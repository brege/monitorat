class FederationRenderer {
  static renderColumnated (sources, sourceStates, options = {}) {
    const {
      containerClass = 'layout-columns',
      columnClass = 'layout-column',
      headerClass = 'feature-header',
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

  static renderSources (sources, sourceStates, options = {}) {
    const {
      headerClass = 'feature-header',
      contentRenderer
    } = options

    const wrapper = document.createDocumentFragment()

    for (const source of sources) {
      const sourceState = sourceStates[source]

      const header = document.createElement('div')
      header.className = headerClass
      header.textContent = source
      wrapper.appendChild(header)

      if (typeof contentRenderer === 'function') {
        const content = contentRenderer(source, sourceState)
        if (content) wrapper.appendChild(content)
      }
    }

    return wrapper
  }

  static createSourceBadge (source, className = 'source-badge') {
    const badge = document.createElement('span')
    badge.className = className
    badge.textContent = source
    return badge
  }

  static createSourceLabel (source, className = 'source-label') {
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

  static hasNodeSources (federationConfig) {
    const nodes = federationConfig?.nodes
    return nodes && Array.isArray(nodes) && nodes.length > 1
  }

  static getNodeSources (federationConfig) {
    const nodes = federationConfig?.nodes
    if (!nodes || !Array.isArray(nodes)) return []
    return nodes
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.FederationRenderer = FederationRenderer
