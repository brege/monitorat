/* global getComputedStyle */
class MetricsChart {
  constructor(widget) {
    this.widget = widget;
  }

  initializeManager() {
    const ChartManager = window.monitorShared?.ChartManager;

    this.widget.chartManager = new ChartManager({
      canvasElement: this.widget.getElement('chart'),
      containerElement: this.widget.getElement('chart-container'),
      height: this.widget.config.chart.height,
      dataUrl: null,
      chartOptions: {},
    });
  }

  update() {
    if (
      !this.widget.chartManager?.chart ||
      !this.widget.transformedEntries.length
    )
      return;

    const DataFormatter = window.monitorShared.DataFormatter;
    const filteredEntries = this.getFilteredEntries();
    const chartData = this.createChartData(
      filteredEntries,
      this.widget.selectedMetric,
      DataFormatter,
    );

    const filteredValues = chartData.allValues.filter((value) =>
      Number.isFinite(value),
    );
    if (!filteredValues.length) return;

    const min = Math.min(...filteredValues);
    const max = Math.max(...filteredValues);
    const padding = (max - min) * 0.1;

    const yAxisLabel =
      this.widget.schema.computed.find(
        (group) => group.group === this.widget.selectedMetric,
      )?.yAxisLabel ||
      this.widget.schema.metrics.find(
        (metric) => metric.field === this.widget.selectedMetric,
      )?.yAxisLabel ||
      'Value';

    const ChartManager = window.monitorShared.ChartManager;
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

  getFilteredEntries() {
    const selectedNode = this.widget.selectedNode;
    if (!selectedNode || selectedNode === 'all') {
      return this.widget.transformedEntries;
    }
    return this.widget.transformedEntries.filter(
      (entry) => entry._source === selectedNode,
    );
  }

  getFilteredSources() {
    const selectedNode = this.widget.selectedNode;
    if (!selectedNode || selectedNode === 'all') {
      return this.widget.sources;
    }
    return [selectedNode];
  }

  createChartData(entries, selectedItem, dataFormatter) {
    const group = this.widget.schema.computed.find(
      (group) => group.group === selectedItem,
    );
    const metricMatch = this.widget.schema.metrics.find(
      (metric) => metric.field === selectedItem,
    );
    const metricsToChart = group
      ? group.fields
      : metricMatch
        ? [metricMatch]
        : [];
    const ChartManager = window.monitorShared.ChartManager;
    const filteredSources = this.getFilteredSources();
    if (filteredSources && filteredSources.length > 1) {
      return this.createMergedChartData(
        entries,
        metricsToChart,
        dataFormatter,
        filteredSources,
      );
    }

    const chronological = entries.slice();
    const labels = chronological.map((row) =>
      dataFormatter.formatTime(row.timestamp),
    );
    const datasets = [];
    const allValues = [];
    const curve = this.widget.config?.chart?.curve || {
      fill: true,
      interpolation: 0.3,
      ghosts: true,
    };

    for (const metric of metricsToChart) {
      const values = chronological.map(
        (row) => parseFloat(row[metric.field]) || 0,
      );

      if (curve.ghosts) {
        const ghosted = ChartManager.buildGhostedDatasets({
          label: metric.label,
          color: metric.color,
          rawValues: values,
        }).map((dataset) => ({
          ...dataset,
          tension: curve.interpolation,
          _seriesLabel: metric.label,
        }));
        datasets.push(...ghosted);
      } else {
        const backgroundColor = curve.fill ? `${metric.color}33` : undefined;
        datasets.push({
          label: metric.label,
          data: values,
          borderColor: metric.color,
          backgroundColor,
          borderWidth: 2,
          pointRadius: 0,
          tension: curve.interpolation,
          _seriesLabel: metric.label,
        });
      }

      allValues.push(...values);
    }

    return { labels, datasets, allValues };
  }

  getSourceColors() {
    const computedStyle = getComputedStyle(document.documentElement);
    return [
      computedStyle.getPropertyValue('--chart-series-1').trim(),
      computedStyle.getPropertyValue('--chart-series-2').trim(),
      computedStyle.getPropertyValue('--chart-series-3').trim(),
      computedStyle.getPropertyValue('--chart-series-4').trim(),
      computedStyle.getPropertyValue('--chart-series-5').trim(),
      computedStyle.getPropertyValue('--chart-series-6').trim(),
    ];
  }

  createMergedChartData(entries, metricsToChart, dataFormatter, sources) {
    const sourceColors = this.getSourceColors();
    const entriesBySource = {};

    for (const row of entries) {
      const source = row._source || 'unknown';
      if (!entriesBySource[source]) {
        entriesBySource[source] = [];
      }
      entriesBySource[source].push(row);
    }

    const allTimestamps = new Set();
    for (const rows of Object.values(entriesBySource)) {
      for (const row of rows) {
        allTimestamps.add(row.timestamp);
      }
    }
    const sortedTimestamps = Array.from(allTimestamps).sort();
    const labels = sortedTimestamps.map((timestamp) =>
      dataFormatter.formatTime(timestamp),
    );

    const datasets = [];
    const allValues = [];

    sources.forEach((source, sourceIndex) => {
      const sourceRows = entriesBySource[source] || [];
      const timestampMap = {};
      for (const row of sourceRows) {
        timestampMap[row.timestamp] = row;
      }

      const color = sourceColors[sourceIndex % sourceColors.length];

      for (const metric of metricsToChart) {
        const values = sortedTimestamps.map((timestamp) => {
          const row = timestampMap[timestamp];
          return row ? parseFloat(row[metric.field]) || 0 : null;
        });

        const label = `${source}: ${metric.label}`;

        datasets.push({
          label,
          data: values,
          borderColor: color,
          backgroundColor: `${color}33`,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          spanGaps: true,
          _seriesLabel: label,
        });
        allValues.push(...values.filter((value) => value !== null));
      }
    });

    return { labels, datasets, allValues };
  }

  renderLegend(datasets) {
    const legend = this.widget.getElement('chart-legend');
    if (!legend) return;

    const ChartLegend = window.monitorShared?.ChartLegend;
    const chart = this.widget.chartManager?.chart;
    if (!ChartLegend || !chart) {
      legend.innerHTML = '';
      return;
    }

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

    const toggleSeries = (label) => {
      const entry = seriesMap.get(label);
      if (!entry) return;
      const anyVisible = entry.indexes.some((index) =>
        chart.isDatasetVisible(index),
      );
      entry.indexes.forEach((index) => {
        chart.setDatasetVisibility(index, !anyVisible);
      });
      chart.update();
      this.renderLegend(chart.data.datasets || []);
    };

    ChartLegend.createMetricLegend(legend, series, {
      activeMetrics,
      onToggle: toggleSeries,
    });
  }
}

window.MetricsChart = MetricsChart;
