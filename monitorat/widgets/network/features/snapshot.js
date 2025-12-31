class NetworkSnapshot {
  constructor (widget) {
    this.widget = widget
  }

  render () {
    const { config, elements, state, helpers } = this.widget
    if (!config.metrics.show || !elements.summary) {
      return
    }

    const summary = elements.summary
    const analysis = state.analysis
    if (!analysis || !analysis.entries.length) {
      summary.uptime.textContent = '–'
      summary.total.textContent = '–'
      summary.expected.textContent = '–'
      summary.missed.textContent = '–'
      summary.first.textContent = '–'
      summary.last.textContent = '–'
      return
    }

    summary.uptime.textContent = analysis.uptimeText
    summary.total.textContent = helpers.formatNumber(analysis.entries.length)
    summary.expected.textContent = helpers.formatNumber(analysis.expectedChecks)
    summary.missed.textContent = helpers.formatNumber(analysis.missedChecks)
    summary.first.textContent = helpers.formatDateTime(analysis.firstEntry)
    summary.last.textContent = helpers.formatDateTime(analysis.lastEntry)
  }
}

window.NetworkSnapshot = NetworkSnapshot
