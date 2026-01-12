const NET_TOLERANCE_MS = 90 * 1000;
const NET_MINUTE_MS = 60 * 1000;
const NET_HOUR_MS = 60 * NET_MINUTE_MS;
const NET_DAY_MS = 24 * NET_HOUR_MS;
const MONTH_INDEX = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function parseNaturalTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const normalized = timeStr.trim().toLowerCase();
  const timePattern = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/;
  const match = normalized.match(timePattern);

  if (!match) return null;

  const [, amountStr, unit] = match;
  const amount = parseFloat(amountStr);

  if (Number.isNaN(amount) || amount <= 0) return null;

  const multipliers = {
    s: 1000,
    sec: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000,
  };

  const multiplier = multipliers[unit];
  if (!multiplier) return null;

  return Math.round(amount * multiplier);
}

class NetworkWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = mergeNetworkConfig(config);
    this.periodsConfig = this.config.uptime?.periods || [];
    const intervalSeconds = this.config.chirper.interval_seconds;
    this.expectedIntervalMs = intervalSeconds * 1000;
    this.minutesPerCheck = this.expectedIntervalMs / 60000;
    this.state = {
      entries: [],
      analysis: null,
      alertsExpanded: false,
      logFingerprint: null,
      sources: null,
      sourceStates: null,
    };
    this.elements = {};
    this.features = {
      snapshot: null,
      uptime: null,
      outages: null,
    };
    this.uptimeCache = {
      rows: new Map(),
    };
    this.helpers = {
      formatDateTime,
      formatDuration,
      formatNumber,
      formatPercent,
      applySegmentClasses,
      buildSegmentTooltip,
    };
  }

  getApiBase() {
    return this.config._apiPrefix
      ? `api/${this.config._apiPrefix}`
      : 'api/network';
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };

    const response = await fetch('widgets/network/index.html');
    const html = await response.text();
    container.innerHTML = html;

    const applyWidgetHeader = window.monitor?.applyWidgetHeader;
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
      });
    }

    await this.loadFeatureScripts();
    this.initializeFeatureHeaders();
    this.cacheElements();
    this.initializeFeatures();
    this.applySectionVisibility();
    this.attachEvents();
    await this.loadLog();
  }

  initializeFeatureHeaders() {
    const features = this.config.features || {};
    for (const [featureId, featureConfig] of Object.entries(features)) {
      if (featureConfig.header !== null && featureConfig.header !== undefined) {
        const headerEl = this.container.querySelector(
          `[data-network-section-header="${featureId}"]`,
        );
        if (headerEl) {
          headerEl.textContent = featureConfig.header;
        }
      }
    }
  }

  cacheElements() {
    this.elements = {
      logStatus: this.container.querySelector('[data-network="log-status"]'),
      uptimeRows: this.container.querySelector('[data-network="uptime-rows"]'),
      alertList: this.container.querySelector('[data-network="alerts-list"]'),
      alertToggle: this.container.querySelector(
        '[data-network="alerts-toggle"]',
      ),
      sectionHeaders: {
        metrics: this.container.querySelector(
          '[data-network-section-header="metrics"]',
        ),
        uptime: this.container.querySelector(
          '[data-network-section-header="uptime"]',
        ),
        alerts: this.container.querySelector(
          '[data-network-section-header="alerts"]',
        ),
      },
      sections: {
        metrics: this.container.querySelector(
          '[data-network-section="metrics"]',
        ),
        uptime: this.container.querySelector('[data-network-section="uptime"]'),
        alerts: this.container.querySelector('[data-network-section="alerts"]'),
      },
      summaryTiles: this.container.querySelector(
        '[data-network="summary-tiles"]',
      ),
    };
  }

  applySectionVisibility() {
    const FeatureVisibility = window.monitorShared.FeatureVisibility;

    const showConfig = {
      tiles: this.config.show?.tiles !== false && this.config.metrics.show,
      uptime: this.config.show?.uptime !== false && this.config.uptime.show,
      outages: this.config.show?.outages !== false && this.config.alerts.show,
    };

    FeatureVisibility.apply(this.container, showConfig, {
      tiles: this.elements.sections.metrics,
      uptime: this.elements.sections.uptime,
      outages: this.elements.sections.alerts,
    });

    const visibleSections = Object.entries(showConfig).filter(
      ([, visible]) => visible,
    );
    const onlySection =
      visibleSections.length === 1 ? visibleSections[0][0] : null;

    Object.entries(this.elements.sectionHeaders).forEach(([key, header]) => {
      if (!header) return;
      const shouldHide = onlySection === key;
      header.classList.toggle('hidden', shouldHide);
    });
  }

  attachEvents() {
    if (this.elements.alertToggle) {
      this.elements.alertToggle.addEventListener('click', () => {
        this.state.alertsExpanded = !this.state.alertsExpanded;
        this.features.outages.render();
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
    const federationNodes = this.config.federation?.nodes;
    if (federationNodes && Array.isArray(federationNodes)) {
      await this.loadMergedLogs(federationNodes);
    } else {
      await this.loadSingleLog();
    }
  }

  async loadSingleLog() {
    setText(this.elements.logStatus, 'Loading log…');

    if (!this.config.log_file) {
      this.state.alertsExpanded = false;
      setText(this.elements.logStatus, 'No log file configured.');
      this.state.entries = [];
      this.state.analysis = analyzeEntries(
        [],
        this.periodsConfig,
        this.expectedIntervalMs,
        this.resolveNowOverride(),
      );
      this.state.logFingerprint = null;
      this.renderAll();
      return;
    }

    try {
      const response = await fetch(`${this.getApiBase()}/log?${Date.now()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      const fingerprint = computeLogFingerprint(text);

      if (fingerprint === this.state.logFingerprint) {
        const label = this.state.entries.length
          ? `${this.state.entries.length.toLocaleString()} log entries (no changes).`
          : 'No log entries found yet.';
        setText(this.elements.logStatus, label);
        return;
      }

      this.state.logFingerprint = fingerprint;
      this.state.entries = parseLog(text);
      this.state.analysis = analyzeEntries(
        this.state.entries,
        this.periodsConfig,
        this.expectedIntervalMs,
        this.resolveNowOverride(),
      );
      this.state.alertsExpanded = false;
      this.renderAll();

      if (this.state.entries.length) {
        setText(
          this.elements.logStatus,
          `Loaded ${this.state.entries.length.toLocaleString()} log entries.`,
        );
      } else {
        setText(this.elements.logStatus, 'No log entries found.');
      }
    } catch (error) {
      console.error('Network log API call failed:', error);
      setText(this.elements.logStatus, `Unable to load log: ${error.message}`);
      this.state.alertsExpanded = false;
      this.state.entries = [];
      this.state.analysis = analyzeEntries(
        [],
        this.periodsConfig,
        this.expectedIntervalMs,
        this.resolveNowOverride(),
      );
      this.state.logFingerprint = null;
      this.renderAll();
    }
  }

  async loadMergedLogs(sources) {
    setText(this.elements.logStatus, 'Loading logs…');

    this.state.sources = sources;
    this.state.sourceStates = {};

    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(
            `api/network-${source}/log?${Date.now()}`,
            { cache: 'no-store' },
          );
          if (!response.ok) {
            console.warn(
              `Failed to fetch network log from ${source}: HTTP ${response.status}`,
            );
            return {
              source,
              entries: [],
              analysis: null,
              error: `HTTP ${response.status}`,
            };
          }
          const text = await response.text();
          const entries = parseLog(text);
          const isDemoEnabled = window.monitor?.demoEnabled === true;
          let nowOverride = null;
          if (isDemoEnabled && entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            nowOverride = new Date(
              lastEntry.timestamp.getTime() + NET_MINUTE_MS,
            );
          }
          const analysis = analyzeEntries(
            entries,
            this.periodsConfig,
            this.expectedIntervalMs,
            nowOverride,
          );
          return { source, entries, analysis, error: null };
        } catch (error) {
          console.warn(
            `Failed to fetch network log from ${source}:`,
            error.message,
          );
          return { source, entries: [], analysis: null, error: error.message };
        }
      }),
    );

    let totalEntries = 0;
    for (const result of results) {
      this.state.sourceStates[result.source] = {
        entries: result.entries,
        analysis: result.analysis,
        error: result.error,
      };
      totalEntries += result.entries.length;
    }

    this.state.alertsExpanded = false;
    this.renderAll();

    if (totalEntries) {
      setText(
        this.elements.logStatus,
        `Loaded ${totalEntries.toLocaleString()} log entries from ${sources.length} sources.`,
      );
    } else {
      setText(this.elements.logStatus, 'No log entries found.');
    }
  }

  downloadLog() {
    if (!this.config.log_file) {
      return;
    }
    const logFilename = this.config.log_file.split('/').pop();
    const link = document.createElement('a');
    link.href = `${this.getApiBase()}/log?${Date.now()}`;
    link.download = logFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async loadFeatureScripts() {
    const featureScripts = [
      {
        globalName: 'NetworkSnapshot',
        source: 'widgets/network/features/snapshot.js',
      },
      {
        globalName: 'NetworkUptime',
        source: 'widgets/network/features/uptime.js',
      },
      {
        globalName: 'NetworkOutages',
        source: 'widgets/network/features/outages.js',
      },
    ];

    await window.monitorShared.loadFeatureScripts(featureScripts);
  }

  initializeFeatures() {
    const SnapshotFeature = window.NetworkSnapshot;
    const UptimeFeature = window.NetworkUptime;
    const OutagesFeature = window.NetworkOutages;

    if (!SnapshotFeature || !UptimeFeature || !OutagesFeature) {
      throw new Error('Network feature scripts not loaded');
    }

    this.features.snapshot = new SnapshotFeature(this);
    this.features.uptime = new UptimeFeature(this);
    this.features.outages = new OutagesFeature(this);
  }

  renderAll() {
    this.features.snapshot.render();
    this.features.uptime.render();
    this.features.outages.render();
  }

  resolveNowOverride(entries = null) {
    const isDemoEnabled = window.monitor?.demoEnabled === true;
    const sourceEntries = entries || this.state.entries;
    if (!isDemoEnabled || !sourceEntries?.length) {
      return null;
    }
    const lastEntry = sourceEntries[sourceEntries.length - 1];
    return new Date(lastEntry.timestamp.getTime() + NET_MINUTE_MS);
  }
}

function mergeNetworkConfig(config) {
  const cfg = config || {};
  const intervalSeconds = cfg.chirper?.interval_seconds;
  const minutesPerCheck = (intervalSeconds * 1000) / 60000;
  const cadenceRaw = Number(cfg.alerts?.cadence);
  const cadenceMinutes = Number.isFinite(cadenceRaw)
    ? Math.max(0, cadenceRaw)
    : 0;
  const cadenceChecks = Math.max(
    0,
    Math.ceil(cadenceMinutes / minutesPerCheck),
  );

  return {
    ...cfg,
    alerts: {
      ...cfg.alerts,
      cadenceChecks,
    },
  };
}

function parseLog(text) {
  const entries = [];
  const lines = text.split(/\r?\n/);
  // ddclient-style log: "Mon  1 12:34:56 hostname ddclient[123]: INFO: detected IPv4 address 1.2.3.4"
  const detectedPattern =
    /^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+[^\s]+\s+[^\s]+(?:\[\d+\])?:\s+[A-Z]+:\s+(?:\[[^\]]+\]>\s+)?detected IPv4 address\s+([0-9.]+)/i;
  const failedPattern =
    /^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+[^\s]+\s+[^\s]+(?:\[\d+\])?:\s+FAILED:\s+(.*)$/i;
  let lastIp = null;

  for (const line of lines) {
    if (line.includes('detected IPv4 address')) {
      const match = line.match(detectedPattern);
      if (!match) continue;
      const timestamp = parseTimestamp(match[1]);
      if (!timestamp) continue;
      lastIp = match[2].trim();
      entries.push({ timestamp, ip: lastIp });
      continue;
    }
    if (line.includes('FAILED:')) {
      const match = line.match(failedPattern);
      if (!match) continue;
      const timestamp = parseTimestamp(match[1]);
      if (!timestamp) continue;
      if (!lastIp) continue;
      const message = normalizeFailureMessage(match[2].trim());
      entries.push({ timestamp, ip: lastIp, failure: true, message });
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

function normalizeFailureMessage(message) {
  let cleaned = message.replace(/^\[[^\]]+]>\s*/, '');
  cleaned = cleaned.replace(/^updating\s+[^:]+:\s*/i, '');
  return cleaned || message;
}

function computeLogFingerprint(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `${text.length}:${hash}`;
}

function parseTimestamp(label) {
  if (!label) return null;
  const normalized = label.replace(/\s+/g, ' ').trim();
  const match = normalized.match(
    /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  const [, monthName, dayStr, hourStr, minuteStr, secondStr] = match;
  const monthIndex = MONTH_INDEX[monthName];
  if (monthIndex === undefined) return null;

  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const second = parseInt(secondStr, 10);
  if ([day, hour, minute, second].some(Number.isNaN)) return null;

  const now = new Date();
  const halfYearMs = 182 * NET_DAY_MS;
  let candidate = new Date(
    now.getFullYear(),
    monthIndex,
    day,
    hour,
    minute,
    second,
  );

  if (candidate.getTime() - now.getTime() > halfYearMs) {
    candidate = new Date(
      now.getFullYear() - 1,
      monthIndex,
      day,
      hour,
      minute,
      second,
    );
  } else if (
    now.getTime() - candidate.getTime() > halfYearMs &&
    monthIndex > now.getMonth()
  ) {
    candidate = new Date(
      now.getFullYear() - 1,
      monthIndex,
      day,
      hour,
      minute,
      second,
    );
  }

  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function analyzeEntries(
  entries,
  periodsConfig,
  expectedIntervalMs,
  nowOverride = null,
) {
  if (!entries.length) {
    const now = nowOverride || new Date();
    return {
      entries: [],
      alerts: [],
      missedChecks: 0,
      expectedChecks: 0,
      uptimeValue: null,
      uptimeText: '–',
      firstEntry: null,
      lastEntry: null,
      windowStats: computeWindowStats(
        [],
        [],
        now,
        periodsConfig,
        expectedIntervalMs,
        [],
      ),
    };
  }

  const alerts = [];
  let missed = 0;
  const slotNumbers = buildSlotNumbers(entries, expectedIntervalMs);

  for (let index = 0; index < entries.length - 1; index += 1) {
    const current = entries[index];
    const next = entries[index + 1];
    const diff = next.timestamp - current.timestamp;

    // DST adjustment: timezone offset changes don't count as outages
    const dstShiftMs =
      (current.timestamp.getTimezoneOffset() -
        next.timestamp.getTimezoneOffset()) *
      60000;
    const missing = Math.floor(
      (diff + dstShiftMs - NET_TOLERANCE_MS) / expectedIntervalMs,
    );

    if (missing > 0) {
      missed += missing;
      alerts.push({
        type: 'outage',
        start: new Date(current.timestamp.getTime() + expectedIntervalMs),
        end: new Date(next.timestamp.getTime()),
        missedChecks: missing,
        open: false,
      });
    }
    if (current.ip && next.ip && current.ip !== next.ip) {
      alerts.push({
        type: 'ipchange',
        timestamp: next.timestamp,
        oldIp: current.ip,
        newIp: next.ip,
      });
    }
    if (current.failure) {
      alerts.push({
        type: 'failure',
        timestamp: current.timestamp,
        message: current.message || 'Failed to resolve current IP',
      });
    }
  }

  if (entries.length && entries[entries.length - 1].failure) {
    const lastEntry = entries[entries.length - 1];
    alerts.push({
      type: 'failure',
      timestamp: lastEntry.timestamp,
      message: lastEntry.message || 'Failed to resolve current IP',
    });
  }

  const lastEntry = entries[entries.length - 1];
  const now = nowOverride || new Date();
  const tailMissing = Math.floor(
    (now.getTime() - lastEntry.timestamp.getTime() - NET_TOLERANCE_MS) /
      expectedIntervalMs,
  );
  if (tailMissing > 0) {
    missed += tailMissing;
    alerts.push({
      type: 'outage',
      start: new Date(lastEntry.timestamp.getTime() + expectedIntervalMs),
      end: now,
      missedChecks: tailMissing,
      open: true,
    });
  }

  alerts.sort((a, b) => {
    const aTime = a.type === 'ipchange' ? a.timestamp : a.start;
    const bTime = b.type === 'ipchange' ? b.timestamp : b.start;
    return aTime - bTime;
  });

  const expectedChecks = entries.length + missed;
  const uptimeValue = expectedChecks
    ? (entries.length / expectedChecks) * 100
    : 100;
  const uptimeText = expectedChecks ? `${uptimeValue.toFixed(2)}%` : '100%';
  const windowStats = computeWindowStats(
    entries,
    slotNumbers,
    now,
    periodsConfig,
    expectedIntervalMs,
    alerts,
  );

  return {
    entries,
    alerts,
    missedChecks: missed,
    expectedChecks,
    uptimeValue,
    uptimeText,
    firstEntry: entries[0].timestamp,
    lastEntry: lastEntry.timestamp,
    windowStats,
  };
}

function buildSlotNumbers(entries, expectedIntervalMs) {
  const slots = [];
  let previous = null;
  entries.forEach((entry) => {
    const slot = Math.round(entry.timestamp.getTime() / expectedIntervalMs);
    if (slot !== previous) {
      slots.push(slot);
      previous = slot;
    }
  });
  return slots;
}

function computeWindowStats(
  entries,
  slotNumbers,
  now,
  periodsConfig,
  expectedIntervalMs,
  alerts,
) {
  const definitions = buildPeriodsDefinitions(
    now,
    periodsConfig,
    expectedIntervalMs,
  );
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
        end: new Date(segment.endMs),
      })),
      observed: 0,
      expected: 0,
      missed: 0,
      uptime: null,
      coverage: 0,
    }));
  }

  const nowMs = now.getTime();
  const nowSlot = Math.floor(nowMs / expectedIntervalMs);
  const firstSlot = Math.floor(
    entries[0].timestamp.getTime() / expectedIntervalMs,
  );

  return definitions.map((definition) => {
    const segments = definition.segments.map((segment) =>
      analyzeSegment(
        segment,
        slotNumbers,
        firstSlot,
        nowSlot,
        expectedIntervalMs,
        alerts,
      ),
    );
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
      coverage,
    };
  });
}

function formatPeriodLabel(period) {
  if (typeof period !== 'string') return period;
  const match = period.match(/^1\s+(hour|day|week|month|year)s?$/i);
  if (match) {
    return match[1].toLowerCase();
  }
  return period;
}

function buildPeriodsDefinitions(now, periodsConfig, expectedIntervalMs) {
  const nowMs = now.getTime();

  return periodsConfig.map((periodConfig, index) => {
    const periodMs = parseNaturalTime(periodConfig.period);
    const segmentMs = parseNaturalTime(periodConfig.segment_size);

    if (!periodMs || !segmentMs) {
      console.warn('Invalid period configuration:', periodConfig);
      return {
        key: `period-${index}`,
        label: periodConfig.period || 'Invalid',
        segments: [],
      };
    }

    const segmentCount = Math.ceil(periodMs / segmentMs);
    const segments = buildCustomPeriodSegments(
      periodConfig.period,
      segmentMs,
      segmentCount,
      nowMs,
      expectedIntervalMs,
    );

    return {
      key: `period-${index}`,
      label: `Past ${formatPeriodLabel(periodConfig.period)}`,
      segments,
    };
  });
}

function buildCustomPeriodSegments(
  periodLabel,
  segmentMs,
  segmentCount,
  nowMs,
  expectedIntervalMs,
) {
  const segmentSlots = Math.max(1, Math.round(segmentMs / expectedIntervalMs));
  const endSlot = Math.floor(nowMs / expectedIntervalMs);
  const firstStartSlot = endSlot - segmentCount * segmentSlots + 1;
  const segments = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const startSlot = firstStartSlot + index * segmentSlots;
    const endSlotForSegment = startSlot + segmentSlots - 1;
    const startMs = startSlot * expectedIntervalMs;
    const endMs = (endSlotForSegment + 1) * expectedIntervalMs;

    segments.push({
      key: `${periodLabel.replace(/\s+/g, '-')}-${index}`,
      label: formatCustomSegmentLabel(segmentMs, startMs, endMs),
      startSlot,
      endSlot: endSlotForSegment,
      startMs,
      endMs,
    });
  }

  return segments;
}

function analyzeSegment(
  segment,
  slotNumbers,
  firstSlot,
  nowSlot,
  expectedIntervalMs,
  alerts,
) {
  const startSlot = segment.startSlot;
  const endSlot = segment.endSlot;
  const startMs = segment.startMs;
  const endMs = segment.endMs;

  const clampedEndSlot = Math.min(endSlot, nowSlot);
  const isFuture = startSlot > nowSlot;
  const available = isFuture ? 0 : Math.max(0, clampedEndSlot - startSlot + 1);
  const effectiveStart = Math.max(startSlot, firstSlot);
  const expected =
    !isFuture && clampedEndSlot >= effectiveStart
      ? clampedEndSlot - effectiveStart + 1
      : 0;
  const observed =
    expected > 0
      ? countSlotsInRange(slotNumbers, effectiveStart, clampedEndSlot)
      : 0;
  const missed = Math.max(0, expected - observed);
  const uptime = expected > 0 ? (observed / expected) * 100 : null;
  const coverage = available > 0 ? expected / available : 0;
  const endMsClamped = Math.min(
    endMs,
    (clampedEndSlot + 1) * expectedIntervalMs,
  );

  return {
    ...segment,
    available,
    expected,
    observed,
    missed,
    uptime,
    coverage,
    start: new Date(Math.max(startMs, 0)),
    end: new Date(Math.max(endMsClamped, Math.max(startMs, 0))),
    status: resolveSegmentStatus(startMs, endMsClamped, alerts),
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

function formatCustomSegmentLabel(segmentMs, startMs, endMs) {
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);

  if (segmentMs <= NET_HOUR_MS) {
    return endDate.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (segmentMs >= NET_DAY_MS) {
    return startDate.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return startDate.toLocaleTimeString(undefined, { hour: 'numeric' });
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–';
  }
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped >= 99.995) {
    return '100%';
  }
  return `${clamped.toFixed(2)}%`;
}

function applySegmentClasses(pill, segment) {
  if (segment.available === 0) {
    pill.classList.add('future');
  } else if (!segment.expected) {
    pill.classList.add('idle');
  } else if (segment.status === 'systemDown') {
    pill.classList.add('bad');
  } else if (segment.status === 'connectionFailure') {
    pill.classList.add('warn');
  } else {
    pill.classList.add('ok');
  }
}

function resolveSegmentStatus(startMs, endMs, alerts) {
  if (!alerts || !alerts.length) {
    return 'normal';
  }
  let hasFailure = false;
  for (const alert of alerts) {
    if (alert.type === 'outage') {
      const alertStart = alert.start.getTime();
      const alertEnd = alert.end.getTime();
      if (startMs <= alertEnd && endMs >= alertStart) {
        return 'systemDown';
      }
    } else if (alert.type === 'failure') {
      const failureTime = alert.timestamp.getTime();
      if (failureTime >= startMs && failureTime <= endMs) {
        hasFailure = true;
      }
    }
  }
  return hasFailure ? 'connectionFailure' : 'normal';
}

function buildSegmentTooltip(windowLabel, segment, expectedIntervalMs) {
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
      lines.push('No log data for this period.');
    }
  } else {
    lines.push(
      `${formatNumber(segment.observed)} / ${formatNumber(segment.expected)} checks (${formatPercent(segment.uptime)})`,
    );
    if (segment.missed) {
      lines.push(
        `${segment.missed} missed (~${formatDuration(segment.missed * expectedIntervalMs)})`,
      );
    } else {
      lines.push('No missed checks.');
    }
    if (segment.coverage < 0.98) {
      lines.push(
        `${Math.round(segment.coverage * 100)}% coverage (partial log range)`,
      );
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
    hour12: true,
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
