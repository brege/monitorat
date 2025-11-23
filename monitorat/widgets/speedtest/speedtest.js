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
      chart: { height: '400px', days: 30, default_period: 'all' }
    }
    this.config = this.buildConfig()
    this.entries = []
    this.metricFields = []
    this.chartManager = null
    this.tableManager = null
    this.currentView = null
    this.selectedPeriod = 'all'
    this.schema = null
  }

  async loadSchema () {
    if (this.schema) return
    const response = await fetch('api/speedtest/schema')
    this.schema = await response.json()
    this.metricFields = this.resolveMetricFields()
  }

  buildConfig (overrides = {}) {
    return TimeSeriesHandler.buildConfig(this.defaults, this.widgetConfig, overrides)
  }

  resolveMetricFields () {
    const enabled = this.config?.metrics?.enabled
    if (Array.isArray(enabled) && enabled.length > 0) {
      return (this.schema?.metrics || []).filter(metric => enabled.includes(metric.field))
    }
    return this.schema?.metrics || []
  }

  async init (container, config = {}) {
    this.container = container
    this.config = this.buildConfig(config)
    this.selectedPeriod = this.config.chart.default_period || this.defaults.chart.default_period
    await this.loadSchema()
    this.metricFields = this.resolveMetricFields()

    const response = await fetch('widgets/speedtest/speedtest.html')
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

    if (run) run.addEventListener('click', () => this.runSpeedtest())
    this.wireViewToggles()

    TimeSeriesHandler.setupPeriodSelect(periodSelect, this.config.chart.periods, this.selectedPeriod, (period) => {
      this.selectedPeriod = period
      if (this.chartManager?.hasChart()) {
        this.chartManager.dataParams.period = this.selectedPeriod
        this.chartManager.loadData()
      }
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
      dataUrl: 'api/speedtest/chart',
      dataParams: {
        days: this.config.chart.days,
        period: this.selectedPeriod
      },
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
        status.textContent = `${DataFormatter.formatTimestamp(result.timestamp)} — ↓ ${download}, ↑ ${upload}, ${ping} (${serverLabel})`
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
      if (this.chartManager?.hasChart()) {
        await this.chartManager.loadData()
      }
    } catch (error) {
      console.error('Speedtest history failed:', error)
      this.tableManager.setStatus(`Unable to load speedtests: ${error.message}`)
    }
  }

  setView (view) {
    return ChartTableWidgetMethods.setView.call(this, view)
  }

  updateViewToggle (hasEntries) {
    return ChartTableWidgetMethods.updateViewToggle.call(this, hasEntries)
  }

  rebuildTableHeaders () {
    return ChartTableWidgetMethods.rebuildTableHeaders.call(this)
  }

  getViewControls () {
    return [
      this.getElement('period-select')
    ]
  }
}

Object.assign(SpeedtestWidget.prototype, window.monitorShared.ChartTableWidgetMethods || ChartTableWidgetMethods)

window.widgets = window.widgets || {}
window.widgets.speedtest = SpeedtestWidget
