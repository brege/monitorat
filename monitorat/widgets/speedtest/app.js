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
  }

  async loadSchema () {
    if (this.schema) return
    const response = await fetch('api/speedtest/schema')
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

    this.rebuildTableHeaders()

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        downloadCsv: this.config.download_csv !== false,
        downloadUrl: 'api/speedtest/csv'
      })
    }

    this.setupEventListeners()
    this.initManagers()
    this.setView(this.config.default)
    await this.loadHistory()
  }

  setupEventListeners () {
    const run = this.getElement('run')
    const periodSelect = this.getElement('period-select')
    const metricSelect = this.getElement('metric-select')

    if (run) run.addEventListener('click', () => this.runSpeedtest())
    this.wireViewToggles()

    if (metricSelect) {
      metricSelect.innerHTML = ''
      const allLabel = this.schema.chart.default_metric_label
      const allOption = document.createElement('option')
      allOption.value = 'all'
      allOption.textContent = allLabel
      metricSelect.appendChild(allOption)
      for (const metric of this.metricFields) {
        const option = document.createElement('option')
        option.value = metric.field
        option.textContent = metric.label
        metricSelect.appendChild(option)
      }
      metricSelect.value = this.selectedMetric
      metricSelect.addEventListener('change', (event) => {
        this.selectedMetric = event.target.value
        this.updateChart()
      })
    }

    TimeSeriesHandler.setupPeriodSelect(periodSelect, this.config.chart.periods, this.selectedPeriod, (period) => {
      this.selectedPeriod = period
      this.loadChartData()
    })
  }

  initManagers () {
    const ChartManager = window.monitorShared?.ChartManager

    const axes = this.schema?.axes && Object.keys(this.schema.axes).length > 0 ? this.schema.axes : {}
    const scales = ChartManager.buildScalesFromSchema(axes)

    this.chartManager = new ChartManager({
      canvasElement: this.getElement('chart'),
      containerElement: this.getElement('chart-container'),
      height: this.config.chart.height,
      dataUrl: null,
      dataParams: null,
      chartOptions: { scales }
    })

    this.tableManager = this.createTableManager()
  }

  async runSpeedtest () {
    const button = this.getElement('run')
    const status = this.getElement('status')
    if (button) button.disabled = true
    if (status) status.textContent = 'Running speedtest…'

    try {
      const response = await fetch('api/speedtest/run', { method: 'POST' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (!result.success) throw new Error(result.error || 'Speedtest failed')

      if (status) {
        const DataFormatter = window.monitorShared.DataFormatter
        const downloadMetric = this.metricFields.find(metric => metric.field === 'download') || {}
        const uploadMetric = this.metricFields.find(metric => metric.field === 'upload') || {}
        const pingMetric = this.metricFields.find(metric => metric.field === 'ping') || {}
        const download = DataFormatter.formatBySchema(result.download, downloadMetric)
        const upload = DataFormatter.formatBySchema(result.upload, uploadMetric)
        const ping = DataFormatter.formatBySchema(result.ping, pingMetric)
        const serverLabel = result.server || 'unknown'
        const statusTemplate = this.schema.chart.status_template
        const replacements = {
          '{timestamp}': DataFormatter.formatTimestamp(result.timestamp),
          '{download}': download,
          '{upload}': upload,
          '{ping}': ping,
          '{server}': serverLabel
        }
        let text = statusTemplate
        for (const [needle, value] of Object.entries(replacements)) {
          text = text.replace(needle, value)
        }
        status.textContent = text
      }
    } catch (error) {
      console.error('Speedtest run failed:', error)
      if (status) status.textContent = `Speedtest error: ${error.message}`
    } finally {
      if (button) button.disabled = false
      await this.loadHistory()
    }
  }

  async loadHistory () {
    this.tableManager.setEntries([])
    this.tableManager.setStatus('Loading speedtest history…')

    try {
      const params = new URLSearchParams()
      params.set('limit', this.config.table.max)
      params.set('ts', Date.now())

      const response = await fetch(`api/speedtest/history?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      this.entries = payload.entries || []
      this.tableManager.setEntries(this.entries)
      this.updateViewToggle(this.entries.length > 0)
      await this.loadChartData()
    } catch (error) {
      console.error('Speedtest history failed:', error)
      this.tableManager.setStatus(`Unable to load speedtests: ${error.message}`)
    }
  }

  async loadChartData () {
    if (!this.chartManager) return
    await this.chartManager.ensureChart()
    try {
      const params = new URLSearchParams()
      params.set('period', this.selectedPeriod)
      params.set('ts', Date.now())
      const response = await fetch(`api/speedtest/chart?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      this.chartEntries = payload.entries || []
      this.updateChart()
    } catch (error) {
      console.error('Speedtest chart load failed:', error)
    }
  }

  updateChart () {
    if (!this.chartManager?.hasChart()) return
    const ChartManager = window.monitorShared?.ChartManager
    const DataFormatter = window.monitorShared?.DataFormatter
    const labels = this.chartEntries.map(entry => DataFormatter.formatTime(entry.timestamp))
    const datasets = []
    const metricsToUse = this.selectedMetric === 'all'
      ? this.metricFields
      : this.metricFields.filter(metric => metric.field === this.selectedMetric)

    for (const metric of metricsToUse) {
      const values = this.chartEntries.map((entry) => {
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
      const backgroundAlpha = this.schema?.chart?.backgroundAlpha ?? 0.1
      const backgroundColor = ChartManager.withAlpha(color, backgroundAlpha)

      datasets.push({
        label: metric.label || metric.field,
        data: values,
        borderColor: color,
        backgroundColor,
        tension: this.schema?.chart?.tension ?? 0.1,
        yAxisID: metric.yAxisID
      })
    }

    this.chartManager.updateChart({ labels, datasets })
  }

  updateChartView () {
    this.loadChartData()
  }

  updateViewToggle (hasEntries) {
    return ChartTableWidgetMethods.updateViewToggle.call(this, hasEntries)
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
