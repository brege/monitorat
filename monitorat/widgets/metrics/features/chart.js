class MetricsChart {
  constructor (widget) {
    this.widget = widget
  }

  initializeManager () {
    const ChartManager = window.monitorShared?.ChartManager

    this.widget.chartManager = new ChartManager({
      canvasElement: this.widget.getElement('chart'),
      containerElement: this.widget.getElement('chart-container'),
      height: this.widget.config.chart.height,
      dataUrl: null,
      chartOptions: {}
    })
  }

  update () {
    if (!this.widget.chartManager?.chart || !this.widget.transformedEntries.length) return

    const DataFormatter = window.monitorShared.DataFormatter
    const filteredEntries = this.getFilteredEntries()
    const chartData = this.createChartData(filteredEntries, this.widget.selectedMetric, DataFormatter)

    const filteredValues = chartData.allValues.filter((value) => Number.isFinite(value))
    if (!filteredValues.length) return

    const min = Math.min(...filteredValues)
    const max = Math.max(...filteredValues)
    const padding = (max - min) * 0.1

    const yAxisLabel = this.widget.schema.computed.find(group => group.group === this.widget.selectedMetric)?.yAxisLabel ||
                       this.widget.schema.metrics.find(metric => metric.field === this.widget.selectedMetric)?.yAxisLabel ||
                       'Value'

    const ChartManager = window.monitorShared.ChartManager
    const axes = this.widget.schema?.axes && Object.keys(this.widget.schema.axes).length > 0 ? this.widget.schema.axes : { x: { display: true }, y: { display: true } }
    const scales = ChartManager.buildScalesFromSchema(axes, {
      y: {
        title: { text: yAxisLabel },
        min: Math.max(0, min - padding),
        max: max + padding
      }
    })

    this.widget.chartManager.updateChart({ labels: chartData.labels, datasets: chartData.datasets }, scales)
  }

  updateView () {
    if (this.widget.chartManager?.hasChart()) {
      this.update()
    }
  }

  getFilteredEntries () {
    const selectedNode = this.widget.selectedNode
    if (!selectedNode || selectedNode === 'all') {
      return this.widget.transformedEntries
    }
    return this.widget.transformedEntries.filter(entry => entry._source === selectedNode)
  }

  getFilteredSources () {
    const selectedNode = this.widget.selectedNode
    if (!selectedNode || selectedNode === 'all') {
      return this.widget.sources
    }
    return [selectedNode]
  }

  createChartData (entries, selectedItem, dataFormatter) {
    const group = this.widget.schema.computed.find(group => group.group === selectedItem)
    const metricMatch = this.widget.schema.metrics.find(metric => metric.field === selectedItem)
    const metricsToChart = group ? group.fields : metricMatch ? [metricMatch] : []
    const ChartManager = window.monitorShared.ChartManager
    const filteredSources = this.getFilteredSources()
    if (filteredSources && filteredSources.length > 1) {
      return this.createMergedChartData(entries, metricsToChart, dataFormatter, filteredSources)
    }

    const chronological = entries.slice()
    const labels = chronological.map(row => dataFormatter.formatTime(row.timestamp))
    const datasets = []
    const allValues = []

    for (const metric of metricsToChart) {
      const values = chronological.map(row => parseFloat(row[metric.field]) || 0)
      datasets.push(...ChartManager.buildGhostedDatasets({
        label: metric.label,
        color: metric.color,
        rawValues: values
      }))
      allValues.push(...values)
    }

    return { labels, datasets, allValues }
  }

  createMergedChartData (entries, metricsToChart, dataFormatter, sources) {
    const sourceColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
    const lineStyles = [[], [5, 5], [2, 2], [10, 5, 2, 5]]
    const entriesBySource = {}

    for (const row of entries) {
      const source = row._source || 'unknown'
      if (!entriesBySource[source]) {
        entriesBySource[source] = []
      }
      entriesBySource[source].push(row)
    }

    const allTimestamps = new Set()
    for (const rows of Object.values(entriesBySource)) {
      for (const row of rows) {
        allTimestamps.add(row.timestamp)
      }
    }
    const sortedTimestamps = Array.from(allTimestamps).sort()
    const labels = sortedTimestamps.map(timestamp => dataFormatter.formatTime(timestamp))

    const datasets = []
    const allValues = []

    sources.forEach((source, sourceIndex) => {
      const sourceRows = entriesBySource[source] || []
      const timestampMap = {}
      for (const row of sourceRows) {
        timestampMap[row.timestamp] = row
      }

      for (const metric of metricsToChart) {
        const values = sortedTimestamps.map(timestamp => {
          const row = timestampMap[timestamp]
          return row ? (parseFloat(row[metric.field]) || 0) : null
        })

        const label = `${source}: ${metric.label}`
        const color = metric.color

        datasets.push({
          label,
          data: values,
          borderColor: color,
          backgroundColor: color + '33',
          borderDash: lineStyles[sourceIndex % lineStyles.length],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          spanGaps: true
        })
        allValues.push(...values.filter(value => value !== null))
      }
    })

    return { labels, datasets, allValues }
  }
}

window.MetricsChart = MetricsChart
