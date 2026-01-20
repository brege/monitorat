class TableManager {
  constructor(config) {
    this.statusElement = config.statusElement;
    this.rowsElement = config.rowsElement;
    this.toggleElement = config.toggleElement;
    this.previewCount = config.previewCount || 5;
    this.emptyMessage = config.emptyMessage || 'No data yet.';
    this.rowFormatter = config.rowFormatter;
    this.isTableViewActive = config.isTableViewActive || (() => true);

    this.entries = [];
    this.expanded = false;

    if (this.toggleElement) {
      this.toggleElement.addEventListener('click', () =>
        this.toggleExpansion(),
      );
    }
  }

  setEntries(entries) {
    this.entries = entries;
    this.render();
  }

  setStatus(message) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
      this.statusElement.style.display = '';
    }
  }

  render() {
    if (!this.rowsElement) return;

    this.rowsElement.innerHTML = '';

    if (!this.entries.length) {
      this.setStatus(this.emptyMessage);
      this.updateToggleVisibility();
      return;
    }

    const previewCount = Math.max(1, this.previewCount);
    const showCount = this.expanded
      ? this.entries.length
      : Math.min(previewCount, this.entries.length);
    const latest = this.entries.slice(0, showCount);

    latest.forEach((entry) => {
      const tr = document.createElement('tr');
      const cells = this.rowFormatter ? this.rowFormatter(entry) : [entry];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      this.rowsElement.appendChild(tr);
    });

    if (this.statusElement) {
      this.statusElement.style.display = 'none';
    }

    this.updateToggleVisibility();
  }

  updateToggleVisibility() {
    if (!this.toggleElement) return;

    const previewCount = Math.max(1, this.previewCount);
    const shouldShow =
      this.entries.length > previewCount && this.isTableViewActive();

    if (shouldShow) {
      this.toggleElement.style.display = '';
      const remaining = this.entries.length - previewCount;
      this.toggleElement.textContent = this.expanded
        ? 'Show fewer'
        : `Show ${remaining} more`;
    } else {
      this.toggleElement.style.display = 'none';
    }
  }

  toggleExpansion() {
    this.expanded = !this.expanded;
    this.render();
  }

  static updateTableHeaders(thead, headers) {
    if (!thead) return;
    thead.innerHTML = '';
    for (const header of headers) {
      const th = document.createElement('th');
      th.textContent = header;
      thead.appendChild(th);
    }
  }

  static buildTableHeaders(
    container,
    metricFields = [],
    metadataLabel = 'Source',
    metadataFields = [],
  ) {
    const headerRow = container?.querySelector('thead tr');
    if (!headerRow) return;

    const headers = ['Timestamp'];
    for (const metric of metricFields) {
      headers.push(metric.label);
    }
    if (Array.isArray(metadataFields) && metadataFields.length > 0) {
      for (const field of metadataFields) {
        if (typeof field === 'string') {
          headers.push(field);
        } else if (field && typeof field.label === 'string') {
          headers.push(field.label);
        } else if (field && typeof field.field === 'string') {
          headers.push(field.field);
        }
      }
    } else {
      headers.push(metadataLabel);
    }

    TableManager.updateTableHeaders(headerRow, headers);
  }
}

class HistoryTableBase {
  constructor(widget) {
    this.widget = widget;
  }

  initializeManager() {
    this.widget.tableManager = this.widget.createTableManager();
  }

  getMergeSources() {
    if (typeof this.widget.getFederationSources === 'function') {
      return this.widget.getFederationSources();
    }
    return (
      this.widget.config?.federation?.nodes ||
      this.widget.widgetConfig?.federation?.nodes ||
      null
    );
  }

  getRequestParams() {
    return {};
  }

  getSingleUrl() {
    throw new Error('getSingleUrl must be implemented by HistoryTableBase');
  }

  getMergedUrl(source) {
    throw new Error('getMergedUrl must be implemented by HistoryTableBase');
  }

  getSourcesFromPayload(payload) {
    return payload?.sources || null;
  }

  parsePayload(payload) {
    return Array.isArray(payload?.entries) ? payload.entries : [];
  }

  transformEntries(entries) {
    return entries;
  }

  sortMergedEntries(entries) {
    return entries;
  }

  selectTableEntries(entries) {
    return entries;
  }

  getLoadingMessage() {
    return 'Loading history…';
  }

  getErrorMessage(error) {
    return `Unable to load history: ${error.message}`;
  }

  logSingleError(error) {
    console.error('History API call failed:', error);
  }

  logMergedError(error) {
    console.error('Merged history API call failed:', error);
  }

  logSourceError(source, errorMessage) {
    console.warn(`Failed to fetch history from ${source}: ${errorMessage}`);
  }

  setLoadingState() {
    this.widget.tableManager.setEntries([]);
    this.widget.tableManager.setStatus(this.getLoadingMessage());
  }

  buildRequestUrl(baseUrl, params = {}) {
    const requestUrl = new URL(baseUrl, window.location);
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      requestUrl.searchParams.set(key, value);
    });
    requestUrl.searchParams.set('ts', Date.now());
    return requestUrl;
  }

  async fetchPayload(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  tagEntriesWithSource(entries, source) {
    return entries.map((entry) => ({ ...entry, _source: source }));
  }

  async applyEntries(entries, sources) {
    this.widget.sources = sources || null;
    this.widget.entries = entries;
    const transformedEntries = this.transformEntries(entries);
    this.widget.transformedEntries = transformedEntries;

    const tableEntries = this.selectTableEntries(transformedEntries);
    this.widget.tableManager.setEntries(tableEntries);
    this.widget.updateViewToggle(tableEntries.length > 0);
    await this.afterEntriesApplied({
      entries,
      transformedEntries,
      tableEntries,
      sources: this.widget.sources,
    });
  }

  async afterEntriesApplied() {}

  async loadHistory() {
    const mergeSources = this.getMergeSources();
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedHistory(mergeSources);
    } else {
      await this.loadSingleHistory();
    }
  }

  async loadSingleHistory() {
    this.setLoadingState();

    try {
      const requestUrl = this.buildRequestUrl(
        this.getSingleUrl(),
        this.getRequestParams(),
      );
      const payload = await this.fetchPayload(requestUrl);
      const entries = this.parsePayload(payload);
      await this.applyEntries(entries, this.getSourcesFromPayload(payload));
    } catch (error) {
      this.logSingleError(error);
      this.widget.tableManager.setStatus(this.getErrorMessage(error));
    }
  }

  async loadMergedHistory(sources) {
    this.setLoadingState();

    try {
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            const requestUrl = this.buildRequestUrl(
              this.getMergedUrl(source),
              this.getRequestParams(),
            );
            const payload = await this.fetchPayload(requestUrl);
            const entries = this.parsePayload(payload);
            return this.tagEntriesWithSource(entries, source);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logSourceError(source, message);
            return [];
          }
        }),
      );

      const allEntries = this.sortMergedEntries(results.flat());
      await this.applyEntries(allEntries, sources);
    } catch (error) {
      this.logMergedError(error);
      this.widget.tableManager.setStatus(this.getErrorMessage(error));
    }
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.TableManager = TableManager;
window.monitorShared.HistoryTableBase = HistoryTableBase;
