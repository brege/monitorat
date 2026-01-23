// NetworkOutages: Event-driven outage renderer
//
// Fetches events from /api/network/events instead of client-side log parsing.
// Handles both single-source and multi-source (federation) cases.

class NetworkOutages {
  constructor(widget) {
    this.widget = widget;
    this.filters = {
      type: 'all',
      source: 'all',
    };
    this.elements = {
      typeFilter: null,
      sourceFilter: null,
    };
    this.events = [];
    this.loading = false;
  }

  async fetchEvents() {
    const { config } = this.widget;
    const sources = this.resolveSources();
    const allEvents = [];

    for (const source of sources) {
      try {
        const url = this.buildEventsUrl(source);
        const response = await fetch(url);
        if (!response.ok) continue;

        const data = await response.json();
        const events = (data.events || []).map((e) =>
          this.convertEvent(e, source),
        );
        allEvents.push(...events);
      } catch (error) {
        console.warn(`Failed to fetch events from ${source}:`, error);
      }
    }

    const threshold = config.alerts.cadenceChecks || 0;
    this.events = allEvents
      .filter((e) => {
        if (e.type === 'outage' && e.missedChecks < threshold) {
          return false;
        }
        return true;
      })
      .sort((a, b) => this.getAlertTime(b) - this.getAlertTime(a));
  }

  buildEventsUrl(source) {
    if (source === 'local') {
      return `${this.widget.getApiBase()}/events?limit=0`;
    }
    return `api/network-${source}/events?limit=0`;
  }

  convertEvent(event, source) {
    const details = event.details || {};
    const timestamp = new Date(event.timestamp);

    if (event.type === 'outage') {
      return {
        type: 'outage',
        start: details.start ? new Date(details.start) : timestamp,
        end: details.end ? new Date(details.end) : timestamp,
        missedChecks: details.missedChecks || event.value || 0,
        open: details.open || false,
        _source: source,
      };
    }

    if (event.type === 'ipchange') {
      return {
        type: 'ipchange',
        timestamp,
        oldIp: details.oldIp || '?',
        newIp: details.newIp || '?',
        _source: source,
      };
    }

    return {
      type: 'failure',
      timestamp,
      message: event.message || 'Connection failure',
      _source: source,
    };
  }

  async render() {
    const { config, elements, state, helpers } = this.widget;

    if (!config.alerts.show || !elements.alertList) {
      return;
    }

    const list = elements.alertList;
    const toggle = elements.alertToggle;

    if (!this.loading) {
      this.loading = true;
      await this.fetchEvents();
      this.loading = false;
    }

    list.innerHTML = '';

    const sources = this.resolveSources();
    const isMultiSource = sources.length > 1;
    this.renderControls(sources, isMultiSource);

    const filteredAlerts = this.applyFilters(this.events);

    if (!filteredAlerts.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = this.events.length
        ? 'No events match the current filters.'
        : 'No events detected.';
      list.appendChild(info);
      if (toggle) toggle.style.display = 'none';
      return;
    }

    const maxVisible = state.alertsExpanded
      ? filteredAlerts.length
      : Math.min(config.alerts.max, filteredAlerts.length);

    filteredAlerts.slice(0, maxVisible).forEach((alert) => {
      const card = this.createAlertCard(alert, isMultiSource, helpers);
      list.appendChild(card);
    });

    this.updateToggle(
      toggle,
      filteredAlerts.length,
      config.alerts.max,
      state.alertsExpanded,
    );
  }

