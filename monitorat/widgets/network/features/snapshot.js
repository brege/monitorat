class NetworkSnapshot {
  constructor(widget) {
    this.widget = widget;
    this.tiles = null;
  }

  render() {
    const { config, elements, state, helpers } = this.widget;
    if (!config.metrics.show || !elements.summaryTiles) {
      return;
    }

    const analysis = state.analysis;
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
              { key: 'uptime', label: 'Uptime', value: '–' },
              { key: 'total', label: 'Checks Logged', value: '–' },
              { key: 'expected', label: 'Checks Expected', value: '–' },
              { key: 'missed', label: 'Missed Checks', value: '–' },
            ],
          },
          {
            className: 'stats-row dates',
            tiles: [
              { key: 'first', label: 'First Entry', value: '–' },
              { key: 'last', label: 'Most Recent', value: '–' },
            ],
          },
        ],
      });
    }

    if (!analysis || !analysis.entries.length) {
      TileBuilder.updateValues(this.tiles, {
        uptime: '–',
        total: '–',
        expected: '–',
        missed: '–',
        first: '–',
        last: '–',
      });
      return;
    }

    TileBuilder.updateValues(this.tiles, {
      uptime: analysis.uptimeText,
      total: helpers.formatNumber(analysis.entries.length),
      expected: helpers.formatNumber(analysis.expectedChecks),
      missed: helpers.formatNumber(analysis.missedChecks),
      first: helpers.formatDateTime(analysis.firstEntry),
      last: helpers.formatDateTime(analysis.lastEntry),
    });
  }
}

window.NetworkSnapshot = NetworkSnapshot;
