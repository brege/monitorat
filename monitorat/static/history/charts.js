/* global Chart, getComputedStyle */
class ChartManager {
  static mobileQuery = window.matchMedia('(max-width: 640px)');

  static isMobile() {
    return ChartManager.mobileQuery.matches;
  }

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

    const isMobile = ChartManager.isMobile();
    const layoutPadding = isMobile
      ? { top: 16, right: 4, bottom: 16, left: 4 }
      : { top: 4, right: 4, bottom: 0, left: 0 };

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
        padding: layoutPadding,
      },
    };

    if (isMobile) {
      defaultOptions.scales = {
        x: {
          ticks: { display: false },
          grid: { drawTicks: false },
          afterFit(scale) {
            scale.height = 0;
          },
        },
        y: {
          ticks: { display: false },
          grid: { drawTicks: false },
          afterFit(scale) {
            scale.width = 0;
          },
        },
      };
    }

    const ctx = this.canvasElement.getContext('2d');

    const CornerLabelsPlugin = window.monitorShared?.CornerLabelsPlugin;
    if (CornerLabelsPlugin && !Chart.registry.plugins.get('cornerLabels')) {
      Chart.register(CornerLabelsPlugin);
    }

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

    if (this.containerElement) {
      ChartManager.applyLegendDock(this.containerElement);
    }
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

  static filterEntries(entries, selectedNode) {
    if (!selectedNode || selectedNode === 'all') {
      return entries;
    }
    return entries.filter((entry) => entry._source === selectedNode);
  }

  static filterSources(sources, selectedNode) {
    if (!selectedNode || selectedNode === 'all') {
      return sources;
    }
    return [selectedNode];
  }

  static buildMergedTimeline(entries, formatTime) {
    const entriesBySource = {};
    for (const entry of entries) {
      const source = entry._source || 'unknown';
      if (!entriesBySource[source]) {
        entriesBySource[source] = [];
      }
      entriesBySource[source].push(entry);
    }

    const allTimestamps = new Set();
    for (const rows of Object.values(entriesBySource)) {
      for (const row of rows) {
        allTimestamps.add(row.timestamp);
      }
    }

    const sortedTimestamps = Array.from(allTimestamps).sort();
    const labels = sortedTimestamps.map((timestamp) => formatTime(timestamp));

    return { entriesBySource, sortedTimestamps, labels };
  }

  static getSeriesColors(count = 6) {
    const computedStyle = getComputedStyle(document.documentElement);
    const colors = [];
    for (let i = 1; i <= count; i += 1) {
      const color = computedStyle
        .getPropertyValue(`--chart-series-${i}`)
        .trim();
      if (color) {
        colors.push(color);
      }
    }
    return colors;
  }

  static toggleDatasets(chart, predicate) {
    const datasets = chart.data.datasets || [];
    const indexes = datasets
      .map((dataset, index) => (predicate(dataset) ? index : null))
      .filter((index) => index !== null);
    if (!indexes.length) return false;

    const anyVisible = indexes.some((index) => chart.isDatasetVisible(index));
    indexes.forEach((index) => {
      chart.setDatasetVisibility(index, !anyVisible);
    });
    return true;
  }

  static updateAxisBounds(chart, options = {}) {
    if (!chart) return;

    const { padding = 0.1 } = options;
    const valuesByAxis = {};
    const datasets = chart.data.datasets || [];

    datasets.forEach((dataset, index) => {
      if (!chart.isDatasetVisible(index)) return;
      const axisId = dataset.yAxisID || 'y';
      if (!valuesByAxis[axisId]) {
        valuesByAxis[axisId] = [];
      }
      for (const value of dataset.data || []) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          valuesByAxis[axisId].push(numeric);
        }
      }
    });

    const scales = chart.options?.scales || {};
    Object.keys(scales).forEach((axisId) => {
      if (axisId === 'x') return;
      const values = valuesByAxis[axisId] || [];
      if (!values.length) {
        delete scales[axisId].min;
        delete scales[axisId].max;
        return;
      }
      let min = Math.min(...values);
      let max = Math.max(...values);
      if (min === max) {
        min -= 1;
        max += 1;
      }
      const range = max - min;
      scales[axisId].min = min - range * padding;
      scales[axisId].max = max + range * padding;
    });

    chart.update();

    const container = chart.canvas?.parentElement;
    if (container) {
      ChartManager.applyLegendDock(container);
    }
  }

  static getActiveDatasetFields(chart, fieldKey, predicate = null) {
    const datasets = chart.data.datasets || [];
    const fields = new Set();
    datasets.forEach((dataset, index) => {
      if (!chart.isDatasetVisible(index)) return;
      if (predicate && !predicate(dataset)) return;
      const field = dataset[fieldKey];
      if (field) {
        fields.add(field);
      }
    });
    return Array.from(fields);
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
    const isMobile = ChartManager.isMobile();

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

    if (isMobile) {
      Object.entries(scales).forEach(([scaleId, scaleConfig]) => {
        scaleConfig.ticks = scaleConfig.ticks || {};
        scaleConfig.ticks.display = false;
        scaleConfig.grid = scaleConfig.grid || {};
        scaleConfig.grid.drawTicks = false;
        if (scaleId === 'x') {
          scaleConfig.afterFit = (scale) => {
            scale.height = 0;
          };
        } else {
          scaleConfig.afterFit = (scale) => {
            scale.width = 0;
          };
        }
      });
    }

    return scales;
  }

  static detectSparsestRegion(chart) {
    if (!chart || !chart.data || !chart.data.datasets) return 'top';

    const datasets = chart.data.datasets || [];
    const chartArea = chart.chartArea;
    if (!chartArea) return 'top';

    const height = chartArea.bottom - chartArea.top;
    if (height <= 0) return 'top';

    const topThreshold = chartArea.top + height * 0.3;
    const bottomThreshold = chartArea.bottom - height * 0.3;

    let topCount = 0;
    let bottomCount = 0;

    datasets.forEach((dataset, index) => {
      if (!chart.isDatasetVisible(index)) return;
      const meta = chart.getDatasetMeta(index);
      const points = meta?.data || [];
      points.forEach((point) => {
        const y = point?.y;
        if (!Number.isFinite(y)) return;
        if (y <= topThreshold) topCount += 1;
        if (y >= bottomThreshold) bottomCount += 1;
      });
    });

    return topCount <= bottomCount ? 'top' : 'bottom';
  }

  static applyLegendDock(container) {
    if (!container) return;
    if (!window.Chart) return;

    const overlay = container.querySelector('.chart-overlay');
    if (!overlay) return;

    if (!ChartManager.isMobile()) {
      overlay.classList.remove('dock-bottom');
      return;
    }

    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    const chart = Chart.getChart(canvas);
    if (!chart) return;

    const region = ChartManager.detectSparsestRegion(chart);
    overlay.classList.toggle('dock-bottom', region === 'bottom');
  }
}

