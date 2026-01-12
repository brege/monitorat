class SpeedtestTable {
  constructor(widget) {
    this.widget = widget;
  }

  initializeManager() {
    this.widget.tableManager = this.widget.createTableManager();
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

  async loadHistory() {
    const mergeSources = this.widget.config.federation?.nodes;
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedHistory(mergeSources);
    } else {
      await this.loadSingleHistory();
    }
  }

  async loadSingleHistory() {
    this.widget.tableManager.setEntries([]);
    this.widget.tableManager.setStatus('Loading speedtest history…');

    try {
      const searchParameters = new URLSearchParams();
      searchParameters.set('limit', this.widget.config.table.max);
      searchParameters.set('ts', Date.now());

      const response = await fetch(
        `${this.widget.getApiBase()}/history?${searchParameters.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      this.widget.entries = payload.entries || [];
      this.widget.sources = null;
      this.widget.tableManager.setEntries(this.widget.entries);
      this.widget.updateViewToggle(this.widget.entries.length > 0);
      await this.widget.features.chart.loadChartData();
    } catch (error) {
      console.error('Speedtest history failed:', error);
      this.widget.tableManager.setStatus(
        `Unable to load speedtests: ${error.message}`,
      );
    }
  }

  async loadMergedHistory(sources) {
    this.widget.tableManager.setEntries([]);
    this.widget.tableManager.setStatus('Loading speedtest history…');

    try {
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            const searchParameters = new URLSearchParams();
            searchParameters.set('limit', this.widget.config.table.max);
            searchParameters.set('ts', Date.now());

            const response = await fetch(
              `api/speedtest-${source}/history?${searchParameters.toString()}`,
              { cache: 'no-store' },
            );
            if (!response.ok) {
              console.warn(
                `Failed to fetch speedtest from ${source}: HTTP ${response.status}`,
              );
              return [];
            }
            const payload = await response.json();
            return (payload.entries || []).map((entry) => ({
              ...entry,
              _source: source,
            }));
          } catch (error) {
            console.warn(
              `Failed to fetch speedtest from ${source}:`,
              error.message,
            );
            return [];
          }
        }),
      );

      const allEntries = results.flat();
      allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      this.widget.entries = allEntries.slice(0, this.widget.config.table.max);
      this.widget.sources = sources;
      this.widget.tableManager.setEntries(this.widget.entries);
      this.widget.updateViewToggle(this.widget.entries.length > 0);
      await this.widget.features.chart.loadChartData();
    } catch (error) {
      console.error('Speedtest merged history failed:', error);
      this.widget.tableManager.setStatus(
        `Unable to load speedtests: ${error.message}`,
      );
    }
  }
}

window.SpeedtestTable = SpeedtestTable;
