class MetricsSnapshot {
  constructor (widget) {
    this.widget = widget
  }

  render (data) {
    if (!data.metrics || !data.metric_statuses) return

    const keys = data.keys || Object.keys(data.metrics).filter(key => key !== 'status' && key !== 'lastUpdated')
    const valueElements = {}
    const statElements = {}

    for (const key of keys) {
      const element = this.widget.container.querySelector(`#${key}-value`)
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

  renderMerged (results, displayStrategy) {
    const statsContainer = this.widget.container.querySelector('.stats')
    if (!statsContainer) return

    const existingRows = statsContainer.querySelectorAll('.stats-row')
    existingRows.forEach(row => { row.style.display = 'none' })

    let mergedContainer = statsContainer.querySelector('.federation-merged-tiles')
    if (!mergedContainer) {
      mergedContainer = document.createElement('div')
      mergedContainer.className = 'federation-merged-tiles'
      statsContainer.appendChild(mergedContainer)
    }
    mergedContainer.innerHTML = ''

    if (displayStrategy === 'columnate') {
      this.renderColumnated(mergedContainer, results)
    } else {
      this.renderStacked(mergedContainer, results)
    }
  }

  renderColumnated (container, results) {
    const columns = document.createElement('div')
    columns.className = 'federation-columns metrics-tile-columns'

    for (const result of results) {
      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('div')
      header.className = 'federation-source-header'
      header.textContent = result.source
      column.appendChild(header)

      if (result.data) {
        const tiles = this.createTilesForSource(result.data)
        column.appendChild(tiles)
      } else {
        const error = document.createElement('p')
        error.className = 'muted'
        error.textContent = result.error || 'Unable to load'
        column.appendChild(error)
      }

      columns.appendChild(column)
    }

    container.appendChild(columns)
  }

  renderStacked (container, results) {
    for (const result of results) {
      const section = document.createElement('div')
      section.className = 'federation-stack-section'

      const header = document.createElement('div')
      header.className = 'federation-source-header'
      header.textContent = result.source
      section.appendChild(header)

      if (result.data) {
        const tiles = this.createTilesForSource(result.data)
        section.appendChild(tiles)
      } else {
        const error = document.createElement('p')
        error.className = 'muted'
        error.textContent = result.error || 'Unable to load'
        section.appendChild(error)
      }

      container.appendChild(section)
    }
  }

  createTilesForSource (data) {
    const tilesContainer = document.createElement('div')
    tilesContainer.className = 'metrics-source-tiles'

    const allKeys = data.metric_keys || Object.keys(data.metrics || {})
    const keys = allKeys.filter(key => key !== 'status' && key !== 'lastUpdated')
    const metrics = data.metrics || {}
    const statuses = data.metric_statuses || {}

    const labels = {
      uptime: 'Uptime',
      load: 'Load',
      memory: 'Memory',
      temp: 'Temp',
      disk: 'Disk',
      storage: 'Storage'
    }

    for (const key of keys) {
      const tile = document.createElement('div')
      tile.className = `stat status-card status-${statuses[key] || 'ok'}`

      const label = document.createElement('span')
      label.className = 'label'
      label.textContent = labels[key] || key

      const value = document.createElement('span')
      value.className = 'value'
      value.textContent = metrics[key] || '–'

      tile.appendChild(label)
      tile.appendChild(value)
      tilesContainer.appendChild(tile)
    }

    return tilesContainer
  }
}

window.MetricsSnapshot = MetricsSnapshot
