function createAlertCard(options = {}) {
  const {
    classes = '',
    badge = null,
    content = null,
    actions = [],
    title = '',
    onClick = null,
  } = options;

  const card = document.createElement('div');
  card.classList.add('alert-card');
  if (typeof classes === 'string') {
    classes
      .split(' ')
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => {
        card.classList.add(name);
      });
  } else if (Array.isArray(classes)) {
    classes.filter(Boolean).forEach((name) => {
      card.classList.add(name);
    });
  }

  if (badge?.text) {
    const badgeElement = document.createElement('span');
    badgeElement.className = `source-badge${badge.className ? ` ${badge.className}` : ''}`;
    badgeElement.textContent = badge.text;
    if (badge.title) {
      badgeElement.title = badge.title;
    }
    card.classList.add('has-badge');
    card.appendChild(badgeElement);
  }

  if (title) {
    card.title = title;
  }

  if (onClick) {
    card.addEventListener('click', onClick);
    card.style.cursor = 'pointer';
  }

  if (typeof content === 'string') {
    const body = document.createElement('span');
    body.className = 'alert-text';
    body.textContent = content;
    card.appendChild(body);
  } else if (Array.isArray(content)) {
    content.filter(Boolean).forEach((node) => {
      if (typeof node === 'string') {
        card.appendChild(document.createTextNode(node));
      } else {
        card.appendChild(node);
      }
    });
  } else if (content) {
    card.appendChild(content);
  }

  if (Array.isArray(actions)) {
    actions.filter(Boolean).forEach((node) => {
      card.appendChild(node);
    });
  }

  return card;
}

class EventsList {
  constructor({
    schemaUrl,
    eventsUrls,
    container,
    toggle,
    config,
    state,
    stateKey,
    helpers,
  }) {
    this.schemaUrl = schemaUrl;
    this.eventsUrls = eventsUrls;
    this.container = container;
    this.toggle = toggle;
    this.config = config;
    this.state = state;
    this.stateKey = stateKey;
    this.helpers = helpers;
    this.schema = null;
    this.events = [];
    this.filters = { type: 'all', source: 'all' };
    this.elements = { typeFilter: null, sourceFilter: null };
  }

  async loadSchema() {
    if (this.schema) return;
    try {
      const response = await fetch(this.schemaUrl);
      const data = await response.json();
      this.schema = data.eventTypes || {};
    } catch {
      this.schema = {};
    }
  }

  async fetchEvents() {
    const allEvents = [];

    for (const { source, url } of this.eventsUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const data = await response.json();
        const events = (data.events || []).map((e) => ({
          ...e,
          _source: source,
        }));
        allEvents.push(...events);
      } catch (error) {
        console.warn(`Failed to fetch events from ${source}:`, error);
      }
    }

