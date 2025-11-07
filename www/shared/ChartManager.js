/* global Chart */
class ChartManager {
  constructor (config) {
    this.canvasElement = config.canvasElement
    this.containerElement = config.containerElement
    this.height = config.height || '400px'
    this.chartOptions = config.chartOptions || {}
    this.dataUrl = config.dataUrl
    this.dataParams = config.dataParams || {}

    this.chart = null
    this.chartInitPromise = null
  }

  ensureChart () {
    if (this.chart) {
      return Promise.resolve()
    }
    if (this.chartInitPromise) {
      return this.chartInitPromise
    }
    this.chartInitPromise = new Promise((resolve) => {
      const initialize = () => {
        if (!this.canvasElement || !window.Chart) {
          this.chartInitPromise = null
          resolve()
          return
        }
        this.initChart()
        this.chartInitPromise = null
        resolve()
      }

      if (window.Chart) {
        initialize()
      } else {
        const script = document.createElement('script')
        script.src = 'vendors/chart.min.js'
        script.onload = initialize
        script.onerror = () => {
          console.error('Failed to load Chart.js')
          this.chartInitPromise = null
          resolve()
        }
        document.head.appendChild(script)
      }
    })
    return this.chartInitPromise
  }

  initChart () {
    if (!this.canvasElement || !window.Chart) return

    const height = parseInt(this.height)
    this.containerElement.style.height = `${height}px`
    this.containerElement.style.position = 'relative'

    const ctx = this.canvasElement.getContext('2d')
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
    })
  }

  async loadData () {
    if (!this.chart || !this.dataUrl) return

    try {
      const params = new URLSearchParams()
      Object.entries(this.dataParams).forEach(([key, value]) => {
        params.set(key, value)
      })
      params.set('ts', Date.now())

      const response = await fetch(`${this.dataUrl}?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const chartData = await response.json()
      this.chart.data = chartData
      this.chart.update()
    } catch (error) {
      console.error('Failed to load chart data:', error)
    }
  }

  updateChart (data, scales = null) {
    if (!this.chart) return

    this.chart.data = data
    if (scales) {
      this.chart.options.scales = { ...this.chart.options.scales, ...scales }
    }
    this.chart.update()
  }

  hasChart () {
    return !!this.chart
  }

  static calculateDeltas (data, readField, writeField) {
    const result = { read: [], write: [] }
    let prevRead = null; let prevWrite = null; let prevTime = null

    for (const row of data) {
      const currentRead = parseFloat(row[readField])
      const currentWrite = parseFloat(row[writeField])
      const currentTime = new Date(row.timestamp)

      if (prevRead !== null && prevTime !== null) {
        const timeDelta = (currentTime - prevTime) / 60000
        const readRate = timeDelta > 0 ? Math.max(0, (currentRead - prevRead) / timeDelta) : 0
        const writeRate = timeDelta > 0 ? Math.max(0, (currentWrite - prevWrite) / timeDelta) : 0

        result.read.push(Math.min(readRate, 100))
        result.write.push(Math.min(writeRate, 100))
      } else {
        result.read.push(0)
        result.write.push(0)
      }

      prevRead = currentRead
      prevWrite = currentWrite
      prevTime = currentTime
    }

    return result
  }

  static calculateTableDeltas (data) {
    const result = []
    let prevRow = null

    for (const row of data) {
      const entry = {
        timestamp: row.timestamp,
        cpu_percent: parseFloat(row.cpu_percent),
        memory_percent: parseFloat(row.memory_percent),
        load_1min: parseFloat(row.load_1min),
        temp_c: parseFloat(row.temp_c),
        source: row.source || ''
      }

      if (prevRow) {
        const timeDelta = (new Date(row.timestamp) - new Date(prevRow.timestamp)) / 60000

        if (timeDelta > 0) {
          entry.disk_read_rate = Math.max(0, (parseFloat(row.disk_read_mb) - parseFloat(prevRow.disk_read_mb)) / timeDelta)
          entry.disk_write_rate = Math.max(0, (parseFloat(row.disk_write_mb) - parseFloat(prevRow.disk_write_mb)) / timeDelta)
          entry.net_rx_rate = Math.max(0, (parseFloat(row.net_rx_mb) - parseFloat(prevRow.net_rx_mb)) / timeDelta)
          entry.net_tx_rate = Math.max(0, (parseFloat(row.net_tx_mb) - parseFloat(prevRow.net_tx_mb)) / timeDelta)
        } else {
          entry.disk_read_rate = 0
          entry.disk_write_rate = 0
          entry.net_rx_rate = 0
          entry.net_tx_rate = 0
        }
      } else {
        entry.disk_read_rate = 0
        entry.disk_write_rate = 0
        entry.net_rx_rate = 0
        entry.net_tx_rate = 0
      }

      result.push(entry)
      prevRow = row
    }

    return result
  }

  static withAlpha (color, alpha) {
    if (typeof color !== 'string') {
      return color
    }
    const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
    if (!match) {
      return color
    }
    const [, r, g, b] = match
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  static computeMovingAverage (values, windowSize = 3) {
    if (!Array.isArray(values) || values.length === 0) {
      return []
    }

    const halfWindow = Math.max(1, Math.floor(windowSize / 2))
    return values.map((value, index) => {
      if (!Number.isFinite(value)) {
        return value
      }

      let sum = 0
      let count = 0
      for (let offset = -halfWindow; offset <= halfWindow; offset += 1) {
        const sampleIndex = index + offset
        if (sampleIndex < 0 || sampleIndex >= values.length) {
          continue
        }
        const sample = values[sampleIndex]
        if (Number.isFinite(sample)) {
          sum += sample
          count += 1
        }
      }

      if (count === 0) {
        return value
      }

      return sum / count
    })
  }

  static buildGhostedDatasets ({ label, color, rawValues, windowSize = 3 }) {
    const smoothedValues = this.computeMovingAverage(rawValues, windowSize)
    const ghostColor = 'rgba(148, 163, 184, 0.35)'

    return [
      {
        label: `${label} (raw)`,
        data: rawValues,
        borderColor: ghostColor,
        backgroundColor: 'rgba(148, 163, 184, 0.08)',
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHitRadius: 6,
        fill: false,
        tension: 0.15,
        spanGaps: true,
        order: 0
      },
      {
        label,
        data: smoothedValues,
        borderColor: color,
        backgroundColor: this.withAlpha(color, 0.18),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 8,
        fill: true,
        tension: 0.25,
        spanGaps: true,
        order: 1
      }
    ]
  }

  static createMetricsChartData (entries, selectedMetric, DataFormatter) {
    if (!entries || !entries.length) return { labels: [], datasets: [] }

    const chronological = entries.slice()
    const labels = chronological.map(row => DataFormatter.formatTime(row.timestamp))

    let datasets = []
    let allValues = []

    switch (selectedMetric) {
      case 'cpu_memory': {
        const cpuData = chronological.map(row => parseFloat(row.cpu_percent))
        const memoryData = chronological.map(row => parseFloat(row.memory_percent))
        datasets = [
          ...this.buildGhostedDatasets({
            label: 'CPU %',
            color: 'rgb(75, 192, 192)',
            rawValues: cpuData
          }),
          ...this.buildGhostedDatasets({
            label: 'Memory %',
            color: 'rgb(255, 159, 64)',
            rawValues: memoryData
          })
        ]
        allValues = [...cpuData, ...memoryData]
        break
      }

      case 'cpu_percent': {
        const cpuValues = chronological.map(row => parseFloat(row.cpu_percent))
        datasets = this.buildGhostedDatasets({
          label: 'CPU %',
          color: 'rgb(75, 192, 192)',
          rawValues: cpuValues
        })
        allValues = cpuValues
        break
      }

      case 'memory_percent': {
        const memValues = chronological.map(row => parseFloat(row.memory_percent))
        datasets = this.buildGhostedDatasets({
          label: 'Memory %',
          color: 'rgb(255, 159, 64)',
          rawValues: memValues
        })
        allValues = memValues
        break
      }

      case 'disk_io': {
        const diskDeltas = this.calculateDeltas(chronological, 'disk_read_mb', 'disk_write_mb')
        datasets = [
          ...this.buildGhostedDatasets({
            label: 'Read MB/min',
            color: 'rgb(54, 162, 235)',
            rawValues: diskDeltas.read
          }),
          ...this.buildGhostedDatasets({
            label: 'Write MB/min',
            color: 'rgb(255, 99, 132)',
            rawValues: diskDeltas.write
          })
        ]
        allValues = [...diskDeltas.read, ...diskDeltas.write]
        break
      }

      case 'net_io': {
        const netDeltas = this.calculateDeltas(chronological, 'net_rx_mb', 'net_tx_mb')
        datasets = [
          ...this.buildGhostedDatasets({
            label: 'RX MB/min',
            color: 'rgb(75, 192, 192)',
            rawValues: netDeltas.read
          }),
          ...this.buildGhostedDatasets({
            label: 'TX MB/min',
            color: 'rgb(255, 159, 64)',
            rawValues: netDeltas.write
          })
        ]
        allValues = [...netDeltas.read, ...netDeltas.write]
        break
      }

      case 'temp_c': {
        const tempValues = chronological.map(row => parseFloat(row.temp_c))
        datasets = this.buildGhostedDatasets({
          label: 'Temperature (°C)',
          color: 'rgb(255, 99, 132)',
          rawValues: tempValues
        })
        allValues = tempValues
        break
      }

      case 'load_1min': {
        const loadValues = chronological.map(row => parseFloat(row.load_1min))
        datasets = this.buildGhostedDatasets({
          label: 'Load Average',
          color: 'rgb(153, 102, 255)',
          rawValues: loadValues
        })
        allValues = loadValues
        break
      }
    }

    return { labels, datasets, allValues }
  }

  static getMetricsYAxisLabel (selectedMetric) {
    switch (selectedMetric) {
      case 'cpu_memory':
      case 'cpu_percent':
      case 'memory_percent':
        return 'Percentage'
      case 'disk_io':
      case 'net_io':
        return 'MB/min'
      case 'temp_c':
        return 'Temperature (°C)'
      case 'load_1min':
        return 'Load Average'
      default:
        return 'Value'
    }
  }

  static filterDataByPeriod (data, period) {
    // Filtering is now done server-side, return data as-is
    return data
  }

  static setView (view, elements, currentView, chartManager, onChartReady) {
    const targetView = view === 'table' ? 'table' : view === 'none' ? 'none' : 'chart'
    if (currentView === targetView) {
      return targetView
    }

    if (targetView === 'none') {
      if (elements.viewToggle) elements.viewToggle.style.display = 'none'
      if (elements.chartContainer) elements.chartContainer.style.display = 'none'
      if (elements.tableContainer) elements.tableContainer.style.display = 'none'
      return targetView
    }

    if (elements.viewToggle) elements.viewToggle.style.display = ''

    if (targetView === 'chart') {
      if (elements.chartContainer) elements.chartContainer.style.display = ''
      if (elements.tableContainer) elements.tableContainer.style.display = 'none'
      if (elements.viewChart) elements.viewChart.classList.add('active')
      if (elements.viewTable) elements.viewTable.classList.remove('active')
      if (chartManager) {
        chartManager.ensureChart().then(() => {
          if (chartManager.hasChart() && targetView === 'chart') {
            if (onChartReady) {
              onChartReady()
            } else {
              chartManager.loadData()
            }
          }
        })
      }
    } else {
      if (elements.chartContainer) elements.chartContainer.style.display = 'none'
      if (elements.tableContainer) elements.tableContainer.style.display = ''
      if (elements.viewChart) elements.viewChart.classList.remove('active')
      if (elements.viewTable) elements.viewTable.classList.add('active')
    }

    return targetView
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.ChartManager = ChartManager
