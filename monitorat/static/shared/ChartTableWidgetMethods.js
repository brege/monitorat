/* global ChartManager, WidgetHelpers */
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
    WidgetHelpers.buildTableHeaders(this.container, this.metricFields, metadataLabel)
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

window.monitorShared = window.monitorShared || {}
window.monitorShared.ChartTableWidgetMethods = ChartTableWidgetMethods
