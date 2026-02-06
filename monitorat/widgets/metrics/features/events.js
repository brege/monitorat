class MetricsEvents {
  constructor(widget) {
    this.widget = widget;
    const sources = widget.getFederationSources();
    const schemaUrl = `${widget.getApiBase()}/schema`;
    const widgetName = widget.getFederatedWidgetName();
    const eventsUrls =
      Array.isArray(sources) && sources.length
        ? sources.map((source) => ({
            source,
            url: `api/${widgetName}-${source}/events?limit=0`,
          }))
        : [{ source: 'local', url: `${widget.getApiBase()}/events?limit=0` }];

    const featureConfig = widget.config?.features?.events || {};
    const baseConfig = widget.config?.events || {};
    const eventsConfig = { ...baseConfig, ...featureConfig };
    if (eventsConfig.show === undefined) {
      eventsConfig.show = true;
    }
    if (eventsConfig.max === undefined) {
      eventsConfig.max = 3;
    }

    const DataFormatter = window.monitorShared.DataFormatter;
    const helpers = {
      formatDateTime: (date) => DataFormatter.formatTimestamp(date),
      formatDuration: (durationMs) =>
        DataFormatter.formatDurationSeconds(durationMs / 1000),
      formatNumber: (value) => DataFormatter.formatNumber(value),
    };

    this.eventsList = new window.monitorShared.EventsList({
      schemaUrl,
      eventsUrls,
      container: widget.getElement('events-list'),
      toggle: widget.getElement('events-toggle'),
      config: eventsConfig,
      state: widget.state,
      stateKey: 'eventsExpanded',
      helpers,
    });
  }

  async render() {
    await this.eventsList.render();
  }
}

window.MetricsEvents = MetricsEvents;
