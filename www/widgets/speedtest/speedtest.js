class SpeedtestWidget {
  constructor(widgetConfig = {}) {
    this.container = null;
    this.widgetConfig = widgetConfig;
    this.config = {
      previewCount: 5,
      historyLimit: 200,
      chart: {
        enabled: true,
        days: 30,
        upload_scale: 1.0,
        show_table: true
      }
    };
    this.elements = {};
    this.entries = [];
    this.expanded = false;
    this.chart = null;
    this.currentView = 'chart';
  }

  async init(container, config = {}) {
    this.container = container;
    const preview = Number(config.preview ?? config.preview_count ?? config.min);
    const historyLimit = Number(config.history_limit ?? config.historyLimit);
    this.config = {
      previewCount: Number.isFinite(preview) && preview > 0 ? preview : 5,
      historyLimit: Number.isFinite(historyLimit) && historyLimit > 0 ? historyLimit : 200,
      _suppressHeader: config._suppressHeader,
      chart: {
        enabled: config.chart?.enabled !== false,
        days: config.chart?.days || 30,
        upload_scale: config.chart?.upload_scale || 1.0,
        show_table: config.chart?.show_table !== false
      }
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
      toggle: container.querySelector('[data-speedtest="toggle"]'),
      viewToggle: container.querySelector('[data-speedtest="view-toggle"]'),
      viewChart: container.querySelector('[data-speedtest="view-chart"]'),
      viewTable: container.querySelector('[data-speedtest="view-table"]'),
      chartContainer: container.querySelector('[data-speedtest="chart-container"]'),
      chartCanvas: container.querySelector('[data-speedtest="chart"]'),
      tableContainer: container.querySelector('[data-speedtest="table-container"]')
    };

    if (this.elements.run) {
      this.elements.run.addEventListener('click', () => this.runSpeedtest());
    }
    if (this.elements.toggle) {
      this.elements.toggle.addEventListener('click', () => this.toggleHistory());
    }
    if (this.elements.viewChart) {
      this.elements.viewChart.addEventListener('click', () => this.setView('chart'));
    }
    if (this.elements.viewTable) {
      this.elements.viewTable.addEventListener('click', () => this.setView('table'));
    }

    this.setupChart();
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
      if (this.config.chart.enabled && this.chart) {
        await this.loadChart();
      }
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
      if (this.config.chart.enabled && this.chart) {
        await this.loadChart();
      }
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

    this.updateViewToggle();
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

  setupChart() {
    if (!this.config.chart.enabled || !this.elements.chartCanvas) {
      console.log('Chart setup skipped:', { enabled: this.config.chart.enabled, canvas: !!this.elements.chartCanvas });
      return;
    }

    console.log('Setting up chart...');
    // Load Chart.js if not already loaded
    if (!window.Chart) {
      console.log('Loading Chart.js...');
      const script = document.createElement('script');
      script.src = 'vendors/chart.min.js';
      script.onload = () => {
        console.log('Chart.js loaded, initializing chart...');
        this.initChart();
      };
      script.onerror = () => {
        console.error('Failed to load Chart.js');
      };
      document.head.appendChild(script);
    } else {
      console.log('Chart.js already loaded, initializing chart...');
      this.initChart();
    }
  }

  initChart() {
    if (!this.elements.chartCanvas || !window.Chart) {
      console.log('Chart init failed:', { canvas: !!this.elements.chartCanvas, Chart: !!window.Chart });
      return;
    }

    console.log('Initializing chart with canvas:', this.elements.chartCanvas);
    const ctx = this.elements.chartCanvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        height: 400,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          speed: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: 'Speed (Mbps)'
            }
          },
          ping: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: 'Ping (ms)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        },
        plugins: {
          legend: {
            position: 'top'
          }
        }
      }
    });
    console.log('Chart initialized:', this.chart);
    
    // Load chart data now that chart is ready
    this.loadChart();
  }

  async loadChart() {
    if (!this.config.chart.enabled || !this.chart) {
      console.log('Chart not enabled or not initialized:', { enabled: this.config.chart.enabled, chart: !!this.chart });
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set('days', this.config.chart.days);
      params.set('ts', Date.now());

      console.log('Loading chart data with params:', params.toString());
      const response = await fetch(`api/speedtest/chart?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const chartData = await response.json();
      console.log('Chart data received:', chartData);

      // Apply upload scaling
      if (this.config.chart.upload_scale !== 1.0) {
        const uploadDataset = chartData.datasets.find(d => d.label.includes('Upload'));
        if (uploadDataset) {
          uploadDataset.data = uploadDataset.data.map(val => val * this.config.chart.upload_scale);
        }
      }

      this.chart.data = chartData;
      this.chart.update();
      console.log('Chart updated with data');
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  }

  setView(view) {
    this.currentView = view;
    
    if (view === 'chart') {
      this.elements.chartContainer.style.display = '';
      this.elements.tableContainer.style.display = 'none';
      this.elements.viewChart.classList.add('active');
      this.elements.viewTable.classList.remove('active');
    } else {
      this.elements.chartContainer.style.display = 'none';
      this.elements.tableContainer.style.display = '';
      this.elements.viewChart.classList.remove('active');
      this.elements.viewTable.classList.add('active');
    }
  }

  updateViewToggle() {
    if (!this.config.chart.enabled || !this.elements.viewToggle) {
      return;
    }

    if (this.entries.length > 0) {
      this.elements.viewToggle.style.display = '';
      
      // Set initial view based on config
      if (this.config.chart.show_table && this.currentView === 'chart') {
        this.setView('chart');
      } else if (!this.config.chart.show_table) {
        this.setView('chart');
        this.elements.viewTable.style.display = 'none';
      }
    } else {
      this.elements.viewToggle.style.display = 'none';
    }
  }
}

window.widgets = window.widgets || {};
window.widgets.speedtest = SpeedtestWidget;
