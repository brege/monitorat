// Services Widget
class ServicesWidget {
  constructor (config = {}) {
    this.container = null
    this.servicesData = []
    this.statusBySource = {}
    this.config = config
  }

  getApiBase () {
    return this.config._apiPrefix ? `api/${this.config._apiPrefix}` : 'api/services'
  }

  getImgBase () {
    return this.config.remote ? `api/proxy/${this.config.remote}/img` : 'img'
  }

  getDisplayStrategy () {
    return this.config.federation?.display?.cards || 'merge'
  }

  sortServices (services) {
    const sortBy = this.config.sort_by || 'name.asc'
    const [field, direction] = sortBy.split('.')
    const ascending = direction !== 'desc'

    const statusOrder = { ok: 0, unknown: 1, down: 2 }

    return [...services].sort((a, b) => {
      let valueA, valueB

      switch (field) {
        case 'name':
          valueA = (a.name || '').toLowerCase()
          valueB = (b.name || '').toLowerCase()
          break
        case 'status':
          valueA = statusOrder[this.getServiceStatus(a)] ?? 1
          valueB = statusOrder[this.getServiceStatus(b)] ?? 1
          break
        default:
          return 0
      }

      if (valueA < valueB) return ascending ? -1 : 1
      if (valueA > valueB) return ascending ? 1 : -1
      return 0
    })
  }

  getServiceStatus (service) {
    const statusData = service._source
      ? (this.statusBySource[service._source] || {})
      : (this.statusBySource._local || {})

    const checks = [
      ...(service.containers || []),
      ...(service.services || []),
      ...(service.timers || [])
    ]

    for (const check of checks) {
      if (statusData[check] === 'down') return 'down'
    }
    for (const check of checks) {
      if (statusData[check] === 'unknown') return 'unknown'
    }
    return 'ok'
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }

