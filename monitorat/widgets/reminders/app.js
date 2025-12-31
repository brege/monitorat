// Reminders Widget
/* global alert */
class RemindersWidget {
  constructor (config = {}) {
    this.container = null
    this.remindersConfig = null
    this.config = config
    this.features = {
      controls: null,
      alerts: null
    }
  }

  getApiBase () {
    return this.config._apiPrefix ? `api/${this.config._apiPrefix}` : 'api/reminders'
  }

  getImgBase () {
    return this.config.remote ? `api/proxy/${this.config.remote}/img` : 'img'
  }

  sortReminders (reminders) {
    const sortBy = this.config.sort_by || 'due.asc'
    const [field, direction] = sortBy.split('.')
    const ascending = direction !== 'desc'

    return [...reminders].sort((a, b) => {
      let valueA, valueB

      switch (field) {
        case 'name':
          valueA = (a.name || '').toLowerCase()
          valueB = (b.name || '').toLowerCase()
          break
        case 'due':
          valueA = a.days_remaining ?? Infinity
          valueB = b.days_remaining ?? Infinity
          break
        case 'touched':
          valueA = a.days_since ?? Infinity
          valueB = b.days_since ?? Infinity
          break
        default:
          return 0
      }

      if (valueA < valueB) return ascending ? -1 : 1
      if (valueA > valueB) return ascending ? 1 : -1
      return 0
    })
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }

    const response = await fetch('widgets/reminders/index.html')
    const html = await response.text()
    container.innerHTML = html

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        preserveChildren: true
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
        await this.loadMergedData(mergeSources)
      } else {
        const response = await fetch(this.getApiBase())
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const reminders = await response.json()
        this.remindersConfig = reminders
      }
      this.render()
    } catch (error) {
      console.error('Unable to load reminders:', error.message)
    }
  }

  async loadMergedData (sources) {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/reminders-${source}`)
          if (!response.ok) {
            console.warn(`Failed to fetch reminders from ${source}: HTTP ${response.status}`)
            return []
          }
          const reminders = await response.json()
          return reminders.map(r => ({ ...r, _source: source }))
        } catch (error) {
          console.warn(`Failed to fetch reminders from ${source}:`, error.message)
          return []
        }
      })
    )

    this.remindersConfig = results.flat()
  }

  getDisplayStrategy () {
    return this.config.federation?.display?.cards || 'merge'
  }

  render () {
    this.features.alerts.render()
  }

  async loadFeatureScripts () {
    const featureScripts = [
      { globalName: 'RemindersControls', source: 'widgets/reminders/features/controls.js' },
      { globalName: 'RemindersAlerts', source: 'widgets/reminders/features/alerts.js' }
    ]

    for (const feature of featureScripts) {
      if (!window[feature.globalName]) {
        await this.loadScript(feature)
      }
    }

    const missing = featureScripts.filter((feature) => !window[feature.globalName])
    if (missing.length) {
      const names = missing.map((feature) => feature.globalName).join(', ')
      throw new Error(`Reminders feature scripts missing: ${names}`)
    }
  }

  loadScript (feature) {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script')
      scriptElement.src = feature.source
      scriptElement.async = true
      scriptElement.onload = () => {
        if (!window[feature.globalName]) {
          reject(new Error(`Reminders feature failed to register: ${feature.globalName}`))
          return
        }
        resolve()
      }
      scriptElement.onerror = () => {
        reject(new Error(`Failed to load reminders feature: ${feature.source}`))
      }
      document.head.appendChild(scriptElement)
    })
  }

  initializeFeatures () {
    const ControlsFeature = window.RemindersControls
    const AlertsFeature = window.RemindersAlerts

    if (!ControlsFeature || !AlertsFeature) {
      throw new Error('Reminders feature scripts not loaded')
    }

    this.features.controls = new ControlsFeature(this)
    this.features.alerts = new AlertsFeature(this)
  }
}

// Test notification function (global)
async function testNotification () {
  try {
    const response = await fetch('api/reminders/test-notification', { method: 'POST' })
    const result = await response.json()
    if (result.success) {
      alert('Test notification sent!')
    } else {
      alert('Failed to send test notification')
    }
  } catch (error) {
    alert('Error sending test notification')
  }
}
window.testNotification = testNotification

// Register widget
window.widgets = window.widgets || {}
window.widgets.reminders = RemindersWidget