class HistoryChartBase {
  constructor(widget) {
    this.widget = widget;
  }

  initializeManager({ chartOptions = {}, dataUrl = null, dataParams = null }) {
    const ChartManager = window.monitorShared?.ChartManager;
    this.widget.chartManager = new ChartManager({
      canvasElement: this.widget.getElement('chart'),
      containerElement: this.widget.getElement('chart-container'),
      height: this.widget.config.chart.height,
      dataUrl,
      dataParams,
      chartOptions,
    });
  }

  getEntries() {
    return [];
  }

  getSources() {
    return null;
  }

  getMetricsToChart() {
    return [];
  }

  getCurveDefaults() {
    return {
      fill: false,
      interpolation: 0.3,
      ghosts: false,
    };
  }

  getCurveConfig() {
    return this.widget.config?.chart?.curve || this.getCurveDefaults();
  }

  getMetricValue(entry, metric) {
    return entry?.[metric.field];
  }

  getDatasetLabel(metric, source) {
    const baseLabel = metric.label || metric.field;
    return source ? `${source}: ${baseLabel}` : baseLabel;
  }

  shouldUseMergedMode(sources, filteredSources) {
    return Array.isArray(filteredSources) && filteredSources.length > 1;
  }

  buildDatasets() {
    return [];
  }

