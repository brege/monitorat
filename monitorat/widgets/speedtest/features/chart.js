class SpeedtestChart {
  constructor (widget) {
    this.widget = widget
  }

  initializeManager () {
    const ChartManager = window.monitorShared?.ChartManager
    const axes = this.widget.schema?.axes && Object.keys(this.widget.schema.axes).length > 0 ? this.widget.schema.axes : {}
    const scales = ChartManager.buildScalesFromSchema(axes)

    this.widget.chartManager = new ChartManager({
      canvasElement: this.widget.getElement('chart'),
      containerElement: this.widget.getElement('chart-container'),
      height: this.widget.config.chart.height,
      dataUrl: null,
      dataParams: null,
      chartOptions: { scales }
    })
  }

  async loadChartData () {
    if (!this.widget.chartManager) return
    await this.widget.chartManager.ensureChart()
    try {
      const searchParameters = new URLSearchParams()
      searchParameters.set('period', this.widget.selectedPeriod)
      searchParameters.set('ts', Date.now())
      const response = await fetch(`${this.widget.getApiBase()}/chart?${searchParameters.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      this.widget.chartEntries = payload.entries || []
      this.update()
    } catch (error) {
      console.error('Speedtest chart load failed:', error)
    }
  }

  update () {
    if (!this.widget.chartManager?.hasChart()) return
    const ChartManager = window.monitorShared?.ChartManager
    const DataFormatter = window.monitorShared?.DataFormatter
    const labels = this.widget.chartEntries.map(entry => DataFormatter.formatTime(entry.timestamp))
    const datasets = []
    const metricsToUse = this.widget.selectedMetric === 'all'
      ? this.widget.metricFields
      : this.widget.metricFields.filter(metric => metric.field === this.widget.selectedMetric)

    for (const metric of metricsToUse) {
      const values = this.widget.chartEntries.map((entry) => {
        const raw = entry[metric.field]
        if (raw === null || raw === undefined) return null
        const numeric = Number(raw)
        if (!Number.isFinite(numeric)) return null
        if (metric.format === 'mbps') {
          return Number((numeric / 1_000_000).toFixed(metric.decimals ?? 2))
        }
        if (metric.format === 'ping') {
          return Number(numeric.toFixed(metric.decimals ?? 1))
        }
        return numeric
      })

      const color = metric.color
      const backgroundAlpha = this.widget.schema?.chart?.backgroundAlpha ?? 0.1
      const backgroundColor = ChartManager.withAlpha(color, backgroundAlpha)

      datasets.push({
        label: metric.label || metric.field,
        data: values,
        borderColor: color,
        backgroundColor,
        tension: this.widget.schema?.chart?.tension ?? 0.1,
        yAxisID: metric.yAxisID
      })
    }

    this.widget.chartManager.updateChart({ labels, datasets })
  }

  updateView () {
    this.loadChartData()
  }
}

window.SpeedtestChart = SpeedtestChart
