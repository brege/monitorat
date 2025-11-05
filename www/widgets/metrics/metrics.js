// Metrics Widget
class MetricsWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = config;
    this.chart = null;
    this.currentView = null;
    this.chartInitPromise = null;
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };
    
    const response = await fetch('widgets/metrics/metrics.html');
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
    
    const viewChart = container.querySelector('[data-metrics="view-chart"]');
    const viewTable = container.querySelector('[data-metrics="view-table"]');
    if (viewChart) {
      viewChart.addEventListener('click', () => this.setView('chart'));
    }
    if (viewTable) {
      viewTable.addEventListener('click', () => this.setView('table'));
    }
    
    await this.loadData();
    this.updateViewToggle();
    
    console.log('Metrics widget initialized');
  }

  async loadData() {
    try {
      const response = await fetch('api/metrics');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      this.update(data);
    } catch (error) {
      console.error('Unable to load metrics:', error.message);
    }
  }

  update(data) {
    if (!data.metrics || !data.metric_statuses) return;
    
    const elements = {
      uptime: document.getElementById('uptime-value'),
      load: document.getElementById('load-value'),
      memory: document.getElementById('memory-value'),
      temp: document.getElementById('temp-value'),
      disk: document.getElementById('disk-value'),
      storage: document.getElementById('storage-value')
    };

    const stats = {
      uptime: document.querySelector('#uptime-value')?.closest('.stat'),
      load: document.querySelector('#load-value')?.closest('.stat'),
      memory: document.querySelector('#memory-value')?.closest('.stat'),
      temp: document.querySelector('#temp-value')?.closest('.stat'),
      disk: document.querySelector('#disk-value')?.closest('.stat'),
      storage: document.querySelector('#storage-value')?.closest('.stat')
    };

    if (elements.uptime && data.metrics.uptime) {
      elements.uptime.textContent = data.metrics.uptime;
    }
    if (elements.load && data.metrics.load) {
      elements.load.textContent = data.metrics.load;
    }
    if (elements.memory && data.metrics.memory) {
      elements.memory.textContent = data.metrics.memory;
    }
    if (elements.temp && data.metrics.temp) {
      elements.temp.textContent = data.metrics.temp;
    }
    if (elements.disk && data.metrics.disk) {
      elements.disk.textContent = data.metrics.disk;
    }
    if (elements.storage && data.metrics.storage) {
      elements.storage.textContent = data.metrics.storage;
    }

    Object.keys(stats).forEach(key => {
      if (stats[key] && data.metric_statuses[key]) {
        const status = data.metric_statuses[key];
        stats[key].className = stats[key].className.replace(/status-\w+/g, '');
        stats[key].classList.add(`status-${status}`);
      }
    });
  }

  setView(view) {
    const targetView = view === 'table' ? 'table' : 'chart';
    if (this.currentView === targetView) {
      return;
    }
    this.currentView = targetView;

    const chartContainer = this.container.querySelector('[data-metrics="chart-container"]');
    const tableContainer = this.container.querySelector('[data-metrics="table-container"]');
    const viewChart = this.container.querySelector('[data-metrics="view-chart"]');
    const viewTable = this.container.querySelector('[data-metrics="view-table"]');

    if (targetView === 'chart') {
      chartContainer.style.display = '';
      tableContainer.style.display = 'none';
      viewChart.classList.add('active');
      viewTable.classList.remove('active');
      this.ensureChart().then(() => {
        if (this.chart && this.currentView === 'chart') {
          this.chart.loadData();
        }
      });
    } else {
      chartContainer.style.display = 'none';
      tableContainer.style.display = '';
      viewChart.classList.remove('active');
      viewTable.classList.add('active');
    }
  }

  ensureChart() {
    if (this.chart) {
      return Promise.resolve();
    }
    if (this.chartInitPromise) {
      return this.chartInitPromise;
    }
    this.chartInitPromise = new Promise((resolve) => {
      const initialize = () => {
        const canvas = this.container.querySelector('[data-metrics="chart"]');
        if (!canvas || !window.Chart) {
          this.chartInitPromise = null;
          resolve();
          return;
        }
        this.initChart(canvas);
        this.chartInitPromise = null;
        resolve();
      };

      if (window.Chart) {
        initialize();
      } else {
        const script = document.createElement('script');
        script.src = 'vendors/chart.min.js';
        script.onload = initialize;
        script.onerror = () => {
          console.error('Failed to load Chart.js');
          this.chartInitPromise = null;
          resolve();
        };
        document.head.appendChild(script);
      }
    });
    return this.chartInitPromise;
  }

  initChart(canvas) {
    if (!window.Chart) return;

    const ctx = canvas.getContext('2d');
    this.chart = {
      chart: new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: []
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index'
          },
          scales: {
            y: {
              title: {
                display: true,
                text: 'Value'
              }
            }
          },
          plugins: {
            legend: {
              position: 'top'
            }
          }
        }
      }),
      loadData: async () => {
        try {
          const response = await fetch('api/metrics/history');
          const result = await response.json();
          const data = result.data || [];
          
          if (data.length > 0) {
            const labels = data.map(row => this.formatTime(row.timestamp));
            const cpuData = data.map(row => parseFloat(row.cpu_percent));
            
            this.chart.chart.data = {
              labels: labels,
              datasets: [{
                label: 'CPU %',
                data: cpuData,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1
              }]
            };
            this.chart.chart.update();
          }
        } catch (error) {
          console.error('Failed to load chart data:', error);
        }
      }
    };
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  updateViewToggle() {
    const viewToggle = this.container.querySelector('[data-metrics="view-toggle"]');
    if (viewToggle) {
      viewToggle.style.display = '';
      if (!this.currentView) {
        this.setView('chart');
      }
    }
  }
}

// Register widget
window.widgets = window.widgets || {};
window.widgets.metrics = MetricsWidget;