  buildSingleChartData(entries, metrics) {
    const DataFormatter = window.monitorShared.DataFormatter;
    const labels = entries.map((row) =>
      DataFormatter.formatTime(row.timestamp),
    );
    const datasets = [];
    const allValues = [];
    const curve = this.getCurveConfig();

    metrics.forEach((metric) => {
      const values = entries.map((entry) => this.getMetricValue(entry, metric));
      allValues.push(...values.filter((value) => Number.isFinite(value)));
      const label = this.getDatasetLabel(metric, null);
      const nextDatasets = this.buildDatasets({
        metric,
        values,
        label,
        curve,
        isMerged: false,
        source: null,
        sourceIndex: 0,
      });
      if (Array.isArray(nextDatasets)) {
        datasets.push(...nextDatasets);
      } else if (nextDatasets) {
        datasets.push(nextDatasets);
      }
    });

    return { labels, datasets, allValues, metrics, sources: [] };
  }

  buildMergedChartData(entries, metrics, sources) {
    const ChartManager = window.monitorShared.ChartManager;
    const DataFormatter = window.monitorShared.DataFormatter;
    const { entriesBySource, sortedTimestamps, labels } =
      ChartManager.buildMergedTimeline(entries, (ts) =>
        DataFormatter.formatTime(ts),
      );

    const datasets = [];
    const allValues = [];
    const curve = this.getCurveConfig();

    sources.forEach((source, sourceIndex) => {
      const sourceEntries = entriesBySource[source] || [];
      const timestampMap = {};
      for (const entry of sourceEntries) {
        timestampMap[entry.timestamp] = entry;
      }

      metrics.forEach((metric) => {
        const values = sortedTimestamps.map((timestamp) => {
          const entry = timestampMap[timestamp];
          if (!entry) return null;
          return this.getMetricValue(entry, metric);
        });
        allValues.push(...values.filter((value) => Number.isFinite(value)));

        const label = this.getDatasetLabel(metric, source);
        const nextDatasets = this.buildDatasets({
          metric,
          values,
          label,
          curve,
          isMerged: true,
          source,
          sourceIndex,
        });
        if (Array.isArray(nextDatasets)) {
          datasets.push(...nextDatasets);
        } else if (nextDatasets) {
          datasets.push(nextDatasets);
        }
      });
    });

    return { labels, datasets, allValues, metrics, sources };
  }

  buildChartData() {
    const ChartManager = window.monitorShared.ChartManager;
    const entries = this.getEntries() || [];
    const metrics = this.getMetricsToChart() || [];
    const sources = this.getSources();
    const filteredEntries = ChartManager.filterEntries(
      entries,
      this.widget.selectedNode,
    );

    if (Array.isArray(sources) && sources.length > 0) {
      const filteredSources = ChartManager.filterSources(
        sources,
        this.widget.selectedNode,
      );
      if (this.shouldUseMergedMode(sources, filteredSources)) {
        return this.buildMergedChartData(
          filteredEntries,
          metrics,
          filteredSources,
        );
      }
    }

    return this.buildSingleChartData(filteredEntries, metrics);
  }

  applyChartData(chartData) {
    this.widget.chartManager.updateChart({
      labels: chartData.labels,
      datasets: chartData.datasets,
    });
  }

  afterUpdateChart() {}

  update() {
    if (!this.widget.chartManager?.hasChart()) return;
    const chartData = this.buildChartData();
    if (!chartData.datasets.length) return;
    this.applyChartData(chartData);
    this.afterUpdateChart(chartData);
  }

  updateView() {
    if (this.widget.chartManager?.hasChart()) {
      this.update();
    }
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.ChartManager = ChartManager;
window.monitorShared.HistoryChartBase = HistoryChartBase;
