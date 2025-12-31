// Metrics Widget
/* global TimeSeriesHandler, ChartTableWidgetMethods */
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
    this.apiPrefix = widgetConfig._apiPrefix || 'metrics'
    this.chartManager = null
    this.tableManager = null
    this.currentView = null
    this.entries = []
    this.transformedEntries = []
    this.selectedMetric = 'cpu_percent'
    this.selectedPeriod = 'all'
    this.schema = null
    this.metricFields = null
    this.features = {
      snapshot: null,
      chart: null,
      table: null
    }
  }

  async loadSchema () {
    if (this.schema) return
    const response = await fetch(`api/${this.apiPrefix}/schema`)
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

    await this.loadFeatureScripts()
    this.initializeFeatures()
    this.features.table.rebuildHeaders()
    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        downloadCsv: this.config.download_csv !== false,
        downloadUrl: `api/${this.apiPrefix}/csv`
      })
    }

    this.setupEventListeners()
    this.initManagers()
    await this.loadData()
    this.setView(this.config.default || this.defaults.default)
    await this.features.table.loadHistory()
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
      this.features.table.loadHistory()
    })
  }

  async loadData () {
    const response = await fetch(`api/${this.apiPrefix}`)
    const data = await response.json()
    this.update(data)
    if (window.monitor?.demoEnabled !== true) {
      try {
        await fetch(`api/${this.apiPrefix}`, { method: 'GET' })
      } catch (error) {
        console.error('Unable to log metrics:', error)
      }
    }
  }

  update (data) {
    this.features.snapshot.render(data)
  }

  getViewControls () {
    return [
      this.getElement('metric-select'),
      this.getElement('period-select')
    ]
  }

  initManagers () {
    this.features.chart.initializeManager()
    this.features.table.initializeManager()
  }

  updateChart () {
    this.features.chart.update()
  }

  updateChartView () {
    this.features.chart.updateView()
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

  async loadFeatureScripts () {
    const featureScripts = [
      { globalName: 'MetricsSnapshot', source: 'widgets/metrics/features/snapshot.js' },
      { globalName: 'MetricsChart', source: 'widgets/metrics/features/chart.js' },
      { globalName: 'MetricsTable', source: 'widgets/metrics/features/table.js' }
    ]

    for (const feature of featureScripts) {
      if (!window[feature.globalName]) {
        await this.loadScript(feature)
      }
    }

    const missing = featureScripts.filter((feature) => !window[feature.globalName])
    if (missing.length) {
      const names = missing.map((feature) => feature.globalName).join(', ')
      throw new Error(`Metrics feature scripts missing: ${names}`)
    }
  }

  loadScript (feature) {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script')
      scriptElement.src = feature.source
      scriptElement.async = true
      scriptElement.onload = () => {
        if (!window[feature.globalName]) {
          reject(new Error(`Metrics feature failed to register: ${feature.globalName}`))
          return
        }
        resolve()
      }
      scriptElement.onerror = () => {
        reject(new Error(`Failed to load metrics feature: ${feature.source}`))
      }
      document.head.appendChild(scriptElement)
    })
  }

  initializeFeatures () {
    const SnapshotFeature = window.MetricsSnapshot
    const ChartFeature = window.MetricsChart
    const TableFeature = window.MetricsTable

    if (!SnapshotFeature || !ChartFeature || !TableFeature) {
      throw new Error('Metrics feature scripts not loaded')
    }

    this.features.snapshot = new SnapshotFeature(this)
    this.features.chart = new ChartFeature(this)
    this.features.table = new TableFeature(this)
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
