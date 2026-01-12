/* global TimeSeriesHandler, ChartTableWidgetMethods */
class SpeedtestWidget {
  constructor(widgetConfig = {}) {
    this.container = null;
    this.widgetConfig = widgetConfig;
    this.attributeName = 'data-speedtest';
    this.defaults = {
      name: 'Speedtest',
      default: 'chart',
      periods: [],
      table: { min: 5, max: 200 },
      chart: {
        height: '400px',
        days: 30,
        default_period: 'all',
        default_metric: 'all',
      },
    };
    this.config = this.buildConfig();
    this.entries = [];
    this.metricFields = [];
    this.chartManager = null;
    this.tableManager = null;
    this.currentView = null;
    this.selectedPeriod = 'all';
    this.selectedMetric = 'all';
    this.selectedNode = 'all';
    this.schema = null;
    this.chartEntries = [];
    this.features = {
      controls: null,
      chart: null,
      table: null,
    };
  }

  initializeFeatureHeaders() {
    const features = this.config.features || {};
    for (const [featureId, featureConfig] of Object.entries(features)) {
      const headerEl = this.container.querySelector(
        `[data-speedtest-section-header="${featureId}"]`,
      );
      if (headerEl && featureConfig.header) {
        headerEl.textContent = featureConfig.header;
      }
    }
  }

  getApiBase() {
    return this.config._apiPrefix
      ? `api/${this.config._apiPrefix}`
      : 'api/speedtest';
  }

  async loadSchema() {
    if (this.schema) return;
    const response = await fetch(`${this.getApiBase()}/schema`);
    this.schema = await response.json();
    this.applyMetadataConfig();
    this.metricFields = this.resolveMetricFields();
  }

  buildConfig(overrides = {}) {
    return TimeSeriesHandler.buildConfig(
      this.defaults,
      this.widgetConfig,
      overrides,
    );
  }

  resolveMetricFields() {
    const enabled = this.config?.enabled;
    if (Array.isArray(enabled) && enabled.length > 0) {
      return (this.schema.metrics || []).filter((metric) =>
        enabled.includes(metric.field),
      );
    }
    return this.schema.metrics || [];
  }

