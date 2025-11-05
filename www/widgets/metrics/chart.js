class MetricsChart {
  constructor() {
    this.container = null;
    this.chart = null;
    this.data = [];
    this.metric = 'cpu_percent';
    this.chartInitPromise = null;
  }

  async init(container) {
    this.container = container;
    
    container.innerHTML = `
      <div class="metrics-chart-controls">
        <label for="metric-select">Metric:</label>
        <select id="metric-select">
          <option value="cpu_percent">CPU %</option>
          <option value="memory_percent">Memory %</option>
          <option value="disk_io_delta">Disk I/O Δ (MB/min)</option>
          <option value="temp_c">Temperature (°C)</option>
          <option value="load_1min">Load Average (1min)</option>
        </select>
      </div>
      <div class="metrics-chart-container" style="height: 400px; position: relative; margin-top: 10px;">
        <canvas id="metrics-chart"></canvas>
      </div>
    `;

    const select = container.querySelector('#metric-select');
    select.addEventListener('change', (e) => {
      this.metric = e.target.value;
      this.updateChart();
    });

    await this.loadData();
    await this.ensureChart();
    this.updateChart();
  }

  async loadData() {
    try {
      const response = await fetch('api/metrics/history');
      const result = await response.json();
      this.data = result.data || [];
    } catch (error) {
      console.error('Failed to load metrics data:', error);
      this.data = [];
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
        const canvas = this.container.querySelector('#metrics-chart');
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
        scales: {
          y: {
            title: {
              display: true,
              text: 'Value'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Time'
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
  }

  calculateDeltas(data, field) {
    const result = [];
    let prev = null;
    let prevTime = null;
    
    for (const row of data) {
      const current = parseFloat(row[field]);
      const currentTime = new Date(row.timestamp);
      
      if (prev !== null && prevTime !== null) {
        const delta = current - prev;
        const timeDelta = (currentTime - prevTime) / 60000; // minutes
        let rate = timeDelta > 0 ? delta / timeDelta : 0;
        
        // Cap disk I/O spikes at reasonable maximum (100 MB/min)
        if (field.includes('disk_') && rate > 100) {
          rate = 100;
        }
        
        result.push({ timestamp: row.timestamp, value: Math.max(0, rate) });
      } else {
        result.push({ timestamp: row.timestamp, value: 0 });
      }
      
      prev = current;
      prevTime = currentTime;
    }
    
    return result;
  }

  updateChart() {
    if (!this.chart || !this.data.length) return;

    let chartData, yAxisLabel;
    
    if (this.metric === 'disk_io_delta') {
      const readDeltas = this.calculateDeltas(this.data, 'disk_read_mb');
      const writeDeltas = this.calculateDeltas(this.data, 'disk_write_mb');
      
      chartData = {
        labels: readDeltas.map(d => this.formatTime(d.timestamp)),
        datasets: [
          {
            label: 'Read MB/min',
            data: readDeltas.map(d => d.value),
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            tension: 0.1
          },
          {
            label: 'Write MB/min',
            data: writeDeltas.map(d => d.value),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.1
          }
        ]
      };
      yAxisLabel = 'MB/min';
    } else {
      const values = this.data.map(row => parseFloat(row[this.metric]));
      const labels = this.data.map(row => this.formatTime(row.timestamp));
      
      const metricLabels = {
        cpu_percent: 'CPU %',
        memory_percent: 'Memory %',
        temp_c: 'Temperature (°C)',
        load_1min: 'Load Average'
      };
      
      chartData = {
        labels: labels,
        datasets: [{
          label: metricLabels[this.metric] || this.metric,
          data: values,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1
        }]
      };
      yAxisLabel = metricLabels[this.metric] || this.metric;
    }

    this.chart.data = chartData;
    this.chart.options.scales.y.title.text = yAxisLabel;
    this.chart.update();
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
}

window.MetricsChart = MetricsChart;