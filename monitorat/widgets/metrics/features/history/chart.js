class MetricsChart extends window.monitorShared.HistoryChartBase {
  constructor(widget) {
    super(widget);
  }

  initializeManager() {
    super.initializeManager({ chartOptions: {} });
  }

  getEntries() {
    return this.widget.transformedEntries || [];
  }

  getSources() {
    return this.widget.sources || null;
  }

  getMetricsToChart() {
    const selectedItem = this.widget.selectedMetric;
    const group = this.widget.schema.computed.find(
      (g) => g.group === selectedItem,
    );
    const metricMatch = this.widget.schema.metrics.find(
      (m) => m.field === selectedItem,
    );
    return group ? group.fields : metricMatch ? [metricMatch] : [];
  }

  getCurveDefaults() {
    return {
      fill: true,
      interpolation: 0.3,
      ghosts: true,
    };
  }

  getMetricValue(entry, metric) {
    return parseFloat(entry[metric.field]) || 0;
  }

  buildDatasets({ metric, values, label, curve, isMerged, sourceIndex }) {
    const ChartManager = window.monitorShared.ChartManager;

    if (isMerged) {
      const sourceColors = ChartManager.getSeriesColors();
      const color = sourceColors[sourceIndex % sourceColors.length];
      return {
        label,
        data: values,
        borderColor: color,
        backgroundColor: `${color}33`,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
        _seriesLabel: label,
      };
    }

    if (curve.ghosts) {
      return ChartManager.buildGhostedDatasets({
        label: metric.label,
        color: metric.color,
        rawValues: values,
      }).map((dataset) => ({
        ...dataset,
        tension: curve.interpolation,
        _seriesLabel: metric.label,
      }));
    }

    const backgroundColor = curve.fill ? `${metric.color}33` : undefined;
    return {
      label: metric.label,
      data: values,
      borderColor: metric.color,
      backgroundColor,
      borderWidth: 2,
      pointRadius: 0,
      tension: curve.interpolation,
      _seriesLabel: metric.label,
    };
  }

  applyChartData(chartData) {
    if (!chartData.allValues.length) return;

    const ChartManager = window.monitorShared.ChartManager;
    const min = Math.min(...chartData.allValues);
    const max = Math.max(...chartData.allValues);
    const padding = (max - min) * 0.1;

    const yAxisLabel =
      this.widget.schema.computed.find(
        (group) => group.group === this.widget.selectedMetric,
      )?.yAxisLabel ||
      this.widget.schema.metrics.find(
        (metric) => metric.field === this.widget.selectedMetric,
      )?.yAxisLabel ||
      'Value';

    const axes =
      this.widget.schema?.axes &&
      Object.keys(this.widget.schema.axes).length > 0
        ? this.widget.schema.axes
        : { x: { display: true }, y: { display: true } };
    const scales = ChartManager.buildScalesFromSchema(axes, {
      y: {
        title: { text: yAxisLabel },
        min: Math.max(0, min - padding),
        max: max + padding,
      },
    });

    this.widget.chartManager.updateChart(
      { labels: chartData.labels, datasets: chartData.datasets },
      scales,
    );
    this.renderLegend(chartData.datasets);
  }

  updateView() {
    if (this.widget.chartManager?.hasChart()) {
      this.update();
    }
  }

  renderLegend(datasets) {
    const legend = this.widget.getElement('chart-legend');
    if (!legend) return;

    const ChartManager = window.monitorShared?.ChartManager;
    const ChartLegend = window.monitorShared?.ChartLegend;
    const chart = this.widget.chartManager?.chart;
    if (!ChartLegend || !chart) {
      legend.innerHTML = '';
      this.widget.updateLegendVisibility();
      return;
    }

    const seriesMap = this.buildSeriesMap(datasets);
    const series = Array.from(seriesMap.values()).map((item) => ({
      field: item.label,
      label: item.label,
      color: item.color,
    }));
    const activeMetrics = series
      .filter((item) => {
        const entry = seriesMap.get(item.label);
        return entry.indexes.some((index) => chart.isDatasetVisible(index));
      })
      .map((item) => item.label);

    ChartLegend.createMetricLegend(legend, series, {
      activeMetrics,
      onToggle: (label) => {
        ChartManager.toggleDatasets(chart, (dataset) => {
          const dsLabel = dataset._seriesLabel || dataset.label;
          const baseLabel = dsLabel?.endsWith(' (raw)')
            ? dsLabel.slice(0, -6)
            : dsLabel;
          return baseLabel === label;
        });
        chart.update();
        this.renderLegend(chart.data.datasets || []);
      },
    });
    this.widget.updateLegendVisibility();
  }

  buildSeriesMap(datasets) {
    const seriesMap = new Map();
    datasets.forEach((dataset, index) => {
      const label = dataset._seriesLabel || dataset.label;
      if (!label) return;
      const isRaw =
        typeof dataset.label === 'string' && dataset.label.endsWith(' (raw)');
      const baseLabel = label.endsWith(' (raw)') ? label.slice(0, -6) : label;
      if (!seriesMap.has(baseLabel)) {
        seriesMap.set(baseLabel, {
          label: baseLabel,
          color: dataset.borderColor,
          indexes: [],
          hasPrimary: !isRaw,
        });
      } else if (!isRaw && !seriesMap.get(baseLabel).hasPrimary) {
        seriesMap.get(baseLabel).color = dataset.borderColor;
        seriesMap.get(baseLabel).hasPrimary = true;
      }
      seriesMap.get(baseLabel).indexes.push(index);
    });
    return seriesMap;
  }
}

window.MetricsChart = MetricsChart;
