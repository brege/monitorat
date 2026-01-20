/* global Chart */
const CornerLabelsPlugin = {
  id: 'cornerLabels',

  isMobile() {
    return window.matchMedia('(max-width: 640px)').matches;
  },

  formatTimestamp(value) {
    if (!value) return '';
    if (typeof value === 'string' && !value.includes('T')) {
      return value;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  },

  formatValue(value, precision = 1) {
    if (value === null || value === undefined) return '';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    if (Math.abs(numeric) >= 1000) {
      return numeric.toFixed(0);
    }
    return numeric.toFixed(precision);
  },

  getYAxisValues(chart) {
    const scales = chart.scales;
    const yAxes = Object.keys(scales).filter((key) => key !== 'x');

    if (yAxes.length === 0) return { min: '', max: '' };

    if (yAxes.length === 1) {
      const yScale = scales[yAxes[0]];
      return {
        min: this.formatValue(yScale.min),
        max: this.formatValue(yScale.max),
      };
    }

    const values = yAxes.map((axisId) => {
      const scale = scales[axisId];
      return {
        min: this.formatValue(scale.min),
        max: this.formatValue(scale.max),
      };
    });

    return {
      min: values.map((v) => v.min).join('/'),
      max: values.map((v) => v.max).join('/'),
    };
  },

  afterDraw(chart) {
    if (!this.isMobile()) return;
    if (!chart.scales.x) return;

    const context = chart.ctx;
    const chartArea = chart.chartArea;

    const labels = chart.data.labels || [];
    if (!labels.length) return;

    const x0 = this.formatTimestamp(labels[0]);
    const x1 = this.formatTimestamp(labels[labels.length - 1]);
    const { min: y0, max: y1 } = this.getYAxisValues(chart);

    const computedStyle = getComputedStyle(document.documentElement);
    const textColor =
      computedStyle.getPropertyValue('--text-muted').trim() || '#6b7280';

    context.save();
    context.font = '500 9px system-ui, sans-serif';
    context.fillStyle = textColor;

    const leftX = chartArea.left + 2;
    const rightX = chartArea.right - 2;

    context.textAlign = 'left';
    context.textBaseline = 'bottom';
    context.fillText(`${x0}, ${y1}`, leftX, chartArea.top - 2);

    context.textAlign = 'right';
    context.textBaseline = 'bottom';
    context.fillText(`${x1}, ${y1}`, rightX, chartArea.top - 2);

    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(`${x0}, ${y0}`, leftX, chartArea.bottom + 2);

    context.textAlign = 'right';
    context.textBaseline = 'top';
    context.fillText(`${x1}, ${y0}`, rightX, chartArea.bottom + 2);

    context.restore();
  },
};

window.monitorShared = window.monitorShared || {};
window.monitorShared.CornerLabelsPlugin = CornerLabelsPlugin;
