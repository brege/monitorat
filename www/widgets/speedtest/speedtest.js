class SpeedtestWidget {
  constructor(widgetConfig = {}) {
    this.container = null;
    this.widgetConfig = widgetConfig;
    this.config = {
      previewCount: 5,
      historyLimit: 200
    };
    this.elements = {};
    this.entries = [];
    this.expanded = false;
  }

  async init(container, config = {}) {
    this.container = container;
    const preview = Number(config.preview ?? config.preview_count ?? config.min);
    const historyLimit = Number(config.history_limit ?? config.historyLimit);
    this.config = {
      previewCount: Number.isFinite(preview) && preview > 0 ? preview : 5,
      historyLimit: Number.isFinite(historyLimit) && historyLimit > 0 ? historyLimit : 200,
      _suppressHeader: config._suppressHeader
    };

    const response = await fetch('widgets/speedtest/speedtest.html');
    const html = await response.text();
    container.innerHTML = html;
    
    const title = container.querySelector('h2');
    if (this.config._suppressHeader && title) {
      title.remove();
    } else if (title && this.widgetConfig.name !== null && this.widgetConfig.name !== false) {
      if (this.widgetConfig.name) {
        title.textContent = this.widgetConfig.name;
      }
    } else if (title && (this.widgetConfig.name === null || this.widgetConfig.name === false)) {
      title.remove();
    }

    this.elements = {
      run: container.querySelector('[data-speedtest="run"]'),
      status: container.querySelector('[data-speedtest="status"]'),
      historyStatus: container.querySelector('[data-speedtest="history-status"]'),
      rows: container.querySelector('[data-speedtest="rows"]'),
      toggle: container.querySelector('[data-speedtest="toggle"]')
    };

    if (this.elements.run) {
      this.elements.run.addEventListener('click', () => this.runSpeedtest());
    }
    if (this.elements.toggle) {
      this.elements.toggle.addEventListener('click', () => this.toggleHistory());
    }

    await this.loadHistory();
  }

  async runSpeedtest() {
    const button = this.elements.run;
    const status = this.elements.status;
    if (button) button.disabled = true;
    if (status) status.textContent = 'Running speedtest…';

    try {
      const response = await fetch('api/speedtest/run', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Speedtest failed');
      }
      if (status) {
        status.textContent = `${this.formatTimestamp(result.timestamp)} — ↓ ${this.formatMbps(result.download)} Mbps, ↑ ${this.formatMbps(result.upload)} Mbps, ${this.formatPing(result.ping)} ms (${result.server || 'unknown server'})`;
      }
    } catch (error) {
      if (status) status.textContent = `Speedtest error: ${error.message}`;
    } finally {
      if (button) button.disabled = false;
      await this.loadHistory();
    }
  }

  async loadHistory() {
    if (!this.elements.historyStatus || !this.elements.rows) {
      return;
    }

    this.elements.historyStatus.textContent = 'Loading speedtest history…';
    this.elements.historyStatus.style.display = '';
    this.elements.rows.innerHTML = '';

    try {
      const params = new URLSearchParams();
      params.set('limit', this.config.historyLimit);
      params.set('ts', Date.now());

      const response = await fetch(`api/speedtest/history?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      this.entries = payload.entries || [];
      this.renderHistory();
    } catch (error) {
      this.elements.historyStatus.textContent = `Unable to load speedtests: ${error.message}`;
    }
  }

  renderHistory() {
    const statusEl = this.elements.historyStatus;
    const rowsEl = this.elements.rows;
    const toggle = this.elements.toggle;

    rowsEl.innerHTML = '';

    if (!this.entries.length) {
      statusEl.textContent = 'No speedtests logged yet.';
      if (toggle) toggle.style.display = 'none';
      return;
    }

    const previewCount = Math.max(1, this.config.previewCount || 5);
    const showCount = this.expanded ? this.entries.length : Math.min(previewCount, this.entries.length);
    const latest = this.entries.slice(0, showCount);

    latest.forEach((entry) => {
      const tr = document.createElement('tr');
      const cells = [
        this.formatTimestamp(entry.timestamp),
        this.formatMbps(entry.download),
        this.formatMbps(entry.upload),
        this.formatPing(entry.ping),
        entry.server || ''
      ];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      rowsEl.appendChild(tr);
    });

    statusEl.style.display = 'none';

    if (toggle) {
      if (this.entries.length <= previewCount) {
        toggle.style.display = 'none';
      } else {
        toggle.style.display = '';
        const remaining = this.entries.length - previewCount;
        toggle.textContent = this.expanded ? 'Show less' : `Show ${remaining} more`;
      }
    }
  }

  toggleHistory() {
    this.expanded = !this.expanded;
    this.renderHistory();
  }

  formatTimestamp(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  formatMbps(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    return (num / 1_000_000).toFixed(2);
  }

  formatPing(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    const text = num.toFixed(1);
    return text.endsWith('.0') ? text.slice(0, -2) : text;
  }
}

window.widgets = window.widgets || {};
window.widgets.speedtest = SpeedtestWidget;
