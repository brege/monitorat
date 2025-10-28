// Metrics Widget
class MetricsWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = config;
  }

  async init(container) {
    this.container = container;
    
    // Load HTML template
    const response = await fetch('widgets/metrics/metrics.html');
    const html = await response.text();
    container.innerHTML = html;
    
    // Update section title from config
    const title = container.querySelector('h2');
    if (title && this.config.name !== null && this.config.name !== false) {
      if (this.config.name) {
        title.textContent = this.config.name;
      }
    } else if (title && (this.config.name === null || this.config.name === false)) {
      title.remove();
    }
    
    // Load initial data
    await this.loadData();
    
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

    // Update values
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

    // Update status classes
    Object.keys(stats).forEach(key => {
      if (stats[key] && data.metric_statuses[key]) {
        const status = data.metric_statuses[key];
        stats[key].className = stats[key].className.replace(/status-\w+/g, '');
        stats[key].classList.add(`status-${status}`);
      }
    });
  }
}

// Register widget
window.widgets = window.widgets || {};
window.widgets.metrics = MetricsWidget;