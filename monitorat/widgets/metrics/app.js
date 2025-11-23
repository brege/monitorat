// Metrics Widget
/* global ChartManager, TimeSeriesHandler, ChartTableWidgetMethods */
class MetricsWidget {
  constructor (widgetConfig = {}) {
    this.container = null
    this.widgetConfig = widgetConfig
    this.attributeName = 'data-metrics'
    this.defaults = {
      name: 'System Metrics',
      default: 'chart',
      periods: [],
      table: { min: 5, max: 200 },
      chart: { default_metric: 'cpu_percent', default_period: 'all', height: '400px', days: 30 }
    }
    this.config = this.buildConfig()
    this.chartManager = null
    this.tableManager = null
    this.currentView = null
    this.entries = []
    this.transformedEntries = []
    this.selectedMetric = 'cpu_percent'
    this.selectedPeriod = 'all'
    this.schema = null
    this.metricFields = null
  }

  async loadSchema () {
    if (this.schema) return
    const response = await fetch('api/metrics/schema')
    this.schema = await response.json()
    this.metricFields = this.resolveMetricFields()
  }

  buildConfig (overrides = {}) {
    return TimeSeriesHandler.buildConfig(this.defaults, this.widgetConfig, overrides)
  }

  resolveMetricFields () {
    const allMetrics = [...(this.schema?.metrics || []), ...(this.schema?.computed || []).flatMap(group => group.fields)]
    const enabled = this.config?.enabled
    if (Array.isArray(enabled) && enabled.length > 0) {
      return allMetrics.filter((metric) => {
        if (enabled.includes(metric.field)) return true
        if (metric.source && enabled.includes(metric.source)) return true
        return false
      })
    }
    return allMetrics
  }

