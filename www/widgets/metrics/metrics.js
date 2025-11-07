// Metrics Widget
/* global ChartManager */
class MetricsWidget {
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
    this.chartManager = null
    this.tableManager = null
    this.currentView = null
    this.entries = []
    this.selectedMetric = 'cpu_memory'
    this.selectedPeriod = 'all'
  }

  async init (container, config = {}) {
    this.container = container
    const defaultView = (typeof config.default === 'string' && config.default.toLowerCase() === 'table') ? 'table' : 'chart'
    const hasExplicitName = Object.prototype.hasOwnProperty.call(config, 'name')
    const configuredMetric = config.chart?.default_metric ?? config.chart?.defaultMetric
    this.config = {
      _suppressHeader: config._suppressHeader,
      name: hasExplicitName ? config.name : this.widgetConfig.name,
      default: defaultView,
      table: {
        min: config.table?.min || 5,
        max: config.table?.max || 200
      },
      chart: {
        height: config.chart?.height || '400px',
        days: config.chart?.days || 30,
        periods: config.periods || ['1 hour', '1 day', '1 week'],
        defaultPeriod: config.chart?.default_period ?? config.chart?.defaultPeriod
      }
    }
    this.selectedPeriod = this.config.chart.defaultPeriod || 'all'
    if (typeof configuredMetric === 'string') {
      this.selectedMetric = configuredMetric.toLowerCase()
    }

    const response = await fetch('widgets/metrics/metrics.html')
    const html = await response.text()
    container.innerHTML = html

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name
      })
    }

    const viewChart = container.querySelector('[data-metrics="view-chart"]')
    const viewTable = container.querySelector('[data-metrics="view-table"]')
    const metricSelect = container.querySelector('[data-metrics="metric-select"]')
    const periodSelect = container.querySelector('[data-metrics="period-select"]')

    if (viewChart) {
      viewChart.addEventListener('click', () => this.setView('chart'))
    }
    if (viewTable) {
      viewTable.addEventListener('click', () => this.setView('table'))
    }
    if (metricSelect) {
      metricSelect.value = this.selectedMetric
      metricSelect.addEventListener('change', (e) => {
        this.selectedMetric = e.target.value
        if (this.chartManager && this.chartManager.hasChart()) {
          this.updateChart()
        }
      })
    }
    if (periodSelect) {
      // Populate period options
      periodSelect.innerHTML = '<option value="all">All</option>'
      this.config.chart.periods.forEach(period => {
        const option = document.createElement('option')
        option.value = period
        option.textContent = period
        periodSelect.appendChild(option)
      })

      periodSelect.value = this.selectedPeriod
      periodSelect.addEventListener('change', (e) => {
        this.selectedPeriod = e.target.value
        this.loadHistory()
      })
    }

    this.initManagers()
    await this.loadData()
    this.setView(this.config.default)
    await this.loadHistory()
  }

  async loadData () {
    try {
      const response = await fetch('api/metrics')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      this.update(data)
    } catch (error) {
      console.error('Unable to load metrics:', error.message)
    }
  }

  update (data) {
    if (!data.metrics || !data.metric_statuses) return

    const elements = {
      uptime: document.getElementById('uptime-value'),
      load: document.getElementById('load-value'),
      memory: document.getElementById('memory-value'),
      temp: document.getElementById('temp-value'),
      disk: document.getElementById('disk-value'),
      storage: document.getElementById('storage-value')
    }

    const stats = {
      uptime: document.querySelector('#uptime-value')?.closest('.stat'),
      load: document.querySelector('#load-value')?.closest('.stat'),
      memory: document.querySelector('#memory-value')?.closest('.stat'),
      temp: document.querySelector('#temp-value')?.closest('.stat'),
      disk: document.querySelector('#disk-value')?.closest('.stat'),
      storage: document.querySelector('#storage-value')?.closest('.stat')
    }

    if (elements.uptime && data.metrics.uptime) {
      elements.uptime.textContent = data.metrics.uptime
    }
    if (elements.load && data.metrics.load) {
      elements.load.textContent = data.metrics.load
    }
    if (elements.memory && data.metrics.memory) {
      elements.memory.textContent = data.metrics.memory
    }
    if (elements.temp && data.metrics.temp) {
      elements.temp.textContent = data.metrics.temp
    }
    if (elements.disk && data.metrics.disk) {
      elements.disk.textContent = data.metrics.disk
    }
    if (elements.storage && data.metrics.storage) {
      elements.storage.textContent = data.metrics.storage
    }

    Object.keys(stats).forEach(key => {
      if (stats[key] && data.metric_statuses[key]) {
        const status = data.metric_statuses[key]
        stats[key].className = stats[key].className.replace(/status-\w+/g, '')
        stats[key].classList.add(`status-${status}`)
      }
    })
  }

  setView (view) {
    const elements = {
      viewToggle: this.container.querySelector('[data-metrics="view-toggle"]'),
      chartContainer: this.container.querySelector('[data-metrics="chart-container"]'),
      tableContainer: this.container.querySelector('[data-metrics="table-container"]'),
      viewChart: this.container.querySelector('[data-metrics="view-chart"]'),
      viewTable: this.container.querySelector('[data-metrics="view-table"]'),
      metricSelect: this.container.querySelector('[data-metrics="metric-select"]'),
      periodSelect: this.container.querySelector('[data-metrics="period-select"]')
    }

    const targetView = view === 'table' ? 'table' : view === 'none' ? 'none' : 'chart'

    // Show/hide metric and period selects based on view
    if (elements.metricSelect) {
      elements.metricSelect.style.display = targetView === 'chart' ? '' : 'none'
    }
    if (elements.periodSelect) {
      elements.periodSelect.style.display = targetView === 'chart' ? '' : 'none'
    }

    this.currentView = ChartManager.setView(view, elements, this.currentView, this.chartManager, () => {
      this.updateChart()
    })
  }

  initManagers () {
    const DataFormatter = window.monitorShared?.DataFormatter
    const ChartManager = window.monitorShared?.ChartManager
    const TableManager = window.monitorShared?.TableManager

    if (!DataFormatter || !ChartManager || !TableManager) {
      throw new Error('Shared modules not available')
    }

    this.chartManager = new ChartManager({
      canvasElement: this.container.querySelector('[data-metrics="chart"]'),
      containerElement: this.container.querySelector('[data-metrics="chart-container"]'),
      height: this.config.chart.height,
      dataUrl: null,
      chartOptions: {}
    })

    this.tableManager = new TableManager({
      statusElement: this.container.querySelector('[data-metrics="history-status"]'),
      rowsElement: this.container.querySelector('[data-metrics="rows"]'),
      toggleElement: this.container.querySelector('[data-metrics="toggle"]'),
      previewCount: this.config.table.min,
      emptyMessage: 'No metrics history yet.',
      rowFormatter: (entry) => [
        DataFormatter.formatTimestamp(entry.timestamp),
        DataFormatter.formatNumber(entry.cpu_percent, 1) + '%',
        DataFormatter.formatNumber(entry.memory_percent, 1) + '%',
        DataFormatter.formatNumber(entry.disk_read_rate, 1),
        DataFormatter.formatNumber(entry.disk_write_rate, 1),
        DataFormatter.formatNumber(entry.net_rx_rate, 1),
        DataFormatter.formatNumber(entry.net_tx_rate, 1),
        DataFormatter.formatNumber(entry.load_1min, 2),
        DataFormatter.formatNumber(entry.temp_c, 1) + '°C',
        entry.source || ''
      ]
    })
  }

  async loadHistory () {
    if (!this.tableManager) return

    this.tableManager.setEntries([])
    this.tableManager.setStatus('Loading metrics history…')

    try {
      const url = new URL('api/metrics/history', window.location)
      if (this.selectedPeriod && this.selectedPeriod !== 'all') {
        url.searchParams.set('period', this.selectedPeriod)
      }
      url.searchParams.set('ts', Date.now())

      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const payload = await response.json()
      const data = payload.data || []
      this.entries = data

      // Calculate deltas for I/O metrics using shared utility
      const transformedEntries = ChartManager.calculateTableDeltas(this.entries)

      // Table gets limited entries, chart gets all entries
      const tableEntries = transformedEntries.slice(-this.config.table.max).reverse()
      this.tableManager.setEntries(tableEntries)
      this.updateViewToggle()

      if (this.chartManager && this.chartManager.hasChart()) {
        this.updateChart()
      }
    } catch (error) {
      this.tableManager.setStatus(`Unable to load metrics history: ${error.message}`)
    }
  }

  updateChart () {
    if (!this.chartManager || !this.chartManager.chart || !this.entries.length) return

    const DataFormatter = window.monitorShared.DataFormatter
    const chartData = ChartManager.createMetricsChartData(this.entries, this.selectedMetric, DataFormatter)

    if (!chartData.allValues || !chartData.allValues.length) return

    const min = Math.min(...chartData.allValues.filter(v => !isNaN(v)))
    const max = Math.max(...chartData.allValues.filter(v => !isNaN(v)))
    const padding = (max - min) * 0.1

    const scales = {
      y: {
        title: {
          display: true,
          text: ChartManager.getMetricsYAxisLabel(this.selectedMetric)
        },
        min: Math.max(0, min - padding),
        max: max + padding
      }
    }

    this.chartManager.updateChart({ labels: chartData.labels, datasets: chartData.datasets }, scales)
  }

  updateViewToggle () {
    const viewToggle = this.container.querySelector('[data-metrics="view-toggle"]')
    if (viewToggle) {
      viewToggle.style.display = ''
      if (!this.currentView) {
        this.setView('chart')
      }
    }
  }
}

// Register widget
window.widgets = window.widgets || {}
window.widgets.metrics = MetricsWidget
