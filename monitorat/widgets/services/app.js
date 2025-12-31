// Services Widget
class ServicesWidget {
  constructor (config = {}) {
    this.container = null
    this.servicesData = []
    this.statusBySource = {}
    this.config = config
    this.features = {
      controls: null,
      snapshot: null
    }
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

    await this.loadFeatureScripts()
    this.initializeFeatures()
    this.features.controls.initialize()
    await this.loadData()
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
    this.features.snapshot.render()
  }

  updateStatus () {
    this.features.snapshot.updateStatus()
  }

  async loadFeatureScripts () {
    const featureScripts = [
      { globalName: 'ServicesControls', source: 'widgets/services/features/controls.js' },
      { globalName: 'ServicesSnapshot', source: 'widgets/services/features/snapshot.js' }
    ]

    await window.monitorShared.loadFeatureScripts(featureScripts)
  }

  initializeFeatures () {
    const ControlsFeature = window.ServicesControls
    const SnapshotFeature = window.ServicesSnapshot

    if (!ControlsFeature || !SnapshotFeature) {
      throw new Error('Services feature scripts not loaded')
    }

    this.features.controls = new ControlsFeature(this)
    this.features.snapshot = new SnapshotFeature(this)
  }
}

// Register widget
window.widgets = window.widgets || {}
window.widgets.services = ServicesWidget
