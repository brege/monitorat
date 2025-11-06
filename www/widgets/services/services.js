// Services Widget
class ServicesWidget {
  constructor (config = {}) {
    this.container = null
    this.servicesConfig = null
    this.config = config
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }

    // Load HTML template
    const response = await fetch('widgets/services/services.html')
    const html = await response.text()
    container.innerHTML = html

    // Update section title from config (unless suppressed by collapsible wrapper)
    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name
      })
    }

    // Load initial data
    await this.loadData()
  }

  async loadData () {
    try {
      // Load services configuration first
      await this.loadServices()

      // Render the cards
      this.render()

      // Then load status data
      await this.loadStatus()
    } catch (error) {
      console.error('Unable to load services:', error.message)
    }
  }

  async loadServices () {
    try {
      const configResponse = await fetch('api/services')
      if (!configResponse.ok) {
        throw new Error(`HTTP ${configResponse.status}`)
      }
      const servicesConfig = await configResponse.json()
      this.servicesConfig = servicesConfig
    } catch (error) {
      console.error('Unable to load services config:', error.message)
      throw error
    }
  }

  async loadStatus () {
    try {
      const response = await fetch('api/services/status')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const statusData = await response.json()
      this.update(statusData)
    } catch (error) {
      console.error('Unable to load service status:', error.message)
    }
  }

  render () {
    const container = document.getElementById('service-cards')
    if (!container || !this.servicesConfig) return

    container.innerHTML = ''

    Object.entries(this.servicesConfig.services).forEach(([key, service]) => {
      const card = document.createElement('div')
      card.className = 'service-card'
      card.setAttribute('data-service-key', key)

      const icon = document.createElement('img')
      icon.className = 'service-icon'
      icon.src = `img/${service.icon}`
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

      container.appendChild(card)
    })
  }

  update (statusData) {
    if (!this.servicesConfig) return

    Object.entries(this.servicesConfig.services).forEach(([key, service]) => {
      const statusElement = document.querySelector(`[data-service-key="${key}"]`)
      if (!statusElement) return

      let overallStatus = 'ok'
      const statusParts = []

      // Check containers
      if (service.containers) {
        service.containers.forEach(container => {
          const status = statusData[container]
          if (status === 'down') overallStatus = 'down'
          else if (status === 'unknown' && overallStatus === 'ok') overallStatus = 'unknown'
          statusParts.push(`${container}: ${status || 'unknown'}`)
        })
      }

      // Check services
      if (service.services) {
        service.services.forEach(svc => {
          const status = statusData[svc]
          if (status === 'down') overallStatus = 'down'
          else if (status === 'unknown' && overallStatus === 'ok') overallStatus = 'unknown'
          statusParts.push(`${svc}: ${status || 'unknown'}`)
        })
      }

      // Check timers
      if (service.timers) {
        service.timers.forEach(timer => {
          const timerName = timer.replace('.timer', '')
          const status = statusData[timerName]
          if (status === 'down') overallStatus = 'down'
          else if (status === 'unknown' && overallStatus === 'ok') overallStatus = 'unknown'
          statusParts.push(`${timerName}: ${status || 'unknown'}`)
        })
      }

      // Update card status
      const card = statusElement.closest('.service-card')
      card.className = `service-card status-${overallStatus}`

      // Update status text and tooltip (matching original logic)
      const statusTextElement = statusElement.querySelector('.service-status')
      if (statusTextElement) {
        statusTextElement.className = 'service-status'
        statusTextElement.textContent = overallStatus === 'ok'
          ? 'Running'
          : overallStatus === 'down' ? 'Stopped' : 'Unknown'
        // Combine status details with click behavior
        const service = this.servicesConfig.services[key]
        const clickTip = `Click: ${service.url}\nCtrl+Shift+Click: ${service.local || service.url}`
        statusTextElement.title = statusParts.join('\n') + '\n\n' + clickTip
      }
    })
  }
}

// Register widget
window.widgets = window.widgets || {}
window.widgets.services = ServicesWidget
