class SpeedtestTable extends window.monitorShared.HistoryTableBase {
  constructor(widget) {
    super(widget);
  }

  rebuildHeaders() {
    const mergeSources = this.widget.config.federation?.nodes;
    if (mergeSources && Array.isArray(mergeSources)) {
      this.addSourceMetadataField();
    }
    this.widget.rebuildTableHeaders();
  }

  addSourceMetadataField() {
    if (!this.widget.schema) {
      this.widget.schema = {};
    }
    if (!this.widget.schema.metadata) {
      this.widget.schema.metadata = {};
    }
    const existingFields = this.widget.schema.metadata.fields || [];
    const hasSourceField = existingFields.some(
      (f) =>
        (typeof f === 'string' && f === '_source') ||
        (f && f.field === '_source'),
    );
    if (!hasSourceField) {
      this.widget.schema.metadata.fields = [
        { field: '_source', label: 'Node' },
        ...existingFields,
      ];
    }
  }

  getRequestParams() {
    return { limit: this.getTableLimit() };
  }

  getTableLimit() {
    return this.widget.config.table.max;
  }

  getSingleUrl() {
    return this.widget.getEndpoint('history');
  }

  getMergedUrl(source) {
    return this.widget.getEndpoint('history', source);
  }

  getSourcesFromPayload() {
    return null;
  }

  parsePayload(payload) {
    return Array.isArray(payload?.entries) ? payload.entries : [];
  }

  getLoadingMessage() {
    return 'Loading speedtest history…';
  }

  getErrorMessage(error) {
    return `Unable to load speedtests: ${error.message}`;
  }

  logSingleError(error) {
    console.error('Speedtest history failed:', error);
  }

  logMergedError(error) {
    console.error('Speedtest merged history failed:', error);
  }

  logSourceError(source, errorMessage) {
    console.warn(`Failed to fetch speedtest from ${source}: ${errorMessage}`);
  }

  sortMergedEntries(entries) {
    return entries.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );
  }

  selectTableEntries(entries) {
    return entries.slice(0, this.getTableLimit());
  }

  async afterEntriesApplied() {
    await this.widget.features.chart.loadChartData();
  }
}

window.SpeedtestTable = SpeedtestTable;
