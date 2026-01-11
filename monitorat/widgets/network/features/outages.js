// NetworkOutages: Unified outage renderer
//
// Handles both single-source and multi-source (federation) cases.
// Single-source is the trivial case: one source, no badges.
// Multi-source interleaves alerts from all sources with source badges.

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

    const sources = this.resolveSources()
    const sourceStates = this.resolveSourceStates(sources)
    const isMultiSource = sources.length > 1

    const allAlerts = this.collectAlerts(sources, sourceStates)

    if (!allAlerts.length) {
      const info = document.createElement('p')
      info.className = 'muted'
      info.textContent = 'No missed intervals detected.'
      list.appendChild(info)
      if (toggle) toggle.style.display = 'none'
      return
    }

    const maxVisible = state.alertsExpanded
      ? allAlerts.length
      : Math.min(config.alerts.max, allAlerts.length)

    allAlerts.slice(0, maxVisible).forEach((alert) => {
      const card = this.createAlertCard(alert, isMultiSource, helpers)
      list.appendChild(card)
    })

    this.updateToggle(toggle, allAlerts.length, config.alerts.max, state.alertsExpanded)
  }

  resolveSources () {
    const { config, state } = this.widget
    const federationNodes = config.federation?.nodes

    if (federationNodes && Array.isArray(federationNodes)) {
      return federationNodes
    }

    return ['local']
  }

  resolveSourceStates (sources) {
    const { state } = this.widget

    if (state.sourceStates) {
      return state.sourceStates
    }

    return {
      local: {
        analysis: state.analysis,
        entries: state.entries,
        error: null
      }
    }
  }

  collectAlerts (sources, sourceStates) {
    const { config } = this.widget
    const threshold = config.alerts.cadenceChecks || 0
    const allAlerts = []

    for (const source of sources) {
      const sourceState = sourceStates[source]
      const analysis = sourceState?.analysis
      if (!analysis?.alerts) continue

      for (const alert of analysis.alerts) {
        if (alert.type === 'outage' && alert.missedChecks < threshold) {
          continue
        }
        allAlerts.push({ ...alert, _source: source })
      }
    }

    allAlerts.sort((a, b) => {
      const aTime = a.type === 'ipchange' ? a.timestamp : a.start
      const bTime = b.type === 'ipchange' ? b.timestamp : b.start
      return bTime - aTime
    })

    return allAlerts
  }

  createAlertCard (alert, showBadge, helpers) {
    const item = document.createElement('div')
    const badgeHtml = showBadge
      ? `<span class="source-badge">${alert._source}</span>`
      : ''
    const badgeClass = showBadge ? ' has-badge' : ''

    if (alert.type === 'ipchange') {
      item.className = `alert alert-card ipchange${badgeClass}`
      item.innerHTML = `${badgeHtml}<strong>IP changed</strong> from ${alert.oldIp} to ${alert.newIp} at ${helpers.formatDateTime(alert.timestamp)}`
    } else if (alert.type === 'failure') {
      item.className = `alert alert-card failure${badgeClass}`
      item.innerHTML = `${badgeHtml}<strong>Connection failure</strong> at ${helpers.formatDateTime(alert.timestamp)} (${alert.message})`
    } else {
      item.className = `alert alert-card${badgeClass}`
      if (alert.open) item.classList.add('open')
      const endLabel = alert.open ? 'now' : helpers.formatDateTime(alert.end)
      const duration = helpers.formatDuration(alert.end.getTime() - alert.start.getTime())
      const countLabel = alert.missedChecks === 1 ? 'check' : 'checks'
      item.innerHTML = `${badgeHtml}<strong>${alert.missedChecks} ${countLabel} missed</strong> from ${helpers.formatDateTime(alert.start)} to ${endLabel} (${duration})`
    }

    return item
  }

  updateToggle (toggle, totalCount, maxVisible, expanded) {
    if (!toggle) return

    if (totalCount <= maxVisible) {
      toggle.style.display = 'none'
    } else {
      toggle.style.display = ''
      const remaining = totalCount - maxVisible
      toggle.textContent = expanded ? 'Show fewer' : `Show ${remaining} more`
    }
  }
}

window.NetworkOutages = NetworkOutages