    const response = await fetch('widgets/services/index.html')
    const html = await response.text()
    container.innerHTML = html

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name
      })
    }

    this.initSortDropdown()
    await this.loadData()
  }

  initSortDropdown () {
    const fieldSelect = this.container.querySelector('.services-sort-field')
    const dirBtn = this.container.querySelector('.services-sort-dir')
    if (!fieldSelect || !dirBtn) return

    const currentSort = this.config.sort_by || 'name.asc'
    const [field, direction] = currentSort.split('.')
    this.sortField = field
    this.sortDirection = direction || 'asc'

    fieldSelect.value = this.sortField
    this.updateDirectionIcon(dirBtn)

    fieldSelect.addEventListener('change', () => {
      this.sortField = fieldSelect.value
      this.applySortAndRender()
    })

    dirBtn.addEventListener('click', () => {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
      this.updateDirectionIcon(dirBtn)
      this.applySortAndRender()
    })
  }

  updateDirectionIcon (btn) {
    const ascIcon = btn.querySelector('.sort-asc')
    const descIcon = btn.querySelector('.sort-desc')
    if (this.sortDirection === 'asc') {
      ascIcon.style.display = ''
      descIcon.style.display = 'none'
    } else {
      ascIcon.style.display = 'none'
      descIcon.style.display = ''
    }
  }

  applySortAndRender () {
    this.config.sort_by = `${this.sortField}.${this.sortDirection}`
    this.render()
    this.updateStatus()
  }

  async loadData () {
    try {
      const mergeSources = this.config.federation?.merge
      if (mergeSources && Array.isArray(mergeSources)) {
        await this.loadMergedServices(mergeSources)
      } else {
        await this.loadServices()
      }

      this.render()

      if (this.config.federation?.merge) {
        await this.loadMergedStatus()
      } else {
        await this.loadStatus()
      }
    } catch (error) {
      console.error('Unable to load services:', error.message)
    }
  }

  async loadServices () {
    try {
      const configResponse = await fetch(this.getApiBase())
      if (!configResponse.ok) {
        throw new Error(`HTTP ${configResponse.status}`)
      }
      const servicesConfig = await configResponse.json()
      this.servicesData = Object.entries(servicesConfig.services || {}).map(([key, service]) => ({
        ...service,
        _key: key,
        _source: this.config.remote || null
      }))
    } catch (error) {
      console.error('Unable to load services config:', error.message)
      throw error
    }
  }

  async loadMergedServices (sources) {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/services-${source}`)
          if (!response.ok) {
            console.warn(`Failed to fetch services from ${source}: HTTP ${response.status}`)
            return []
          }
          const config = await response.json()
          return Object.entries(config.services || {}).map(([key, service]) => ({
            ...service,
            _key: key,
            _source: source
          }))
        } catch (error) {
          console.warn(`Failed to fetch services from ${source}:`, error.message)
          return []
        }
      })
    )

    this.servicesData = results.flat()
  }

  async loadStatus () {
    try {
      const response = await fetch(`${this.getApiBase()}/status`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const statusData = await response.json()
      this.statusBySource = { _local: statusData }
      this.updateStatus()
    } catch (error) {
      console.error('Unable to load service status:', error.message)
    }
  }

  async loadMergedStatus () {
    const sources = this.config.federation?.merge || []
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/services-${source}/status`)
          if (!response.ok) return { source, status: {} }
          const status = await response.json()
          return { source, status }
        } catch (error) {
          return { source, status: {} }
        }
      })
    )

    this.statusBySource = {}
    results.forEach(({ source, status }) => {
      this.statusBySource[source] = status
    })
    this.updateStatus()
  }

  render () {
    const cardsContainer = this.container.querySelector('.service-grid')
    if (!cardsContainer || !this.servicesData) return

    cardsContainer.innerHTML = ''

    const strategy = this.getDisplayStrategy()
    const hasMergedSources = this.config.federation?.merge

    if (hasMergedSources && strategy === 'stack') {
      this.renderStacked(cardsContainer)
    } else if (hasMergedSources && strategy === 'columnate') {
      this.renderColumnate(cardsContainer)
    } else {
      this.renderMerged(cardsContainer)
    }
  }

  renderMerged (container) {
    const sorted = this.sortServices(this.servicesData)
    sorted.forEach(service => {
      container.appendChild(this.createServiceCard(service))
    })
  }

  renderStacked (container) {
    const sources = this.config.federation?.merge || []
    const wrapper = document.createElement('div')
    wrapper.className = 'federation-stacked'

    sources.forEach(source => {
      const sourceServices = this.servicesData.filter(s => s._source === source)
      if (sourceServices.length === 0) return

      const section = document.createElement('div')
      section.className = 'federation-stack-section'

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      section.appendChild(header)

      const grid = document.createElement('div')
      grid.className = 'service-grid-inner'
      const sorted = this.sortServices(sourceServices)
      sorted.forEach(service => {
        grid.appendChild(this.createServiceCard(service))
      })
      section.appendChild(grid)

      wrapper.appendChild(section)
    })

    container.appendChild(wrapper)
  }

  renderColumnate (container) {
    const sources = this.config.federation?.merge || []
    const columns = document.createElement('div')
    columns.className = 'federation-columns'
    columns.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;'

    sources.forEach(source => {
      const sourceServices = this.servicesData.filter(s => s._source === source)
      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      column.appendChild(header)

      const grid = document.createElement('div')
      grid.className = 'service-grid-inner'
      const sorted = this.sortServices(sourceServices)
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
    const hasBadge = this.config.remote || service._source
    card.className = `service-card card status-card${hasBadge ? ' has-badge' : ''}`
    card.setAttribute('data-service-key', service._key)
    card.setAttribute('data-service-source', service._source || '')

    if (hasBadge) {
      const sourceName = service._source || this.config.remote
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
      : this.getImgBase()
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
    if (!this.servicesData) return

    this.servicesData.forEach(service => {
      const selector = `[data-service-key="${service._key}"][data-service-source="${service._source || ''}"]`
      const card = this.container.querySelector(selector)
      if (!card) return

      const statusData = service._source
        ? (this.statusBySource[service._source] || {})
        : (this.statusBySource._local || {})

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
        service.services.forEach(svc => {
          const status = statusData[svc]
          if (status === 'down') overallStatus = 'down'
          else if (status === 'unknown' && overallStatus === 'ok') overallStatus = 'unknown'
          statusParts.push(`${svc}: ${status || 'unknown'}`)
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

// Register widget
window.widgets = window.widgets || {}
window.widgets.services = ServicesWidget
