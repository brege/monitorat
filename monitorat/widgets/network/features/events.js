class NetworkEvents {
  constructor(widget) {
    this.widget = widget;
    const nodes = widget.config.federation?.nodes;
    const sources = Array.isArray(nodes) && nodes.length ? nodes : ['local'];

    this.eventsList = new window.monitorShared.EventsList({
      schemaUrl: `${widget.getApiBase()}/schema`,
      eventsUrls: sources.map((source) => ({
        source,
        url: source === 'local' ? `${widget.getApiBase()}/events?limit=0` : `api/network-${source}/events?limit=0`,
      })),
      container: widget.elements.alertList,
      toggle: widget.elements.alertToggle,
      config: { ...widget.config.alerts, expectedIntervalMs: widget.expectedIntervalMs },
      state: widget.state,
      stateKey: 'alertsExpanded',
      helpers: widget.helpers,
    });
  }

  async render() {
    await this.eventsList.render();
  }
}

window.NetworkEvents = NetworkEvents;
