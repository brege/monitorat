class SpeedtestChart extends window.monitorShared.HistoryChartBase {
  constructor(widget) {
    super(widget);
    this.lineStyles = [[], [5, 5], [2, 2], [10, 5, 2, 5]];
    this.legendState = null;
  }

  initializeManager() {
    const ChartManager = window.monitorShared?.ChartManager;
    const axes =
      this.widget.schema?.axes &&
      Object.keys(this.widget.schema.axes).length > 0
        ? this.widget.schema.axes
        : {};
    const scales = ChartManager.buildScalesFromSchema(axes);

    super.initializeManager({
      chartOptions: {
        scales,
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  async loadChartData() {
    if (!this.widget.chartManager) return;
    await this.widget.chartManager.ensureChart();

    const mergeSources = this.widget.config.federation?.nodes;
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedChartData(mergeSources);
    } else {
      await this.loadSingleChartData();
    }
  }

  async loadSingleChartData() {
    try {
      const searchParameters = new URLSearchParams();
      searchParameters.set('period', this.widget.selectedPeriod);
      searchParameters.set('ts', Date.now());
      const response = await fetch(
        `${this.widget.getEndpoint('chart')}?${searchParameters.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      this.widget.chartEntries = payload.entries || [];
      this.update();
    } catch (error) {
      console.error('Speedtest chart load failed:', error);
    }
  }

  async loadMergedChartData(sources) {
    try {
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            const searchParameters = new URLSearchParams();
            searchParameters.set('period', this.widget.selectedPeriod);
            searchParameters.set('ts', Date.now());
            const response = await fetch(
              `${this.widget.getEndpoint('chart', source)}?${searchParameters.toString()}`,
              { cache: 'no-store' },
            );
            if (!response.ok) {
              console.warn(
                `Failed to fetch speedtest chart from ${source}: HTTP ${response.status}`,
              );
              return [];
            }
            const payload = await response.json();
            return (payload.entries || []).map((entry) => ({
              ...entry,
              _source: source,
            }));
          } catch (error) {
            console.warn(
              `Failed to fetch speedtest chart from ${source}:`,
              error.message,
            );
            return [];
          }
        }),
      );

      this.widget.chartEntries = results.flat();
      this.widget.chartEntries.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      );
      this.update();
    } catch (error) {
      console.error('Speedtest merged chart load failed:', error);
    }
  }

  getEntries() {
    return this.widget.chartEntries || [];
  }

  getSources() {
    return this.widget.config.federation?.nodes || null;
  }

  shouldUseMergedMode(sources) {
    return Array.isArray(sources) && sources.length > 0;
  }

  getMetricsToChart() {
    return this.widget.selectedMetric === 'all'
      ? this.widget.metricFields
      : this.widget.metricFields.filter(
          (metric) => metric.field === this.widget.selectedMetric,
        );
  }

  getMetricValue(entry, metric) {
    return this.formatMetricValue(entry[metric.field], metric);
  }

  formatMetricValue(raw, metric) {
    if (raw === null || raw === undefined) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    if (metric.format === 'mbps') {
      return Number((numeric / 1_000_000).toFixed(metric.decimals ?? 2));
    }
    if (metric.format === 'ping') {
      return Number(numeric.toFixed(metric.decimals ?? 1));
    }
    return numeric;
  }

  buildDatasets({
    metric,
    values,
    label,
    curve,
    isMerged,
    source,
    sourceIndex,
  }) {
    const color = metric.color;
    const backgroundColor = curve.fill ? `${color}33` : undefined;

    return {
      label,
      data: values,
      borderColor: color,
      backgroundColor,
      borderWidth: 2,
      pointRadius: 0,
      borderDash: isMerged
        ? this.lineStyles[sourceIndex % this.lineStyles.length]
        : undefined,
      tension: curve.interpolation,
      yAxisID: metric.yAxisID,
      spanGaps: isMerged,
      _metricField: metric.field,
      _source: source || null,
    };
  }

  applyChartData(chartData) {
    this.widget.chartManager.updateChart({
      labels: chartData.labels,
      datasets: chartData.datasets,
    });
  }

  afterUpdateChart(chartData) {
    const ChartManager = window.monitorShared.ChartManager;
    ChartManager.updateAxisBounds(this.widget.chartManager.chart);
    this.renderLegends(chartData.metrics, chartData.sources);
  }

  updateView() {
    this.loadChartData();
  }

  renderLegends(metrics, sources) {
    const chart = this.widget.chartManager?.chart;
    if (!chart) {
      this.clearLegends();
      return;
    }

    this.legendState = { metrics, sources };
    this.renderMetricLegend(chart, metrics);
    this.renderNodeLegend(chart, sources);
    this.widget.updateLegendVisibility();
  }

  clearLegends() {
    const metricLegend = this.widget.getElement('metric-legend');
    const nodeLegend = this.widget.getElement('node-legend');
    if (metricLegend) metricLegend.innerHTML = '';
    if (nodeLegend) nodeLegend.innerHTML = '';
  }

  renderMetricLegend(chart, metrics) {
    const metricLegend = this.widget.getElement('metric-legend');
    const ChartManager = window.monitorShared?.ChartManager;
    const ChartLegend = window.monitorShared?.ChartLegend;
    if (!metricLegend || !ChartLegend) {
      return;
    }

    const datasets = chart.data.datasets || [];
    const metricsToRender = metrics.filter((metric) =>
      datasets.some((dataset) => dataset._metricField === metric.field),
    );
    if (!metricsToRender.length) {
      metricLegend.style.display = 'none';
      return;
    }

    const activeMetrics = metricsToRender
      .filter((metric) => {
        const matchingIndexes = datasets
          .map((dataset, index) =>
            dataset._metricField === metric.field ? index : null,
          )
          .filter((index) => index !== null);
        return matchingIndexes.some((index) => chart.isDatasetVisible(index));
      })
      .map((metric) => metric.field);

    ChartLegend.createMetricLegend(metricLegend, metricsToRender, {
      activeMetrics,
      onToggle: (field) => {
        ChartManager.toggleDatasets(
          chart,
          (dataset) => dataset._metricField === field,
        );
        ChartManager.updateAxisBounds(chart);
        this.renderMetricLegend(chart, metricsToRender);
        if (this.legendState) {
          this.renderNodeLegend(chart, this.legendState.sources);
        }
      },
    });
  }

  renderNodeLegend(chart, sources) {
    const nodeLegend = this.widget.getElement('node-legend');
    const ChartManager = window.monitorShared?.ChartManager;
    const ChartLegend = window.monitorShared?.ChartLegend;
    if (!nodeLegend || !ChartLegend) {
      return;
    }

    if (!sources || sources.length < 2) {
      nodeLegend.style.display = 'none';
      return;
    }

    const datasets = chart.data.datasets || [];
    const activeNodes = sources.filter((source) => {
      const matchingIndexes = datasets
        .map((dataset, datasetIndex) =>
          dataset._source === source ? datasetIndex : null,
        )
        .filter((datasetIndex) => datasetIndex !== null);
      return matchingIndexes.some((datasetIndex) =>
        chart.isDatasetVisible(datasetIndex),
      );
    });

    ChartLegend.createNodeLegend(nodeLegend, sources, {
      lineStyles: this.lineStyles,
      activeNodes,
      onToggle: (node) => {
        ChartManager.toggleDatasets(
          chart,
          (dataset) => dataset._source === node,
        );
        ChartManager.updateAxisBounds(chart);
        if (this.legendState) {
          this.renderMetricLegend(chart, this.legendState.metrics);
        }
        this.renderNodeLegend(chart, sources);
      },
    });
  }
}

window.SpeedtestChart = SpeedtestChart;
