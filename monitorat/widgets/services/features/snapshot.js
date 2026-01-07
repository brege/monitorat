const SERVICE_TYPE_ICONS = {
  container: '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="#1794D4"/><path d="M18 7H16V9H18V7Z" fill="white"/><path d="M10 10H12V12H10V10Z" fill="white"/><path d="M6.00155 16.9414C6.17244 19.8427 7.90027 24 14 24C20.8 24 23.8333 19 24.5 16.5C25.3333 16.5 27.2 16 28 14C27.5 13.5 25.5 13.5 24.5 14C24.5 13.2 24 11.5 23 11C22.3333 11.6667 21.3 13.4 22.5 15C22 16 20.6667 16 20 16H6.9429C6.41342 16 5.97041 16.4128 6.00155 16.9414Z" fill="white"/><path d="M9 13H7V15H9V13Z" fill="white"/><path d="M10 13H12V15H10V13Z" fill="white"/><path d="M15 13H13V15H15V13Z" fill="white"/><path d="M16 13H18V15H16V13Z" fill="white"/><path d="M21 13H19V15H21V13Z" fill="white"/><path d="M15 10H13V12H15V10Z" fill="white"/><path d="M16 10H18V12H16V10Z" fill="white"/></svg>',
  service: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M2,12v8H5.256V18.769H3.3V13.231H5.256V12Z" fill="#201a26"/><path d="M26.744,12v1.231H28.7v5.538H26.744V20H30V12Z" fill="#201a26"/><path d="M17.628,16l5.21-2.769v5.538Z" fill="#30d475"/><ellipse cx="12.093" cy="16" rx="2.93" ry="2.769" fill="#30d475"/></svg>',
  timer: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M2,12v8H5.256V18.769H3.3V13.231H5.256V12Z" fill="#201a26"/><path d="M26.744,12v1.231H28.7v5.538H26.744V20H30V12Z" fill="#201a26"/><path d="M17.628,16l5.21-2.769v5.538Z" fill="#30d475"/><ellipse cx="12.093" cy="16" rx="2.93" ry="2.769" fill="#30d475"/></svg>',
  info: '<svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><circle cx="256" cy="256" r="184" style="stroke-miterlimit:10"/><polyline points="220 220 252 220 252 336"/><line x1="208" y1="340" x2="296" y2="340" style="stroke-miterlimit:10"/><circle cx="256" cy="156" r="26" fill="currentColor" stroke="none"/></svg>'
}

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
    } else {
      const infoBtn = document.createElement('button')
      infoBtn.type = 'button'
      infoBtn.className = 'service-info-btn'
      infoBtn.innerHTML = SERVICE_TYPE_ICONS.info
      infoBtn.title = 'Service details'
      infoBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        this.showUrlPickerModal(service)
      })
      card.appendChild(infoBtn)
    }

    let longPressTriggered = false

    card.addEventListener('click', (event) => {
      if (longPressTriggered) {
        longPressTriggered = false
        return
      }
      if (event.target.closest('.service-info-btn')) {
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

  getServiceStatusInfo (service) {
    const statusData = service._source
      ? (this.widget.statusBySource[service._source] || {})
      : (this.widget.statusBySource._local || {})

    const severityOrder = this.widget.getStatusSeverity()
    let overallStatus = 'ok'
    let worstIndex = this.widget.getStatusRank(overallStatus, severityOrder)
    const statusParts = []

    const checks = [
      ...(service.containers || []).map(c => ({ name: c, type: 'container' })),
      ...(service.services || []).map(s => ({ name: s, type: 'service' })),
      ...(service.timers || []).map(t => ({ name: t, type: 'timer' }))
    ]

    checks.forEach(({ name, type }) => {
      const entry = this.widget.getStatusEntry(statusData, name)
      const statusIndex = this.widget.getStatusRank(entry.status, severityOrder)
      if (statusIndex > worstIndex) {
        overallStatus = entry.status
        worstIndex = statusIndex
      }
      const label = this.widget.getStatusLabel(entry.status)
      const reasonText = entry.reason ? ` (${entry.reason})` : ''
      statusParts.push({ name, type, label, reason: reasonText, status: entry.status })
    })

    return {
      overall: overallStatus,
      overallLabel: this.widget.getStatusLabel(overallStatus),
      overallClass: this.widget.getStatusClass(overallStatus),
      parts: statusParts
    }
  }

  showUrlPickerModal (service) {
    const hasLocal = service.local && service.local !== service.url
    const imgBase = service._source
      ? `api/proxy/${service._source}/img`
      : this.widget.getImgBase()

    const statusInfo = this.getServiceStatusInfo(service)

    const statusHtml = statusInfo.parts.length > 0
      ? `
      <div class="url-picker-status">
        ${statusInfo.parts.map(p => `
          <div class="url-picker-status-item">
            <span class="url-picker-status-type" title="${p.type}">${SERVICE_TYPE_ICONS[p.type] || ''}</span>
            <span class="url-picker-status-name">${p.name}</span>
            <span class="url-picker-status-label ${this.widget.getStatusClass(p.status)}">${p.label}${p.reason}</span>
          </div>
        `).join('')}
      </div>
      `
      : ''

    const content = `
      <div class="url-picker-service">
        <div class="url-picker-icon-wrapper">
          <img src="${imgBase}/${service.icon}" alt="${service.name}" class="url-picker-icon">
          <span class="url-picker-status-dot ${statusInfo.overallClass}"></span>
        </div>
        <span class="url-picker-name">${service.name}</span>
      </div>
      ${statusHtml}
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
