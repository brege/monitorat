/* global ChartManager */
class SpeedtestWidget {
  constructor (widgetConfig = {}) {
    this.container = null
    this.widgetConfig = widgetConfig
    this.config = {
      default: 'chart',
      table: {
        min: 5,
        max: 200
      },
      chart: {
        height: '400px',
        days: 30
      }
    }
    this.elements = {}
    this.entries = []
    this.chartManager = null
    this.tableManager = null
    this.currentView = null
    this.selectedPeriod = 'all'
  }

  async init (container, config = {}) {
    this.container = container
    const hasExplicitName = Object.prototype.hasOwnProperty.call(config, 'name')
    this.config = {
      _suppressHeader: config._suppressHeader,
      name: hasExplicitName ? config.name : this.widgetConfig.name,
      default: config.default,
      table: config.table,
      chart: config.chart
    }
    this.selectedPeriod = this.config.chart.default_period

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

    this.elements = {
      run: container.querySelector('[data-speedtest="run"]'),
      status: container.querySelector('[data-speedtest="status"]'),
      historyStatus: container.querySelector('[data-speedtest="history-status"]'),
      rows: container.querySelector('[data-speedtest="rows"]'),
      toggle: container.querySelector('[data-speedtest="toggle"]'),
      viewToggle: container.querySelector('[data-speedtest="view-toggle"]'),
      viewChart: container.querySelector('[data-speedtest="view-chart"]'),
      viewTable: container.querySelector('[data-speedtest="view-table"]'),
      chartContainer: container.querySelector('[data-speedtest="chart-container"]'),
      chartCanvas: container.querySelector('[data-speedtest="chart"]'),
      tableContainer: container.querySelector('[data-speedtest="table-container"]'),
      periodSelect: container.querySelector('[data-speedtest="period-select"]')
    }

    if (this.elements.run) {
      this.elements.run.addEventListener('click', () => this.runSpeedtest())
    }
    if (this.elements.viewChart) {
      this.elements.viewChart.addEventListener('click', () => this.setView('chart'))
    }
    if (this.elements.viewTable) {
      this.elements.viewTable.addEventListener('click', () => this.setView('table'))
    }

    if (this.elements.periodSelect) {
      // Populate period options
      this.elements.periodSelect.innerHTML = '<option value="all">All</option>'
      if (Array.isArray(this.config.chart.periods)) {
        this.config.chart.periods.forEach(period => {
          const option = document.createElement('option')
          option.value = period
          option.textContent = period
          this.elements.periodSelect.appendChild(option)
        })
      }

      this.elements.periodSelect.value = this.selectedPeriod
      this.elements.periodSelect.addEventListener('change', (e) => {
        this.selectedPeriod = e.target.value
        if (this.chartManager) {
          this.chartManager.dataParams.period = this.selectedPeriod
          if (this.chartManager.hasChart()) {
            this.chartManager.loadData()
          }
        }
      })
    }

    this.initManagers()
    this.setView(this.config.default)
    await this.loadHistory()
  }

  initManagers () {
    const DataFormatter = window.monitorShared?.DataFormatter
    const ChartManager = window.monitorShared?.ChartManager
    const TableManager = window.monitorShared?.TableManager

    if (!DataFormatter || !ChartManager || !TableManager) {
      throw new Error('Shared modules not available')
    }

    this.chartManager = new ChartManager({
      canvasElement: this.elements.chartCanvas,
      containerElement: this.elements.chartContainer,
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
            title: {
              display: true,
              text: 'Speed (Mbps)'
            }
          },
          ping: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: 'Ping (ms)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    })

    this.tableManager = new TableManager({
      statusElement: this.elements.historyStatus,
      rowsElement: this.elements.rows,
      toggleElement: this.elements.toggle,
      previewCount: this.config.table.min,
      emptyMessage: 'No speedtests logged yet.',
      rowFormatter: (entry) => [
        DataFormatter.formatTimestamp(entry.timestamp),
        DataFormatter.formatMbps(entry.download),
        DataFormatter.formatMbps(entry.upload),
        DataFormatter.formatPing(entry.ping),
        entry.server || ''
      ]
    })

    this.tableManager.isTableViewActive = () => this.currentView === 'table'
  }

  async runSpeedtest () {
    const button = this.elements.run
    const status = this.elements.status
    if (button) button.disabled = true
    if (status) status.textContent = 'Running speedtest…'

    try {
      const response = await fetch('api/speedtest/run', { method: 'POST' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Speedtest failed')
      }
      if (status) {
        const DataFormatter = window.monitorShared.DataFormatter
        status.textContent = `${DataFormatter.formatTimestamp(result.timestamp)} — ↓ ${DataFormatter.formatMbps(result.download)} Mbps, ↑ ${DataFormatter.formatMbps(result.upload)} Mbps, ${DataFormatter.formatPing(result.ping)} ms (${result.server || 'unknown server'})`
      }
    } catch (error) {
      console.error('Speedtest run API call failed:', error)
      if (status) status.textContent = `Speedtest error: ${error.message}`
    } finally {
      if (button) button.disabled = false
      await this.loadHistory()
    }
  }

  async loadHistory () {
    if (!this.tableManager) {
      return
    }

    this.tableManager.setEntries([])
    this.tableManager.setStatus('Loading speedtest history…')

    try {
      const params = new URLSearchParams()
      params.set('limit', this.config.table.max)
      params.set('ts', Date.now())

      const response = await fetch(`api/speedtest/history?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const payload = await response.json()
      this.entries = payload.entries || []
      this.tableManager.setEntries(this.entries)
      this.updateViewToggle()
      if (this.chartManager && this.chartManager.hasChart()) {
        await this.chartManager.loadData()
      }
    } catch (error) {
      console.error('Speedtest history API call failed:', error)
      this.tableManager.setStatus(`Unable to load speedtests: ${error.message}`)
    }
  }

  setView (view) {
    const targetView = view === 'table' ? 'table' : view === 'none' ? 'none' : 'chart'

    // Show/hide period select based on view
    if (this.elements.periodSelect) {
      this.elements.periodSelect.style.display = targetView === 'chart' ? '' : 'none'
    }

    this.currentView = ChartManager.setView(view, this.elements, this.currentView, this.chartManager)

    // Update toggle visibility when view changes
    if (this.tableManager) {
      this.tableManager.updateToggleVisibility()
    }
  }

  updateViewToggle () {
    if (!this.elements.viewToggle) return

    if (this.entries.length > 0) {
      this.elements.viewToggle.style.display = ''
      if (!this.currentView) {
        this.setView(this.config.default)
      }
    } else {
      this.elements.viewToggle.style.display = 'none'
    }
  }
}

window.widgets = window.widgets || {}
window.widgets.speedtest = SpeedtestWidget
