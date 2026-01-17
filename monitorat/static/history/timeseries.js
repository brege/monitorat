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
    // Matches single-unit periods for compact labels.
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

const TimeSeriesHandler = {
  buildConfig(defaults, widgetConfig = {}, overrides = {}) {
    const merged = { ...defaults, ...widgetConfig, ...overrides };
    const table = {
      ...defaults.table,
      ...(widgetConfig.table || {}),
      ...(overrides.table || {}),
    };
    const chart = {
      ...defaults.chart,
      ...(widgetConfig.chart || {}),
      ...(overrides.chart || {}),
    };
    const periods = Array.isArray(merged.periods)
      ? [...merged.periods]
      : Array.isArray(defaults.periods)
        ? [...defaults.periods]
        : [];

    return {
      ...merged,
      name: typeof merged.name !== 'undefined' ? merged.name : defaults.name,
      default:
        typeof merged.default === 'string' ? merged.default : defaults.default,
      table,
      chart,
      periods,
    };
  },

  setupPeriodSelect(selectElement, periods, selectedPeriod, onChange) {
    if (!selectElement) return;

    const DataFormatter = window.monitorShared.DataFormatter;

    selectElement.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All';
    selectElement.appendChild(allOption);

    if (Array.isArray(periods)) {
      for (const period of periods) {
        const option = document.createElement('option');
        option.value = period;
        option.textContent = DataFormatter.formatPeriodLabel(period);
        selectElement.appendChild(option);
      }
    }

    selectElement.value = selectedPeriod;
    if (typeof onChange === 'function') {
      selectElement.addEventListener('change', (event) =>
        onChange(event.target.value),
      );
    }
  },

  setView({
    view,
    currentView,
    container,
    attributeName,
    chartManager,
    onChartReady,
    controlsForChart = [],
  }) {
    const q = (name) =>
      container?.querySelector(`[${attributeName}="${name}"]`);
    const elements = {
      viewToggle: q('view-toggle'),
      chartContainer: q('chart-container'),
      tableContainer: q('table-container'),
      viewChart: q('view-chart'),
      viewTable: q('view-table'),
    };

    const nextView = window.monitorShared.ChartManager.setView(
      view,
      {
        viewToggle: elements.viewToggle,
        chartContainer: elements.chartContainer,
        tableContainer: elements.tableContainer,
        viewChart: elements.viewChart,
        viewTable: elements.viewTable,
      },
      currentView,
      chartManager,
      onChartReady,
    );

    const showControls = nextView === 'chart';
    controlsForChart.filter(Boolean).forEach((element) => {
      element.style.display = showControls ? '' : 'none';
    });

    return nextView;
  },

  updateViewToggle({
    container,
    attributeName,
    hasEntries,
    currentView,
    defaultViewSetter,
  }) {
    const toggle = container.querySelector(`[${attributeName}="view-toggle"]`);
    if (!toggle) return currentView;

    if (!hasEntries) {
      toggle.style.display = 'none';
      return currentView;
    }

    toggle.style.display = '';
    if (!currentView && typeof defaultViewSetter === 'function') {
      return defaultViewSetter();
    }

    return currentView;
  },

  formatTableRow({
    entry,
    metricFields = [],
    metadataField,
    metadataFields = [],
  }) {
    const DataFormatter = window.monitorShared.DataFormatter;
    const row = [DataFormatter.formatTimestamp(entry.timestamp)];

    for (const metric of metricFields) {
      row.push(DataFormatter.formatBySchema(entry[metric.field], metric));
    }

    const metadataFieldName = metadataField || null;
    if (metadataFieldName) {
      row.push(entry.source || entry[metadataFieldName] || '');
    }

    if (Array.isArray(metadataFields)) {
      for (const field of metadataFields) {
        const fieldName = typeof field === 'string' ? field : field?.field;
        if (!fieldName) continue;
        if (fieldName === metadataFieldName) continue;
        row.push(entry[fieldName] || '');
      }
    }

    return row;
  },
};

const ChartTableWidgetMethods = {
  getElement(name) {
    return this.container?.querySelector(`[${this.attributeName}="${name}"]`);
  },

  setView(view) {
    const controls = this.getViewControls();

    this.currentView = TimeSeriesHandler.setView({
      view,
      currentView: this.currentView,
      container: this.container,
      attributeName: this.attributeName,
      chartManager: this.chartManager,
      onChartReady: () => {
        if (typeof this.updateChartView === 'function') {
          this.updateChartView();
        } else if (this.chartManager?.hasChart()) {
          this.chartManager.loadData();
        }
      },
      controlsForChart: controls,
    });

    if (this.tableManager) this.tableManager.updateToggleVisibility();
    return this.currentView;
  },

  updateViewToggle(hasEntries) {
    this.currentView = TimeSeriesHandler.updateViewToggle({
      container: this.container,
      attributeName: this.attributeName,
      hasEntries,
      currentView: this.currentView,
      defaultViewSetter: () =>
        this.setView(this.config.default || this.defaults.default),
    });
  },

  getViewControls() {
    return [];
  },

  wireViewToggles() {
    const viewChart = this.getElement('view-chart');
    const viewTable = this.getElement('view-table');

    if (viewChart)
      viewChart.addEventListener('click', () => this.setView('chart'));
    if (viewTable) {
      viewTable.addEventListener('click', () => this.setView('table'));
    }
  },

  rebuildTableHeaders() {
    const metadataLabel = this.schema?.metadata?.label || 'Source';
    const metadataFields = Array.isArray(this.schema?.metadata?.fields)
      ? this.schema.metadata.fields
      : [];
    const TableManager = window.monitorShared.TableManager;
    TableManager.buildTableHeaders(
      this.container,
      this.metricFields,
      metadataLabel,
      metadataFields,
    );
  },

  formatTableRow(entry) {
    const metadataField = this.schema?.metadata?.field;
    const metadataFields = Array.isArray(this.schema?.metadata?.fields)
      ? this.schema.metadata.fields
      : [];
    return TimeSeriesHandler.formatTableRow({
      entry,
      metricFields: this.metricFields,
      metadataField,
      metadataFields,
    });
  },

  createTableManager() {
    const TableManager = window.monitorShared?.TableManager;

    return new TableManager({
      statusElement: this.getElement('history-status'),
      rowsElement: this.getElement('rows'),
      toggleElement: this.getElement('toggle'),
      previewCount: this.config.table.min,
      emptyMessage: this.schema?.metadata?.emptyMessage || 'No entries yet.',
      isTableViewActive: () => this.currentView === 'table',
      rowFormatter: (entry) => this.formatTableRow(entry),
    });
  },
};

window.monitorShared = window.monitorShared || {};
window.monitorShared.DataFormatter = DataFormatter;
window.monitorShared.TimeSeriesHandler = TimeSeriesHandler;
window.monitorShared.ChartTableWidgetMethods = ChartTableWidgetMethods;
