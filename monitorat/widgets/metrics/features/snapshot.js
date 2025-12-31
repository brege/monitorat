class MetricsSnapshot {
  constructor (widget) {
    this.widget = widget
  }

  render (data) {
    if (!data.metrics || !data.metric_statuses) return

    const keys = data.keys || Object.keys(data.metrics).filter(key => key !== 'status' && key !== 'lastUpdated')
    const valueElements = {}
    const statElements = {}

    for (const key of keys) {
      const element = this.widget.container.querySelector(`#${key}-value`)
      if (element) {
        valueElements[key] = element
        statElements[key] = element.closest('.stat')
      }
    }

    for (const key of keys) {
      if (valueElements[key] && data.metrics[key]) {
        valueElements[key].textContent = data.metrics[key]
      }
      if (statElements[key] && data.metric_statuses[key]) {
        const status = data.metric_statuses[key]
        statElements[key].className = statElements[key].className.replace(/status-\w+/g, '')
        statElements[key].classList.add(`status-${status}`)
      }
    }
  }
}

window.MetricsSnapshot = MetricsSnapshot
