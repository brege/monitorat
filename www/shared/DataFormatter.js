class DataFormatter {
  static formatTimestamp(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  static formatMbps(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    return (num / 1_000_000).toFixed(2);
  }

  static formatPing(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    const text = num.toFixed(1);
    return text.endsWith('.0') ? text.slice(0, -2) : text;
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.DataFormatter = DataFormatter;