  renderControls(sources, isMultiSource) {
    const { elements } = this.widget;
    const actionsContainer =
      elements.alertList?.parentElement?.querySelector('.alerts-actions');
    if (!actionsContainer) return;

    if (!this.elements.typeFilter) {
      const typeSelect = document.createElement('select');
      typeSelect.className = 'alerts-toggle';
      typeSelect.innerHTML = `
        <option value="all">All Events</option>
        <option value="outage">Missed Checks</option>
        <option value="ipchange">IP Changes</option>
        <option value="failure">Connection Failures</option>
      `;
      typeSelect.value = this.filters.type;
      typeSelect.addEventListener('change', () => {
        this.filters.type = typeSelect.value;
        this.render();
      });
      this.elements.typeFilter = typeSelect;
      actionsContainer.insertBefore(typeSelect, actionsContainer.firstChild);
    }

    if (isMultiSource && !this.elements.sourceFilter) {
      const sourceSelect = document.createElement('select');
      sourceSelect.className = 'alerts-toggle';
      sourceSelect.innerHTML = '<option value="all">All Nodes</option>';
      sources.forEach((source) => {
        const option = document.createElement('option');
        option.value = source;
        option.textContent = source;
        sourceSelect.appendChild(option);
      });
      sourceSelect.value = this.filters.source;
      sourceSelect.addEventListener('change', () => {
        this.filters.source = sourceSelect.value;
        this.render();
      });
      this.elements.sourceFilter = sourceSelect;
      const insertionPoint = this.elements.typeFilter
        ? this.elements.typeFilter.nextSibling
        : actionsContainer.firstChild;
      actionsContainer.insertBefore(sourceSelect, insertionPoint);
    }

    if (!isMultiSource && this.elements.sourceFilter) {
      this.elements.sourceFilter.remove();
      this.elements.sourceFilter = null;
      this.filters.source = 'all';
    }
  }

  resolveSources() {
    const { config } = this.widget;
    const federationNodes = config.federation?.nodes;

    if (federationNodes && Array.isArray(federationNodes)) {
      return federationNodes;
    }

    return ['local'];
  }

  getAlertTime(alert) {
    if (alert.type === 'ipchange' || alert.type === 'failure') {
      return alert.timestamp.getTime();
    }
    return alert.start.getTime();
  }

  applyFilters(alerts) {
    return alerts.filter((alert) => {
      if (this.filters.type !== 'all' && alert.type !== this.filters.type) {
        return false;
      }
      if (
        this.filters.source !== 'all' &&
        alert._source !== this.filters.source
      ) {
        return false;
      }
      return true;
    });
  }

  createAlertCard(alert, showBadge, helpers) {
    const Alerts = window.monitorShared.Alerts;
    const badge = showBadge ? { text: alert._source } : null;

    if (alert.type === 'ipchange') {
      const strong = document.createElement('strong');
      strong.textContent = 'IP changed';
      const detail = document.createElement('span');
      detail.textContent = ` from ${alert.oldIp} to ${alert.newIp} at ${helpers.formatDateTime(alert.timestamp)}`;
      return Alerts.createCard({
        classes: ['alert', 'ipchange'],
        badge,
        content: [strong, detail],
      });
    }

    if (alert.type === 'failure') {
      const strong = document.createElement('strong');
      strong.textContent = 'Connection failure';
      const detail = document.createElement('span');
      detail.textContent = ` at ${helpers.formatDateTime(alert.timestamp)} (${alert.message})`;
      return Alerts.createCard({
        classes: ['alert', 'failure'],
        badge,
        content: [strong, detail],
      });
    }

    const endLabel = alert.open ? 'now' : helpers.formatDateTime(alert.end);
    const intervalMs = this.widget.expectedIntervalMs || 0;
    const durationMs =
      intervalMs > 0
        ? alert.missedChecks * intervalMs
        : alert.end.getTime() - alert.start.getTime();
    const duration = helpers.formatDuration(durationMs);
    const countLabel = alert.missedChecks === 1 ? 'check' : 'checks';
    const strong = document.createElement('strong');
    strong.textContent = `${alert.missedChecks} ${countLabel} missed`;
    const detail = document.createElement('span');
    detail.textContent = ` from ${helpers.formatDateTime(alert.start)} to ${endLabel} (${duration})`;
    return Alerts.createCard({
      classes: ['alert', alert.open ? 'open' : ''],
      badge,
      content: [strong, detail],
    });
  }

  updateToggle(toggle, totalCount, maxVisible, expanded) {
    if (!toggle) return;

    if (totalCount <= maxVisible) {
      toggle.style.display = 'none';
    } else {
      toggle.style.display = '';
      const remaining = totalCount - maxVisible;
      toggle.textContent = expanded ? 'Show fewer' : `Show ${remaining} more`;
    }
  }
}

window.NetworkOutages = NetworkOutages;
