class SpeedtestChart {
  constructor (widget) {
    this.widget = widget
    this.lineStyles = [[], [5, 5], [2, 2], [10, 5, 2, 5]]
    this.legendState = null
  }

  initializeManager () {
    const ChartManager = window.monitorShared?.ChartManager
    const axes = this.widget.schema?.axes && Object.keys(this.widget.schema.axes).length > 0 ? this.widget.schema.axes : {}
    const scales = ChartManager.buildScalesFromSchema(axes)

    this.widget.chartManager = new ChartManager({
      canvasElement: this.widget.getElement('chart'),
      containerElement: this.widget.getElement('chart-container'),
      height: this.widget.config.chart.height,
      dataUrl: null,
      dataParams: null,
      chartOptions: {
        scales,
        plugins: {
          legend: { display: false }
        }
      }
    })
  }

  async loadChartData () {
    if (!this.widget.chartManager) return
    await this.widget.chartManager.ensureChart()

    const mergeSources = this.widget.config.federation?.nodes
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedChartData(mergeSources)
    } else {
      await this.loadSingleChartData()
    }
  }

  async loadSingleChartData () {
    try {
      const searchParameters = new URLSearchParams()
      searchParameters.set('period', this.widget.selectedPeriod)
      searchParameters.set('ts', Date.now())
      const response = await fetch(`${this.widget.getApiBase()}/chart?${searchParameters.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      this.widget.chartEntries = payload.entries || []
      this.update()
    } catch (error) {
      console.error('Speedtest chart load failed:', error)
    }
  }

  async loadMergedChartData (sources) {
    try {
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            const searchParameters = new URLSearchParams()
            searchParameters.set('period', this.widget.selectedPeriod)
            searchParameters.set('ts', Date.now())
            const response = await fetch(`api/speedtest-${source}/chart?${searchParameters.toString()}`, { cache: 'no-store' })
            if (!response.ok) {
              console.warn(`Failed to fetch speedtest chart from ${source}: HTTP ${response.status}`)
              return []
            }
            const payload = await response.json()
            return (payload.entries || []).map(entry => ({ ...entry, _source: source }))
          } catch (error) {
            console.warn(`Failed to fetch speedtest chart from ${source}:`, error.message)
            return []
          }
        })
      )

      this.widget.chartEntries = results.flat()
      this.widget.chartEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      this.updateMerged(sources)
    } catch (error) {
      console.error('Speedtest merged chart load failed:', error)
    }
  }

  update () {
    if (!this.widget.chartManager?.hasChart()) return

    const mergeSources = this.widget.config.federation?.nodes
    if (mergeSources && Array.isArray(mergeSources)) {
      const filteredSources = this.getFilteredSources(mergeSources)
      this.updateMerged(filteredSources)
      return
    }

    const ChartManager = window.monitorShared?.ChartManager
    const DataFormatter = window.monitorShared?.DataFormatter
    const filteredEntries = this.getFilteredEntries()
    const labels = filteredEntries.map(entry => DataFormatter.formatTime(entry.timestamp))
    const datasets = []
    const metricsToUse = this.widget.selectedMetric === 'all'
      ? this.widget.metricFields
      : this.widget.metricFields.filter(metric => metric.field === this.widget.selectedMetric)

    for (const metric of metricsToUse) {
      const values = filteredEntries.map((entry) => {
        const raw = entry[metric.field]
        if (raw === null || raw === undefined) return null
        const numeric = Number(raw)
        if (!Number.isFinite(numeric)) return null
        if (metric.format === 'mbps') {
          return Number((numeric / 1_000_000).toFixed(metric.decimals ?? 2))
        }
        if (metric.format === 'ping') {
          return Number(numeric.toFixed(metric.decimals ?? 1))
        }
        return numeric
      })

      const color = metric.color
      const backgroundAlpha = this.widget.schema?.chart?.backgroundAlpha ?? 0.1
      const backgroundColor = ChartManager.withAlpha(color, backgroundAlpha)

      datasets.push({
        label: metric.label || metric.field,
        data: values,
        borderColor: color,
        backgroundColor,
        tension: this.widget.schema?.chart?.tension ?? 0.1,
        yAxisID: metric.yAxisID,
        _metricField: metric.field,
        _source: null
      })
    }

    this.widget.chartManager.updateChart({ labels, datasets })
    this.renderLegends(metricsToUse, [])
  }

  getFilteredEntries () {
    const selectedNode = this.widget.selectedNode
    if (!selectedNode || selectedNode === 'all') {
      return this.widget.chartEntries
    }
    return this.widget.chartEntries.filter(entry => entry._source === selectedNode)
  }

  getFilteredSources (allSources) {
    const selectedNode = this.widget.selectedNode
    if (!selectedNode || selectedNode === 'all') {
      return allSources
    }
    return [selectedNode]
  }

  updateMerged (sources) {
    if (!this.widget.chartManager?.hasChart()) return
    const ChartManager = window.monitorShared?.ChartManager
    const DataFormatter = window.monitorShared?.DataFormatter
    const filteredEntries = this.getFilteredEntries()

    const entriesBySource = {}
    for (const entry of filteredEntries) {
      const source = entry._source || 'unknown'
      if (!entriesBySource[source]) {
        entriesBySource[source] = []
      }
      entriesBySource[source].push(entry)
    }

    const allTimestamps = new Set()
    for (const entries of Object.values(entriesBySource)) {
      for (const entry of entries) {
        allTimestamps.add(entry.timestamp)
      }
    }
    const sortedTimestamps = Array.from(allTimestamps).sort()
    const labels = sortedTimestamps.map(timestamp => DataFormatter.formatTime(timestamp))

    const metricsToUse = this.widget.selectedMetric === 'all'
      ? this.widget.metricFields
      : this.widget.metricFields.filter(metric => metric.field === this.widget.selectedMetric)

    const datasets = []

    sources.forEach((source, sourceIndex) => {
      const sourceEntries = entriesBySource[source] || []
      const timestampMap = {}
      for (const entry of sourceEntries) {
        timestampMap[entry.timestamp] = entry
      }

      for (const metric of metricsToUse) {
        const values = sortedTimestamps.map(timestamp => {
          const entry = timestampMap[timestamp]
          if (!entry) return null
          const raw = entry[metric.field]
          if (raw === null || raw === undefined) return null
          const numeric = Number(raw)
          if (!Number.isFinite(numeric)) return null
          if (metric.format === 'mbps') {
            return Number((numeric / 1_000_000).toFixed(metric.decimals ?? 2))
          }
          if (metric.format === 'ping') {
            return Number(numeric.toFixed(metric.decimals ?? 1))
          }
          return numeric
        })

        const label = `${source}: ${metric.label || metric.field}`
        const color = metric.color
        const backgroundAlpha = this.widget.schema?.chart?.backgroundAlpha ?? 0.1
        const backgroundColor = ChartManager.withAlpha(color, backgroundAlpha)

        datasets.push({
          label,
          data: values,
          borderColor: color,
          backgroundColor,
          borderDash: this.lineStyles[sourceIndex % this.lineStyles.length],
          tension: this.widget.schema?.chart?.tension ?? 0.1,
          yAxisID: metric.yAxisID,
          spanGaps: true,
          _metricField: metric.field,
          _source: source
        })
      }
    })

    this.widget.chartManager.updateChart({ labels, datasets })
    this.renderLegends(metricsToUse, sources)
  }

  updateView () {
    this.loadChartData()
  }

  renderLegends (metrics, sources) {
    const chart = this.widget.chartManager?.chart
    if (!chart) {
      this.clearLegends()
      return
    }

    this.legendState = { metrics, sources }
    this.renderMetricLegend(chart, metrics)
    this.renderNodeLegend(chart, sources)
    this.widget.updateLegendVisibility()
  }

  clearLegends () {
    const metricLegend = this.widget.getElement('metric-legend')
    const nodeLegend = this.widget.getElement('node-legend')
    if (metricLegend) metricLegend.innerHTML = ''
    if (nodeLegend) nodeLegend.innerHTML = ''
  }

  renderMetricLegend (chart, metrics) {
    const metricLegend = this.widget.getElement('metric-legend')
    if (!metricLegend) {
      return
    }

    metricLegend.innerHTML = ''
    const datasets = chart.data.datasets || []
    const metricsToRender = metrics.filter(metric =>
      datasets.some(dataset => dataset._metricField === metric.field)
    )
    if (!metricsToRender.length) {
      metricLegend.style.display = 'none'
      return
    }
    metricLegend.style.display = ''

    for (const metric of metricsToRender) {
      const matchingIndexes = datasets
        .map((dataset, index) => dataset._metricField === metric.field ? index : null)
        .filter(index => index !== null)
      const isVisible = matchingIndexes.some(index => chart.isDatasetVisible(index))

      const button = document.createElement('button')
      button.type = 'button'
      button.className = `speedtest-legend-item${isVisible ? ' active' : ''}`
      button.addEventListener('click', () => {
        this.toggleDatasets(chart, (dataset) => dataset._metricField === metric.field)
        this.renderMetricLegend(chart, metrics)
        if (this.legendState) {
          this.renderNodeLegend(chart, this.legendState.sources)
        }
      })

      const swatch = document.createElement('span')
      swatch.className = 'speedtest-legend-swatch metric'
      swatch.style.backgroundColor = metric.color || 'var(--text-muted)'

      const label = document.createElement('span')
      label.textContent = metric.label || metric.field

      button.appendChild(swatch)
      button.appendChild(label)
      metricLegend.appendChild(button)
    }
  }

  renderNodeLegend (chart, sources) {
    const nodeLegend = this.widget.getElement('node-legend')
    if (!nodeLegend) {
      return
    }

    nodeLegend.innerHTML = ''
    if (!sources || sources.length < 2) {
      nodeLegend.style.display = 'none'
      return
    }

    const datasets = chart.data.datasets || []
    nodeLegend.style.display = ''

    sources.forEach((source, index) => {
      const matchingIndexes = datasets
        .map((dataset, datasetIndex) => dataset._source === source ? datasetIndex : null)
        .filter(datasetIndex => datasetIndex !== null)
      const isVisible = matchingIndexes.some(datasetIndex => chart.isDatasetVisible(datasetIndex))

      const button = document.createElement('button')
      button.type = 'button'
      button.className = `speedtest-legend-item${isVisible ? ' active' : ''}`
      button.addEventListener('click', () => {
        this.toggleDatasets(chart, (dataset) => dataset._source === source)
        if (this.legendState) {
          this.renderMetricLegend(chart, this.legendState.metrics)
        }
        this.renderNodeLegend(chart, sources)
      })

      const swatch = document.createElement('span')
      swatch.className = 'speedtest-legend-swatch line'
      const dash = this.lineStyles[index % this.lineStyles.length]
      swatch.style.borderTopStyle = dash.length ? 'dashed' : 'solid'

      const label = document.createElement('span')
      label.textContent = source

      button.appendChild(swatch)
      button.appendChild(label)
      nodeLegend.appendChild(button)
    })
  }

  toggleDatasets (chart, predicate) {
    const datasets = chart.data.datasets || []
    const indexes = datasets
      .map((dataset, index) => predicate(dataset) ? index : null)
      .filter(index => index !== null)
    if (!indexes.length) return

    const anyVisible = indexes.some(index => chart.isDatasetVisible(index))
    indexes.forEach((index) => {
      chart.setDatasetVisibility(index, !anyVisible)
    })
    chart.update()
  }
}

window.SpeedtestChart = SpeedtestChart