  applyMetadataConfig() {
    const metadataConfig = this.config?.metadata || {};
    if (!this.schema.metadata) {
      this.schema.metadata = {};
    }
    if (metadataConfig.field) {
      this.schema.metadata.field = metadataConfig.field;
    }
    if (metadataConfig.label) {
      this.schema.metadata.label = metadataConfig.label;
    }
    const enabledSet = new Set(this.config?.enabled || []);
    const metadataFields = Array.isArray(this.schema.metadata.fields)
      ? this.schema.metadata.fields
      : [];
    const filteredMetadata = metadataFields.filter((field) => {
      if (typeof field === 'string') return enabledSet.has(field);
      if (field && typeof field.field === 'string')
        return enabledSet.has(field.field);
      return false;
    });
    this.schema.metadata.fields = filteredMetadata;
    if (
      filteredMetadata.length === 0 ||
      (filteredMetadata.length === 1 &&
        !enabledSet.has(this.schema.metadata.field))
    ) {
      this.schema.metadata.field = null;
    }
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = this.buildConfig(config);
    this.selectedPeriod =
      this.config.chart.default_period || this.defaults.chart.default_period;
    await this.loadSchema();
    this.metricFields = this.resolveMetricFields();
    const metricFields = this.metricFields.map((metric) => metric.field);
    const preferredMetric =
      this.config.chart.default_metric || this.defaults.chart.default_metric;
    this.selectedMetric =
      preferredMetric === 'all'
        ? 'all'
        : metricFields.includes(preferredMetric)
          ? preferredMetric
          : metricFields[0] || 'all';

    const response = await fetch('widgets/speedtest/index.html');
    const html = await response.text();
    container.innerHTML = html;

    this.applyVisibilityConfig();
    this.initializeFeatureHeaders();
    await this.loadFeatureScripts();
    this.initializeFeatures();

    const applyWidgetHeader = window.monitor?.applyWidgetHeader;
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        downloadCsv: false,
        downloadUrl: null,
      });
    }

    const showControls = this.config.show?.controls !== false;
    const showHistory = this.config.show?.history !== false;

    if (showControls || showHistory) {
      this.features.controls.setupEventListeners();
    }

    if (showHistory) {
      this.features.table.rebuildHeaders();
      this.setupNodeSelect();
      this.setupDownloadControl();
      this.initManagers();
      this.setView(this.config.default);
      await this.features.table.loadHistory();
    }
  }

  applyVisibilityConfig() {
    const FeatureVisibility = window.monitorShared.FeatureVisibility;

    FeatureVisibility.apply(this.container, this.config.show, {
      controls: '.speedtest-controls',
      history: '.speedtest-history',
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

  async loadFeatureScripts() {
    const featureScripts = [
      {
        globalName: 'SpeedtestControls',
        source: 'widgets/speedtest/features/controls.js',
      },
      {
        globalName: 'SpeedtestChart',
        source: 'widgets/speedtest/features/history/chart.js',
      },
      {
        globalName: 'SpeedtestTable',
        source: 'widgets/speedtest/features/history/table.js',
      },
    ];

    await window.monitorShared.loadFeatureScripts(featureScripts);
  }

  initializeFeatures() {
    const ControlsFeature = window.SpeedtestControls;
    const ChartFeature = window.SpeedtestChart;
    const TableFeature = window.SpeedtestTable;

    if (!ControlsFeature || !ChartFeature || !TableFeature) {
      throw new Error('Speedtest feature scripts not loaded');
    }

    this.features.controls = new ControlsFeature(this);
    this.features.chart = new ChartFeature(this);
    this.features.table = new TableFeature(this);
  }

  updateViewToggle(hasEntries) {
    return ChartTableWidgetMethods.updateViewToggle.call(this, hasEntries);
  }

  setupNodeSelect() {
    const nodeSelect = this.getElement('node-select');
    if (!nodeSelect) return;

    const mergeSources = this.config.federation?.nodes;
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
    const filtered =
      this.selectedNode === 'all'
        ? this.entries
        : this.entries.filter((entry) => entry._source === this.selectedNode);

    this.tableManager.setEntries(filtered);
    this.features.chart.update();
  }

  setupDownloadControl() {
    const downloadButton = this.getElement('download-csv');
    if (!downloadButton) {
      return;
    }
    if (this.config.download_csv === false) {
      downloadButton.style.display = 'none';
      return;
    }
    downloadButton.addEventListener('click', (event) => {
      event.preventDefault();
      const mergeSources = this.config.federation?.nodes;
      const isFederated =
        mergeSources && Array.isArray(mergeSources) && mergeSources.length > 1;
      if (isFederated && this.selectedNode !== 'all') {
        this.downloadCsvForSource(this.selectedNode);
        return;
      }
      this.downloadCsv();
    });
  }

  downloadCsv() {
    const url = `${this.getApiBase()}/csv?${Date.now()}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = 'speedtest.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadCsvForSource(source) {
    const url = `api/speedtest-${source}/csv?${Date.now()}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `speedtest-${source}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

Object.assign(
  SpeedtestWidget.prototype,
  window.monitorShared.ChartTableWidgetMethods || ChartTableWidgetMethods,
);

SpeedtestWidget.prototype.getViewControls = () => [];

SpeedtestWidget.prototype.updateControlStates = function () {
  const mergeSources = this.config.federation?.nodes;
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

SpeedtestWidget.prototype.updateLegendVisibility = function () {
  const metricLegend = this.getElement('metric-legend');
  const nodeLegend = this.getElement('node-legend');
  if (!metricLegend && !nodeLegend) {
    return;
  }
  const show = this.currentView === 'chart';
  if (metricLegend) {
    metricLegend.style.display =
      show && metricLegend.childElementCount ? '' : 'none';
  }
  if (nodeLegend) {
    nodeLegend.style.display =
      show && nodeLegend.childElementCount ? '' : 'none';
  }
};

SpeedtestWidget.prototype.setView = function (view) {
  const nextView = ChartTableWidgetMethods.setView.call(this, view);
  this.updateControlStates();
  this.updateLegendVisibility();
  return nextView;
};

SpeedtestWidget.prototype.openTableForSource = function (source) {
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
window.widgets.speedtest = SpeedtestWidget;
