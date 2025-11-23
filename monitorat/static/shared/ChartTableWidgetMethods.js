/* global ChartManager, WidgetHelpers */
const ChartTableWidgetMethods = {
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
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.ChartTableWidgetMethods = ChartTableWidgetMethods
