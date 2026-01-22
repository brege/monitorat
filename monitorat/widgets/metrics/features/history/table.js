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
    const fieldSet = new Set(
      (this.widget.metricFields || []).map((metric) => metric.field),
    );
    const computedFields = (this.widget.computedGroups || []).flatMap(
      (group) => group.fields || [],
    );
    const previousBySource = {};

    return entries.map((entry) => {
      const next = { ...entry };
      for (const field of fieldSet) {
        if (typeof next[field] === 'string') {
          const value = Number(next[field]);
          if (Number.isFinite(value)) {
            next[field] = value;
          }
        }
      }

      if (computedFields.length > 0) {
        const sourceKey = entry._source || '';
        const previous = previousBySource[sourceKey];
        let timeDeltaMinutes = null;
        if (previous && entry.timestamp && previous.timestamp) {
          timeDeltaMinutes =
            (new Date(entry.timestamp) - new Date(previous.timestamp)) / 60000;
        }

        for (const metric of computedFields) {
          if (!metric.source) {
            continue;
          }
          const current = Number(entry[metric.source]);
          const previousValue = previous
            ? Number(previous[metric.source])
            : null;
          if (
            Number.isFinite(current) &&
            Number.isFinite(previousValue) &&
            timeDeltaMinutes &&
            timeDeltaMinutes > 0
          ) {
            const rate = (current - previousValue) / timeDeltaMinutes;
            next[metric.field] = Number.isFinite(rate)
              ? Math.max(0, rate)
              : null;
          } else {
            next[metric.field] = null;
          }
        }

        previousBySource[sourceKey] = entry;
      }

      return next;
    });
  }

  async afterEntriesApplied() {
    if (this.widget.chartManager?.hasChart()) {
      this.widget.updateChart();
    }
  }
}

window.MetricsTable = MetricsTable;
