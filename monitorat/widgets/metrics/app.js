// Metrics Widget
/* global TimeSeriesHandler, ChartTableWidgetMethods */
class MetricsWidget {
  constructor(widgetConfig = {}) {
    this.container = null;
    this.widgetConfig = widgetConfig;
    this.attributeName = 'data-metrics';
    this.defaults = {
      name: 'System Metrics',
      default: 'chart',
      periods: [],
      table: { min: 5, max: 200 },
      chart: {
        default_metric: 'cpu_percent',
        default_period: 'all',
        height: '400px',
        days: 30,
      },
    };
    this.config = this.buildConfig();
    this.apiPrefix = widgetConfig._apiPrefix || 'metrics';
    this.chartManager = null;
    this.tableManager = null;
    this.currentView = null;
    this.entries = [];
    this.transformedEntries = [];
    this.selectedMetric = 'cpu_percent';
    this.selectedPeriod = 'all';
    this.selectedNode = 'all';
    this.schema = null;
    this.metricFields = null;
    this.features = {
      snapshot: null,
      chart: null,
      table: null,
    };
  }

  async loadSchema() {
    if (this.schema) return;
    const response = await fetch(`api/${this.apiPrefix}/schema`);
    this.schema = await response.json();
    this.metricFields = this.resolveMetricFields();
  }

  initializeFeatureHeaders() {
    const features = this.config.features || {};
    for (const [featureId, featureConfig] of Object.entries(features)) {
      if (featureConfig.header !== null && featureConfig.header !== undefined) {
        const headerEl = this.container.querySelector(
          `[data-metrics-section-header="${featureId}"]`,
        );
        if (headerEl) {
          headerEl.textContent = featureConfig.header;
        }
      }
    }
  }

  buildConfig(overrides = {}) {
    return TimeSeriesHandler.buildConfig(
      this.defaults,
      this.widgetConfig,
      overrides,
    );
  }

