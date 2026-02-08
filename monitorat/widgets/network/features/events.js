class NetworkEvents {
  constructor(widget) {
    this.widget = widget;
    const nodes = widget.config.federation?.nodes;
    const sources = Array.isArray(nodes) && nodes.length ? nodes : ['local'];

    const cadenceChecks = this.parseCadenceChecks(
      widget.config.alerts?.cadence,
      widget.expectedIntervalMs,
    );

    this.eventsList = new window.monitorShared.EventsList({
      schemaUrl: `${widget.getApiBase()}/schema`,
      eventsUrls: sources.map((source) => ({
        source,
        url:
          source === 'local'
            ? `${widget.getApiBase()}/events?limit=0`
            : `api/network-${source}/events?limit=0`,
      })),
      container: widget.elements.alertList,
      toggle: widget.elements.alertToggle,
      config: {
        ...widget.config.alerts,
        cadenceChecks,
        expectedIntervalMs: widget.expectedIntervalMs,
      },
      state: widget.state,
      stateKey: 'alertsExpanded',
      helpers: widget.helpers,
    });
  }

  async render() {
    await this.eventsList.render();
  }

  parseCadenceChecks(value, expectedIntervalMs) {
    const cadenceMinutes = this.parseDurationMinutes(value);
    const checksPerMinute = 60000 / expectedIntervalMs;
    return Math.ceil(cadenceMinutes * checksPerMinute);
  }

  parseDurationMinutes(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') {
      throw new Error('network alerts.cadence must be a duration string');
    }
    if (typeof value !== 'string') {
      throw new Error('network alerts.cadence must be a duration string');
    }
    const trimmed = value.trim();
    if (!trimmed) return 0;

    // Match duration strings like "5 minutes", "1 hour", "2 days".
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(minutes?|hours?|days?)$/i);
    if (!match) {
      throw new Error('network alerts.cadence must be a duration string');
    }
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('hour')) return amount * 60;
    if (unit.startsWith('day')) return amount * 1440;
    return amount;
  }
}

window.NetworkEvents = NetworkEvents;
