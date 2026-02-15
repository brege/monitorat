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
    this.apiPrefix =
      widgetConfig._apiPrefix || widgetConfig.api_prefix || 'system';
    this.chartManager = null;
    this.tableManager = null;
    this.currentView = null;
    this.entries = [];
    this.transformedEntries = [];
    this.selectedMetric = null;
    this.selectedPeriod = 'all';
    this.selectedNode = 'all';
    this.schema = null;
    this.editor = null;
    this.metricFields = null;
    this.chartFields = null;
    this.computedGroups = [];
    this.state = {
      eventsExpanded: false,
    };
    this.features = {
      snapshot: null,
      chart: null,
      table: null,
      events: null,
    };
  }

  async loadSchema() {
    if (this.schema) return;
    const response = await fetch(`api/${this.apiPrefix}/schema`);
    this.schema = await response.json();
    if (!Array.isArray(this.schema.quantities)) {
      this.schema.quantities = [];
    }
    if (!this.schema.units || typeof this.schema.units !== 'object') {
      this.schema.units = {};
    }
    if (!Array.isArray(this.schema.metrics)) {
      this.schema.metrics = [];
    }
    if (!Array.isArray(this.schema.computed)) {
      this.schema.computed = [];
    }
    this.metricFields = this.resolveTableFields();
    this.chartFields = this.resolveChartFields();
    this.computedGroups = this.resolveComputedGroups();
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

  getHistoryPeriods() {
    const historyPeriods = this.config?.history?.periods;
    if (Array.isArray(historyPeriods) && historyPeriods.length) {
      return historyPeriods;
    }
    const chartPeriods = this.config?.chart?.periods;
    if (Array.isArray(chartPeriods) && chartPeriods.length) {
      return chartPeriods;
    }
    return this.defaults.periods || [];
  }

  getApiBase() {
    return `api/${this.apiPrefix}`;
  }

  buildConfig(overrides = {}) {
    const merged = TimeSeriesHandler.buildConfig(
      this.defaults,
      this.widgetConfig,
      overrides,
    );
    const history = merged.history || {};
    if (history.chart && typeof history.chart === 'object') {
      merged.chart = { ...merged.chart, ...history.chart };
    }
    if (history.table && typeof history.table === 'object') {
      merged.table = { ...merged.table, ...history.table };
    }
    if (typeof history.default === 'string') {
      merged.default = history.default;
    }
    if (Array.isArray(history.periods)) {
      merged.periods = [...history.periods];
    }
    return merged;
  }

  getEventsConfig() {
    const baseConfig = this.config?.events || {};
    const featureConfig = this.config?.features?.events || {};
    return { ...baseConfig, ...featureConfig };
  }

  getComputedGroup(groupName) {
    return this.computedGroups.find((group) => group.group === groupName);
  }

  resolveTableFields() {
    const unitSpecs = this.schema?.units || {};
    const quantities = this.schema?.quantities || [];
    const historyKeys = this.config?.history?.table?.columns;
    const filteredQuantities =
      Array.isArray(historyKeys) && historyKeys.length
        ? quantities.filter((quantity) => historyKeys.includes(quantity.key))
        : quantities;

    return filteredQuantities.map((quantity) => {
      const unitSpec = unitSpecs[quantity.unit] || {};
      return {
        field: quantity.key,
        label: quantity.label,
        unitName: quantity.unit,
        unit: unitSpec.suffix ?? '',
        format: unitSpec.format,
        decimals: unitSpec.decimals,
        color: unitSpec.color,
      };
    });
  }

  resolveChartFields() {
    const unitSpecs = this.schema?.units || {};
    const quantities = this.schema?.quantities || [];
    const chartKeys =
      this.config?.history?.chart?.quantities || this.schema?.chart_quantities;
    const filteredQuantities =
      Array.isArray(chartKeys) && chartKeys.length
        ? quantities.filter((quantity) => chartKeys.includes(quantity.key))
        : quantities;

    return filteredQuantities.map((quantity) => {
      const unitSpec = unitSpecs[quantity.unit] || {};
      return {
        field: quantity.key,
        label: quantity.label,
        unitName: quantity.unit,
        unit: unitSpec.suffix ?? '',
        format: unitSpec.format,
        decimals: unitSpec.decimals,
        color: unitSpec.color,
      };
    });
  }
  resolveComputedGroups() {
    const groups = this.config?.history?.computed;
    const unitSpecs = this.schema?.units || {};
    if (!Array.isArray(groups)) {
      return [];
    }
    return groups
      .filter((group) => group && typeof group.group === 'string')
      .map((group) => {
        const unitSpec = unitSpecs[group.unit] || {};
        const fields = Array.isArray(group.fields) ? group.fields : [];
        return {
          group: group.group,
          label: group.label || group.group,
          unit: group.unit,
          unitLabel: unitSpec.label,
          unitSuffix: unitSpec.suffix,
          unitFormat: unitSpec.format,
          unitDecimals: unitSpec.decimals,
          fields: fields
            .filter((field) => field?.field && field?.source)
            .map((field) => ({
              field: field.field,
              label: field.label || field.field,
              source: field.source,
              unitName: group.unit,
              color: field.color || unitSpec.color,
              format: unitSpec.format,
              decimals: unitSpec.decimals,
              unit: unitSpec.suffix ?? '',
            })),
        };
      });
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = this.buildConfig(config);
    this.selectedPeriod =
      this.config.chart.default_period || this.defaults.chart.default_period;

    await this.loadSchema();
    const metricFields = this.chartFields.map((metric) => metric.field);
    const preferredMetric =
      this.config.chart.default_metric || this.defaults.chart.default_metric;
    const computedGroups = this.computedGroups.map((group) => group.group);
    this.selectedMetric = metricFields.includes(preferredMetric)
      ? preferredMetric
      : computedGroups.includes(preferredMetric)
        ? preferredMetric
        : metricFields[0] || computedGroups[0] || preferredMetric;

    const response = await fetch('widgets/metrics/index.html');
    const html = await response.text();
    await window.monitorShared.renderWidgetTemplate(container, html);

    this.applyVisibilityConfig();
    this.initializeFeatureHeaders();
    await this.loadFeatureScripts();
    this.initializeFeatures();
    this.features.table.rebuildHeaders();

    this.setupEventListeners();
    this.initManagers();
    await this.loadData();

    if (this.canEditMetrics()) {
      this.addEditButton();
    }

    const showHistory = this.config.show?.history !== false;
    if (showHistory) {
      this.setView(this.config.default || this.defaults.default);
      await this.features.table.loadHistory();
    }

    await this.features.events.render();
  }

  canEditMetrics() {
    if (this.config.remote) {
      return false;
    }
    if (this.config.federation?.nodes) {
      return false;
    }
    return window.monitorShared?.isEditModeEnabled?.() === true;
  }

  async openMetricsEditor() {
    if (!window.MetricsEditor) {
      await window.monitorShared.loadScript(
        'widgets/metrics/features/editor.js',
        'MetricsEditor',
      );
    }
    if (!this.editor) {
      this.editor = new window.MetricsEditor(this);
    }
    await this.editor.openEditor();
  }

  async applySnapshotQuantities(quantities) {
    this.config = this.buildConfig({
      snapshots: {
        ...(this.config.snapshots || {}),
        quantities: [...quantities],
      },
    });
    if (this.features.snapshot) {
      this.features.snapshot.tiles = null;
    }
    await this.loadData();
  }

  addEditButton() {
    const controlsRow = this.container.querySelector(
      '[data-metrics="widget-controls"]',
    );
    if (!controlsRow) return;

    controlsRow.style.display = '';
    const configureBtn = controlsRow.querySelector('.metrics-configure');
    if (!configureBtn) return;

    configureBtn.style.display = '';
    configureBtn.addEventListener('click', () => {
      this.openMetricsEditor();
    });
  }

  setupEventListeners() {
    const metricSelect = this.getElement('metric-select');
    const periodSelect = this.getElement('period-select');

    this.wireViewToggles();

    if (metricSelect) {
      metricSelect.innerHTML = '';
      for (const metric of this.chartFields) {
        const option = document.createElement('option');
        option.value = metric.field;
        option.textContent = metric.label;
        metricSelect.appendChild(option);
      }
      for (const group of this.computedGroups) {
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
      this.getHistoryPeriods(),
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
    this.setupDownloadControl();
    this.setupLegendToggle();
    this.updateControlStates();

    const eventsToggle = this.getElement('events-toggle');
    if (eventsToggle) {
      eventsToggle.addEventListener('click', () => {
        this.state.eventsExpanded = !this.state.eventsExpanded;
        this.features.events?.render();
      });
    }
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

  getCsvUrl() {
    return `${this.getApiBase()}/csv?${Date.now()}`;
  }

  getCsvUrlForSource(source) {
    const widgetName = this.getFederatedWidgetName();
    return `api/${widgetName}-${source}/csv?${Date.now()}`;
  }

  getCsvFilename() {
    return `${this.apiPrefix}.csv`;
  }

  getCsvFilenameForSource(source) {
    const widgetName = this.getFederatedWidgetName();
    return `${widgetName}-${source}.csv`;
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
    const eventsConfig = this.getEventsConfig();

    FeatureVisibility.apply(
      this.container,
      {
        tiles: this.config.show?.tiles !== false,
        history: this.config.show?.history !== false,
        events: eventsConfig.show !== false,
      },
      {
        tiles: '.stats',
        history: '.metrics-history',
        events: '[data-metrics-section="events"]',
      },
    );
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
      {
        globalName: 'MetricsEvents',
        source: 'widgets/metrics/features/events.js',
      },
    ];

    await window.monitorShared.loadFeatureScripts(featureScripts);
  }

  initializeFeatures() {
    const SnapshotFeature = window.MetricsSnapshot;
    const ChartFeature = window.MetricsChart;
    const TableFeature = window.MetricsTable;
    const EventsFeature = window.MetricsEvents;

    if (!SnapshotFeature || !ChartFeature || !TableFeature || !EventsFeature) {
      throw new Error('Metrics feature scripts not loaded');
    }

    this.features.snapshot = new SnapshotFeature(this);
    this.features.chart = new ChartFeature(this);
    this.features.table = new TableFeature(this);
    this.features.events = new EventsFeature(this);
  }
}

Object.assign(
  MetricsWidget.prototype,
  window.monitorShared.ChartTableWidgetMethods || ChartTableWidgetMethods,
);

MetricsWidget.prototype.getViewControls = () => [];

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
