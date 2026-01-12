// NetworkOutages: Unified outage renderer
//
// Handles both single-source and multi-source (federation) cases.
// Single-source is the trivial case: one source, no badges.
// Multi-source interleaves alerts from all sources with source badges.

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
  }

  render() {
    const { config, elements, state, helpers } = this.widget;

    if (!config.alerts.show || !elements.alertList) {
      return;
    }

    const list = elements.alertList;
    list.innerHTML = '';
    const toggle = elements.alertToggle;

    const sources = this.resolveSources();
    const sourceStates = this.resolveSourceStates(sources);
    const isMultiSource = sources.length > 1;

    this.renderControls(sources, isMultiSource);

    const allAlerts = this.collectAlerts(sources, sourceStates);
    const filteredAlerts = this.applyFilters(allAlerts);

    if (!filteredAlerts.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = allAlerts.length
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

    let controlsContainer = actionsContainer.querySelector('.outages-controls');
    if (!controlsContainer) {
      controlsContainer = document.createElement('div');
      controlsContainer.className = 'outages-controls';
      actionsContainer.insertBefore(
        controlsContainer,
        actionsContainer.firstChild,
      );
    }

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
      controlsContainer.appendChild(typeSelect);
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
      controlsContainer.appendChild(sourceSelect);
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

  resolveSourceStates() {
    const { state } = this.widget;

    if (state.sourceStates) {
      return state.sourceStates;
    }

    return {
      local: {
        analysis: state.analysis,
        entries: state.entries,
        error: null,
      },
    };
  }

  collectAlerts(sources, sourceStates) {
    const { config } = this.widget;
    const threshold = config.alerts.cadenceChecks || 0;
    const allAlerts = [];

    for (const source of sources) {
      const sourceState = sourceStates[source];
      const analysis = sourceState?.analysis;
      if (!analysis?.alerts) continue;

      for (const alert of analysis.alerts) {
        if (alert.type === 'outage' && alert.missedChecks < threshold) {
          continue;
        }
        allAlerts.push({ ...alert, _source: source });
      }
    }

    allAlerts.sort((a, b) => {
      const aTime = this.getAlertTime(a);
      const bTime = this.getAlertTime(b);
      return bTime - aTime;
    });

    return allAlerts;
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
    const item = document.createElement('div');
    const badgeHtml = showBadge
      ? `<span class="source-badge">${alert._source}</span>`
      : '';
    const badgeClass = showBadge ? ' has-badge' : '';

    if (alert.type === 'ipchange') {
      item.className = `alert alert-card ipchange${badgeClass}`;
      item.innerHTML = `${badgeHtml}<strong>IP changed</strong> from ${alert.oldIp} to ${alert.newIp} at ${helpers.formatDateTime(alert.timestamp)}`;
    } else if (alert.type === 'failure') {
      item.className = `alert alert-card failure${badgeClass}`;
      item.innerHTML = `${badgeHtml}<strong>Connection failure</strong> at ${helpers.formatDateTime(alert.timestamp)} (${alert.message})`;
    } else {
      item.className = `alert alert-card${badgeClass}`;
      if (alert.open) item.classList.add('open');
      const endLabel = alert.open ? 'now' : helpers.formatDateTime(alert.end);
      const duration = helpers.formatDuration(
        alert.end.getTime() - alert.start.getTime(),
      );
      const countLabel = alert.missedChecks === 1 ? 'check' : 'checks';
      item.innerHTML = `${badgeHtml}<strong>${alert.missedChecks} ${countLabel} missed</strong> from ${helpers.formatDateTime(alert.start)} to ${endLabel} (${duration})`;
    }

    return item;
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
