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
      this.renderSources(mergedContainer, results)
    }
  }

  renderColumnated (container, results) {
    const columns = document.createElement('div')
    columns.className = 'federation-columns metrics-tile-columns'

    for (const result of results) {
      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('div')
      header.className = 'feature-header'
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

  renderSources (container, results) {
    for (const result of results) {
      const header = document.createElement('div')
      header.className = 'feature-header'
      header.textContent = result.source
      container.appendChild(header)

      if (result.data) {
        const tiles = this.createTilesForSource(result.data)
        container.appendChild(tiles)
      } else {
        const error = document.createElement('p')
        error.className = 'muted'
        error.textContent = result.error || 'Unable to load'
        container.appendChild(error)
      }
    }
  }

  createTilesForSource (data) {
    const TileRenderer = window.monitorShared.TileRenderer
    const metrics = data.metrics || {}
    const statuses = data.metric_statuses || {}

    const resolveTileClass = (key) => {
      const status = statuses[key] || 'ok'
      return `stat status-card status-${status}`
    }

    return TileRenderer.createTilesFromSpec({
      containerClass: 'stats',
      rows: [
        {
          className: 'stats-row primary',
          tiles: [
            { label: 'Uptime', value: metrics.uptime || '–', options: { tileClass: resolveTileClass('uptime') } },
            { label: 'Load Average', value: metrics.load || '–', options: { tileClass: resolveTileClass('load') } },
            { label: 'Memory Usage', value: metrics.memory || '–', options: { tileClass: resolveTileClass('memory') } },
            { label: 'Temperature', value: metrics.temp || '–', options: { tileClass: resolveTileClass('temp') } }
          ]
        },
        {
          className: 'stats-row dates',
          tiles: [
            { label: 'Disk Usage', value: metrics.disk || '–', options: { tileClass: resolveTileClass('disk') } },
            { label: 'NFS Storage', value: metrics.storage || '–', options: { tileClass: resolveTileClass('storage') } }
          ]
        }
      ]
    })
  }
}

window.MetricsSnapshot = MetricsSnapshot
