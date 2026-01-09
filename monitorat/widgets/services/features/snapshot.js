const SERVICE_TYPE_ICONS = {
  container: '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="#1794D4"/><path d="M18 7H16V9H18V7Z" fill="white"/><path d="M10 10H12V12H10V10Z" fill="white"/><path d="M6.00155 16.9414C6.17244 19.8427 7.90027 24 14 24C20.8 24 23.8333 19 24.5 16.5C25.3333 16.5 27.2 16 28 14C27.5 13.5 25.5 13.5 24.5 14C24.5 13.2 24 11.5 23 11C22.3333 11.6667 21.3 13.4 22.5 15C22 16 20.6667 16 20 16H6.9429C6.41342 16 5.97041 16.4128 6.00155 16.9414Z" fill="white"/><path d="M9 13H7V15H9V13Z" fill="white"/><path d="M10 13H12V15H10V13Z" fill="white"/><path d="M15 13H13V15H15V13Z" fill="white"/><path d="M16 13H18V15H16V13Z" fill="white"/><path d="M21 13H19V15H21V13Z" fill="white"/><path d="M15 10H13V12H15V10Z" fill="white"/><path d="M16 10H18V12H16V10Z" fill="white"/></svg>',
  service: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M2,12v8H5.256V18.769H3.3V13.231H5.256V12Z" fill="#201a26"/><path d="M26.744,12v1.231H28.7v5.538H26.744V20H30V12Z" fill="#201a26"/><path d="M17.628,16l5.21-2.769v5.538Z" fill="#30d475"/><ellipse cx="12.093" cy="16" rx="2.93" ry="2.769" fill="#30d475"/></svg>',
  timer: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M2,12v8H5.256V18.769H3.3V13.231H5.256V12Z" fill="#201a26"/><path d="M26.744,12v1.231H28.7v5.538H26.744V20H30V12Z" fill="#201a26"/><path d="M17.628,16l5.21-2.769v5.538Z" fill="#30d475"/><ellipse cx="12.093" cy="16" rx="2.93" ry="2.769" fill="#30d475"/></svg>'
}

const SERVICE_ACTION_ICONS = {
  info: '<svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><circle cx="256" cy="256" r="184" style="stroke-miterlimit:10"/><polyline points="220 220 252 220 252 336"/><line x1="208" y1="340" x2="296" y2="340" style="stroke-miterlimit:10"/><circle cx="256" cy="156" r="26" fill="currentColor" stroke="none"/></svg>',
  external: '<svg viewBox="0 0 496 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm39.5 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.3 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"/></svg>',
  local: '<svg viewBox="0 0 640 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M54.2 202.9C123.2 136.7 216.8 96 320 96s196.8 40.7 265.8 106.9c12.8 12.2 33 11.8 45.2-.9s11.8-33-.9-45.2C549.7 79.5 440.4 32 320 32S90.3 79.5 9.8 156.7C-2.9 169-3.3 189.2 8.9 202s32.5 13.2 45.2 .9zM320 256c56.8 0 108.6 21.1 148.2 56c13.3 11.7 33.5 10.4 45.2-2.8s10.4-33.5-2.8-45.2C459.8 219.2 393 192 320 192s-139.8 27.2-190.5 72c-13.3 11.7-14.5 31.9-2.8 45.2s31.9 14.5 45.2 2.8c39.5-34.9 91.3-56 148.2-56zm64 160a64 64 0 1 0 -128 0 64 64 0 1 0 128 0z"/></svg>',
  copy: '<svg viewBox="0 0 448 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M384 336l-192 0c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l140.1 0L400 115.9 400 320c0 8.8-7.2 16-16 16zM192 384l192 0c35.3 0 64-28.7 64-64l0-204.1c0-12.7-5.1-24.9-14.1-33.9L366.1 14.1c-9-9-21.2-14.1-33.9-14.1L192 0c-35.3 0-64 28.7-64 64l0 256c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-32-48 0 0 32c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l32 0 0-48-32 0z"/></svg>'
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
      infoBtn.className = 'service-info-btn hover-expand'
      infoBtn.innerHTML = SERVICE_ACTION_ICONS.info
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

  getServiceTypeInfo (service) {
    if (service.containers && service.containers.length > 0) {
      return { icon: SERVICE_TYPE_ICONS.container, label: 'Docker Container' }
    }
    if (service.services && service.services.length > 0) {
      return { icon: SERVICE_TYPE_ICONS.service, label: 'Systemd Service' }
    }
    if (service.timers && service.timers.length > 0) {
      return { icon: SERVICE_TYPE_ICONS.timer, label: 'Systemd Timer' }
    }
    return { icon: SERVICE_TYPE_ICONS.service, label: 'Service' }
  }

  showUrlPickerModal (service) {
    const hasLocal = service.local && service.local !== service.url
    const imgBase = service._source
      ? `api/proxy/${service._source}/img`
      : this.widget.getImgBase()

    const statusInfo = this.getServiceStatusInfo(service)
    const typeInfo = this.getServiceTypeInfo(service)

    const statusHtml = statusInfo.parts.length > 0
      ? `
      <div class="url-picker-status">
        ${statusInfo.parts.map(p => `
          <div class="url-picker-status-item">
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
      <div class="url-picker-links">
        <div class="url-picker-link-row">
          <span class="url-picker-link-url" title="${service.url}">${service.url}</span>
          <div class="url-picker-link-actions">
            <button type="button" class="url-picker-icon-btn url-picker-copy" data-url="${service.url}" aria-label="Copy external URL" title="Copy external URL">
              ${SERVICE_ACTION_ICONS.copy}
            </button>
            <button type="button" class="url-picker-icon-btn url-picker-open" data-url="${service.url}" aria-label="Open external URL" title="Open external URL">
              ${SERVICE_ACTION_ICONS.external}
            </button>
          </div>
        </div>
        ${hasLocal
? `
        <div class="url-picker-link-row">
          <span class="url-picker-link-url" title="${service.local}">${service.local}</span>
          <div class="url-picker-link-actions">
            <button type="button" class="url-picker-icon-btn url-picker-copy" data-url="${service.local}" aria-label="Copy local URL" title="Copy local URL">
              ${SERVICE_ACTION_ICONS.copy}
            </button>
            <button type="button" class="url-picker-icon-btn url-picker-open" data-url="${service.local}" aria-label="Open local URL" title="Open local URL">
              ${SERVICE_ACTION_ICONS.local}
            </button>
          </div>
        </div>
        `
: ''}
      </div>
    `

    window.Modal.show({
      title: `<span class="url-picker-title"><span class="url-picker-title-icon">${typeInfo.icon}</span><span class="url-picker-title-text">${typeInfo.label}</span></span>`,
      content
    })

    document.querySelectorAll('.url-picker-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url
        if (url) {
          window.open(url, '_blank')
        }
        window.Modal.hide()
      })
    })

    document.querySelectorAll('.url-picker-copy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url
        if (!url) return
        navigator.clipboard.writeText(url)
        const row = btn.closest('.url-picker-link-row')
        if (row) {
          row.dataset.copied = url
          row.classList.add('is-copied')
          if (row.copyTimeout) {
            clearTimeout(row.copyTimeout)
          }
          row.copyTimeout = setTimeout(() => {
            row.classList.remove('is-copied')
          }, 1400)
        }
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