    const threshold = this.config.cadenceChecks || 0;
    this.events = allEvents
      .filter((e) => {
        if (e.type === 'outage' && (e.details?.missedChecks || 0) < threshold) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async render() {
    if (!this.config.show || !this.container) return;

    await this.loadSchema();
    await this.fetchEvents();

    this.container.innerHTML = '';

    const isMultiSource = this.eventsUrls.length > 1;
    this.renderControls(isMultiSource);

    const filtered = this.events.filter((e) => {
      if (this.filters.type !== 'all' && e.type !== this.filters.type)
        return false;
      if (this.filters.source !== 'all' && e._source !== this.filters.source)
        return false;
      return true;
    });

    if (!filtered.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = this.events.length
        ? 'No events match the current filters.'
        : 'No events detected.';
      this.container.appendChild(info);
      if (this.toggle) this.toggle.style.display = 'none';
      return;
    }

    const expanded = this.state[this.stateKey];
    const maxVisible = expanded
      ? filtered.length
      : Math.min(this.config.max, filtered.length);

    filtered.slice(0, maxVisible).forEach((event) => {
      this.container.appendChild(this.createCard(event, isMultiSource));
    });

    this.updateToggle(filtered.length, maxVisible);
  }

  renderControls(isMultiSource) {
    const actionsContainer =
      this.container?.parentElement?.querySelector('.alerts-actions');
    if (!actionsContainer) return;

    if (!this.elements.typeFilter) {
      const typeSelect = document.createElement('select');
      typeSelect.className = 'alerts-toggle';
      typeSelect.innerHTML =
        '<option value="all">All Events</option>' +
        Object.entries(this.schema)
          .map(
            ([type, def]) =>
              `<option value="${type}">${def.label || type}</option>`,
          )
          .join('');
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
      sourceSelect.innerHTML =
        '<option value="all">All Nodes</option>' +
        this.eventsUrls
          .map(({ source }) => `<option value="${source}">${source}</option>`)
          .join('');
      sourceSelect.value = this.filters.source;
      sourceSelect.addEventListener('change', () => {
        this.filters.source = sourceSelect.value;
        this.render();
      });
      this.elements.sourceFilter = sourceSelect;
      actionsContainer.insertBefore(
        sourceSelect,
        this.elements.typeFilter.nextSibling,
      );
    }

    if (!isMultiSource && this.elements.sourceFilter) {
      this.elements.sourceFilter.remove();
      this.elements.sourceFilter = null;
      this.filters.source = 'all';
    }
  }

  createCard(event, showBadge) {
    const def = this.schema[event.type] || {};
    const details = event.details || {};

    const formatTemplateValue = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'number' && this.helpers?.formatNumber) {
        return this.helpers.formatNumber(value);
      }
      return value;
    };

    const formatValue = (template, vars) => {
      // Regex matches {token} placeholders for template substitution.
      return template.replace(/\{(\w+)\}/g, (_, key) =>
        formatTemplateValue(vars[key]),
      );
    };

    let title = '';
    let detailText = '';
    let classes = def.classes || ['alert'];
    if (event.status && event.status !== 'detected') {
      if (Array.isArray(classes)) {
        if (!classes.includes(event.status)) {
          classes = [...classes, event.status];
        }
      } else if (typeof classes === 'string') {
        const tokens = classes.split(' ').filter(Boolean);
        if (!tokens.includes(event.status)) {
          tokens.push(event.status);
        }
        classes = tokens;
      }
    }

    if (event.type === 'outage') {
      const start = details.start ? new Date(details.start) : null;
      const end = details.end ? new Date(details.end) : null;
      const endLabel = details.open ? 'now' : this.helpers.formatDateTime(end);
      const intervalMs = this.config.expectedIntervalMs || 0;
      const durationMs =
        intervalMs > 0
          ? details.missedChecks * intervalMs
          : end && start
            ? end.getTime() - start.getTime()
            : 0;
      title = formatValue(def.titleTemplate || event.message, {
        missedChecks: details.missedChecks,
      });
      detailText = formatValue(def.detailTemplate || '', {
        start: this.helpers.formatDateTime(start),
        end: endLabel,
        duration: this.helpers.formatDuration(durationMs),
      });
      if (details.open) classes.push('open');
    } else if (event.type === 'ipchange') {
      title = def.titleTemplate || 'IP address changed';
      detailText = formatValue(def.detailTemplate || '', {
        oldIp: details.oldIp,
        newIp: details.newIp,
        timestamp: this.helpers.formatDateTime(new Date(event.timestamp)),
      });
    } else {
      const templateVars = {
        ...details,
        message: event.message,
        timestamp: this.helpers.formatDateTime(new Date(event.timestamp)),
        value: details.value ?? event.value,
        threshold: details.threshold ?? event.threshold,
      };
      title = formatValue(
        def.titleTemplate || event.message || event.type,
        templateVars,
      );
      detailText = formatValue(def.detailTemplate || '', templateVars);
    }

    const strong = document.createElement('strong');
    strong.textContent = title;
    const detail = document.createElement('span');
    detail.textContent = detailText;

    return createAlertCard({
      classes,
      badge: showBadge ? { text: event._source } : null,
      content: [strong, detail],
    });
  }

  updateToggle(totalCount, maxVisible) {
    if (!this.toggle) return;

    if (totalCount <= this.config.max) {
      this.toggle.style.display = 'none';
    } else {
      this.toggle.style.display = '';
      const expanded = this.state[this.stateKey];
      const remaining = totalCount - this.config.max;
      this.toggle.textContent = expanded
        ? 'Show fewer'
        : `Show ${remaining} more`;
    }
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.Alerts = { createCard: createAlertCard };
window.monitorShared.EventsList = EventsList;
