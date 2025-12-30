// Reminders Widget
/* global alert */
class RemindersWidget {
  constructor (config = {}) {
    this.container = null
    this.remindersConfig = null
    this.config = config
  }

  getApiBase () {
    return this.config._apiPrefix ? `api/${this.config._apiPrefix}` : 'api/reminders'
  }

  getImgBase () {
    return this.config.remote ? `api/proxy/${this.config.remote}/img` : 'img'
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }

    // Load HTML template
    const response = await fetch('widgets/reminders/index.html')
    const html = await response.text()
    container.innerHTML = html

    // Update section title from config (unless suppressed by collapsible wrapper)
    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        preserveChildren: true
      })
    }

    // Load initial data
    await this.loadData()
  }

  async loadData () {
    try {
      const response = await fetch(this.getApiBase())
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const reminders = await response.json()
      this.remindersConfig = reminders
      this.render()
    } catch (error) {
      console.error('Unable to load reminders:', error.message)
    }
  }

  render () {
    const alertsContainer = this.container.querySelector('.reminder-alerts')
    if (!alertsContainer || !this.remindersConfig) return

    alertsContainer.innerHTML = ''

    this.remindersConfig.forEach(reminder => {
      const alertElement = document.createElement('div')
      alertElement.className = `reminder-alert alert-card status-card status-${reminder.status}`

      const icon = document.createElement('img')
      icon.className = 'reminder-alert-icon'
      icon.src = `${this.getImgBase()}/${reminder.icon}`
      icon.alt = reminder.name

      const content = document.createElement('div')
      content.className = 'reminder-alert-content'

      // Left side: name + reason
      const leftDiv = document.createElement('div')

      const nameDiv = document.createElement('div')
      nameDiv.className = 'reminder-alert-name'
      nameDiv.textContent = reminder.name

      const descDiv = document.createElement('div')
      descDiv.className = 'reminder-alert-description'
      descDiv.textContent = reminder.reason || ''

      leftDiv.appendChild(nameDiv)
      if (reminder.reason) {
        leftDiv.appendChild(descDiv)
      }

      // Right side: stats
      const statsDiv = document.createElement('div')
      statsDiv.className = 'reminder-alert-stats'

      const daysSpan = document.createElement('span')
      if (reminder.status === 'never') {
        daysSpan.textContent = 'Never'
      } else if (reminder.status === 'expired') {
        daysSpan.textContent = `${Math.abs(reminder.days_remaining)}d overdue`
      } else {
        daysSpan.textContent = `${reminder.days_remaining}d left`
      }

      const lastTouchSpan = document.createElement('span')
      if (reminder.days_since !== null) {
        lastTouchSpan.textContent = `${reminder.days_since}d ago`
      } else {
        lastTouchSpan.textContent = 'Never'
      }

      statsDiv.appendChild(daysSpan)
      statsDiv.appendChild(lastTouchSpan)

      content.appendChild(leftDiv)
      content.appendChild(statsDiv)

      alertElement.appendChild(icon)
      alertElement.appendChild(content)

      // Add click handler to open URL directly
      alertElement.addEventListener('click', async () => {
        if (reminder.url) {
          // Immediately update visual status to green (ok)
          alertElement.className = alertElement.className.replace(/status-\w+/, 'status-ok')

          // Update the stats to show "0d ago"
          const statsDiv = alertElement.querySelector('.reminder-alert-stats')
          if (statsDiv) {
            const spans = statsDiv.querySelectorAll('span')
            if (spans.length >= 2) {
              spans[1].textContent = '0d ago' // Last touch span
            }
          }

          // Touch the reminder and refresh data
          try {
            await fetch(`${this.getApiBase()}/${reminder.id}/touch`, { method: 'POST' })
            setTimeout(() => this.loadData(), 500) // Refresh after delay to get accurate data
          } catch (error) {
            console.error('Failed to touch reminder:', error)
          }

          // Open URL
          window.open(reminder.url, '_blank')
        }
      })

      alertsContainer.appendChild(alertElement)
    })
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
