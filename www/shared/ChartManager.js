class ChartManager {
  constructor(config) {
    this.canvasElement = config.canvasElement;
    this.containerElement = config.containerElement;
    this.height = config.height || '400px';
    this.chartOptions = config.chartOptions || {};
    this.dataUrl = config.dataUrl;
    this.dataParams = config.dataParams || {};
    
    this.chart = null;
    this.chartInitPromise = null;
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
        if (!this.canvasElement || !window.Chart) {
          this.chartInitPromise = null;
          resolve();
          return;
        }
        this.initChart();
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

  initChart() {
    if (!this.canvasElement || !window.Chart) return;

    const height = parseInt(this.height);
    this.containerElement.style.height = `${height}px`;
    this.containerElement.style.position = 'relative';

    const ctx = this.canvasElement.getContext('2d');
    this.chart = new Chart(ctx, {
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
        plugins: {
          legend: {
            position: 'top'
          }
        },
        ...this.chartOptions
      }
    });
  }

  async loadData() {
    if (!this.chart || !this.dataUrl) return;

    try {
      const params = new URLSearchParams();
      Object.entries(this.dataParams).forEach(([key, value]) => {
        params.set(key, value);
      });
      params.set('ts', Date.now());

      const response = await fetch(`${this.dataUrl}?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const chartData = await response.json();
      this.chart.data = chartData;
      this.chart.update();
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  }

  hasChart() {
    return !!this.chart;
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.ChartManager = ChartManager;