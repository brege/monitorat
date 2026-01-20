class MetricsTable extends window.monitorShared.HistoryTableBase {
  constructor(widget) {
    super(widget);
  }

  rebuildHeaders() {
    const metadataLabel = this.widget.schema?.metadata?.label || 'Source';
    const TableManager = window.monitorShared.TableManager;
    TableManager.buildTableHeaders(
      this.widget.container,
      this.widget.metricFields,
      metadataLabel,
    );
  }

  getRequestParams() {
    if (this.widget.selectedPeriod && this.widget.selectedPeriod !== 'all') {
      return { period: this.widget.selectedPeriod };
    }
    return {};
  }

  getSingleUrl() {
    return this.widget.getEndpoint('history');
  }

  getMergedUrl(source) {
    return this.widget.getEndpoint('history', source);
  }

  parsePayload(payload) {
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  getLoadingMessage() {
    return 'Loading metrics history…';
  }

  getErrorMessage(error) {
    return `Unable to load metrics history: ${error.message}`;
  }

  logSingleError(error) {
    console.error('Metrics history API call failed:', error);
  }

  logMergedError(error) {
    console.error('Metrics merged history API call failed:', error);
  }

  logSourceError(source, errorMessage) {
    console.warn(`Failed to fetch metrics from ${source}: ${errorMessage}`);
  }

  sortMergedEntries(entries) {
    return entries.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    );
  }

  selectTableEntries(entries) {
    const tableLimit = Number.isFinite(this.widget.config.table?.max)
      ? this.widget.config.table.max
      : this.widget.defaults.table.max;
    return entries.slice(-tableLimit).reverse();
  }

  transformEntries(entries) {
    return this.calculateTableDeltas(entries);
  }

  async afterEntriesApplied() {
    if (this.widget.chartManager?.hasChart()) {
      this.widget.updateChart();
    }
  }

  calculateTableDeltas(data) {
    const result = [];
    const previousBySource = {};

    for (const row of data) {
      const sourceKey = row._source || '';
      const entry = {
        timestamp: row.timestamp,
        source: row.source || '',
        _source: row._source || '',
      };

      for (const metric of this.widget.metricFields) {
        if (metric.source) {
          entry[metric.field] = 0;
        } else {
          entry[metric.field] = parseFloat(row[metric.field]) || 0;
        }
      }

      const previousRow = previousBySource[sourceKey];
      if (previousRow) {
        const timeDelta =
          (new Date(row.timestamp) - new Date(previousRow.timestamp)) / 60000;
        if (timeDelta > 0) {
          for (const metric of this.widget.metricFields) {
            if (metric.source) {
              const current = parseFloat(row[metric.source]) || 0;
              const previous = parseFloat(previousRow[metric.source]) || 0;
              entry[metric.field] = Math.max(
                0,
                (current - previous) / timeDelta,
              );
            }
          }
        }
      }

      result.push(entry);
      previousBySource[sourceKey] = row;
    }

    return result;
  }
}

window.MetricsTable = MetricsTable;
