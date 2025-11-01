const NET_EXPECTED_INTERVAL_MS = 5 * 60 * 1000;
const NET_TOLERANCE_MS = 90 * 1000;
const NET_MINUTE_MS = 60 * 1000;
const NET_HOUR_MS = 60 * NET_MINUTE_MS;
const NET_DAY_MS = 24 * NET_HOUR_MS;
const NET_MINUTES_PER_CHECK = NET_EXPECTED_INTERVAL_MS / 60000;

const NETWORK_WINDOWS = [
  { key: '1h', flag: 'hour', label: 'Past hour', type: 'interval', segmentMs: 5 * NET_MINUTE_MS, segmentCount: 12 },
  { key: '24h', flag: 'day', label: 'Past 24 hours', type: 'interval', segmentMs: NET_HOUR_MS, segmentCount: 24 },
  { key: '7d', flag: 'week', label: 'Past 7 days', type: 'interval', segmentMs: NET_DAY_MS, segmentCount: 7 },
  { key: 'month', flag: 'month', label: null, type: 'month' },
  { key: 'year', flag: 'year', label: null, type: 'year' }
];

class NetworkWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = mergeNetworkConfig(config);
    this.enabledWindows = deriveWindowKeys(this.config.uptime.windows);
    this.state = {
      entries: [],
      analysis: null,
      gapsExpanded: false
    };
    this.elements = {};
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };
    
    const response = await fetch('widgets/network/network.html');
    const html = await response.text();
    container.innerHTML = html;
    
    const title = container.querySelector('h2');
    if (this.config._suppressHeader && title) {
      title.remove();
    } else if (title && this.config.name !== null && this.config.name !== false) {
      if (this.config.name) {
        title.textContent = this.config.name;
      }
    } else if (title && (this.config.name === null || this.config.name === false)) {
      title.remove();
    }

    this.cacheElements();
    this.applySectionVisibility();
    this.attachEvents();
    await this.loadLog();
  }

  cacheElements() {
    this.elements = {
      logStatus: this.container.querySelector('[data-network="log-status"]'),
      uptimeRows: this.container.querySelector('[data-network="uptime-rows"]'),
      gapList: this.container.querySelector('[data-network="gap-list"]'),
      gapToggle: this.container.querySelector('[data-network="gaps-toggle"]'),
      sections: {
        metrics: this.container.querySelector('[data-network-section="metrics"]'),
        uptime: this.container.querySelector('[data-network-section="uptime"]'),
        gaps: this.container.querySelector('[data-network-section="gaps"]')
      },
      summary: {
        uptime: this.container.querySelector('[data-network="summary-uptime"]'),
        total: this.container.querySelector('[data-network="summary-total"]'),
        expected: this.container.querySelector('[data-network="summary-expected"]'),
        missed: this.container.querySelector('[data-network="summary-missed"]'),
        first: this.container.querySelector('[data-network="summary-first"]'),
        last: this.container.querySelector('[data-network="summary-last"]')
      }
    };
  }

  applySectionVisibility() {
    if (this.elements.sections.metrics && !this.config.metrics.show) {
      this.elements.sections.metrics.classList.add('hidden');
    }
    if (this.elements.sections.uptime && !this.config.uptime.show) {
      this.elements.sections.uptime.classList.add('hidden');
    }
    if (this.elements.sections.gaps && !this.config.gaps.show) {
      this.elements.sections.gaps.classList.add('hidden');
    }
  }

  attachEvents() {
    if (this.elements.gapToggle) {
      this.elements.gapToggle.addEventListener('click', () => {
        this.state.gapsExpanded = !this.state.gapsExpanded;
        this.renderGaps();
      });
    }
    
    if (this.elements.logStatus) {
      this.elements.logStatus.addEventListener('click', (e) => {
        e.preventDefault();
        this.downloadLog();
      });
    }
  }

  async loadLog() {
    setText(this.elements.logStatus, 'Loading log…');
    this.state.gapsExpanded = false;

    if (!this.config.log_file) {
      setText(this.elements.logStatus, 'No log file configured.');
      this.state.entries = [];
      this.state.analysis = analyzeEntries([], this.enabledWindows);
      this.updateSummary();
      this.renderUptime();
      this.renderGaps();
      return;
    }

    try {
      const logFilename = this.config.log_file.split('/').pop();
      const response = await fetch(`api/network/log?${Date.now()}`, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      this.state.entries = parseLog(text);
      this.state.analysis = analyzeEntries(this.state.entries, this.enabledWindows);
      this.updateSummary();
      this.renderUptime();
      this.renderGaps();

      if (this.state.entries.length) {
        setText(this.elements.logStatus, `Loaded ${this.state.entries.length.toLocaleString()} log entries.`);
      } else {
        setText(this.elements.logStatus, 'No log entries found.');
      }
    } catch (error) {
      setText(this.elements.logStatus, `Unable to load log: ${error.message}`);
      this.state.entries = [];
      this.state.analysis = analyzeEntries([], this.enabledWindows);
      this.updateSummary();
      this.renderUptime();
      this.renderGaps();
    }
  }

  downloadLog() {
    if (!this.config.log_file) {
      return;
    }
    const logFilename = this.config.log_file.split('/').pop();
    const link = document.createElement('a');
    link.href = `data/${logFilename}?${Date.now()}`;
    link.download = logFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  updateSummary() {
    if (!this.config.metrics.show || !this.elements.summary) {
      return;
    }
    const summary = this.elements.summary;
    const analysis = this.state.analysis;
    if (!analysis || !analysis.entries.length) {
      summary.uptime.textContent = '–';
      summary.total.textContent = '–';
      summary.expected.textContent = '–';
      summary.missed.textContent = '–';
      summary.first.textContent = '–';
      summary.last.textContent = '–';
      return;
    }

    summary.uptime.textContent = analysis.uptimeText;
    summary.total.textContent = formatNumber(analysis.entries.length);
    summary.expected.textContent = formatNumber(analysis.expectedChecks);
    summary.missed.textContent = formatNumber(analysis.missedChecks);
    summary.first.textContent = formatDateTime(analysis.firstEntry);
    summary.last.textContent = formatDateTime(analysis.lastEntry);
  }

  renderUptime() {
    if (!this.config.uptime.show || !this.elements.uptimeRows) {
      return;
    }

    const container = this.elements.uptimeRows;
    container.innerHTML = '';

    const analysis = this.state.analysis;
    const stats = analysis?.windowStats || [];
    if (!stats.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = 'No log data available yet.';
      container.appendChild(info);
      return;
    }

    stats.forEach((stat) => {
      const item = document.createElement('div');
      item.className = 'uptime-item';

      const row = document.createElement('div');
      row.className = 'uptime-row';

      const label = document.createElement('div');
      label.className = 'uptime-label';
      label.textContent = stat.label;

      const pills = document.createElement('div');
      pills.className = 'uptime-pills';
      const segmentCount = Math.max(1, stat.segments.length);
      pills.style.gridTemplateColumns = `repeat(${segmentCount}, minmax(0, 1fr))`;

      if (!stat.segments.length) {
        const blank = document.createElement('div');
        blank.className = 'muted';
        blank.textContent = 'No data';
        pills.appendChild(blank);
      } else {
        stat.segments.forEach((segment) => {
          const pill = document.createElement('div');
          pill.className = 'uptime-pill';

          if (segment.available === 0) {
            pill.classList.add('future');
          } else if (!segment.expected) {
            pill.classList.add('idle');
          } else if (segment.uptime >= 99) {
            pill.classList.add('ok');
          } else if (segment.uptime >= 95) {
            pill.classList.add('warn');
          } else {
            pill.classList.add('bad');
          }

          pill.title = buildSegmentTooltip(stat.label, segment);
          pills.appendChild(pill);
        });
      }

      const value = document.createElement('div');
      value.className = 'uptime-value';
      value.textContent = formatPercent(stat.uptime);

      row.append(label, pills, value);
      item.appendChild(row);

      const meta = document.createElement('div');
      meta.className = 'uptime-meta';

      if (!stat.expected) {
        const span = document.createElement('span');
        span.textContent = 'No data collected for this window yet.';
        meta.appendChild(span);
      } else {
        const counts = document.createElement('span');
        counts.textContent = `${formatNumber(stat.observed)} of ${formatNumber(stat.expected)} checks`;
        meta.appendChild(counts);

        const misses = document.createElement('span');
        if (stat.missed) {
          misses.textContent = `${formatNumber(stat.missed)} missed (${formatDuration(stat.missed * NET_EXPECTED_INTERVAL_MS)})`;
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

      item.appendChild(meta);
      container.appendChild(item);
    });
  }

  renderGaps() {
    if (!this.config.gaps.show || !this.elements.gapList) {
      return;
    }

    const list = this.elements.gapList;
    list.innerHTML = '';
    const toggle = this.elements.gapToggle;

    const analysis = this.state.analysis;
    if (!analysis || !analysis.entries.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = 'No log entries to inspect yet.';
      list.appendChild(info);
      if (toggle) toggle.style.display = 'none';
      return;
    }

    const filtered = analysis.gaps.filter((gap) => {
      if (gap.type !== 'outage') {
        return true;
      }
      const threshold = this.config.gaps.cadenceChecks || 0;
      return gap.missedChecks >= threshold;
    });

    if (!filtered.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = 'No missed 5-minute intervals detected.';
      list.appendChild(info);
      if (toggle) toggle.style.display = 'none';
      return;
    }

    const reversed = [...filtered].reverse();
    const maxVisible = this.state.gapsExpanded ? reversed.length : Math.min(this.config.gaps.maxVisible || 3, reversed.length);
    reversed.slice(0, maxVisible).forEach((gap) => {
      const item = document.createElement('div');
      if (gap.type === 'ipchange') {
        item.className = 'gap ipchange';
        item.innerHTML = `<strong>IP address changed</strong> from ${gap.oldIp} to ${gap.newIp} at ${formatDateTime(gap.timestamp)}`;
      } else {
        item.className = 'gap';
        if (gap.open) {
          item.classList.add('open');
        }
        const endLabel = gap.open ? 'now' : formatDateTime(gap.end);
        const duration = formatDuration(gap.end.getTime() - gap.start.getTime());
        const countLabel = gap.missedChecks === 1 ? 'check' : 'checks';
        item.innerHTML = `<strong>${gap.missedChecks} ${countLabel} missed</strong> from ${formatDateTime(gap.start)} to ${endLabel} (${duration})`;
      }
      list.appendChild(item);
    });

    if (toggle) {
      const maxVisible = this.config.gaps.maxVisible || 3;
      if (filtered.length <= maxVisible) {
        toggle.style.display = 'none';
      } else {
        toggle.style.display = '';
        const remaining = filtered.length - maxVisible;
        toggle.textContent = this.state.gapsExpanded ? 'Show less' : `Show ${remaining} more`;
      }
    }
  }
}

function mergeNetworkConfig(config) {
  const cfg = config || {};
  const metrics = { show: cfg.metrics?.show !== false };
  
  const maxRaw = Number(cfg.gaps?.max);
  const cadenceRaw = Number(cfg.gaps?.cadence);
  
  const maxVisible = Number.isFinite(maxRaw) ? Math.max(1, maxRaw) : 3;
  const cadenceMinutes = Number.isFinite(cadenceRaw) ? Math.max(0, cadenceRaw) : 0;
  const cadenceChecks = Math.max(0, Math.ceil(cadenceMinutes / NET_MINUTES_PER_CHECK));
  
  const gaps = {
    show: cfg.gaps?.show !== false,
    maxVisible,
    cadenceMinutes,
    cadenceChecks
  };
  const uptime = {
    show: cfg.uptime?.show !== false,
    windows: cfg.uptime || {}
  };
  return { metrics, gaps, uptime };
}

function deriveWindowKeys(windowFlags = {}) {
  const enabled = NETWORK_WINDOWS
    .filter((definition) => windowFlags[definition.flag] !== false)
    .map((definition) => definition.key);
  return enabled.length ? enabled : NETWORK_WINDOWS.map((definition) => definition.key);
}

function parseLog(text) {
  const entries = [];
  const lines = text.split(/\r?\n/);
  const pattern = /^([A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} (?:AM|PM) [A-Z]{3} \d{4}): Current IP is (.+)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;
    const timestamp = parseTimestamp(match[1]);
    if (!timestamp) continue;
    entries.push({ timestamp, ip: match[2].trim(), raw: match[1] });
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

function parseTimestamp(label) {
  const normalized = label.replace(/\s+/g, ' ');
  const parts = normalized.split(' ');
  if (parts.length < 7) return null;

  const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const monthIndex = MONTHS[parts[1]];
  if (monthIndex === undefined) return null;

  const day = parseInt(parts[2], 10);
  const timeParts = parts[3].split(':').map((value) => parseInt(value, 10));
  if (timeParts.some(Number.isNaN)) return null;

  let [hour, minute, second] = timeParts;
  const ampm = parts[4];
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const year = parseInt(parts[6], 10);
  if (Number.isNaN(year) || Number.isNaN(day)) return null;

  const date = new Date(year, monthIndex, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

function analyzeEntries(entries, enabledWindows) {
  if (!entries.length) {
    const now = new Date();
    return {
      entries: [],
      gaps: [],
      missedChecks: 0,
      expectedChecks: 0,
      uptimeValue: null,
      uptimeText: '–',
      firstEntry: null,
      lastEntry: null,
      windowStats: computeWindowStats([], [], now, enabledWindows)
    };
  }

  const gaps = [];
  let missed = 0;
  const slotNumbers = buildSlotNumbers(entries);

  for (let index = 0; index < entries.length - 1; index += 1) {
    const current = entries[index];
    const next = entries[index + 1];
    const diff = next.timestamp - current.timestamp;
    const missing = Math.floor((diff - NET_TOLERANCE_MS) / NET_EXPECTED_INTERVAL_MS);
    if (missing > 0) {
      missed += missing;
      gaps.push({
        type: 'outage',
        start: new Date(current.timestamp.getTime() + NET_EXPECTED_INTERVAL_MS),
        end: new Date(next.timestamp.getTime()),
        missedChecks: missing,
        open: false
      });
    }
    if (current.ip !== next.ip) {
      gaps.push({
        type: 'ipchange',
        timestamp: next.timestamp,
        oldIp: current.ip,
        newIp: next.ip
      });
    }
  }

  const lastEntry = entries[entries.length - 1];
  const now = new Date();
  const tailMissing = Math.floor((now.getTime() - lastEntry.timestamp.getTime() - NET_TOLERANCE_MS) / NET_EXPECTED_INTERVAL_MS);
  if (tailMissing > 0) {
    missed += tailMissing;
    gaps.push({
      type: 'outage',
      start: new Date(lastEntry.timestamp.getTime() + NET_EXPECTED_INTERVAL_MS),
      end: now,
      missedChecks: tailMissing,
      open: true
    });
  }

  gaps.sort((a, b) => {
    const aTime = a.type === 'ipchange' ? a.timestamp : a.start;
    const bTime = b.type === 'ipchange' ? b.timestamp : b.start;
    return aTime - bTime;
  });

  const expectedChecks = entries.length + missed;
  const uptimeValue = expectedChecks ? (entries.length / expectedChecks) * 100 : 100;
  const uptimeText = expectedChecks ? `${uptimeValue.toFixed(2)}%` : '100%';
  const windowStats = computeWindowStats(entries, slotNumbers, now, enabledWindows);

  return {
    entries,
    gaps,
    missedChecks: missed,
    expectedChecks,
    uptimeValue,
    uptimeText,
    firstEntry: entries[0].timestamp,
    lastEntry: lastEntry.timestamp,
    windowStats
  };
}

function buildSlotNumbers(entries) {
  const slots = [];
  let previous = null;
  entries.forEach((entry) => {
    const slot = Math.round(entry.timestamp.getTime() / NET_EXPECTED_INTERVAL_MS);
    if (slot !== previous) {
      slots.push(slot);
      previous = slot;
    }
  });
  return slots;
}

function computeWindowStats(entries, slotNumbers, now, enabledWindows) {
  const definitions = buildOverviewDefinitions(now, enabledWindows);
  if (!entries.length) {
    return definitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      segments: definition.segments.map((segment) => ({
        ...segment,
        available: 0,
        expected: 0,
        observed: 0,
        missed: 0,
        uptime: null,
        coverage: 0,
        start: new Date(segment.startMs),
        end: new Date(segment.endMs)
      })),
      observed: 0,
      expected: 0,
      missed: 0,
      uptime: null,
      coverage: 0
    }));
  }

  const nowMs = now.getTime();
  const nowSlot = Math.floor(nowMs / NET_EXPECTED_INTERVAL_MS);
  const firstSlot = Math.floor(entries[0].timestamp.getTime() / NET_EXPECTED_INTERVAL_MS);

  return definitions.map((definition) => {
    const segments = definition.segments.map((segment) => analyzeSegment(segment, slotNumbers, firstSlot, nowSlot));
    const observed = segments.reduce((sum, item) => sum + item.observed, 0);
    const expected = segments.reduce((sum, item) => sum + item.expected, 0);
    const available = segments.reduce((sum, item) => sum + item.available, 0);
    const missed = Math.max(0, expected - observed);
    const uptime = expected > 0 ? (observed / expected) * 100 : null;
    const coverage = available > 0 ? expected / available : 0;

    return {
      key: definition.key,
      label: definition.label,
      segments,
      observed,
      expected,
      missed,
      uptime,
      coverage
    };
  });
}

function buildOverviewDefinitions(now, enabledWindows) {
  const windowSet = new Set(enabledWindows);
  const nowMs = now.getTime();
  return NETWORK_WINDOWS
    .filter((entry) => windowSet.has(entry.key))
    .map((window) => {
      if (window.type === 'interval') {
        const segments = buildIntervalSegments(window, nowMs);
        return { key: window.key, label: window.label, segments };
      }
      if (window.type === 'month') {
        const segments = buildMonthSegments(now);
        const label = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
        return { key: window.key, label, segments };
      }
      if (window.type === 'year') {
        const segments = buildYearSegments(now);
        const label = `${now.getFullYear()}`;
        return { key: window.key, label, segments };
      }
      return { key: window.key, label: window.label || '', segments: [] };
    });
}

function buildIntervalSegments(window, nowMs) {
  const segmentMs = window.segmentMs;
  const segmentCount = window.segmentCount;
  const segmentSlots = Math.max(1, Math.round(segmentMs / NET_EXPECTED_INTERVAL_MS));
  const endSlot = Math.floor(nowMs / NET_EXPECTED_INTERVAL_MS);
  const firstStartSlot = endSlot - (segmentCount * segmentSlots) + 1;
  const segments = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const startSlot = firstStartSlot + index * segmentSlots;
    const endSlotForSegment = startSlot + segmentSlots - 1;
    const startMs = startSlot * NET_EXPECTED_INTERVAL_MS;
    const endMs = (endSlotForSegment + 1) * NET_EXPECTED_INTERVAL_MS;
    segments.push({
      key: `${window.key}-${index}`,
      label: formatIntervalSegmentLabel(window.key, startMs, endMs),
      startSlot,
      endSlot: endSlotForSegment,
      startMs,
      endMs
    });
  }

  return segments;
}

function buildMonthSegments(now) {
  const segments = [];
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const start = new Date(year, month, day);
    const end = new Date(year, month, day + 1);
    segments.push({
      key: `month-${day}`,
      label: start.toLocaleDateString(undefined, { day: 'numeric' }),
      startSlot: Math.floor(start.getTime() / NET_EXPECTED_INTERVAL_MS),
      endSlot: Math.floor((end.getTime() - 1) / NET_EXPECTED_INTERVAL_MS),
      startMs: start.getTime(),
      endMs: end.getTime()
    });
  }
  return segments;
}

function buildYearSegments(now) {
  const segments = [];
  const year = now.getFullYear();
  for (let month = 0; month < 12; month += 1) {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    segments.push({
      key: `year-${month}`,
      label: start.toLocaleString(undefined, { month: 'short' }),
      startSlot: Math.floor(start.getTime() / NET_EXPECTED_INTERVAL_MS),
      endSlot: Math.floor((end.getTime() - 1) / NET_EXPECTED_INTERVAL_MS),
      startMs: start.getTime(),
      endMs: end.getTime()
    });
  }
  return segments;
}

function analyzeSegment(segment, slotNumbers, firstSlot, nowSlot) {
  const startSlot = segment.startSlot;
  const endSlot = segment.endSlot;
  const startMs = segment.startMs;
  const endMs = segment.endMs;

  const clampedEndSlot = Math.min(endSlot, nowSlot);
  const isFuture = startSlot > nowSlot;
  const available = isFuture ? 0 : Math.max(0, clampedEndSlot - startSlot + 1);
  const effectiveStart = Math.max(startSlot, firstSlot);
  const expected = (!isFuture && clampedEndSlot >= effectiveStart) ? (clampedEndSlot - effectiveStart + 1) : 0;
  const observed = expected > 0 ? countSlotsInRange(slotNumbers, effectiveStart, clampedEndSlot) : 0;
  const missed = Math.max(0, expected - observed);
  const uptime = expected > 0 ? (observed / expected) * 100 : null;
  const coverage = available > 0 ? expected / available : 0;
  const endMsClamped = Math.min(endMs, (clampedEndSlot + 1) * NET_EXPECTED_INTERVAL_MS);

  return {
    ...segment,
    available,
    expected,
    observed,
    missed,
    uptime,
    coverage,
    start: new Date(Math.max(startMs, 0)),
    end: new Date(Math.max(endMsClamped, Math.max(startMs, 0)))
  };
}

function countSlotsInRange(slots, startSlot, endSlot) {
  if (startSlot > endSlot) {
    return 0;
  }
  const startIndex = lowerBound(slots, startSlot);
  const endIndex = upperBound(slots, endSlot);
  return Math.max(0, endIndex - startIndex);
}

function lowerBound(array, value) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (array[mid] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function upperBound(array, value) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (array[mid] <= value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function formatIntervalSegmentLabel(windowKey, startMs, endMs) {
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);
  if (windowKey === '1h') {
    return endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (windowKey === '24h') {
    return startDate.toLocaleTimeString(undefined, { hour: 'numeric' });
  }
  if (windowKey === '7d') {
    return startDate.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–';
  }
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped >= 99.995) {
    return '100%';
  }
  if (clamped >= 10) {
    return `${clamped.toFixed(2)}%`;
  }
  return `${clamped.toFixed(2)}%`;
}

function buildSegmentTooltip(windowLabel, segment) {
  const lines = [];
  if (segment.label) {
    lines.push(`${windowLabel} • ${segment.label}`);
  } else {
    lines.push(windowLabel);
  }
  lines.push(`${formatDateTime(segment.start)} → ${formatDateTime(segment.end)}`);
  if (!segment.expected) {
    if (segment.available === 0) {
      lines.push('Period has not started yet.');
    } else {
      lines.push('No log data for this period.');
    }
  } else {
    lines.push(`${formatNumber(segment.observed)} / ${formatNumber(segment.expected)} checks (${formatPercent(segment.uptime)})`);
    if (segment.missed) {
      lines.push(`${segment.missed} missed (~${formatDuration(segment.missed * NET_EXPECTED_INTERVAL_MS)})`);
    } else {
      lines.push('No missed checks.');
    }
    if (segment.coverage < 0.98) {
      lines.push(`${Math.round(segment.coverage * 100)}% coverage (partial log range)`);
    }
  }
  return lines.join(String.fromCharCode(10));
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function formatDuration(ms) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.round(safeMs / 60000);
  if (minutes < 1) {
    return '<1 min';
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
  }
  if (remaining > 0) {
    parts.push(`${remaining} min`);
  }
  return parts.join(' ');
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return '–';
  }
  return Number(value).toLocaleString();
}

window.widgets = window.widgets || {};
window.widgets.network = NetworkWidget;
