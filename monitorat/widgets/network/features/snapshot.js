class NetworkSnapshot {
  constructor(widget) {
    this.widget = widget;
    this.tiles = null;
    this.eventSummary = null;
    this.loadingSummary = false;
  }

  async loadEventSummary() {
    if (this.loadingSummary || this.eventSummary) {
      return;
    }
    this.loadingSummary = true;
    try {
      const response = await fetch(
        `${this.widget.getApiBase()}/events?limit=0`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const summary = { failures: 0, ipChanges: 0 };
      for (const event of data.events || []) {
        if (event.type === 'failure') {
          summary.failures += 1;
        } else if (event.type === 'ipchange') {
          summary.ipChanges += 1;
        }
      }
      this.eventSummary = summary;
      this.render();
    } catch (error) {
      console.warn('Failed to load event summary:', error);
    } finally {
      this.loadingSummary = false;
    }
  }

  render() {
    const { config, elements, state, helpers } = this.widget;
    if (!config.metrics.show || !elements.summaryTiles) {
      return;
    }

    const uptime = state.uptime;
    const TileBuilder =
      window.monitorTiles?.TileBuilder || window.monitorShared?.TileBuilder;
    if (!TileBuilder) {
      throw new Error('Tile builder not loaded');
    }

    if (!this.tiles) {
      this.tiles = TileBuilder.renderInto(elements.summaryTiles, {
        containerClass: 'stats',
        rows: [
          {
            className: 'stats-row primary',
            tiles: [
              { key: 'uptime', label: 'Availability', value: '–' },
              { key: 'total', label: 'Observed', value: '–' },
              { key: 'expected', label: 'Expected', value: '–' },
              { key: 'missed', label: 'Missing', value: '–' },
            ],
          },
          {
            className: 'stats-row dates',
            tiles: [
              { key: 'first', label: 'First Entry', value: '–' },
              { key: 'last', label: 'Most Recent', value: '–' },
              { key: 'failures', label: 'Failed', value: '–' },
              { key: 'ip_changes', label: 'IP Changes', value: '–' },
            ],
          },
        ],
      });
    }

    if (!uptime || !uptime.expectedChecks) {
      TileBuilder.updateValues(this.tiles, {
        uptime: '–',
        total: '–',
        expected: '–',
        missed: '–',
        first: '–',
        last: '–',
        failures: '–',
        ip_changes: '–',
      });
      return;
    }

    if (!this.eventSummary) {
      this.loadEventSummary();
    }

    TileBuilder.updateValues(this.tiles, {
      uptime: uptime.uptimeText,
      total: helpers.formatNumber(uptime.loggedChecks || 0),
      expected: helpers.formatNumber(uptime.expectedChecks),
      missed: helpers.formatNumber(uptime.missedChecks),
      first: helpers.formatDateTime(uptime.firstEntry),
      last: helpers.formatDateTime(uptime.lastEntry),
      failures: helpers.formatNumber(this.eventSummary?.failures || 0),
      ip_changes: helpers.formatNumber(this.eventSummary?.ipChanges || 0),
    });
  }
}

window.NetworkSnapshot = NetworkSnapshot;
