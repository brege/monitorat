// Metrics Widget
/* global ChartManager, DataFormatter */
class MetricsWidget {
  constructor (widgetConfig = {}) {
    this.container = null
    this.widgetConfig = widgetConfig
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
    this.metricFields = [...this.schema.metrics, ...this.schema.computed.flatMap(g => g.fields)]
  }

  buildConfig (overrides = {}) {
    const merged = { ...this.widgetConfig, ...overrides }
    const table = { ...this.defaults.table, ...(this.widgetConfig.table || {}), ...(overrides.table || {}) }
    const chart = { ...this.defaults.chart, ...(this.widgetConfig.chart || {}), ...(overrides.chart || {}) }
    const periods = Array.isArray(merged.periods) ? [...merged.periods] : [...this.defaults.periods]
    return {
      _suppressHeader: merged._suppressHeader,
      name: typeof merged.name !== 'undefined' ? merged.name : this.defaults.name,
      default: typeof merged.default === 'string' ? merged.default : this.defaults.default,
      table,
      chart,
      periods
    }
  }

  async init (container, config = {}) {
    this.container = container
    this.config = this.buildConfig(config)
    this.selectedPeriod = this.config.chart.default_period || this.defaults.chart.default_period

    await this.loadSchema()
    this.selectedMetric = this.config.chart.default_metric || this.defaults.chart.default_metric

    const response = await fetch('widgets/metrics/metrics.html')
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
    const viewChart = this.container.querySelector('[data-metrics="view-chart"]')
    const viewTable = this.container.querySelector('[data-metrics="view-table"]')
    const metricSelect = this.container.querySelector('[data-metrics="metric-select"]')
    const periodSelect = this.container.querySelector('[data-metrics="period-select"]')

    if (viewChart) viewChart.addEventListener('click', () => this.setView('chart'))
    if (viewTable) viewTable.addEventListener('click', () => this.setView('table'))

    if (metricSelect) {
      metricSelect.innerHTML = ''
      for (const metric of this.schema.metrics) {
        const option = document.createElement('option')
        option.value = metric.field
        option.textContent = metric.label
        metricSelect.appendChild(option)
      }
      for (const group of this.schema.computed) {
        const option = document.createElement('option')
        option.value = group.group
        option.textContent = group.label
        metricSelect.appendChild(option)
      }
      metricSelect.value = this.selectedMetric
      metricSelect.addEventListener('change', (e) => {
        this.selectedMetric = e.target.value
        if (this.chartManager?.hasChart()) this.updateChart()
      })
    }

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
        this.loadHistory()
      })
    }
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
    const thead = this.container.querySelector('thead tr')
    if (!thead) return
    const headers = ['Timestamp']
    const enabled = this.config.metrics?.enabled
    const all = !enabled || enabled.length === 0

    for (const metric of this.metricFields) {
      if (all || enabled.includes(metric.field)) {
        headers.push(metric.label)
      }
    }
    headers.push('Source')
    const DataFormatter = window.monitorShared.DataFormatter
    DataFormatter.updateTableHeaders(thead, headers)
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

  formatTableRow (entry) {
    const DataFormatter = window.monitorShared.DataFormatter
    const row = [DataFormatter.formatTimestamp(entry.timestamp)]
    const enabled = this.config.metrics?.enabled
    const all = !enabled || enabled.length === 0

    for (const metric of this.metricFields) {
      if (all || enabled.includes(metric.field)) {
        const value = entry[metric.field]
        const formatted = value === null || value === undefined ? '–' : DataFormatter.formatNumber(value, metric.decimals)
        row.push(formatted + metric.unit)
      }
    }

    row.push(entry.source || '')
    return row
  }

  setView (view) {
    const DataFormatter = window.monitorShared.DataFormatter
    const elements = DataFormatter.selectByAttribute(this.container, 'data-metrics', [
      'view-toggle', 'chart-container', 'table-container', 'view-chart', 'view-table', 'metric-select', 'period-select'
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
            if (this.chartManager.hasChart()) this.updateChart()
          })
        }
      } else {
        elements['chart-container'].style.display = 'none'
        elements['table-container'].style.display = ''
        elements['view-chart'].classList.remove('active')
        elements['view-table'].classList.add('active')
      }
      if (elements['metric-select']) elements['metric-select'].style.display = targetView === 'chart' ? '' : 'none'
      if (elements['period-select']) elements['period-select'].style.display = targetView === 'chart' ? '' : 'none'
    }

    this.currentView = targetView
    if (this.tableManager) this.tableManager.updateToggleVisibility()
  }

  initManagers () {
    const DataFormatter = window.monitorShared?.DataFormatter
    const ChartManager = window.monitorShared?.ChartManager
    const TableManager = window.monitorShared?.TableManager

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
      isTableViewActive: () => this.currentView === 'table',
      rowFormatter: (entry) => this.formatTableRow(entry)
    })
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
      this.updateViewToggle()

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

    if (!chartData.allValues?.length) return

    const min = Math.min(...chartData.allValues.filter(v => !isNaN(v)))
    const max = Math.max(...chartData.allValues.filter(v => !isNaN(v)))
    const padding = (max - min) * 0.1

    const yAxisLabel = this.schema.computed.find(g => g.group === this.selectedMetric)?.yAxisLabel ||
                       this.schema.metrics.find(m => m.field === this.selectedMetric)?.yAxisLabel ||
                       'Value'

    const scales = {
      x: { display: true },
      y: {
        title: { display: true, text: yAxisLabel },
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
      if (!this.currentView) this.setView('chart')
    }
  }
}

window.widgets = window.widgets || {}
window.widgets.metrics = MetricsWidget
