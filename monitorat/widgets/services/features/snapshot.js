class ServicesSnapshot {
  constructor (widget) {
    this.widget = widget
  }

  render () {
    const cardsContainer = this.widget.container.querySelector('.service-grid')
    if (!cardsContainer || !this.widget.servicesData) return

    cardsContainer.innerHTML = ''

    const strategy = this.widget.getDisplayStrategy()
    const hasMergedSources = this.widget.config.federation?.merge

    if (hasMergedSources && strategy === 'stack') {
      this.renderStacked(cardsContainer)
    } else if (hasMergedSources && strategy === 'columnate') {
      this.renderColumnate(cardsContainer)
    } else {
      this.renderMerged(cardsContainer)
    }
  }

  renderMerged (container) {
    const sorted = this.widget.sortServices(this.widget.servicesData)
    sorted.forEach(service => {
      container.appendChild(this.createServiceCard(service))
    })
  }

  renderStacked (container) {
    const sources = this.widget.config.federation?.merge || []
    const wrapper = document.createElement('div')
    wrapper.className = 'federation-stacked'

    sources.forEach(source => {
      const sourceServices = this.widget.servicesData.filter(service => service._source === source)
      if (sourceServices.length === 0) return

      const section = document.createElement('div')
      section.className = 'federation-stack-section'

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      section.appendChild(header)

      const grid = document.createElement('div')
      grid.className = 'service-grid-inner'
      const sorted = this.widget.sortServices(sourceServices)
      sorted.forEach(service => {
        grid.appendChild(this.createServiceCard(service))
      })
      section.appendChild(grid)

      wrapper.appendChild(section)
    })

    container.appendChild(wrapper)
  }

  renderColumnate (container) {
    const sources = this.widget.config.federation?.merge || []
    const columns = document.createElement('div')
    columns.className = 'federation-columns'
    columns.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;'

    sources.forEach(source => {
      const sourceServices = this.widget.servicesData.filter(service => service._source === source)
      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      column.appendChild(header)

      const grid = document.createElement('div')
      grid.className = 'service-grid-inner'
      const sorted = this.widget.sortServices(sourceServices)
      sorted.forEach(service => {
        grid.appendChild(this.createServiceCard(service))
      })
      column.appendChild(grid)

      columns.appendChild(column)
    })

    container.appendChild(columns)
  }

  createServiceCard (service) {
    const card = document.createElement('div')
    const hasBadge = this.widget.config.remote || service._source
    card.className = `service-card card status-card${hasBadge ? ' has-badge' : ''}`
    card.setAttribute('data-service-key', service._key)
    card.setAttribute('data-service-source', service._source || '')

    if (hasBadge) {
      const sourceName = service._source || this.widget.config.remote
      const badge = document.createElement('span')
      badge.className = `federation-source-badge federation-source-${sourceName}`
      badge.textContent = sourceName
      badge.title = `Source: ${sourceName}`
      card.appendChild(badge)
    }

    const icon = document.createElement('img')
    icon.className = 'service-icon'
    const imgBase = service._source
      ? `api/proxy/${service._source}/img`
      : this.widget.getImgBase()
    icon.src = `${imgBase}/${service.icon}`
    icon.alt = service.name

    const info = document.createElement('div')
    info.className = 'service-info'

    const name = document.createElement('div')
    name.className = 'service-name'
    name.textContent = service.name

    const status = document.createElement('div')
    status.className = 'service-status'
    status.textContent = 'Loading...'

    info.appendChild(name)
    info.appendChild(status)

    card.appendChild(icon)
    card.appendChild(info)

    card.addEventListener('click', (event) => {
      const useLocal = event.shiftKey && (event.ctrlKey || event.metaKey)
      const url = useLocal ? (service.local || service.url) : service.url
      if (url) {
        window.open(url, '_blank')
      }
    })

    return card
  }

  updateStatus () {
    if (!this.widget.servicesData) return

    this.widget.servicesData.forEach(service => {
      const selector = `[data-service-key="${service._key}"][data-service-source="${service._source || ''}"]`
      const card = this.widget.container.querySelector(selector)
      if (!card) return

      const statusData = service._source
        ? (this.widget.statusBySource[service._source] || {})
        : (this.widget.statusBySource._local || {})

      let overallStatus = 'ok'
      const statusParts = []

      if (service.containers) {
        service.containers.forEach(container => {
          const status = statusData[container]
          if (status === 'down') overallStatus = 'down'
          else if (status === 'unknown' && overallStatus === 'ok') overallStatus = 'unknown'
          statusParts.push(`${container}: ${status || 'unknown'}`)
        })
      }

      if (service.services) {
        service.services.forEach(serviceName => {
          const status = statusData[serviceName]
          if (status === 'down') overallStatus = 'down'
          else if (status === 'unknown' && overallStatus === 'ok') overallStatus = 'unknown'
          statusParts.push(`${serviceName}: ${status || 'unknown'}`)
        })
      }

      if (service.timers) {
        service.timers.forEach(timer => {
          const status = statusData[timer]
          if (status === 'down') overallStatus = 'down'
          else if (status === 'unknown' && overallStatus === 'ok') overallStatus = 'unknown'
          statusParts.push(`${timer}: ${status || 'unknown'}`)
        })
      }

      card.className = `service-card card status-card${card.classList.contains('has-badge') ? ' has-badge' : ''} status-${overallStatus}`

      const statusTextElement = card.querySelector('.service-status')
      if (statusTextElement) {
        statusTextElement.textContent = overallStatus === 'ok'
          ? 'Running'
          : overallStatus === 'down' ? 'Stopped' : 'Unknown'
        const clickTip = `Click: ${service.url}\nCtrl+Shift+Click: ${service.local || service.url}`
        statusTextElement.title = statusParts.join('\n') + '\n\n' + clickTip
      }
    })
  }
}

window.ServicesSnapshot = ServicesSnapshot
