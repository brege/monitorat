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

  static formatMbps (value, decimals = 2) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '–'
    return (num / 1_000_000).toFixed(decimals)
  }

  static formatPing (value, decimals = 1) {
    const num = Number(value)
    if (!Number.isFinite(num)) return '–'
    const text = num.toFixed(decimals)
    return decimals === 1 && text.endsWith('.0') ? text.slice(0, -2) : text
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

  static formatBySchema (value, metricSchema = {}) {
    if (value === null || value === undefined) return '–'

    const unit = typeof metricSchema.unit === 'string' ? metricSchema.unit : ''
    const formatType = metricSchema.format || 'number'
    const decimals = Number.isFinite(metricSchema.decimals) ? metricSchema.decimals : 1

    if (formatType === 'mbps') {
      const formattedMbps = this.formatNumber(value / 1_000_000, Number.isFinite(metricSchema.decimals) ? metricSchema.decimals : 2)
      return formattedMbps === '–' ? formattedMbps : `${formattedMbps}${unit}`
    }

    if (formatType === 'ping') {
      const formattedPing = this.formatPing(value, decimals)
      return formattedPing === '–' ? formattedPing : `${formattedPing}${unit}`
    }

    const formattedNumber = this.formatNumber(value, decimals)
    return formattedNumber === '–' ? formattedNumber : `${formattedNumber}${unit}`
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.DataFormatter = DataFormatter
