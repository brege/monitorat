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

  static selectElements (container, attributeName, names) {
    const DataFormatter = window.monitorShared.DataFormatter
    return DataFormatter.selectByAttribute(container, attributeName, names)
  }

  static getElement (container, attributeName, name) {
    if (!container) return null
    return container.querySelector(`[${attributeName}="${name}"]`)
  }

  static toggleControls (controls, show) {
    if (!Array.isArray(controls)) return
    controls.filter(Boolean).forEach((element) => {
      element.style.display = show ? '' : 'none'
    })
  }

  static setView ({ view, currentView, container, attributeName, chartManager, onChartReady, controlsForChart = [] }) {
    const elements = this.selectElements(container, attributeName, [
      'view-toggle', 'chart-container', 'table-container', 'view-chart', 'view-table'
    ])

    const nextView = window.monitorShared.ChartManager.setView(view, {
      viewToggle: elements['view-toggle'],
      chartContainer: elements['chart-container'],
      tableContainer: elements['table-container'],
      viewChart: elements['view-chart'],
      viewTable: elements['view-table']
    }, currentView, chartManager, onChartReady)

    this.toggleControls(controlsForChart, nextView === 'chart')
    if (nextView !== 'chart') {
      this.toggleControls(controlsForChart, false)
    }

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

  static cloneObject (object) {
    return JSON.parse(JSON.stringify(object || {}))
  }

  static mergeObjects (baseObject, overrideObject) {
    const merged = this.cloneObject(baseObject)
    Object.entries(overrideObject || {}).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.mergeObjects(merged[key] || {}, value)
      } else {
        merged[key] = value
      }
    })
    return merged
  }

  static buildScalesFromSchema (axes = {}, overrides = {}) {
    const scales = {}
    Object.entries(axes || {}).forEach(([scaleId, config]) => {
      scales[scaleId] = this.cloneObject(config)
    })

    Object.entries(overrides || {}).forEach(([scaleId, overrideConfig]) => {
      scales[scaleId] = this.mergeObjects(scales[scaleId] || {}, overrideConfig)
    })

    return scales
  }

  static buildTableHeaders (container, metricFields = [], metadataLabel = 'Source') {
    const headerRow = container?.querySelector('thead tr')
    if (!headerRow) return

    const headers = ['Timestamp']
    for (const metric of metricFields) {
      headers.push(metric.label)
    }
    headers.push(metadataLabel)

    const DataFormatter = window.monitorShared.DataFormatter
    DataFormatter.updateTableHeaders(headerRow, headers)
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
