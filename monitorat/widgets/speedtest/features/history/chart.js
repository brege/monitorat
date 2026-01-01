class SpeedtestChart {
  constructor (widget) {
    this.widget = widget
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
      chartOptions: { scales }
    })
  }

  async loadChartData () {
    if (!this.widget.chartManager) return
    await this.widget.chartManager.ensureChart()

    const mergeSources = this.widget.config.federation?.merge
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

    const mergeSources = this.widget.config.federation?.merge
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
        yAxisID: metric.yAxisID
      })
    }

    this.widget.chartManager.updateChart({ labels, datasets })
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
    const lineStyles = [[], [5, 5], [2, 2], [10, 5, 2, 5]]
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
          borderDash: lineStyles[sourceIndex % lineStyles.length],
          tension: this.widget.schema?.chart?.tension ?? 0.1,
          yAxisID: metric.yAxisID,
          spanGaps: true
        })
      }
    })

    this.widget.chartManager.updateChart({ labels, datasets })
  }

  updateView () {
    this.loadChartData()
  }
}

window.SpeedtestChart = SpeedtestChart
