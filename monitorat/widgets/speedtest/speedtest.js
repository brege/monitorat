/* global ChartManager, DataFormatter, MetricsWidget */
class SpeedtestWidget {
  constructor (widgetConfig = {}) {
    this.container = null
    this.widgetConfig = widgetConfig
    this.defaults = {
      default: 'chart',
      table: { min: 5, max: 200 },
      chart: { height: '400px', days: 30 }
    }
    this.config = this.buildConfig()
    this.elements = {}
    this.entries = []
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
  }

  buildConfig (overrides = {}) {
    const merged = { ...this.widgetConfig, ...overrides }
    const table = { ...this.defaults.table, ...(this.widgetConfig.table || {}), ...(overrides.table || {}) }
    const chart = { ...this.defaults.chart, ...(this.widgetConfig.chart || {}), ...(overrides.chart || {}) }
    const periods = Array.isArray(merged.periods) ? [...merged.periods] : [...this.defaults.periods || []]
    return {
      _suppressHeader: merged._suppressHeader,
      name: merged.name || 'Speedtest',
      default: typeof merged.default === 'string' ? merged.default : this.defaults.default,
      table,
      chart,
      periods
    }
  }

  async init (container, config = {}) {
    this.container = container
    this.config = this.buildConfig(config)
    await this.loadSchema()

    const response = await fetch('widgets/speedtest/speedtest.html')
    const html = await response.text()
    container.innerHTML = html

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
    const run = this.container.querySelector('[data-speedtest="run"]')
    const viewChart = this.container.querySelector('[data-speedtest="view-chart"]')
    const viewTable = this.container.querySelector('[data-speedtest="view-table"]')
    const periodSelect = this.container.querySelector('[data-speedtest="period-select"]')

    if (run) run.addEventListener('click', () => this.runSpeedtest())
    if (viewChart) viewChart.addEventListener('click', () => this.setView('chart'))
    if (viewTable) viewTable.addEventListener('click', () => this.setView('table'))

    if (periodSelect) {
      periodSelect.innerHTML = '<option value="all">All</option>'
      if (Array.isArray(this.config.chart.periods)) {
        this.config.chart.periods.forEach(period => {
          const option = document.createElement('option')
          option.value = period
          option.textContent = period
          periodSelect.appendChild(option)
        })
      }
      periodSelect.value = this.selectedPeriod
      periodSelect.addEventListener('change', (e) => {
        this.selectedPeriod = e.target.value
        if (this.chartManager?.hasChart()) {
          this.chartManager.dataParams.period = this.selectedPeriod
          this.chartManager.loadData()
        }
      })
    }
  }

  initManagers () {
    const DataFormatter = window.monitorShared?.DataFormatter
    const ChartManager = window.monitorShared?.ChartManager
    const TableManager = window.monitorShared?.TableManager

    this.chartManager = new ChartManager({
      canvasElement: this.container.querySelector('[data-speedtest="chart"]'),
      containerElement: this.container.querySelector('[data-speedtest="chart-container"]'),
      height: this.config.chart.height,
      dataUrl: 'api/speedtest/chart',
      dataParams: {
        days: this.config.chart.days,
        period: this.selectedPeriod
      },
      chartOptions: {
        scales: {
          speed: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Speed (Mbps)' }
          },
          ping: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Ping (ms)' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    })

    this.tableManager = new TableManager({
      statusElement: this.container.querySelector('[data-speedtest="history-status"]'),
      rowsElement: this.container.querySelector('[data-speedtest="rows"]'),
      toggleElement: this.container.querySelector('[data-speedtest="toggle"]'),
      previewCount: this.config.table.min,
      emptyMessage: 'No speedtests logged yet.',
      isTableViewActive: () => this.currentView === 'table',
      rowFormatter: (entry) => this.formatTableRow(entry)
    })
  }

  formatTableRow (entry) {
    const DataFormatter = window.monitorShared.DataFormatter
    const row = [DataFormatter.formatTimestamp(entry.timestamp)]

    for (const metric of this.schema.metrics) {
      const value = entry[metric.field]
      if (value === null || value === undefined) {
        row.push('–')
      } else {
        const numValue = parseFloat(value)
        const formatted = metric.converter === 'mbps'
          ? DataFormatter.formatMbps(numValue * 1_000_000)
          : DataFormatter.formatNumber(numValue, metric.decimals)
        row.push(formatted + metric.unit)
      }
    }

    row.push(entry[this.schema.metadata.field] || '')
    return row
  }

  async runSpeedtest () {
    const button = this.container.querySelector('[data-speedtest="run"]')
    const status = this.container.querySelector('[data-speedtest="status"]')
    if (button) button.disabled = true
    if (status) status.textContent = 'Running speedtest…'

    try {
      const response = await fetch('api/speedtest/run', { method: 'POST' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (!result.success) throw new Error(result.error || 'Speedtest failed')

      if (status) {
        const DataFormatter = window.monitorShared.DataFormatter
        const download = DataFormatter.formatMbps(result.download)
        const upload = DataFormatter.formatMbps(result.upload)
        const ping = DataFormatter.formatPing(result.ping)
        status.textContent = `${DataFormatter.formatTimestamp(result.timestamp)} — ↓ ${download} Mbps, ↑ ${upload} Mbps, ${ping} ms (${result.server || 'unknown'})`
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
      this.updateViewToggle()
      if (this.chartManager?.hasChart()) {
        await this.chartManager.loadData()
      }
    } catch (error) {
      console.error('Speedtest history failed:', error)
      this.tableManager.setStatus(`Unable to load speedtests: ${error.message}`)
    }
  }

  setView (view) {
    const DataFormatter = window.monitorShared.DataFormatter
    const elements = DataFormatter.selectByAttribute(this.container, 'data-speedtest', [
      'view-toggle', 'chart-container', 'table-container', 'view-chart', 'view-table', 'period-select'
    ])

    const targetView = view === 'table' ? 'table' : view === 'none' ? 'none' : 'chart'
    if (this.currentView === targetView) return

    if (targetView === 'none') {
      elements['view-toggle'].style.display = 'none'
      elements['chart-container'].style.display = 'none'
      elements['table-container'].style.display = 'none'
    } else {
      elements['view-toggle'].style.display = ''
      if (targetView === 'chart') {
        elements['chart-container'].style.display = ''
        elements['table-container'].style.display = 'none'
        elements['view-chart'].classList.add('active')
        elements['view-table'].classList.remove('active')
        if (this.chartManager) {
          this.chartManager.ensureChart().then(() => {
            if (this.chartManager.hasChart()) this.chartManager.loadData()
          })
        }
      } else {
        elements['chart-container'].style.display = 'none'
        elements['table-container'].style.display = ''
        elements['view-chart'].classList.remove('active')
        elements['view-table'].classList.add('active')
      }
      if (elements['period-select']) {
        elements['period-select'].style.display = targetView === 'chart' ? '' : 'none'
      }
    }

    this.currentView = targetView
    if (this.tableManager) this.tableManager.updateToggleVisibility()
  }

  updateViewToggle () {
    const viewToggle = this.container.querySelector('[data-speedtest="view-toggle"]')
    if (!viewToggle) return
    if (this.entries.length > 0) {
      viewToggle.style.display = ''
      if (!this.currentView) this.setView(this.config.default)
    } else {
      viewToggle.style.display = 'none'
    }
  }
}

window.widgets = window.widgets || {}
window.widgets.speedtest = SpeedtestWidget
