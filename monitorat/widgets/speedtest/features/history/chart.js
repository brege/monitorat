class SpeedtestChart {
  constructor(widget) {
    this.widget = widget;
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

    this.widget.chartManager = new ChartManager({
      canvasElement: this.widget.getElement('chart'),
      containerElement: this.widget.getElement('chart-container'),
      height: this.widget.config.chart.height,
      dataUrl: null,
      dataParams: null,
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
        `${this.widget.getApiBase()}/chart?${searchParameters.toString()}`,
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
              `api/speedtest-${source}/chart?${searchParameters.toString()}`,
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
      this.updateMerged(sources);
    } catch (error) {
      console.error('Speedtest merged chart load failed:', error);
    }
  }

  getMetricsToUse() {
    return this.widget.selectedMetric === 'all'
      ? this.widget.metricFields
      : this.widget.metricFields.filter(
          (metric) => metric.field === this.widget.selectedMetric,
        );
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

  update() {
    if (!this.widget.chartManager?.hasChart()) return;

    const ChartManager = window.monitorShared.ChartManager;
    const mergeSources = this.widget.config.federation?.nodes;
    if (mergeSources && Array.isArray(mergeSources)) {
      const filteredSources = ChartManager.filterSources(
        mergeSources,
        this.widget.selectedNode,
      );
      this.updateMerged(filteredSources);
      return;
    }

    const DataFormatter = window.monitorShared?.DataFormatter;
    const filteredEntries = ChartManager.filterEntries(
      this.widget.chartEntries,
      this.widget.selectedNode,
    );
    const labels = filteredEntries.map((entry) =>
      DataFormatter.formatTime(entry.timestamp),
    );
    const datasets = [];
    const metricsToUse = this.getMetricsToUse();
    const curve = this.widget.config?.chart?.curve || {
      fill: false,
      interpolation: 0.3,
      ghosts: false,
    };

    for (const metric of metricsToUse) {
      const values = filteredEntries.map((entry) =>
        this.formatMetricValue(entry[metric.field], metric),
      );

      const color = metric.color;
      const backgroundColor = curve.fill ? `${color}33` : undefined;

      datasets.push({
        label: metric.label || metric.field,
        data: values,
        borderColor: color,
        backgroundColor,
        borderWidth: 2,
        pointRadius: 0,
        tension: curve.interpolation,
        yAxisID: metric.yAxisID,
        _metricField: metric.field,
        _source: null,
      });
    }

    this.widget.chartManager.updateChart({ labels, datasets });
    ChartManager.updateAxisBounds(this.widget.chartManager.chart);
    this.renderLegends(metricsToUse, []);
  }

  updateMerged(sources) {
    if (!this.widget.chartManager?.hasChart()) return;

    const ChartManager = window.monitorShared.ChartManager;
    const DataFormatter = window.monitorShared?.DataFormatter;
    const filteredEntries = ChartManager.filterEntries(
      this.widget.chartEntries,
      this.widget.selectedNode,
    );

    const { entriesBySource, sortedTimestamps, labels } =
      ChartManager.buildMergedTimeline(filteredEntries, (ts) =>
        DataFormatter.formatTime(ts),
      );

    const metricsToUse = this.getMetricsToUse();
    const datasets = [];
    const curve = this.widget.config?.chart?.curve || {
      fill: false,
      interpolation: 0.3,
      ghosts: false,
    };

    sources.forEach((source, sourceIndex) => {
      const sourceEntries = entriesBySource[source] || [];
      const timestampMap = {};
      for (const entry of sourceEntries) {
        timestampMap[entry.timestamp] = entry;
      }

      for (const metric of metricsToUse) {
        const values = sortedTimestamps.map((timestamp) => {
          const entry = timestampMap[timestamp];
          if (!entry) return null;
          return this.formatMetricValue(entry[metric.field], metric);
        });

        const label = `${source}: ${metric.label || metric.field}`;
        const color = metric.color;
        const backgroundColor = curve.fill ? `${color}33` : undefined;

        datasets.push({
          label,
          data: values,
          borderColor: color,
          backgroundColor,
          borderWidth: 2,
          pointRadius: 0,
          borderDash: this.lineStyles[sourceIndex % this.lineStyles.length],
          tension: curve.interpolation,
          yAxisID: metric.yAxisID,
          spanGaps: true,
          _metricField: metric.field,
          _source: source,
        });
      }
    });

    this.widget.chartManager.updateChart({ labels, datasets });
    ChartManager.updateAxisBounds(this.widget.chartManager.chart);
    this.renderLegends(metricsToUse, sources);
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
