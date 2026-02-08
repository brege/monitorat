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
    const stats = state.uptime?.windowStats || [];
    if (!stats.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = 'No update data available yet.';
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
      this.applySegmentClasses(pill, segment);
      pill.title = this.buildSegmentTooltip(
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
    counts.textContent = `${this.widget.helpers.formatNumber(stat.observed)} of ${this.widget.helpers.formatNumber(stat.expected)} observed`;
    meta.appendChild(counts);

    const misses = document.createElement('span');
    misses.textContent = `${this.widget.helpers.formatNumber(stat.missed)} unknown (${this.widget.helpers.formatDuration(stat.missed * this.widget.expectedIntervalMs)})`;
    meta.appendChild(misses);

    const failures = document.createElement('span');
    failures.textContent = `${this.widget.helpers.formatNumber(stat.failed)} failed`;
    meta.appendChild(failures);
  }

  applySegmentClasses(element, segment) {
    const gradientConfig = this.widget.schema?.uptime?.gradient;

    element.classList.remove(
      'ok',
      'warn',
      'bad',
      'idle',
      'future',
      'unknown',
      'gradient',
      'meter',
    );
    element.style.removeProperty('--pip-ok-end');
    element.style.removeProperty('--pip-unknown-end');

    if (segment.available === 0) {
      element.classList.add('future');
      return;
    }
    if (!segment.expected) {
      element.classList.add('idle');
      return;
    }
    if (segment.status === 'systemDown') {
      element.classList.add('unknown');
      return;
    }

    if (gradientConfig && segment.expected > 0) {
      const rawUnknownRatio = this.clampRatio(
        segment.missed / segment.expected,
      );
      const rawFailedRatio = this.clampRatio(
        (segment.failed || 0) / segment.expected,
      );
      const { unknownRatio, failedRatio } = this.applyMeterVisualFloor(
        rawUnknownRatio,
        rawFailedRatio,
        segment.uptime,
      );
      const unknownEnd = this.clampRatio(1 - failedRatio);
      const okEnd = this.clampRatio(unknownEnd - unknownRatio);

      if (okEnd <= 0) {
        if (failedRatio > 0) {
          element.classList.add('bad');
        } else {
          element.classList.add('unknown');
        }
        return;
      }

      if (failedRatio <= 0 && unknownRatio <= 0) {
        element.classList.add('ok');
        return;
      }

      element.classList.add('meter');
      element.style.setProperty('--pip-ok-end', `${(okEnd * 100).toFixed(3)}%`);
      element.style.setProperty(
        '--pip-unknown-end',
        `${(unknownEnd * 100).toFixed(3)}%`,
      );
    } else if (segment.status === 'connectionFailure') {
      element.classList.add('bad');
    } else {
      element.classList.add('ok');
    }
  }

  clampRatio(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  applyMeterVisualFloor(unknownRatio, failedRatio, uptime) {
    const nonOk = this.clampRatio(unknownRatio + failedRatio);
    if (nonOk <= 0) {
      return { unknownRatio: 0, failedRatio: 0 };
    }

    if (uptime === null || uptime === undefined || uptime < 90) {
      return { unknownRatio, failedRatio };
    }

    const minimumNonOkWidth = 0.08;
    if (nonOk >= minimumNonOkWidth) {
      return { unknownRatio, failedRatio };
    }

    const scale = minimumNonOkWidth / nonOk;
    return {
      unknownRatio: this.clampRatio(unknownRatio * scale),
      failedRatio: this.clampRatio(failedRatio * scale),
    };
  }

  buildSegmentTooltip(windowLabel, segment, expectedIntervalMs) {
    const { formatDateTime, formatDuration, formatNumber, formatPercent } =
      this.widget.helpers;
    const lines = [];

    if (segment.label) {
      lines.push(`${windowLabel} • ${segment.label}`);
    } else {
      lines.push(windowLabel);
    }
    lines.push(
      `${formatDateTime(segment.start)} → ${formatDateTime(segment.end)}`,
    );

    if (!segment.expected) {
      if (segment.available === 0) {
        lines.push('Period has not started yet.');
      } else {
        lines.push('No data for this period.');
      }
    } else {
      lines.push(
        `${formatNumber(segment.observed)} / ${formatNumber(segment.expected)} observed (${formatPercent(segment.uptime)})`,
      );
      if (segment.missed) {
        lines.push(
          `${segment.missed} unknown (~${formatDuration(segment.missed * expectedIntervalMs)})`,
        );
      } else {
        lines.push('0 unknown.');
      }
    }

    return lines.join('\n');
  }
}

window.NetworkUptime = NetworkUptime;
