class DataFormatter {
  static formatTimestamp (value) {
    return this.formatDate(value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }, 'Unknown')
  }

  static formatMbps (value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '–'
    return (num / 1_000_000).toFixed(2)
  }

  static formatPing (value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '–'
    const text = num.toFixed(1)
    return text.endsWith('.0') ? text.slice(0, -2) : text
  }

  static formatNumber (value, decimals = 1) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '–'
    const text = num.toFixed(decimals)
    return decimals === 1 && text.endsWith('.0') ? text.slice(0, -2) : text
  }

  static formatTime (timestamp) {
    return this.formatDate(timestamp, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }, 'Unknown')
  }

  static formatDate (value, options, fallback = 'Unknown') {
    if (!value) return fallback
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(undefined, options)
  }

  static selectByAttribute (container, attributeName, values) {
    const result = {}
    for (const value of values) {
      result[value] = container.querySelector(`[${attributeName}="${value}"]`)
    }
    return result
  }

  static updateTableHeaders (thead, headers) {
    thead.innerHTML = ''
    for (const header of headers) {
      const th = document.createElement('th')
      th.textContent = header
      thead.appendChild(th)
    }
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.DataFormatter = DataFormatter
