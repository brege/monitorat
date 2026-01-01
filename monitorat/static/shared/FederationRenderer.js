class FederationRenderer {
  static renderColumnated (sources, sourceStates, options = {}) {
    const {
      containerClass = 'federation-columns',
      columnClass = 'federation-column',
      headerClass = 'federation-source-header',
      contentRenderer
    } = options

    const columns = document.createElement('div')
    columns.className = containerClass

    for (const source of sources) {
      const sourceState = sourceStates[source]
      const column = document.createElement('div')
      column.className = columnClass

      const header = document.createElement('div')
      header.className = headerClass
      header.textContent = source
      column.appendChild(header)

      if (typeof contentRenderer === 'function') {
        const content = contentRenderer(source, sourceState)
        if (content) column.appendChild(content)
      }

      columns.appendChild(column)
    }

    return columns
  }

  static renderStacked (sources, sourceStates, options = {}) {
    const {
      sectionClass = 'federation-stack-section',
      headerClass = 'federation-source-header',
      contentRenderer
    } = options

    const wrapper = document.createDocumentFragment()

    for (const source of sources) {
      const sourceState = sourceStates[source]
      const section = document.createElement('div')
      section.className = sectionClass

      const header = document.createElement('div')
      header.className = headerClass
      header.textContent = source
      section.appendChild(header)

      if (typeof contentRenderer === 'function') {
        const content = contentRenderer(source, sourceState)
        if (content) section.appendChild(content)
      }

      wrapper.appendChild(section)
    }

    return wrapper
  }

  static createSourceBadge (source, className = 'federation-source-badge') {
    const badge = document.createElement('span')
    badge.className = className
    badge.textContent = source
    return badge
  }

  static createSourceLabel (source, className = 'federation-source-label') {
    const label = document.createElement('span')
    label.className = className
    label.textContent = source
    return label
  }

  static createNoDataMessage (message = 'No data available.', className = 'muted') {
    const element = document.createElement('p')
    element.className = className
    element.textContent = message
    return element
  }

  static createErrorMessage (error, fallback = 'No data available.', className = 'muted') {
    return this.createNoDataMessage(error || fallback, className)
  }

  static resolveStrategy (federationConfig, feature, defaultStrategy = 'columnate') {
    if (!federationConfig?.display) return defaultStrategy
    return federationConfig.display[feature] || defaultStrategy
  }

  static hasMergeSources (federationConfig) {
    const merge = federationConfig?.merge
    return merge && Array.isArray(merge) && merge.length > 1
  }

  static getMergeSources (federationConfig) {
    const merge = federationConfig?.merge
    if (!merge || !Array.isArray(merge)) return []
    return merge
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.FederationRenderer = FederationRenderer
