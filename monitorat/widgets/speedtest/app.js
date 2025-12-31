/* global TimeSeriesHandler, ChartTableWidgetMethods */
class SpeedtestWidget {
  constructor (widgetConfig = {}) {
    this.container = null
    this.widgetConfig = widgetConfig
    this.attributeName = 'data-speedtest'
    this.defaults = {
      name: 'Speedtest',
      default: 'chart',
      periods: [],
      table: { min: 5, max: 200 },
      chart: { height: '400px', days: 30, default_period: 'all', default_metric: 'all' }
    }
    this.config = this.buildConfig()
    this.entries = []
    this.metricFields = []
    this.chartManager = null
    this.tableManager = null
    this.currentView = null
    this.selectedPeriod = 'all'
    this.selectedMetric = 'all'
    this.schema = null
    this.chartEntries = []
    this.features = {
      controls: null,
      chart: null,
      table: null
    }
  }

  getApiBase () {
    return this.config._apiPrefix ? `api/${this.config._apiPrefix}` : 'api/speedtest'
  }

  async loadSchema () {
    if (this.schema) return
    const response = await fetch(`${this.getApiBase()}/schema`)
    this.schema = await response.json()
    this.applyMetadataConfig()
    this.metricFields = this.resolveMetricFields()
  }

  buildConfig (overrides = {}) {
    return TimeSeriesHandler.buildConfig(this.defaults, this.widgetConfig, overrides)
  }

  resolveMetricFields () {
    const enabled = this.config?.enabled
    if (Array.isArray(enabled) && enabled.length > 0) {
      return (this.schema.metrics || []).filter(metric => enabled.includes(metric.field))
    }
    return this.schema.metrics || []
  }

  applyMetadataConfig () {
    const metadataConfig = this.config?.metadata || {}
    if (!this.schema.metadata) {
      this.schema.metadata = {}
    }
    if (metadataConfig.field) {
      this.schema.metadata.field = metadataConfig.field
    }
    if (metadataConfig.label) {
      this.schema.metadata.label = metadataConfig.label
    }
    const enabledSet = new Set(this.config?.enabled || [])
    const metadataFields = Array.isArray(this.schema.metadata.fields) ? this.schema.metadata.fields : []
    const filteredMetadata = metadataFields.filter((field) => {
      if (typeof field === 'string') return enabledSet.has(field)
      if (field && typeof field.field === 'string') return enabledSet.has(field.field)
      return false
    })
    this.schema.metadata.fields = filteredMetadata
    if (filteredMetadata.length === 0 || (filteredMetadata.length === 1 && !enabledSet.has(this.schema.metadata.field))) {
      this.schema.metadata.field = null
    }
  }

  async init (container, config = {}) {
    this.container = container
    this.config = this.buildConfig(config)
    this.selectedPeriod = this.config.chart.default_period || this.defaults.chart.default_period
    await this.loadSchema()
    this.metricFields = this.resolveMetricFields()
    const metricFields = this.metricFields.map((metric) => metric.field)
    const preferredMetric = this.config.chart.default_metric || this.defaults.chart.default_metric
    this.selectedMetric = preferredMetric === 'all' ? 'all' : (metricFields.includes(preferredMetric) ? preferredMetric : (metricFields[0] || 'all'))

    const response = await fetch('widgets/speedtest/index.html')
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
        downloadCsv: false,
        downloadUrl: null
      })
    }

    this.features.controls.setupEventListeners()
    this.setupDownloadControl()
    this.initManagers()
    this.setView(this.config.default)
    await this.features.table.loadHistory()
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

  async loadFeatureScripts () {
    const featureScripts = [
      { globalName: 'SpeedtestControls', source: 'widgets/speedtest/features/controls.js' },
      { globalName: 'SpeedtestChart', source: 'widgets/speedtest/features/chart.js' },
      { globalName: 'SpeedtestTable', source: 'widgets/speedtest/features/table.js' }
    ]

    for (const feature of featureScripts) {
      if (!window[feature.globalName]) {
        await this.loadScript(feature)
      }
    }

    const missing = featureScripts.filter((feature) => !window[feature.globalName])
    if (missing.length) {
      const names = missing.map((feature) => feature.globalName).join(', ')
      throw new Error(`Speedtest feature scripts missing: ${names}`)
    }
  }

  loadScript (feature) {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script')
      scriptElement.src = feature.source
      scriptElement.async = true
      scriptElement.onload = () => {
        if (!window[feature.globalName]) {
          reject(new Error(`Speedtest feature failed to register: ${feature.globalName}`))
          return
        }
        resolve()
      }
      scriptElement.onerror = () => {
        reject(new Error(`Failed to load speedtest feature: ${feature.source}`))
      }
      document.head.appendChild(scriptElement)
    })
  }

  initializeFeatures () {
    const ControlsFeature = window.SpeedtestControls
    const ChartFeature = window.SpeedtestChart
    const TableFeature = window.SpeedtestTable

    if (!ControlsFeature || !ChartFeature || !TableFeature) {
      throw new Error('Speedtest feature scripts not loaded')
    }

    this.features.controls = new ControlsFeature(this)
    this.features.chart = new ChartFeature(this)
    this.features.table = new TableFeature(this)
  }

  updateViewToggle (hasEntries) {
    return ChartTableWidgetMethods.updateViewToggle.call(this, hasEntries)
  }

  setupDownloadControl () {
    const downloadButton = this.getElement('download-csv')
    if (!downloadButton) {
      return
    }
    if (this.config.download_csv === false) {
      downloadButton.style.display = 'none'
      return
    }
    downloadButton.addEventListener('click', (event) => {
      event.preventDefault()
      this.downloadCsv()
    })
  }

  downloadCsv () {
    const url = `${this.getApiBase()}/csv?${Date.now()}`
    const link = document.createElement('a')
    link.href = url
    link.download = 'speedtest.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

Object.assign(SpeedtestWidget.prototype, window.monitorShared.ChartTableWidgetMethods || ChartTableWidgetMethods)

SpeedtestWidget.prototype.getViewControls = function () {
  return [
    this.getElement('metric-select'),
    this.getElement('period-select')
  ]
}

window.widgets = window.widgets || {}
window.widgets.speedtest = SpeedtestWidget