  resolveMetricFields() {
    const allMetrics = [
      ...(this.schema?.metrics || []),
      ...(this.schema?.computed || []).flatMap((group) => group.fields),
    ];
    const enabled = this.config?.enabled;
    if (Array.isArray(enabled) && enabled.length > 0) {
      return allMetrics.filter((metric) => {
        if (enabled.includes(metric.field)) return true;
        if (metric.source && enabled.includes(metric.source)) return true;
        return false;
      });
    }
    return allMetrics;
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = this.buildConfig(config);
    this.selectedPeriod =
      this.config.chart.default_period || this.defaults.chart.default_period;

    await this.loadSchema();
    const metricFields = this.metricFields.map((metric) => metric.field);
    const preferredMetric =
      this.config.chart.default_metric || this.defaults.chart.default_metric;
    this.selectedMetric = metricFields.includes(preferredMetric)
      ? preferredMetric
      : metricFields[0] || preferredMetric;

    const response = await fetch('widgets/metrics/index.html');
    const html = await response.text();
    container.innerHTML = html;

    this.applyVisibilityConfig();
    this.initializeFeatureHeaders();
    await this.loadFeatureScripts();
    this.initializeFeatures();
    this.features.table.rebuildHeaders();
    const applyWidgetHeader = window.monitor?.applyWidgetHeader;
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        downloadCsv: false,
        downloadUrl: null,
      });
    }

    this.setupEventListeners();
    this.initManagers();
    await this.loadData();

    const showHistory = this.config.show?.history !== false;
    if (showHistory) {
      this.setView(this.config.default || this.defaults.default);
      await this.features.table.loadHistory();
    }
  }

  setupEventListeners() {
    const metricSelect = this.getElement('metric-select');
    const periodSelect = this.getElement('period-select');
    const downloadButton = this.getElement('download-csv');

    this.wireViewToggles();

    if (metricSelect) {
      metricSelect.innerHTML = '';
      const allowedFields = new Set(
        this.metricFields.map((metric) => metric.field),
      );

      const allowedMetrics = (this.schema.metrics || []).filter((metric) =>
        allowedFields.has(metric.field),
      );
      const allowedComputed = (this.schema.computed || []).filter((group) =>
        group.fields.some((field) => allowedFields.has(field.field)),
      );

      for (const metric of allowedMetrics) {
        const option = document.createElement('option');
        option.value = metric.field;
        option.textContent = metric.label;
        metricSelect.appendChild(option);
      }
      for (const group of allowedComputed) {
        const option = document.createElement('option');
        option.value = group.group;
        option.textContent = group.label;
        metricSelect.appendChild(option);
      }
      metricSelect.value = this.selectedMetric;
      metricSelect.style.display = '';
      metricSelect.addEventListener('change', (event) => {
        this.selectedMetric = event.target.value;
        if (this.chartManager?.hasChart()) this.updateChart();
      });
    }

    TimeSeriesHandler.setupPeriodSelect(
      periodSelect,
      this.config.chart.periods,
      this.selectedPeriod,
      (period) => {
        this.selectedPeriod = period;
        this.features.table.loadHistory();
      },
    );
    if (periodSelect) {
      periodSelect.style.display = '';
    }

    this.setupNodeSelect();
    this.setupDownloadControl(downloadButton);
    this.updateControlStates();
  }

  setupNodeSelect() {
    const nodeSelect = this.getElement('node-select');
    if (!nodeSelect) return;

    const mergeSources = this.widgetConfig.federation?.nodes;
    if (
      !mergeSources ||
      !Array.isArray(mergeSources) ||
      mergeSources.length < 2
    ) {
      nodeSelect.style.display = 'none';
      return;
    }

    nodeSelect.innerHTML = '';
    nodeSelect.style.display = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Nodes';
    nodeSelect.appendChild(allOption);

    for (const source of mergeSources) {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source;
      nodeSelect.appendChild(option);
    }

    nodeSelect.value = this.selectedNode;
    nodeSelect.addEventListener('change', (event) => {
      this.selectedNode = event.target.value;
      if (this.selectedNode === 'all' && this.currentView === 'table') {
        this.setView('chart');
      }
      this.applyNodeFilter();
      this.updateControlStates();
    });
  }

  applyNodeFilter() {
    const tableLimit = Number.isFinite(this.config.table?.max)
      ? this.config.table.max
      : this.defaults.table.max;
    const filtered =
      this.selectedNode === 'all'
        ? this.transformedEntries
        : this.transformedEntries.filter(
            (entry) => entry._source === this.selectedNode,
          );

    const tableEntries = filtered.slice(-tableLimit).reverse();
    this.tableManager.setEntries(tableEntries);

    if (this.chartManager?.hasChart()) {
      this.updateChart();
    }
  }

  setupDownloadControl(downloadButton) {
    if (!downloadButton) return;

    if (this.config.download_csv === false) {
      downloadButton.style.display = 'none';
      return;
    }

    downloadButton.addEventListener('click', (event) => {
      event.preventDefault();
      const mergeSources = this.widgetConfig.federation?.nodes;
      const isFederated =
        mergeSources && Array.isArray(mergeSources) && mergeSources.length > 1;
      if (isFederated && this.selectedNode !== 'all') {
        this.downloadCsvForSource(this.selectedNode);
        return;
      }
      this.downloadCsv();
    });
  }

  async loadData() {
    const showTiles = this.config.show?.tiles !== false;
    if (!showTiles) return;

    const mergeSources = this.widgetConfig.federation?.nodes;
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedData(mergeSources);
    } else {
      await this.loadSingleData();
    }
  }

  async loadSingleData() {
    const response = await fetch(`api/${this.apiPrefix}`);
    const data = await response.json();
    this.features.snapshot.render(data);
  }

  async loadMergedData(sources) {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/metrics-${source}`);
          if (!response.ok) {
            return { source, data: null, error: `HTTP ${response.status}` };
          }
          const data = await response.json();
          return { source, data, error: null };
        } catch (error) {
          return { source, data: null, error: error.message };
        }
      }),
    );

    const displayStrategy =
      this.widgetConfig.columns === 1 ? 'sources' : 'columnate';
    this.features.snapshot.renderMerged(results, displayStrategy);
  }

  getViewControls() {
    return [];
  }

  applyVisibilityConfig() {
    const FeatureVisibility = window.monitorShared.FeatureVisibility;

    FeatureVisibility.apply(this.container, this.config.show, {
      tiles: '.stats',
      history: '.metrics-history',
    });
  }

  initManagers() {
    this.features.chart.initializeManager();
    this.features.table.initializeManager();
  }

  updateChart() {
    this.features.chart.update();
  }

  updateChartView() {
    this.features.chart.updateView();
  }

  updateViewToggle(hasEntries) {
    this.currentView = TimeSeriesHandler.updateViewToggle({
      container: this.container,
      attributeName: this.attributeName,
      hasEntries,
      currentView: this.currentView,
      defaultViewSetter: () =>
        this.setView(this.config.default || this.defaults.default),
    });
  }

  downloadCsv() {
    const url = `api/${this.apiPrefix}/csv?${Date.now()}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.apiPrefix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadCsvForSource(source) {
    const url = `api/metrics-${source}/csv?${Date.now()}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `metrics-${source}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async loadFeatureScripts() {
    const featureScripts = [
      {
        globalName: 'MetricsSnapshot',
        source: 'widgets/metrics/features/snapshot.js',
      },
      {
        globalName: 'MetricsChart',
        source: 'widgets/metrics/features/history/chart.js',
      },
      {
        globalName: 'MetricsTable',
        source: 'widgets/metrics/features/history/table.js',
      },
    ];

    await window.monitorShared.loadFeatureScripts(featureScripts);
  }

  initializeFeatures() {
    const SnapshotFeature = window.MetricsSnapshot;
    const ChartFeature = window.MetricsChart;
    const TableFeature = window.MetricsTable;

    if (!SnapshotFeature || !ChartFeature || !TableFeature) {
      throw new Error('Metrics feature scripts not loaded');
    }

    this.features.snapshot = new SnapshotFeature(this);
    this.features.chart = new ChartFeature(this);
    this.features.table = new TableFeature(this);
  }
}

Object.assign(
  MetricsWidget.prototype,
  window.monitorShared.ChartTableWidgetMethods || ChartTableWidgetMethods,
);

MetricsWidget.prototype.getViewControls = () => [];

MetricsWidget.prototype.updateControlStates = function () {
  const mergeSources = this.widgetConfig.federation?.nodes;
  const isFederated =
    mergeSources && Array.isArray(mergeSources) && mergeSources.length > 1;
  const isAllNodes = isFederated && this.selectedNode === 'all';
  const isTableView = this.currentView === 'table';

  const metricSelect = this.getElement('metric-select');
  const periodSelect = this.getElement('period-select');
  const tableButton = this.getElement('view-table');
  const csvButton = this.getElement('download-csv');

  if (metricSelect) metricSelect.disabled = isTableView;
  if (periodSelect) periodSelect.disabled = isTableView;
  if (tableButton) tableButton.disabled = isAllNodes;
  if (csvButton) csvButton.disabled = isAllNodes;
};

MetricsWidget.prototype.setView = function (view) {
  const nextView = ChartTableWidgetMethods.setView.call(this, view);
  this.updateControlStates();
  return nextView;
};

MetricsWidget.prototype.openTableForSource = function (source) {
  if (!source) {
    return;
  }
  this.selectedNode = source;
  const nodeSelect = this.getElement('node-select');
  if (nodeSelect) {
    nodeSelect.value = source;
  }
  this.applyNodeFilter();
  this.setView('table');
};

window.widgets = window.widgets || {};
window.widgets.metrics = MetricsWidget;
