const DataFormatter = {
  formatTimestamp(value) {
    return DataFormatter.formatDate(
      value,
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      },
      'Unknown',
    );
  },

  formatMbps(value, decimals = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    return (num / 1_000_000).toFixed(decimals);
  },

  formatPing(value, decimals = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    const text = num.toFixed(decimals);
    return decimals === 1 && text.endsWith('.0') ? text.slice(0, -2) : text;
  },

  formatNumber(value, decimals = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    const text = num.toFixed(decimals);
    return decimals === 1 && text.endsWith('.0') ? text.slice(0, -2) : text;
  },

  formatTime(timestamp) {
    return DataFormatter.formatDate(
      timestamp,
      {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      },
      'Unknown',
    );
  },

  formatDate(value, options, fallback = 'Unknown') {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, options);
  },

  formatPeriodLabel(period) {
    if (typeof period !== 'string') return period;
    const match = period.match(/^1\s+(hour|day|week|month|year)s?$/i);
    if (match) {
      return match[1].toLowerCase();
    }
    return period;
  },

  selectByAttribute(container, attributeName, values) {
    const result = {};
    for (const value of values) {
      result[value] = container.querySelector(`[${attributeName}="${value}"]`);
    }
    return result;
  },

  formatBySchema(value, metricSchema = {}) {
    if (value === null || value === undefined) return '–';

    const unit = typeof metricSchema.unit === 'string' ? metricSchema.unit : '';
    const formatType = metricSchema.format || 'number';
    const decimals = Number.isFinite(metricSchema.decimals)
      ? metricSchema.decimals
      : 1;

    if (formatType === 'mbps') {
      const formattedMbps = DataFormatter.formatNumber(
        value / 1_000_000,
        Number.isFinite(metricSchema.decimals) ? metricSchema.decimals : 2,
      );
      return formattedMbps === '–' ? formattedMbps : `${formattedMbps}${unit}`;
    }

    if (formatType === 'ping') {
      const formattedPing = DataFormatter.formatPing(value, decimals);
      return formattedPing === '–' ? formattedPing : `${formattedPing}${unit}`;
    }

    const formattedNumber = DataFormatter.formatNumber(value, decimals);
    return formattedNumber === '–'
      ? formattedNumber
      : `${formattedNumber}${unit}`;
  },
};

window.monitorShared = window.monitorShared || {};
window.monitorShared.DataFormatter = DataFormatter;
