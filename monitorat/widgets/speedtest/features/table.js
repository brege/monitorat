class SpeedtestTable {
  constructor (widget) {
    this.widget = widget
  }

  initializeManager () {
    this.widget.tableManager = this.widget.createTableManager()
  }

  rebuildHeaders () {
    this.widget.rebuildTableHeaders()
  }

  async loadHistory () {
    this.widget.tableManager.setEntries([])
    this.widget.tableManager.setStatus('Loading speedtest history…')

    try {
      const searchParameters = new URLSearchParams()
      searchParameters.set('limit', this.widget.config.table.max)
      searchParameters.set('ts', Date.now())

      const response = await fetch(`${this.widget.getApiBase()}/history?${searchParameters.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      this.widget.entries = payload.entries || []
      this.widget.tableManager.setEntries(this.widget.entries)
      this.widget.updateViewToggle(this.widget.entries.length > 0)
      await this.widget.features.chart.loadChartData()
    } catch (error) {
      console.error('Speedtest history failed:', error)
      this.widget.tableManager.setStatus(`Unable to load speedtests: ${error.message}`)
    }
  }
}

window.SpeedtestTable = SpeedtestTable
