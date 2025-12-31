class MetricsTable {
  constructor (widget) {
    this.widget = widget
  }

  initializeManager () {
    this.widget.tableManager = this.widget.createTableManager()
  }

  rebuildHeaders () {
    const metadataLabel = this.widget.schema?.metadata?.label || 'Source'
    const TableManager = window.monitorShared.TableManager
    TableManager.buildTableHeaders(this.widget.container, this.widget.metricFields, metadataLabel)
  }

  async loadHistory () {
    this.widget.tableManager.setEntries([])
    this.widget.tableManager.setStatus('Loading metrics history…')

    try {
      const requestAddress = new URL(`api/${this.widget.apiPrefix}/history`, window.location)
      if (this.widget.selectedPeriod && this.widget.selectedPeriod !== 'all') {
        requestAddress.searchParams.set('period', this.widget.selectedPeriod)
      }
      requestAddress.searchParams.set('ts', Date.now())

      const response = await fetch(requestAddress, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const payload = await response.json()
      const data = payload.data || []
      this.widget.sources = payload.sources || null
      this.widget.entries = data
      this.widget.transformedEntries = this.calculateTableDeltas(this.widget.entries)

      const tableLimit = Number.isFinite(this.widget.config.table?.max) ? this.widget.config.table.max : this.widget.defaults.table.max
      const tableEntries = this.widget.transformedEntries.slice(-tableLimit).reverse()
      this.widget.tableManager.setEntries(tableEntries)
      this.widget.updateViewToggle(tableEntries.length > 0)

      if (this.widget.chartManager?.hasChart()) this.widget.updateChart()
    } catch (error) {
      console.error('Metrics history API call failed:', error)
      this.widget.tableManager.setStatus(`Unable to load metrics history: ${error.message}`)
    }
  }

  calculateTableDeltas (data) {
    const result = []
    const previousBySource = {}

    for (const row of data) {
      const sourceKey = row._source || ''
      const entry = {
        timestamp: row.timestamp,
        source: row.source || '',
        _source: row._source || ''
      }

      for (const metric of this.widget.metricFields) {
        if (metric.source) {
          entry[metric.field] = 0
        } else {
          entry[metric.field] = parseFloat(row[metric.field]) || 0
        }
      }

      const previousRow = previousBySource[sourceKey]
      if (previousRow) {
        const timeDelta = (new Date(row.timestamp) - new Date(previousRow.timestamp)) / 60000
        if (timeDelta > 0) {
          for (const metric of this.widget.metricFields) {
            if (metric.source) {
              const current = parseFloat(row[metric.source]) || 0
              const previous = parseFloat(previousRow[metric.source]) || 0
              entry[metric.field] = Math.max(0, (current - previous) / timeDelta)
            }
          }
        }
      }

      result.push(entry)
      previousBySource[sourceKey] = row
    }

    return result
  }
}

window.MetricsTable = MetricsTable
