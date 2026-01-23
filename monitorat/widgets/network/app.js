const NET_MINUTE_MS = 60 * 1000;

class NetworkWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = mergeNetworkConfig(config);
    this.periodsConfig = this.config.uptime?.periods || [];
    const intervalSeconds = this.config.chirper.interval_seconds;
    this.expectedIntervalMs = intervalSeconds * 1000;
    this.minutesPerCheck = this.expectedIntervalMs / 60000;
    this.state = {
      uptime: null,
      alertsExpanded: false,
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

  async init(container, config = {}) {
    this.container = container;
    this.config = mergeNetworkConfig({ ...this.config, ...config });
    this.periodsConfig = this.config.uptime?.periods || [];
    const intervalSeconds = this.config.chirper.interval_seconds;
    this.expectedIntervalMs = intervalSeconds * 1000;
    this.minutesPerCheck = this.expectedIntervalMs / 60000;

    const response = await fetch('widgets/network/index.html');
    const html = await response.text();
    container.innerHTML = html;

    await this.loadFeatureScripts();
    this.initializeFeatureHeaders();
    this.cacheElements();
    this.bindEvents();
    this.initializeFeatures();
    this.applyVisibilityConfig();
    await this.loadUptime();
  }

  cacheElements() {
    const get = (attr) =>
      this.container.querySelector(`[data-network="${attr}"]`);
    const getAll = (attr) =>
      this.container.querySelectorAll(`[data-network="${attr}"]`);

    this.elements = {
      logStatus: get('log-status'),
      alertList: get('alerts-list'),
      alertToggle: get('alerts-toggle'),
      uptimeRows: get('uptime-rows'),
      summaryTiles: get('summary-tiles'),
      snapshot: {
        tiles: getAll('snapshot-tile'),
      },
      headers: {
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
    };
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

  applyVisibilityConfig() {
    const FeatureVisibility = window.monitorShared.FeatureVisibility;

    const showConfig = {
      metrics: this.config.show?.metrics !== false && this.config.metrics.show,
      uptime: this.config.show?.uptime !== false && this.config.uptime.show,
      outages: this.config.show?.outages !== false && this.config.alerts.show,
    };

    FeatureVisibility.apply(this.container, showConfig, {
      metrics: '[data-network-section="metrics"]',
      uptime: '[data-network-section="uptime"]',
      outages: '[data-network-section="alerts"]',
    });
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
    const available = {
      metrics: this.config.show?.metrics !== false,
      uptime:
        this.config.show?.uptime !== false &&
        this.periodsConfig.length > 0 &&
        !!this.elements.sections.uptime,
      outages: this.config.show?.outages !== false && this.config.alerts.show,
    };
    const headerElements = {
      metrics: this.elements.headers.metrics,
      uptime: this.elements.headers.uptime,
      outages: this.elements.sections.alerts,
    };

    if (window.NetworkSnapshot) {
      this.features.snapshot = new window.NetworkSnapshot(this, {
        enabled: available.metrics,
        section: this.elements.sections.metrics,
        header: headerElements.metrics,
      });
    }

    if (window.NetworkUptime) {
      this.features.uptime = new window.NetworkUptime(this, {
        enabled: available.uptime,
        section: this.elements.sections.uptime,
        header: headerElements.uptime,
      });
    }

    if (window.NetworkOutages) {
      this.features.outages = new window.NetworkOutages(this);
    }
  }

  bindEvents() {
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

  async loadUptime() {
    const federationNodes = this.config.federation?.nodes;
    if (federationNodes && Array.isArray(federationNodes)) {
      await this.loadMergedUptime(federationNodes);
    } else {
      await this.loadSingleUptime();
    }
  }

  async loadSingleUptime() {
    setText(this.elements.logStatus, 'Loading update data…');

    try {
      const response = await fetch(
        `${this.getApiBase()}/uptime?${Date.now()}`,
        {
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.state.uptime = this.convertUptimeData(data);
      this.state.alertsExpanded = false;
      this.renderAll();

      if (data.expectedChecks > 0) {
        setText(
          this.elements.logStatus,
          `${data.expectedChecks.toLocaleString()} expected since first entry.`,
        );
      } else {
        setText(this.elements.logStatus, 'No update data available.');
      }
    } catch (error) {
      console.error('Network update API call failed:', error);
      setText(
        this.elements.logStatus,
        `Unable to load update data: ${error.message}`,
      );
      this.state.uptime = this.emptyUptimeState();
      this.state.alertsExpanded = false;
      this.renderAll();
    }
  }

  async loadMergedUptime(sources) {
    setText(this.elements.logStatus, 'Loading update data…');

    this.state.sources = sources;
    this.state.sourceStates = {};

    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(
            `api/network-${source}/uptime?${Date.now()}`,
            { cache: 'no-store' },
          );
          if (!response.ok) {
            console.warn(
              `Failed to fetch update data from ${source}: HTTP ${response.status}`,
            );
            return { source, uptime: null, error: `HTTP ${response.status}` };
          }
          const data = await response.json();
          return { source, uptime: this.convertUptimeData(data), error: null };
        } catch (error) {
          console.warn(
            `Failed to fetch update data from ${source}:`,
            error.message,
          );
          return { source, uptime: null, error: error.message };
        }
      }),
    );

    for (const result of results) {
      this.state.sourceStates[result.source] = {
        uptime: result.uptime,
        error: result.error,
      };
    }

    const first = results.find((r) => r.uptime);
    this.state.uptime = first ? first.uptime : this.emptyUptimeState();
    this.state.alertsExpanded = false;
    this.renderAll();

    setText(
      this.elements.logStatus,
      `Loaded update data from ${sources.length} sources.`,
    );
  }

  convertUptimeData(data) {
    return {
      loggedChecks: data.loggedChecks ?? 0,
      uptimeValue: data.uptimeValue,
      uptimeText: data.uptimeText,
      missedChecks: data.missedChecks,
      expectedChecks: data.expectedChecks,
      firstEntry: data.firstEntry ? new Date(data.firstEntry) : null,
      lastEntry: data.lastEntry ? new Date(data.lastEntry) : null,
      windowStats: (data.windowStats || []).map((ws) => ({
        key: ws.key,
        label: ws.label,
        observed: ws.observed,
        expected: ws.expected,
        missed: ws.missed,
        failed: ws.failed ?? 0,
        uptime: ws.uptime,
        coverage: ws.coverage,
        segments: (ws.segments || []).map((s) => ({
          key: s.key,
          label: s.label,
          start: new Date(s.start),
          end: new Date(s.end),
          available: s.available,
          expected: s.expected,
          observed: s.observed,
          missed: s.missed,
          uptime: s.uptime,
          coverage: s.coverage,
          status: s.status,
        })),
      })),
    };
  }

  emptyUptimeState() {
    return {
      loggedChecks: 0,
      uptimeValue: null,
      uptimeText: '–',
      missedChecks: 0,
      expectedChecks: 0,
      firstEntry: null,
      lastEntry: null,
      windowStats: [],
    };
  }

  getApiBase() {
    const prefix = this.config._apiPrefix || 'network';
    return `api/${prefix}`;
  }

  downloadLog() {
    const url = `${this.getApiBase()}/log?${Date.now()}`;
    window.open(url, '_blank');
  }

  renderAll() {
    if (this.features.snapshot) {
      this.features.snapshot.render();
    }
    if (this.features.uptime) {
      this.features.uptime.render();
    }
    if (this.features.outages) {
      this.features.outages.render();
    }
  }

  resolveNowOverride() {
    const isDemoEnabled = window.monitor?.demoEnabled === true;
    if (!isDemoEnabled) return null;
    if (!this.state.uptime?.lastEntry) return null;
    return new Date(this.state.uptime.lastEntry.getTime() + NET_MINUTE_MS);
  }
}

function mergeNetworkConfig(cfg) {
  const cadenceRaw = Number(cfg.alerts?.cadence);
  const intervalSeconds = cfg.chirper?.interval_seconds || 300;
  const checksPerMinute = 60 / intervalSeconds;
  const cadenceMinutes =
    !Number.isNaN(cadenceRaw) && cadenceRaw >= 0 ? cadenceRaw : 0;
  const cadenceChecks = Math.ceil(cadenceMinutes * checksPerMinute);

  return {
    ...cfg,
    alerts: {
      ...cfg.alerts,
      cadenceChecks,
    },
  };
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function formatDateTime(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '–';
  }
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${hours}:${minutes}`;
}

function formatDuration(ms) {
  if (ms < 0) return '–';
  const minutes = Math.round(ms / 60000);
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

function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined) return '–';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined) return '–';
  return `${value.toFixed(decimals)}%`;
}

function applySegmentClasses(element, segment) {
  element.classList.remove('ok', 'warn', 'bad', 'idle', 'future', 'unknown');
  if (segment.available === 0) {
    element.classList.add('future');
  } else if (!segment.expected) {
    element.classList.add('idle');
  } else if (segment.status === 'systemDown') {
    element.classList.add('unknown');
  } else if (segment.status === 'connectionFailure') {
    element.classList.add('bad');
  } else {
    element.classList.add('ok');
  }
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

window.widgets = window.widgets || {};
window.widgets.network = NetworkWidget;
