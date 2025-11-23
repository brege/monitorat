class WidgetHelpers {
  static buildConfig (defaults, widgetConfig = {}, overrides = {}) {
    const merged = { ...defaults, ...widgetConfig, ...overrides }
    const table = { ...defaults.table, ...(widgetConfig.table || {}), ...(overrides.table || {}) }
    const chart = { ...defaults.chart, ...(widgetConfig.chart || {}), ...(overrides.chart || {}) }
    const periods = Array.isArray(merged.periods) ? [...merged.periods] : Array.isArray(defaults.periods) ? [...defaults.periods] : []

    return {
      ...merged,
      name: typeof merged.name !== 'undefined' ? merged.name : defaults.name,
      default: typeof merged.default === 'string' ? merged.default : defaults.default,
      table,
      chart,
      periods
    }
  }

  static setupPeriodSelect (selectElement, periods, selectedPeriod, onChange) {
    if (!selectElement) return

    selectElement.innerHTML = ''
    const allOption = document.createElement('option')
    allOption.value = 'all'
    allOption.textContent = 'All'
    selectElement.appendChild(allOption)

    if (Array.isArray(periods)) {
      for (const period of periods) {
        const option = document.createElement('option')
        option.value = period
        option.textContent = period
        selectElement.appendChild(option)
      }
    }

    selectElement.value = selectedPeriod
    if (typeof onChange === 'function') {
      selectElement.addEventListener('change', (event) => onChange(event.target.value))
    }
  }

  static setView ({ view, currentView, container, attributeName, chartManager, onChartReady, controlsForChart = [] }) {
    const q = (name) => container?.querySelector(`[${attributeName}="${name}"]`)
    const elements = {
      viewToggle: q('view-toggle'),
      chartContainer: q('chart-container'),
      tableContainer: q('table-container'),
      viewChart: q('view-chart'),
      viewTable: q('view-table')
    }

    const nextView = window.monitorShared.ChartManager.setView(view, {
      viewToggle: elements.viewToggle,
      chartContainer: elements.chartContainer,
      tableContainer: elements.tableContainer,
      viewChart: elements.viewChart,
      viewTable: elements.viewTable
    }, currentView, chartManager, onChartReady)

    const showControls = nextView === 'chart'
    controlsForChart.filter(Boolean).forEach((element) => {
      element.style.display = showControls ? '' : 'none'
    })

    return nextView
  }

  static updateViewToggle ({ container, attributeName, hasEntries, currentView, defaultViewSetter }) {
    const toggle = container.querySelector(`[${attributeName}="view-toggle"]`)
    if (!toggle) return currentView

    if (!hasEntries) {
      toggle.style.display = 'none'
      return currentView
    }

    toggle.style.display = ''
    if (!currentView && typeof defaultViewSetter === 'function') {
      return defaultViewSetter()
    }

    return currentView
  }

  static formatTableRow ({ entry, metricFields = [], metadataField }) {
    const DataFormatter = window.monitorShared.DataFormatter
    const row = [DataFormatter.formatTimestamp(entry.timestamp)]

    for (const metric of metricFields) {
      row.push(DataFormatter.formatBySchema(entry[metric.field], metric))
    }

    row.push(entry.source || entry[metadataField] || '')
    return row
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.WidgetHelpers = WidgetHelpers

const ChartTableWidgetMethods = {
  getElement (name) {
    return this.container?.querySelector(`[${this.attributeName}="${name}"]`)
  },

  setView (view) {
    const controls = this.getViewControls()

    this.currentView = WidgetHelpers.setView({
      view,
      currentView: this.currentView,
      container: this.container,
      attributeName: this.attributeName,
      chartManager: this.chartManager,
      onChartReady: () => {
        if (typeof this.updateChartView === 'function') {
          this.updateChartView()
        } else if (this.chartManager?.hasChart()) {
          this.chartManager.loadData()
        }
      },
      controlsForChart: controls
    })

    if (this.tableManager) this.tableManager.updateToggleVisibility()
    return this.currentView
  },

  updateViewToggle (hasEntries) {
    this.currentView = WidgetHelpers.updateViewToggle({
      container: this.container,
      attributeName: this.attributeName,
      hasEntries,
      currentView: this.currentView,
      defaultViewSetter: () => this.setView(this.config.default || this.defaults.default)
    })
  },

  getViewControls () {
    return []
  },

  wireViewToggles () {
    const viewChart = this.getElement('view-chart')
    const viewTable = this.getElement('view-table')

    if (viewChart) viewChart.addEventListener('click', () => this.setView('chart'))
    if (viewTable) viewTable.addEventListener('click', () => this.setView('table'))
  },

  rebuildTableHeaders () {
    const metadataLabel = this.schema?.metadata?.label || 'Source'
    const TableManager = window.monitorShared.TableManager
    TableManager.buildTableHeaders(this.container, this.metricFields, metadataLabel)
  },

  formatTableRow (entry) {
    const metadataField = this.schema?.metadata?.field
    return WidgetHelpers.formatTableRow({
      entry,
      metricFields: this.metricFields,
      metadataField
    })
  },

  createTableManager () {
    const TableManager = window.monitorShared?.TableManager

    return new TableManager({
      statusElement: this.getElement('history-status'),
      rowsElement: this.getElement('rows'),
      toggleElement: this.getElement('toggle'),
      previewCount: this.config.table.min,
      emptyMessage: this.schema?.metadata?.emptyMessage || 'No entries yet.',
      isTableViewActive: () => this.currentView === 'table',
      rowFormatter: (entry) => this.formatTableRow(entry)
    })
  }
}

window.monitorShared.ChartTableWidgetMethods = ChartTableWidgetMethods
