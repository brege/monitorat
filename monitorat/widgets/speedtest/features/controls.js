class SpeedtestControls {
  constructor(widget) {
    this.widget = widget;
  }

  setupEventListeners() {
    const runButton = this.widget.getElement('run');
    const periodSelect = this.widget.getElement('period-select');
    const metricSelect = this.widget.getElement('metric-select');
    const demoModeEnabled = window.monitor?.demoEnabled === true;

    if (runButton) {
      if (demoModeEnabled) {
        runButton.disabled = true;
        runButton.setAttribute('title', 'Disabled in demo mode');
      } else {
        runButton.addEventListener('click', () => this.runSpeedtest());
      }
    }
    this.widget.wireViewToggles();

    if (metricSelect) {
      metricSelect.innerHTML = '';
      const allLabel = this.widget.schema.chart.default_metric_label;
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = allLabel;
      metricSelect.appendChild(allOption);
      for (const metric of this.widget.metricFields) {
        const option = document.createElement('option');
        option.value = metric.field;
        option.textContent = metric.label;
        metricSelect.appendChild(option);
      }
      metricSelect.value = this.widget.selectedMetric;
      metricSelect.style.display = '';
      metricSelect.addEventListener('change', (event) => {
        this.widget.selectedMetric = event.target.value;
        this.widget.updateChart();
      });
    }

    const timeSeriesHandler = window.monitorShared.TimeSeriesHandler;
    timeSeriesHandler.setupPeriodSelect(
      periodSelect,
      this.widget.config.chart.periods,
      this.widget.selectedPeriod,
      (period) => {
        this.widget.selectedPeriod = period;
        this.widget.features.chart.loadChartData();
      },
    );

    if (periodSelect) {
      const periods = this.widget.config.chart.periods;
      periodSelect.style.display =
        Array.isArray(periods) && periods.length > 0 ? '' : 'none';
    }
  }

  async runSpeedtest() {
    const button = this.widget.getElement('run');
    const status = this.widget.getElement('status');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Running speedtest…';

    try {
      const response = await fetch(`${this.widget.getApiBase()}/run`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Speedtest failed');

      if (status) {
        const DataFormatter = window.monitorShared.DataFormatter;
        const downloadMetric =
          this.widget.metricFields.find(
            (metric) => metric.field === 'download',
          ) || {};
        const uploadMetric =
          this.widget.metricFields.find(
            (metric) => metric.field === 'upload',
          ) || {};
        const pingMetric =
          this.widget.metricFields.find((metric) => metric.field === 'ping') ||
          {};
        const download = DataFormatter.formatBySchema(
          result.download,
          downloadMetric,
        );
        const upload = DataFormatter.formatBySchema(
          result.upload,
          uploadMetric,
        );
        const ping = DataFormatter.formatBySchema(result.ping, pingMetric);
        const serverLabel = result.server || 'unknown';
        const statusTemplate = this.widget.schema.chart.status_template;
        const replacementValues = {
          '{timestamp}': DataFormatter.formatTimestamp(result.timestamp),
          '{download}': download,
          '{upload}': upload,
          '{ping}': ping,
          '{server}': serverLabel,
        };
        let text = statusTemplate;
        for (const [needle, value] of Object.entries(replacementValues)) {
          text = text.replace(needle, value);
        }
        status.textContent = text;
      }
    } catch (error) {
      console.error('Speedtest run failed:', error);
      if (status) status.textContent = `Speedtest error: ${error.message}`;
    } finally {
      if (button) button.disabled = false;
      await this.widget.features.table.loadHistory();
    }
  }
}

window.SpeedtestControls = SpeedtestControls;
