class NetworkUptime {
  constructor(widget) {
    this.widget = widget;
  }

  render() {
    const { config, elements, state } = this.widget;
    if (!config.uptime.show || !elements.uptimeRows) {
      return;
    }

    const container = elements.uptimeRows;
    const analysis = state.analysis;
    const stats = analysis?.windowStats || [];
    if (!stats.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = 'No log data available yet.';
      container.replaceChildren(info);
      this.widget.uptimeCache.rows.clear();
      return;
    }

    const fragment = document.createDocumentFragment();
    const seenKeys = new Set();

    stats.forEach((stat) => {
      const entry = this.ensureUptimeRow(stat.key);
      this.updateUptimeRow(entry, stat);
      fragment.appendChild(entry.root);
      seenKeys.add(stat.key);
    });

    container.replaceChildren(fragment);

    for (const key of Array.from(this.widget.uptimeCache.rows.keys())) {
      if (!seenKeys.has(key)) {
        this.widget.uptimeCache.rows.delete(key);
      }
    }
  }

  ensureUptimeRow(key) {
    if (!this.widget.uptimeCache.rows.has(key)) {
      const item = document.createElement('div');
      item.className = 'uptime-item';

      const row = document.createElement('div');
      row.className = 'uptime-row';

      const label = document.createElement('div');
      label.className = 'uptime-label';

      const pills = document.createElement('div');
      pills.className = 'uptime-pills';

      const value = document.createElement('div');
      value.className = 'uptime-value';

      row.append(label, pills, value);

      const meta = document.createElement('div');
      meta.className = 'uptime-meta';

      item.append(row, meta);

      this.widget.uptimeCache.rows.set(key, {
        root: item,
        label,
        pills,
        value,
        meta,
        segments: new Map(),
        emptyNode: null,
      });
    }
    return this.widget.uptimeCache.rows.get(key);
  }

  updateUptimeRow(entry, stat) {
    entry.label.textContent = stat.label;
    entry.value.textContent = this.widget.helpers.formatPercent(stat.uptime);
    this.updateUptimePills(entry, stat);
    this.updateUptimeMeta(entry, stat);
  }

  updateUptimePills(entry, stat) {
    const pills = entry.pills;
    const segmentMap = entry.segments;
    const seenSegments = new Set();

    if (!stat.segments.length) {
      if (!entry.emptyNode) {
        const blank = document.createElement('div');
        blank.className = 'muted';
        blank.textContent = 'No data';
        entry.emptyNode = blank;
      }
      segmentMap.clear();
      pills.replaceChildren(entry.emptyNode);
      pills.style.gridTemplateColumns = '';
      return;
    }

    if (entry.emptyNode && entry.emptyNode.parentNode === pills) {
      pills.removeChild(entry.emptyNode);
    }
    entry.emptyNode = null;

    const fragment = document.createDocumentFragment();
    pills.style.gridTemplateColumns = `repeat(${Math.max(1, stat.segments.length)}, minmax(0, 1fr))`;

    stat.segments.forEach((segment) => {
      let pill = segmentMap.get(segment.key);
      if (!pill) {
        pill = document.createElement('div');
        segmentMap.set(segment.key, pill);
      }
      pill.className = 'uptime-pill';
      this.widget.helpers.applySegmentClasses(pill, segment);
      pill.title = this.widget.helpers.buildSegmentTooltip(
        stat.label,
        segment,
        this.widget.expectedIntervalMs,
      );
      fragment.appendChild(pill);
      seenSegments.add(segment.key);
    });

    pills.replaceChildren(fragment);

    for (const key of Array.from(segmentMap.keys())) {
      if (!seenSegments.has(key)) {
        segmentMap.delete(key);
      }
    }
  }

  updateUptimeMeta(entry, stat) {
    const meta = entry.meta;
    meta.replaceChildren();

    if (!stat.expected) {
      const span = document.createElement('span');
      span.textContent = 'No data collected for this window yet.';
      meta.appendChild(span);
      return;
    }

    const counts = document.createElement('span');
    counts.textContent = `${this.widget.helpers.formatNumber(stat.observed)} of ${this.widget.helpers.formatNumber(stat.expected)} checks`;
    meta.appendChild(counts);

    const misses = document.createElement('span');
    if (stat.missed) {
      misses.textContent = `${this.widget.helpers.formatNumber(stat.missed)} missed (${this.widget.helpers.formatDuration(stat.missed * this.widget.expectedIntervalMs)})`;
    } else {
      misses.textContent = 'No missed checks';
    }
    meta.appendChild(misses);

    if (stat.coverage < 0.98) {
      const coverage = document.createElement('span');
      coverage.textContent = `${Math.round(stat.coverage * 100)}% coverage`;
      meta.appendChild(coverage);
    }
  }
}

window.NetworkUptime = NetworkUptime;
