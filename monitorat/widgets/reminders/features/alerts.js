class RemindersAlerts {
  constructor (widget) {
    this.widget = widget
  }

  render () {
    const alertsContainer = this.widget.container.querySelector('.reminder-alerts')
    if (!alertsContainer || !this.widget.remindersConfig) return

    alertsContainer.innerHTML = ''

    const strategy = this.widget.getDisplayStrategy()
    const hasMergedSources = this.widget.config.federation?.nodes

    if (hasMergedSources && strategy === 'stack') {
      this.renderStacked(alertsContainer)
    } else if (hasMergedSources && strategy === 'columnate') {
      this.renderColumnate(alertsContainer)
    } else {
      this.renderMerged(alertsContainer)
    }
  }

  renderMerged (container) {
    const sortedReminders = this.widget.sortReminders(this.widget.remindersConfig)
    sortedReminders.forEach(reminder => {
      container.appendChild(this.createReminderCard(reminder))
    })
  }

  renderStacked (container) {
    const sources = this.widget.config.federation?.nodes || []
    sources.forEach(source => {
      const sourceReminders = this.widget.remindersConfig.filter(reminder => reminder._source === source)
      if (sourceReminders.length === 0) return

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      container.appendChild(header)

      const sorted = this.widget.sortReminders(sourceReminders)
      sorted.forEach(reminder => {
        container.appendChild(this.createReminderCard(reminder))
      })
    })
  }

  renderColumnate (container) {
    const sources = this.widget.config.federation?.nodes || []
    const columns = document.createElement('div')
    columns.className = 'federation-columns'
    columns.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;'

    sources.forEach(source => {
      const sourceReminders = this.widget.remindersConfig.filter(reminder => reminder._source === source)
      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('h4')
      header.className = 'federation-source-header'
      header.textContent = source
      column.appendChild(header)

      const sorted = this.widget.sortReminders(sourceReminders)
      sorted.forEach(reminder => {
        column.appendChild(this.createReminderCard(reminder))
      })

      columns.appendChild(column)
    })

    container.appendChild(columns)
  }

  createReminderCard (reminder) {
    const alertElement = document.createElement('div')
    const hasBadge = this.widget.config.remote || reminder._source
    alertElement.className = `reminder-alert alert-card status-card status-${reminder.status}${hasBadge ? ' has-badge' : ''}`

    if (hasBadge) {
      const sourceName = reminder._source || this.widget.config.remote
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
      : this.widget.getImgBase()
    icon.src = `${imgBase}/${reminder.icon}`
    icon.alt = reminder.name

    const content = document.createElement('div')
    content.className = 'reminder-alert-content'

    const textDiv = document.createElement('div')
    textDiv.className = 'reminder-alert-text'

    const nameDiv = document.createElement('div')
    nameDiv.className = 'reminder-alert-name'
    nameDiv.textContent = reminder.name

    const descDiv = document.createElement('div')
    descDiv.className = 'reminder-alert-description'
    descDiv.textContent = reminder.reason || ''

    textDiv.appendChild(nameDiv)
    if (reminder.reason) {
      textDiv.appendChild(descDiv)
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

    content.appendChild(textDiv)
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
            : this.widget.getApiBase()
          await fetch(`${touchBase}/${reminder.id}/touch`, { method: 'POST' })
          setTimeout(() => this.widget.loadData(), 500)
        } catch (error) {
          console.error('Failed to touch reminder:', error)
        }

        window.open(reminder.url, '_blank')
      }
    })

    return alertElement
  }
}

window.RemindersAlerts = RemindersAlerts
