class NetworkOutages {
  constructor (widget) {
    this.widget = widget
  }

  render () {
    const { config, elements, state, helpers } = this.widget
    if (!config.alerts.show || !elements.alertList) {
      return
    }

    const list = elements.alertList
    list.innerHTML = ''
    const toggle = elements.alertToggle

    const analysis = state.analysis
    if (!analysis || !analysis.entries.length) {
      const info = document.createElement('p')
      info.className = 'muted'
      info.textContent = 'No log entries to inspect yet.'
      list.appendChild(info)
      if (toggle) toggle.style.display = 'none'
      return
    }

    const filtered = analysis.alerts.filter((alert) => {
      if (alert.type !== 'outage') {
        return true
      }
      const threshold = config.alerts.cadenceChecks || 0
      return alert.missedChecks >= threshold
    })

    if (!filtered.length) {
      const info = document.createElement('p')
      info.className = 'muted'
      info.textContent = 'No missed 5-minute intervals detected.'
      list.appendChild(info)
      if (toggle) toggle.style.display = 'none'
      return
    }

    const reversed = [...filtered].reverse()
    const maxVisible = state.alertsExpanded ? reversed.length : Math.min(config.alerts.max, reversed.length)
    reversed.slice(0, maxVisible).forEach((alert) => {
      const item = document.createElement('div')
      if (alert.type === 'ipchange') {
        item.className = 'alert alert-card ipchange'
        item.innerHTML = `<strong>IP address changed</strong> from ${alert.oldIp} to ${alert.newIp} at ${helpers.formatDateTime(alert.timestamp)}`
      } else if (alert.type === 'failure') {
        item.className = 'alert alert-card failure'
        item.innerHTML = `<strong>Connection failure</strong> at ${helpers.formatDateTime(alert.timestamp)} (${alert.message})`
      } else {
        item.className = 'alert alert-card'
        if (alert.open) {
          item.classList.add('open')
        }
        const endLabel = alert.open ? 'now' : helpers.formatDateTime(alert.end)
        const duration = helpers.formatDuration(alert.end.getTime() - alert.start.getTime())
        const countLabel = alert.missedChecks === 1 ? 'check' : 'checks'
        item.innerHTML = `<strong>${alert.missedChecks} ${countLabel} missed</strong> from ${helpers.formatDateTime(alert.start)} to ${endLabel} (${duration})`
      }
      list.appendChild(item)
    })

    if (toggle) {
      const maxVisible = config.alerts.max
      if (filtered.length <= maxVisible) {
        toggle.style.display = 'none'
      } else {
        toggle.style.display = ''
        const remaining = filtered.length - maxVisible
        toggle.textContent = state.alertsExpanded ? 'Show less' : `Show ${remaining} more`
      }
    }
  }
}

window.NetworkOutages = NetworkOutages