  async init (container, config = {}) {
    this.container = container
    this.config = this.buildConfig(config)
    this.selectedPeriod = this.config.chart.default_period || this.defaults.chart.default_period

    await this.loadSchema()
    const metricFields = this.metricFields.map((metric) => metric.field)
    const preferredMetric = this.config.chart.default_metric || this.defaults.chart.default_metric
    this.selectedMetric = metricFields.includes(preferredMetric) ? preferredMetric : (metricFields[0] || preferredMetric)

    const response = await fetch('widgets/metrics/index.html')
    const html = await response.text()
    container.innerHTML = html

    this.rebuildTableHeaders()
    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        downloadCsv: this.config.download_csv !== false,
        downloadUrl: 'api/metrics/csv'
      })
    }

    this.setupEventListeners()
    this.initManagers()
    await this.loadData()
    this.setView(this.config.default || this.defaults.default)
    await this.loadHistory()
  }

  setupEventListeners () {
    const metricSelect = this.getElement('metric-select')
    const periodSelect = this.getElement('period-select')

    this.wireViewToggles()

    if (metricSelect) {
      metricSelect.innerHTML = ''
      const allowedFields = new Set(this.metricFields.map((metric) => metric.field))

      const allowedMetrics = (this.schema.metrics || []).filter((metric) => allowedFields.has(metric.field))
      const allowedComputed = (this.schema.computed || []).filter((group) =>
        group.fields.some((field) => allowedFields.has(field.field))
      )

      for (const metric of allowedMetrics) {
        const option = document.createElement('option')
        option.value = metric.field
        option.textContent = metric.label
        metricSelect.appendChild(option)
      }
      for (const group of allowedComputed) {
        const option = document.createElement('option')
        option.value = group.group
        option.textContent = group.label
        metricSelect.appendChild(option)
      }
      metricSelect.value = this.selectedMetric
      metricSelect.addEventListener('change', (event) => {
        this.selectedMetric = event.target.value
        if (this.chartManager?.hasChart()) this.updateChart()
      })
    }

    TimeSeriesHandler.setupPeriodSelect(periodSelect, this.config.chart.periods, this.selectedPeriod, (period) => {
      this.selectedPeriod = period
      this.loadHistory()
    })
  }

  async loadData () {
    const response = await fetch('api/metrics')
    const data = await response.json()
    this.update(data)
    try {
      await fetch('api/metrics', { method: 'GET' })
    } catch (error) {
      console.error('Unable to log metrics:', error)
    }
  }

  update (data) {
    if (!data.metrics || !data.metric_statuses) return

    const keys = data.keys || Object.keys(data.metrics).filter(k => k !== 'status' && k !== 'lastUpdated')
    const valueElements = {}
    const statElements = {}

    for (const key of keys) {
      const element = this.container.querySelector(`#${key}-value`)
      if (element) {
        valueElements[key] = element
        statElements[key] = element.closest('.stat')
      }
    }

    for (const key of keys) {
      if (valueElements[key] && data.metrics[key]) {
        valueElements[key].textContent = data.metrics[key]
      }
      if (statElements[key] && data.metric_statuses[key]) {
        const status = data.metric_statuses[key]
        statElements[key].className = statElements[key].className.replace(/status-\w+/g, '')
        statElements[key].classList.add(`status-${status}`)
      }
    }
  }

  rebuildTableHeaders () {
    const metadataLabel = this.schema?.metadata?.label || 'Source'
    const TableManager = window.monitorShared.TableManager
    TableManager.buildTableHeaders(this.container, this.metricFields, metadataLabel)
  }

  calculateTableDeltas (data) {
    const result = []
    let prevRow = null

    for (const row of data) {
      const entry = { timestamp: row.timestamp, source: row.source || '' }

      for (const metric of this.metricFields) {
        if (metric.source) {
          entry[metric.field] = 0
        } else {
          entry[metric.field] = parseFloat(row[metric.field]) || 0
        }
      }

      if (prevRow) {
        const timeDelta = (new Date(row.timestamp) - new Date(prevRow.timestamp)) / 60000
        if (timeDelta > 0) {
          for (const metric of this.metricFields) {
            if (metric.source) {
              const current = parseFloat(row[metric.source]) || 0
              const prev = parseFloat(prevRow[metric.source]) || 0
              entry[metric.field] = Math.max(0, (current - prev) / timeDelta)
            }
          }
        }
      }

      result.push(entry)
      prevRow = row
    }

    return result
  }

  createChartData (entries, selectedItem, DataFormatter) {
    const chronological = entries.slice()
    const labels = chronological.map(row => DataFormatter.formatTime(row.timestamp))
    const datasets = []
    const allValues = []

    const group = this.schema.computed.find(g => g.group === selectedItem)
    const metricsToChart = group ? group.fields : this.schema.metrics.find(m => m.field === selectedItem) ? [this.schema.metrics.find(m => m.field === selectedItem)] : []

    const ChartManager = window.monitorShared.ChartManager
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

  getViewControls () {
    return [
      this.getElement('metric-select'),
      this.getElement('period-select')
    ]
  }

  initManagers () {
    const ChartManager = window.monitorShared?.ChartManager

    this.chartManager = new ChartManager({
      canvasElement: this.getElement('chart'),
      containerElement: this.getElement('chart-container'),
      height: this.config.chart.height,
      dataUrl: null,
      chartOptions: {}
    })

    this.tableManager = this.createTableManager()
  }

  async loadHistory () {
    this.tableManager.setEntries([])
    this.tableManager.setStatus('Loading metrics history…')

    try {
      const url = new URL('api/metrics/history', window.location)
      if (this.selectedPeriod && this.selectedPeriod !== 'all') {
        url.searchParams.set('period', this.selectedPeriod)
      }
      url.searchParams.set('ts', Date.now())

      const response = await fetch(url, { cache: 'no-store' })
      const payload = await response.json()
      const data = payload.data || []
      this.entries = data
      this.transformedEntries = this.calculateTableDeltas(this.entries)

      const tableLimit = Number.isFinite(this.config.table?.max) ? this.config.table.max : this.defaults.table.max
      const tableEntries = this.transformedEntries.slice(-tableLimit).reverse()
      this.tableManager.setEntries(tableEntries)
      this.updateViewToggle(tableEntries.length > 0)

      if (this.chartManager?.hasChart()) this.updateChart()
    } catch (error) {
      console.error('Metrics history API call failed:', error)
      this.tableManager.setStatus(`Unable to load metrics history: ${error.message}`)
    }
  }

  updateChart () {
    if (!this.chartManager?.chart || !this.transformedEntries.length) return

    const DataFormatter = window.monitorShared.DataFormatter
    const chartData = this.createChartData(this.transformedEntries, this.selectedMetric, DataFormatter)

    const filteredValues = chartData.allValues.filter((value) => Number.isFinite(value))
    if (!filteredValues.length) return

    const min = Math.min(...filteredValues)
    const max = Math.max(...filteredValues)
    const padding = (max - min) * 0.1

    const yAxisLabel = this.schema.computed.find(g => g.group === this.selectedMetric)?.yAxisLabel ||
                       this.schema.metrics.find(m => m.field === this.selectedMetric)?.yAxisLabel ||
                       'Value'

    const axes = this.schema?.axes && Object.keys(this.schema.axes).length > 0 ? this.schema.axes : { x: { display: true }, y: { display: true } }
    const scales = ChartManager.buildScalesFromSchema(axes, {
      y: {
        title: { text: yAxisLabel },
        min: Math.max(0, min - padding),
        max: max + padding
      }
    })

    this.chartManager.updateChart({ labels: chartData.labels, datasets: chartData.datasets }, scales)
  }

  updateChartView () {
    if (this.chartManager?.hasChart()) {
      this.updateChart()
    }
  }

  updateViewToggle (hasEntries) {
    this.currentView = TimeSeriesHandler.updateViewToggle({
      container: this.container,
      attributeName: this.attributeName,
      hasEntries,
      currentView: this.currentView,
      defaultViewSetter: () => this.setView(this.config.default || this.defaults.default)
    })
  }
}

Object.assign(MetricsWidget.prototype, window.monitorShared.ChartTableWidgetMethods || ChartTableWidgetMethods)

MetricsWidget.prototype.getViewControls = function () {
  return [
    this.getElement('metric-select'),
    this.getElement('period-select')
  ]
}

window.widgets = window.widgets || {}
window.widgets.metrics = MetricsWidget
