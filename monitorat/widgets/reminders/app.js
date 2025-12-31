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

    this.initSortDropdown()
    await this.loadData()
  }

  initSortDropdown () {
    const fieldSelect = this.container.querySelector('.reminders-sort-field')
    const dirBtn = this.container.querySelector('.reminders-sort-dir')
    if (!fieldSelect || !dirBtn) return

    const currentSort = this.config.sort_by || 'due.asc'
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
    const alertsContainer = this.container.querySelector('.reminder-alerts')
    if (!alertsContainer || !this.remindersConfig) return

    alertsContainer.innerHTML = ''

    const strategy = this.getDisplayStrategy()
    const hasMergedSources = this.config.federation?.merge

    if (hasMergedSources && strategy === 'stack') {
      this.renderStacked(alertsContainer)
    } else if (hasMergedSources && strategy === 'columnate') {
      this.renderColumnate(alertsContainer)
    } else {
      this.renderMerged(alertsContainer)
    }
  }

  renderMerged (container) {
    const sortedReminders = this.sortReminders(this.remindersConfig)
    sortedReminders.forEach(reminder => {
      container.appendChild(this.createReminderCard(reminder))
    })
  }

  renderStacked (container) {
    const sources = this.config.federation?.merge || []
    sources.forEach(source => {
      const sourceReminders = this.remindersConfig.filter(r => r._source === source)
      if (sourceReminders.length === 0) return

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      container.appendChild(header)

      const sorted = this.sortReminders(sourceReminders)
      sorted.forEach(reminder => {
        container.appendChild(this.createReminderCard(reminder))
      })
    })
  }

  renderColumnate (container) {
    const sources = this.config.federation?.merge || []
    const columns = document.createElement('div')
    columns.className = 'federation-columns'
    columns.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;'

    sources.forEach(source => {
      const sourceReminders = this.remindersConfig.filter(r => r._source === source)
      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      column.appendChild(header)

      const sorted = this.sortReminders(sourceReminders)
      sorted.forEach(reminder => {
        column.appendChild(this.createReminderCard(reminder))
      })

      columns.appendChild(column)
    })

    container.appendChild(columns)
  }

  createReminderCard (reminder) {
    const alertElement = document.createElement('div')
    const hasBadge = this.config.remote || reminder._source
    alertElement.className = `reminder-alert alert-card status-card status-${reminder.status}${hasBadge ? ' has-badge' : ''}`

    if (hasBadge) {
      const sourceName = reminder._source || this.config.remote
      const badge = document.createElement('span')
      badge.className = `federation-source-badge federation-source-${sourceName}`
      badge.textContent = sourceName
      badge.title = `Source: ${sourceName}`
      alertElement.appendChild(badge)
    }

    const icon = document.createElement('img')
    icon.className = 'reminder-alert-icon'
    const imgBase = reminder._source
      ? `api/proxy/${reminder._source}/img`
      : this.getImgBase()
    icon.src = `${imgBase}/${reminder.icon}`
    icon.alt = reminder.name

    const content = document.createElement('div')
    content.className = 'reminder-alert-content'

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

    alertElement.addEventListener('click', async () => {
      if (reminder.url) {
        alertElement.className = alertElement.className.replace(/status-\w+/, 'status-ok')

        const stats = alertElement.querySelector('.reminder-alert-stats')
        if (stats) {
          const spans = stats.querySelectorAll('span')
          if (spans.length >= 2) {
            spans[1].textContent = '0d ago'
          }
        }

        try {
          const touchBase = reminder._source
            ? `api/reminders-${reminder._source}`
            : this.getApiBase()
          await fetch(`${touchBase}/${reminder.id}/touch`, { method: 'POST' })
          setTimeout(() => this.loadData(), 500)
        } catch (error) {
          console.error('Failed to touch reminder:', error)
        }

        window.open(reminder.url, '_blank')
      }
    })

    return alertElement
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
