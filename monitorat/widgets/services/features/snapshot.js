class ServicesSnapshot {
  constructor (widget) {
    this.widget = widget
  }

  render () {
    const cardsContainer = this.widget.container.querySelector('.service-grid')
    if (!cardsContainer || !this.widget.servicesData) return

    cardsContainer.innerHTML = ''
    const isCompact = this.widget.getDisplayMode() === 'compact'
    cardsContainer.classList.toggle('compact', isCompact)
    if (isCompact) {
      this.applyCompactSizing()
    } else {
      this.clearCompactSizing()
    }

    const strategy = this.widget.getDisplayStrategy()
    const hasMergedSources = this.widget.config.federation?.nodes

    if (hasMergedSources && strategy === 'stack') {
      this.renderStacked(cardsContainer)
    } else if (hasMergedSources && strategy === 'columnate') {
      this.renderColumnate(cardsContainer)
    } else {
      this.renderMerged(cardsContainer)
    }
  }

  applyCompactSizing () {
    const container = this.widget.container
    if (!container) return

    const scale = this.widget.getCompactIconScale()
    container.style.setProperty('--service-compact-icon-size', `${Math.round(28 * scale)}px`)
    container.style.setProperty('--service-compact-card-size', `${Math.round(52 * scale)}px`)
    container.style.setProperty('--service-compact-padding', `${Math.round(8 * scale)}px`)
    container.style.setProperty('--service-compact-dot-size', `${Math.round(10 * scale)}px`)
    container.style.setProperty('--service-compact-dot-offset', `${Math.round(6 * scale)}px`)
  }

  clearCompactSizing () {
    const container = this.widget.container
    if (!container) return

    container.style.removeProperty('--service-compact-icon-size')
    container.style.removeProperty('--service-compact-card-size')
    container.style.removeProperty('--service-compact-padding')
    container.style.removeProperty('--service-compact-dot-size')
    container.style.removeProperty('--service-compact-dot-offset')
  }

  renderMerged (container) {
    const sorted = this.widget.sortServices(this.widget.servicesData)
    sorted.forEach(service => {
      container.appendChild(this.createServiceCard(service))
    })
  }

  renderStacked (container) {
    const sources = this.widget.config.federation?.nodes || []
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
      if (this.widget.getDisplayMode() === 'compact') {
        grid.classList.add('compact')
      }
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
    const sources = this.widget.config.federation?.nodes || []
    const columns = document.createElement('div')
    columns.className = 'federation-columns'

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
      if (this.widget.getDisplayMode() === 'compact') {
        grid.classList.add('compact')
      }
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
    const mode = this.widget.getDisplayMode()
    const hasBadge = this.widget.config.remote || service._source
    const baseClass = mode === 'compact' ? 'service-card compact' : 'service-card card status-card'
    card.className = `${baseClass}${hasBadge ? ' has-badge' : ''}`
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

    if (mode === 'compact') {
      const statusDot = document.createElement('span')
      statusDot.className = 'service-status-dot'
      card.appendChild(statusDot)
    }

    let longPressTriggered = false

    card.addEventListener('click', (event) => {
      if (longPressTriggered) {
        longPressTriggered = false
        return
      }
      const useLocal = event.shiftKey && (event.ctrlKey || event.metaKey)
      const url = useLocal ? (service.local || service.url) : service.url
      if (url) {
        window.open(url, '_blank')
      }
    })

    let longPressTimer = null
    const longPressDelay = 500

    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    card.addEventListener('touchstart', (event) => {
      longPressTriggered = false
      longPressTimer = setTimeout(() => {
        longPressTriggered = true
        this.showUrlPickerModal(service)
      }, longPressDelay)
    }, { passive: true })

    card.addEventListener('touchend', cancelLongPress)
    card.addEventListener('touchmove', cancelLongPress)
    card.addEventListener('touchcancel', cancelLongPress)

    return card
  }

  showUrlPickerModal (service) {
    const hasLocal = service.local && service.local !== service.url
    const imgBase = service._source
      ? `api/proxy/${service._source}/img`
      : this.widget.getImgBase()

    const content = `
      <div class="url-picker-service">
        <img src="${imgBase}/${service.icon}" alt="${service.name}" class="url-picker-icon">
        <span class="url-picker-name">${service.name}</span>
      </div>
      <div class="url-picker-buttons">
        <button type="button" class="url-picker-btn url-picker-external" data-url="${service.url}">
          Open External
        </button>
        ${hasLocal
? `
        <button type="button" class="url-picker-btn url-picker-local" data-url="${service.local}">
          Open Local
        </button>
        `
: ''}
      </div>
    `

    window.Modal.show({
      title: 'Open Service',
      content
    })

    document.querySelectorAll('.url-picker-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url
        if (url) {
          window.open(url, '_blank')
        }
        window.Modal.hide()
      })
    })
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

      const severityOrder = this.widget.getStatusSeverity()
      let overallStatus = 'ok'
      let worstIndex = this.widget.getStatusRank(overallStatus, severityOrder)
      const statusParts = []

      if (service.containers) {
        service.containers.forEach(container => {
          const entry = this.widget.getStatusEntry(statusData, container)
          const statusIndex = this.widget.getStatusRank(entry.status, severityOrder)
          if (statusIndex > worstIndex) {
            overallStatus = entry.status
            worstIndex = statusIndex
          }
          const label = this.widget.getStatusLabel(entry.status)
          const reasonText = entry.reason ? ` (${entry.reason})` : ''
          statusParts.push(`${container}: ${label}${reasonText}`)
        })
      }

      if (service.services) {
        service.services.forEach(serviceName => {
          const entry = this.widget.getStatusEntry(statusData, serviceName)
          const statusIndex = this.widget.getStatusRank(entry.status, severityOrder)
          if (statusIndex > worstIndex) {
            overallStatus = entry.status
            worstIndex = statusIndex
          }
          const label = this.widget.getStatusLabel(entry.status)
          const reasonText = entry.reason ? ` (${entry.reason})` : ''
          statusParts.push(`${serviceName}: ${label}${reasonText}`)
        })
      }

      if (service.timers) {
        service.timers.forEach(timer => {
          const entry = this.widget.getStatusEntry(statusData, timer)
          const statusIndex = this.widget.getStatusRank(entry.status, severityOrder)
          if (statusIndex > worstIndex) {
            overallStatus = entry.status
            worstIndex = statusIndex
          }
          const label = this.widget.getStatusLabel(entry.status)
          const reasonText = entry.reason ? ` (${entry.reason})` : ''
          statusParts.push(`${timer}: ${label}${reasonText}`)
        })
      }

      const hasBadge = card.classList.contains('has-badge')
      const isCompact = card.classList.contains('compact')
      const baseClass = isCompact ? 'service-card compact' : 'service-card card status-card'
      const statusClass = this.widget.getStatusClass(overallStatus)
      card.className = `${baseClass}${hasBadge ? ' has-badge' : ''} ${statusClass}`

      const statusTextElement = card.querySelector('.service-status')
      if (statusTextElement) {
        statusTextElement.textContent = this.widget.getStatusLabel(overallStatus)
      }

      const clickTip = `Click: ${service.url}\nCtrl+Shift+Click: ${service.local || service.url}`
      card.title = statusParts.join('\n') + '\n\n' + clickTip
    })
  }
}

window.ServicesSnapshot = ServicesSnapshot
