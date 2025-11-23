// Metrics Widget
/* global ChartManager, DataFormatter, WidgetHelpers, ChartTableWidgetMethods */
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
    return WidgetHelpers.buildConfig(this.defaults, this.widgetConfig, overrides)
  }

  resolveMetricFields () {
    const allMetrics = [...(this.schema?.metrics || []), ...(this.schema?.computed || []).flatMap(group => group.fields)]
    const enabled = this.config?.metrics?.enabled
    if (Array.isArray(enabled) && enabled.length > 0) {
      return allMetrics.filter(metric => enabled.includes(metric.field))
    }
    return allMetrics
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
    const viewChart = WidgetHelpers.getElement(this.container, this.attributeName, 'view-chart')
    const viewTable = WidgetHelpers.getElement(this.container, this.attributeName, 'view-table')
    const metricSelect = WidgetHelpers.getElement(this.container, this.attributeName, 'metric-select')
    const periodSelect = WidgetHelpers.getElement(this.container, this.attributeName, 'period-select')

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
      metricSelect.addEventListener('change', (event) => {
        this.selectedMetric = event.target.value
        if (this.chartManager?.hasChart()) this.updateChart()
      })
    }

    WidgetHelpers.setupPeriodSelect(periodSelect, this.config.chart.periods, this.selectedPeriod, (period) => {
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
    WidgetHelpers.buildTableHeaders(this.container, this.metricFields, metadataLabel)
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
    return ChartTableWidgetMethods.formatTableRow.call(this, entry)
  }

  rebuildTableHeaders () {
    return ChartTableWidgetMethods.rebuildTableHeaders.call(this)
  }

  setView (view) {
    return ChartTableWidgetMethods.setView.call(this, view)
  }

  updateViewToggle (hasEntries) {
    return ChartTableWidgetMethods.updateViewToggle.call(this, hasEntries)
  }

  getViewControls () {
    return [
      WidgetHelpers.getElement(this.container, this.attributeName, 'metric-select'),
      WidgetHelpers.getElement(this.container, this.attributeName, 'period-select')
    ]
  }

  initManagers () {
    const ChartManager = window.monitorShared?.ChartManager
    const TableManager = window.monitorShared?.TableManager

    this.chartManager = new ChartManager({
      canvasElement: WidgetHelpers.getElement(this.container, this.attributeName, 'chart'),
      containerElement: WidgetHelpers.getElement(this.container, this.attributeName, 'chart-container'),
      height: this.config.chart.height,
      dataUrl: null,
      chartOptions: {}
    })

    this.tableManager = new TableManager({
      statusElement: WidgetHelpers.getElement(this.container, this.attributeName, 'history-status'),
      rowsElement: WidgetHelpers.getElement(this.container, this.attributeName, 'rows'),
      toggleElement: WidgetHelpers.getElement(this.container, this.attributeName, 'toggle'),
      previewCount: this.config.table.min,
      emptyMessage: this.schema?.metadata?.emptyMessage || 'No metrics history yet.',
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
    const scales = WidgetHelpers.buildScalesFromSchema(axes, {
      y: {
        title: { text: yAxisLabel },
        min: Math.max(0, min - padding),
        max: max + padding
      }
    })

    this.chartManager.updateChart({ labels: chartData.labels, datasets: chartData.datasets }, scales)
  }

  updateViewToggle (hasEntries) {
    this.currentView = WidgetHelpers.updateViewToggle({
      container: this.container,
      attributeName: this.attributeName,
      hasEntries,
      currentView: this.currentView,
      defaultViewSetter: () => this.setView(this.config.default || this.defaults.default)
    })
  }
}

window.widgets = window.widgets || {}
window.widgets.metrics = MetricsWidget
