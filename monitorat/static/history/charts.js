/* global Chart, getComputedStyle */
class ChartManager {
  constructor(config) {
    this.canvasElement = config.canvasElement;
    this.containerElement = config.containerElement;
    this.height = config.height || '400px';
    this.chartOptions = config.chartOptions || {};
    this.dataUrl = config.dataUrl;
    this.dataParams = config.dataParams || {};

    this.chart = null;
    this.chartInitPromise = null;
  }

  ensureChart() {
    if (this.chart) {
      return Promise.resolve();
    }
    if (this.chartInitPromise) {
      return this.chartInitPromise;
    }
    this.chartInitPromise = new Promise((resolve) => {
      const initialize = () => {
        if (!this.canvasElement || !window.Chart) {
          this.chartInitPromise = null;
          resolve();
          return;
        }
        this.initChart();
        this.chartInitPromise = null;
        resolve();
      };

      if (window.Chart) {
        initialize();
      } else {
        const script = document.createElement('script');
        script.src = 'vendors/chart.min.js';
        script.onload = initialize;
        script.onerror = () => {
          console.error('Failed to load Chart.js');
          this.chartInitPromise = null;
          resolve();
        };
        document.head.appendChild(script);
      }
    });
    return this.chartInitPromise;
  }

  initChart() {
    if (!this.canvasElement || !window.Chart) return;

    const height = Number.parseInt(this.height, 10);
    this.containerElement.style.height = `${height}px`;
    this.containerElement.style.position = 'relative';

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          usePointStyle: false,
          boxWidth: 12,
          boxHeight: 12,
          boxPadding: 4,
          callbacks: {
            labelColor: (context) => {
              const color = context.dataset.borderColor;
              return {
                borderColor: color,
                backgroundColor: color,
                borderWidth: 0,
              };
            },
          },
        },
      },
      layout: {
        padding: { top: 4, right: 4, bottom: 0, left: 0 },
      },
    };

    const ctx = this.canvasElement.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [],
      },
      options: ChartManager.mergeObjects(defaultOptions, this.chartOptions),
    });
  }

  async loadData() {
    if (!this.chart || !this.dataUrl) return;

    try {
      const params = new URLSearchParams();
      Object.entries(this.dataParams).forEach(([key, value]) => {
        params.set(key, value);
      });
      params.set('ts', Date.now());

      const response = await fetch(`${this.dataUrl}?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const chartData = await response.json();
      this.chart.data = chartData;
      this.chart.update();
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  }

  updateChart(data, scales = null) {
    if (!this.chart) return;

    this.chart.data = data;
    if (scales) {
      this.chart.options.scales = { ...this.chart.options.scales, ...scales };
    }
    this.chart.update();
  }

  hasChart() {
    return !!this.chart;
  }

  static withAlpha(color, alpha) {
    if (typeof color !== 'string') {
      return color;
    }
    const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!match) {
      return color;
    }
    const [, r, g, b] = match;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  static computeMovingAverage(values, windowSize = 3) {
    if (!Array.isArray(values) || values.length === 0) {
      return [];
    }

    const halfWindow = Math.max(1, Math.floor(windowSize / 2));
    return values.map((value, index) => {
      if (!Number.isFinite(value)) {
        return value;
      }

      let sum = 0;
      let count = 0;
      for (let offset = -halfWindow; offset <= halfWindow; offset += 1) {
        const sampleIndex = index + offset;
        if (sampleIndex < 0 || sampleIndex >= values.length) {
          continue;
        }
        const sample = values[sampleIndex];
        if (Number.isFinite(sample)) {
          sum += sample;
          count += 1;
        }
      }

      if (count === 0) {
        return value;
      }

      return sum / count;
    });
  }

  static buildGhostedDatasets({ label, color, rawValues, windowSize = 3 }) {
    const smoothedValues = ChartManager.computeMovingAverage(
      rawValues,
      windowSize,
    );
    const computedStyle = getComputedStyle(document.documentElement);
    const ghostColor =
      computedStyle.getPropertyValue('--color-ghost').trim() ||
      'rgba(148, 163, 184, 0.35)';
    const ghostLightColor =
      computedStyle.getPropertyValue('--color-ghost-light').trim() ||
      'rgba(148, 163, 184, 0.08)';

    return [
      {
        label: `${label} (raw)`,
        data: rawValues,
        borderColor: ghostColor,
        backgroundColor: ghostLightColor,
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHitRadius: 6,
        fill: false,
        tension: 0.15,
        spanGaps: true,
        order: 0,
      },
      {
        label,
        data: smoothedValues,
        borderColor: color,
        backgroundColor: ChartManager.withAlpha(color, 0.12),
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 10,
        fill: true,
        tension: 0.25,
        spanGaps: true,
        order: 1,
      },
    ];
  }

  static filterDataByPeriod(data) {
    return data;
  }

  static setView(view, elements, currentView, chartManager, onChartReady) {
    const targetView =
      view === 'table' ? 'table' : view === 'none' ? 'none' : 'chart';
    if (currentView === targetView) {
      return targetView;
    }

    if (targetView === 'none') {
      if (elements.viewToggle) elements.viewToggle.style.display = 'none';
      if (elements.chartContainer)
        elements.chartContainer.style.display = 'none';
      if (elements.tableContainer)
        elements.tableContainer.style.display = 'none';
      return targetView;
    }

    if (elements.viewToggle) elements.viewToggle.style.display = '';

    if (targetView === 'chart') {
      if (elements.chartContainer) elements.chartContainer.style.display = '';
      if (elements.tableContainer)
        elements.tableContainer.style.display = 'none';
      if (elements.viewChart) elements.viewChart.classList.add('active');
      if (elements.viewTable) elements.viewTable.classList.remove('active');
      if (chartManager) {
        chartManager.ensureChart().then(() => {
          if (chartManager.hasChart() && targetView === 'chart') {
            if (onChartReady) {
              onChartReady();
            } else {
              chartManager.loadData();
            }
          }
        });
      }
    } else {
      if (elements.chartContainer)
        elements.chartContainer.style.display = 'none';
      if (elements.tableContainer) elements.tableContainer.style.display = '';
      if (elements.viewChart) elements.viewChart.classList.remove('active');
      if (elements.viewTable) elements.viewTable.classList.add('active');
    }

    return targetView;
  }

  static cloneObject(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => ChartManager.cloneObject(entry));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    if (value.constructor !== Object) {
      return value;
    }
    const cloned = {};
    Object.entries(value).forEach(([key, entry]) => {
      cloned[key] = ChartManager.cloneObject(entry);
    });
    return cloned;
  }

  static mergeObjects(baseObject, overrideObject) {
    const merged = ChartManager.cloneObject(baseObject);
    Object.entries(overrideObject || {}).forEach(([key, value]) => {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value.constructor === Object
      ) {
        merged[key] = ChartManager.mergeObjects(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    });
    return merged;
  }

  static buildScalesFromSchema(axes = {}, overrides = {}) {
    const scales = {};

    const minimalAxisDefaults = {
      ticks: {
        font: { size: 10, weight: '500' },
        maxTicksLimit: 4,
        padding: 0,
      },
      title: {
        display: false,
        font: { size: 10, weight: '500' },
        padding: { top: 0, bottom: 0 },
      },
      grid: {
        drawTicks: true,
      },
    };

    const xAxisDefaults = {
      ...minimalAxisDefaults,
      ticks: {
        ...minimalAxisDefaults.ticks,
        maxRotation: 0,
      },
    };

    Object.entries(axes || {}).forEach(([scaleId, config]) => {
      const cloned = ChartManager.cloneObject(config);
      const defaults = scaleId === 'x' ? xAxisDefaults : minimalAxisDefaults;
      scales[scaleId] = ChartManager.mergeObjects(defaults, cloned);
    });

    Object.entries(overrides || {}).forEach(([scaleId, overrideConfig]) => {
      scales[scaleId] = ChartManager.mergeObjects(
        scales[scaleId] || {},
        overrideConfig,
      );
    });

    return scales;
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.ChartManager = ChartManager;
