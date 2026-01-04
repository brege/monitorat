const NET_TOLERANCE_MS = 90 * 1000
const NET_MINUTE_MS = 60 * 1000
const NET_HOUR_MS = 60 * NET_MINUTE_MS
const NET_DAY_MS = 24 * NET_HOUR_MS
const MONTH_INDEX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

function parseNaturalTime (timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null

  const normalized = timeStr.trim().toLowerCase()
  const timePattern = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/
  const match = normalized.match(timePattern)

  if (!match) return null

  const [, amountStr, unit] = match
  const amount = parseFloat(amountStr)

  if (isNaN(amount) || amount <= 0) return null

  const multipliers = {
    s: 1000,
    sec: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000
  }

  const multiplier = multipliers[unit]
  if (!multiplier) return null

  return Math.round(amount * multiplier)
}

class NetworkWidget {
  constructor (config = {}) {
    this.container = null
    this.config = mergeNetworkConfig(config)
    this.periodsConfig = this.config.uptime?.periods || []
    // mergeNetworkConfig guarantees chirper.interval_seconds exists
    const intervalSeconds = this.config.chirper.interval_seconds
    this.expectedIntervalMs = intervalSeconds * 1000
    this.minutesPerCheck = this.expectedIntervalMs / 60000
    this.state = {
      entries: [],
      analysis: null,
      alertsExpanded: false,
      logFingerprint: null
    }
    this.elements = {}
    this.features = {
      snapshot: null,
      uptime: null,
      outages: null
    }
    this.uptimeCache = {
      rows: new Map()
    }
    this.helpers = {
      formatDateTime,
      formatDuration,
      formatNumber,
      formatPercent,
      applySegmentClasses,
      buildSegmentTooltip
    }
  }

  getApiBase () {
    return this.config._apiPrefix ? `api/${this.config._apiPrefix}` : 'api/network'
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }

    const response = await fetch('widgets/network/index.html')
    const html = await response.text()
    container.innerHTML = html

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name
      })
    }

    await this.loadFeatureScripts()
    this.cacheElements()
    this.initializeFeatures()
    this.applySectionVisibility()
    this.attachEvents()
    await this.loadLog()
  }

  cacheElements () {
    this.elements = {
      logStatus: this.container.querySelector('[data-network="log-status"]'),
      uptimeRows: this.container.querySelector('[data-network="uptime-rows"]'),
      alertList: this.container.querySelector('[data-network="alerts-list"]'),
      alertToggle: this.container.querySelector('[data-network="alerts-toggle"]'),
      sections: {
        metrics: this.container.querySelector('[data-network-section="metrics"]'),
        uptime: this.container.querySelector('[data-network-section="uptime"]'),
        alerts: this.container.querySelector('[data-network-section="alerts"]')
      },
      summary: {
        uptime: this.container.querySelector('[data-network="summary-uptime"]'),
        total: this.container.querySelector('[data-network="summary-total"]'),
        expected: this.container.querySelector('[data-network="summary-expected"]'),
        missed: this.container.querySelector('[data-network="summary-missed"]'),
        first: this.container.querySelector('[data-network="summary-first"]'),
        last: this.container.querySelector('[data-network="summary-last"]')
      }
    }
  }

  applySectionVisibility () {
    const FeatureVisibility = window.monitorShared.FeatureVisibility

    const showConfig = {
      tiles: this.config.show?.tiles !== false && this.config.metrics.show,
      uptime: this.config.show?.uptime !== false && this.config.uptime.show,
      outages: this.config.show?.outages !== false && this.config.alerts.show
    }

    FeatureVisibility.apply(this.container, showConfig, {
      tiles: this.elements.sections.metrics,
      uptime: this.elements.sections.uptime,
      outages: this.elements.sections.alerts
    })
  }

  attachEvents () {
    if (this.elements.alertToggle) {
      this.elements.alertToggle.addEventListener('click', () => {
        this.state.alertsExpanded = !this.state.alertsExpanded
        this.features.outages.render()
      })
    }

    if (this.elements.logStatus) {
      this.elements.logStatus.addEventListener('click', (e) => {
        e.preventDefault()
        this.downloadLog()
      })
    }
  }

  async loadLog () {
    const mergeSources = this.config.federation?.merge
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedLogs(mergeSources)
    } else {
      await this.loadSingleLog()
    }
  }

  async loadSingleLog () {
    setText(this.elements.logStatus, 'Loading log…')

    if (!this.config.log_file) {
      this.state.alertsExpanded = false
      setText(this.elements.logStatus, 'No log file configured.')
      this.state.entries = []
      this.state.analysis = analyzeEntries([], this.periodsConfig, this.expectedIntervalMs, this.resolveNowOverride())
      this.state.logFingerprint = null
      this.renderAll()
      return
    }

    try {
      const response = await fetch(`${this.getApiBase()}/log?${Date.now()}`, { cache: 'no-store' })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const text = await response.text()
      const fingerprint = computeLogFingerprint(text)

      if (fingerprint === this.state.logFingerprint) {
        const label = this.state.entries.length
          ? `${this.state.entries.length.toLocaleString()} log entries (no changes).`
          : 'No log entries found yet.'
        setText(this.elements.logStatus, label)
        return
      }

      this.state.logFingerprint = fingerprint
      this.state.entries = parseLog(text)
      this.state.analysis = analyzeEntries(
        this.state.entries,
        this.periodsConfig,
        this.expectedIntervalMs,
        this.resolveNowOverride()
      )
      this.state.alertsExpanded = false
      this.renderAll()

      if (this.state.entries.length) {
        setText(this.elements.logStatus, `Loaded ${this.state.entries.length.toLocaleString()} log entries.`)
      } else {
        setText(this.elements.logStatus, 'No log entries found.')
      }
    } catch (error) {
      console.error('Network log API call failed:', error)
      setText(this.elements.logStatus, `Unable to load log: ${error.message}`)
      this.state.alertsExpanded = false
      this.state.entries = []
      this.state.analysis = analyzeEntries([], this.periodsConfig, this.expectedIntervalMs, this.resolveNowOverride())
      this.state.logFingerprint = null
      this.renderAll()
    }
  }

  async loadMergedLogs (sources) {
    setText(this.elements.logStatus, 'Loading logs…')

    this.state.sources = sources
    this.state.sourceStates = {}

    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/network-${source}/log?${Date.now()}`, { cache: 'no-store' })
          if (!response.ok) {
            console.warn(`Failed to fetch network log from ${source}: HTTP ${response.status}`)
            return { source, entries: [], analysis: null, error: `HTTP ${response.status}` }
          }
          const text = await response.text()
          const entries = parseLog(text)
          const isDemoEnabled = window.monitor?.demoEnabled === true
          let nowOverride = null
          if (isDemoEnabled && entries.length > 0) {
            const lastEntry = entries[entries.length - 1]
            nowOverride = new Date(lastEntry.timestamp.getTime() + NET_MINUTE_MS)
          }
          const analysis = analyzeEntries(entries, this.periodsConfig, this.expectedIntervalMs, nowOverride)
          return { source, entries, analysis, error: null }
        } catch (error) {
          console.warn(`Failed to fetch network log from ${source}:`, error.message)
          return { source, entries: [], analysis: null, error: error.message }
        }
      })
    )

    let totalEntries = 0
    for (const result of results) {
      this.state.sourceStates[result.source] = {
        entries: result.entries,
        analysis: result.analysis,
        error: result.error
      }
      totalEntries += result.entries.length
    }

    this.state.alertsExpanded = false
    this.renderAllMerged()

    if (totalEntries) {
      setText(this.elements.logStatus, `Loaded ${totalEntries.toLocaleString()} log entries from ${sources.length} sources.`)
    } else {
      setText(this.elements.logStatus, 'No log entries found.')
    }
  }

  downloadLog () {
    if (!this.config.log_file) {
      return
    }
    const logFilename = this.config.log_file.split('/').pop()
    const link = document.createElement('a')
    link.href = `${this.getApiBase()}/log?${Date.now()}`
    link.download = logFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async loadFeatureScripts () {
    const featureScripts = [
      { globalName: 'NetworkSnapshot', source: 'widgets/network/features/snapshot.js' },
      { globalName: 'NetworkUptime', source: 'widgets/network/features/uptime.js' },
      { globalName: 'NetworkOutages', source: 'widgets/network/features/outages.js' }
    ]

    await window.monitorShared.loadFeatureScripts(featureScripts)
  }

  initializeFeatures () {
    const SnapshotFeature = window.NetworkSnapshot
    const UptimeFeature = window.NetworkUptime
    const OutagesFeature = window.NetworkOutages

    if (!SnapshotFeature || !UptimeFeature || !OutagesFeature) {
      throw new Error('Network feature scripts not loaded')
    }

    this.features.snapshot = new SnapshotFeature(this)
    this.features.uptime = new UptimeFeature(this)
    this.features.outages = new OutagesFeature(this)
  }

  renderAll () {
    this.features.snapshot.render()
    this.features.uptime.render()
    this.features.outages.render()
  }

  renderAllMerged () {
    const sources = this.state.sources || []
    const sourceStates = this.state.sourceStates || {}

    this.renderMergedSnapshot(sources, sourceStates)
    this.renderMergedUptime(sources, sourceStates)
    this.renderMergedOutages(sources, sourceStates)
  }

  renderMergedSnapshot (sources, sourceStates) {
    const showTiles = this.config.show?.tiles !== false && this.config.metrics.show
    if (!showTiles) return

    const container = this.elements.sections.metrics
    if (!container) return

    const existingStats = container.querySelectorAll('.stats-row')
    existingStats.forEach(row => { row.style.display = 'none' })

    let mergedContainer = container.querySelector('.federation-merged-snapshots')
    if (!mergedContainer) {
      mergedContainer = document.createElement('div')
      mergedContainer.className = 'federation-merged-snapshots'
      container.appendChild(mergedContainer)
    }
    mergedContainer.innerHTML = ''

    const displayStrategy = this.config.federation?.display?.tiles || 'columnate'

    if (displayStrategy === 'columnate') {
      this.renderSnapshotColumnated(mergedContainer, sources, sourceStates)
    } else {
      this.renderSnapshotStacked(mergedContainer, sources, sourceStates)
    }
  }

  renderSnapshotColumnated (container, sources, sourceStates) {
    const columns = document.createElement('div')
    columns.className = 'federation-columns network-tile-columns'

    for (const source of sources) {
      const sourceState = sourceStates[source]
      const analysis = sourceState?.analysis

      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('div')
      header.className = 'federation-source-header'
      header.textContent = source
      column.appendChild(header)

      const tiles = this.createSnapshotTiles(analysis)
      column.appendChild(tiles)

      columns.appendChild(column)
    }

    container.appendChild(columns)
  }

  renderSnapshotStacked (container, sources, sourceStates) {
    for (const source of sources) {
      const sourceState = sourceStates[source]
      const analysis = sourceState?.analysis

      const section = document.createElement('div')
      section.className = 'federation-stack-section'

      const header = document.createElement('div')
      header.className = 'federation-source-header'
      header.textContent = source
      section.appendChild(header)

      const tiles = this.createSnapshotTiles(analysis)
      section.appendChild(tiles)

      container.appendChild(section)
    }
  }

  createSnapshotTiles (analysis) {
    const TileRenderer = window.monitorShared.TileRenderer

    return TileRenderer.createTilesFromSpec({
      containerClass: 'stats',
      rows: [
        {
          className: 'stats-row primary',
          tiles: [
            { label: 'Uptime', value: analysis?.uptimeText || '–' },
            { label: 'Checks Logged', value: analysis?.entries?.length ? this.helpers.formatNumber(analysis.entries.length) : '–' },
            { label: 'Checks Expected', value: analysis?.expectedChecks ? this.helpers.formatNumber(analysis.expectedChecks) : '–' },
            { label: 'Missed Checks', value: analysis?.missedChecks !== undefined ? this.helpers.formatNumber(analysis.missedChecks) : '–' }
          ]
        },
        {
          className: 'stats-row dates',
          tiles: [
            { label: 'First Entry', value: analysis?.firstEntry ? this.helpers.formatDateTime(analysis.firstEntry) : '–' },
            { label: 'Most Recent', value: analysis?.lastEntry ? this.helpers.formatDateTime(analysis.lastEntry) : '–' }
          ]
        }
      ]
    })
  }

  renderMergedUptime (sources, sourceStates) {
    const showUptime = this.config.show?.uptime !== false && this.config.uptime.show
    if (!showUptime || !this.elements.uptimeRows) return

    const container = this.elements.uptimeRows
    container.innerHTML = ''

    const displayStrategy = this.config.federation?.display?.uptime || 'columnate'

    if (displayStrategy === 'columnate') {
      this.renderUptimeColumnated(container, sources, sourceStates)
    } else {
      this.renderUptimeStacked(container, sources, sourceStates)
    }
  }

  renderUptimeColumnated (container, sources, sourceStates) {
    const allPeriodLabels = new Set()
    for (const source of sources) {
      const stats = sourceStates[source]?.analysis?.windowStats || []
      for (const stat of stats) {
        allPeriodLabels.add(stat.label)
      }
    }

    for (const periodLabel of allPeriodLabels) {
      const periodRow = document.createElement('div')
      periodRow.className = 'uptime-item federation-uptime-period'

      const columns = document.createElement('div')
      columns.className = 'federation-columns network-uptime-columns'

      for (const source of sources) {
        const sourceState = sourceStates[source]
        const stats = sourceState?.analysis?.windowStats || []
        const stat = stats.find(s => s.label === periodLabel)

        const column = document.createElement('div')
        column.className = 'federation-column'

        const headerRow = document.createElement('div')
        headerRow.className = 'uptime-column-header'

        const sourceLabel = document.createElement('span')
        sourceLabel.className = 'federation-source-label'
        sourceLabel.textContent = source

        const periodLabelElement = document.createElement('span')
        periodLabelElement.className = 'uptime-period-label'
        periodLabelElement.textContent = periodLabel

        headerRow.appendChild(sourceLabel)
        headerRow.appendChild(periodLabelElement)
        column.appendChild(headerRow)

        if (!stat) {
          const info = document.createElement('p')
          info.className = 'muted'
          info.textContent = sourceState?.error || 'No data'
          column.appendChild(info)
        } else {
          const pillRow = this.createUptimePillRow(stat)
          column.appendChild(pillRow)
        }

        columns.appendChild(column)
      }

      periodRow.appendChild(columns)
      container.appendChild(periodRow)
    }
  }

  renderUptimeStacked (container, sources, sourceStates) {
    for (const source of sources) {
      const sourceState = sourceStates[source]
      const analysis = sourceState?.analysis
      const stats = analysis?.windowStats || []

      const section = document.createElement('div')
      section.className = 'federation-stack-section'

      const header = document.createElement('div')
      header.className = 'federation-source-header'
      header.textContent = source
      section.appendChild(header)

      if (!stats.length) {
        const info = document.createElement('p')
        info.className = 'muted'
        info.textContent = sourceState?.error || 'No log data available.'
        section.appendChild(info)
      } else {
        for (const stat of stats) {
          const row = this.createUptimeRow(stat)
          section.appendChild(row)
        }
      }

      container.appendChild(section)
    }
  }

  createUptimeRow (stat) {
    const row = document.createElement('div')
    row.className = 'uptime-item'
    row.innerHTML = `
      <div class="uptime-row">
        <div class="uptime-label">${stat.label}</div>
        <div class="uptime-pills" style="grid-template-columns: repeat(${Math.max(1, stat.segments.length)}, minmax(0, 1fr));">
          ${stat.segments.map(segment => {
            const statusClass = this.getSegmentClass(segment)
            return `<div class="uptime-pill ${statusClass}" title="${this.helpers.buildSegmentTooltip(stat.label, segment, this.expectedIntervalMs)}"></div>`
          }).join('')}
        </div>
        <div class="uptime-value">${this.helpers.formatPercent(stat.uptime)}</div>
      </div>
    `
    return row
  }

  createUptimePillRow (stat) {
    const wrapper = document.createElement('div')
    wrapper.className = 'uptime-pill-wrapper'

    const pills = document.createElement('div')
    pills.className = 'uptime-pills'
    pills.style.gridTemplateColumns = `repeat(${Math.max(1, stat.segments.length)}, minmax(0, 1fr))`

    for (const segment of stat.segments) {
      const pill = document.createElement('div')
      pill.className = `uptime-pill ${this.getSegmentClass(segment)}`
      pill.title = this.helpers.buildSegmentTooltip(stat.label, segment, this.expectedIntervalMs)
      pills.appendChild(pill)
    }

    const value = document.createElement('div')
    value.className = 'uptime-value'
    value.textContent = this.helpers.formatPercent(stat.uptime)

    wrapper.appendChild(pills)
    wrapper.appendChild(value)
    return wrapper
  }

  getSegmentClass (segment) {
    if (segment.available === 0) return 'future'
    if (!segment.expected) return 'idle'
    if (segment.status === 'systemDown') return 'bad'
    if (segment.status === 'connectionFailure') return 'warn'
    return 'ok'
  }

  renderMergedOutages (sources, sourceStates) {
    const showOutages = this.config.show?.outages !== false && this.config.alerts.show
    if (!showOutages || !this.elements.alertList) return

    const displayStrategy = this.config.federation?.display?.outages || 'merge'

    if (displayStrategy === 'stack') {
      this.renderMergedOutagesStacked(sources, sourceStates)
    } else if (displayStrategy === 'columnate') {
      this.renderMergedOutagesColumnated(sources, sourceStates)
    } else {
      this.renderMergedOutagesCombined(sources, sourceStates)
    }
  }

  renderMergedOutagesCombined (sources, sourceStates) {
    const list = this.elements.alertList
    list.innerHTML = ''

    const allAlerts = []
    for (const source of sources) {
      const sourceState = sourceStates[source]
      const analysis = sourceState?.analysis
      if (!analysis?.alerts) continue

      for (const alert of analysis.alerts) {
        if (alert.type === 'outage') {
          const threshold = this.config.alerts.cadenceChecks || 0
          if (alert.missedChecks < threshold) continue
        }
        allAlerts.push({ ...alert, _source: source })
      }
    }

    allAlerts.sort((a, b) => {
      const aTime = a.type === 'ipchange' ? a.timestamp : a.start
      const bTime = b.type === 'ipchange' ? b.timestamp : b.start
      return bTime - aTime
    })

    if (!allAlerts.length) {
      const info = document.createElement('p')
      info.className = 'muted'
      info.textContent = 'No missed intervals detected.'
      list.appendChild(info)
      if (this.elements.alertToggle) this.elements.alertToggle.style.display = 'none'
      return
    }

    const maxVisible = this.state.alertsExpanded ? allAlerts.length : Math.min(this.config.alerts.max, allAlerts.length)
    allAlerts.slice(0, maxVisible).forEach((alert) => {
      const item = document.createElement('div')
      const sourceLabel = `<span class="federation-source-badge">${alert._source}</span>`

      if (alert.type === 'ipchange') {
        item.className = 'alert alert-card ipchange has-badge'
        item.innerHTML = `${sourceLabel} <strong>IP changed</strong> from ${alert.oldIp} to ${alert.newIp} at ${this.helpers.formatDateTime(alert.timestamp)}`
      } else if (alert.type === 'failure') {
        item.className = 'alert alert-card failure has-badge'
        item.innerHTML = `${sourceLabel} <strong>Connection failure</strong> at ${this.helpers.formatDateTime(alert.timestamp)} (${alert.message})`
      } else {
        item.className = 'alert alert-card has-badge'
        if (alert.open) item.classList.add('open')
        const endLabel = alert.open ? 'now' : this.helpers.formatDateTime(alert.end)
        const duration = this.helpers.formatDuration(alert.end.getTime() - alert.start.getTime())
        const countLabel = alert.missedChecks === 1 ? 'check' : 'checks'
        item.innerHTML = `${sourceLabel} <strong>${alert.missedChecks} ${countLabel} missed</strong> from ${this.helpers.formatDateTime(alert.start)} to ${endLabel} (${duration})`
      }
      list.appendChild(item)
    })

    if (this.elements.alertToggle) {
      if (allAlerts.length <= this.config.alerts.max) {
        this.elements.alertToggle.style.display = 'none'
      } else {
        this.elements.alertToggle.style.display = ''
        const remaining = allAlerts.length - this.config.alerts.max
        this.elements.alertToggle.textContent = this.state.alertsExpanded ? 'Show less' : `Show ${remaining} more`
      }
    }
  }

  renderMergedOutagesStacked (sources, sourceStates) {
    const list = this.elements.alertList
    list.innerHTML = ''

    for (const source of sources) {
      const sourceState = sourceStates[source]
      const analysis = sourceState?.analysis

      const section = document.createElement('div')
      section.className = 'federation-stack-section'

      const header = document.createElement('div')
      header.className = 'federation-source-header'
      header.textContent = source
      section.appendChild(header)

      if (!analysis?.entries?.length) {
        const info = document.createElement('p')
        info.className = 'muted'
        info.textContent = sourceState?.error || 'No log entries.'
        section.appendChild(info)
        list.appendChild(section)
        continue
      }

      const filtered = (analysis.alerts || []).filter((alert) => {
        if (alert.type !== 'outage') return true
        const threshold = this.config.alerts.cadenceChecks || 0
        return alert.missedChecks >= threshold
      })

      if (!filtered.length) {
        const info = document.createElement('p')
        info.className = 'muted'
        info.textContent = 'No missed intervals detected.'
        section.appendChild(info)
      } else {
        const reversed = [...filtered].reverse()
        const maxVisible = Math.min(3, reversed.length)
        reversed.slice(0, maxVisible).forEach((alert) => {
          const item = document.createElement('div')
          if (alert.type === 'ipchange') {
            item.className = 'alert alert-card ipchange'
            item.innerHTML = `<strong>IP changed</strong> from ${alert.oldIp} to ${alert.newIp} at ${this.helpers.formatDateTime(alert.timestamp)}`
          } else if (alert.type === 'failure') {
            item.className = 'alert alert-card failure'
            item.innerHTML = `<strong>Connection failure</strong> at ${this.helpers.formatDateTime(alert.timestamp)} (${alert.message})`
          } else {
            item.className = 'alert alert-card'
            if (alert.open) item.classList.add('open')
            const endLabel = alert.open ? 'now' : this.helpers.formatDateTime(alert.end)
            const duration = this.helpers.formatDuration(alert.end.getTime() - alert.start.getTime())
            const countLabel = alert.missedChecks === 1 ? 'check' : 'checks'
            item.innerHTML = `<strong>${alert.missedChecks} ${countLabel} missed</strong> from ${this.helpers.formatDateTime(alert.start)} to ${endLabel} (${duration})`
          }
          section.appendChild(item)
        })
      }

      list.appendChild(section)
    }

    if (this.elements.alertToggle) {
      this.elements.alertToggle.style.display = 'none'
    }
  }

  renderMergedOutagesColumnated (sources, sourceStates) {
    const list = this.elements.alertList
    list.innerHTML = ''

    const columns = document.createElement('div')
    columns.className = 'federation-columns network-outages-columns'

    for (const source of sources) {
      const sourceState = sourceStates[source]
      const analysis = sourceState?.analysis

      const column = document.createElement('div')
      column.className = 'federation-column'

      const header = document.createElement('div')
      header.className = 'federation-source-header'
      header.textContent = source
      column.appendChild(header)

      if (!analysis?.entries?.length) {
        const info = document.createElement('p')
        info.className = 'muted'
        info.textContent = sourceState?.error || 'No log entries.'
        column.appendChild(info)
        columns.appendChild(column)
        continue
      }

      const filtered = (analysis.alerts || []).filter((alert) => {
        if (alert.type !== 'outage') return true
        const threshold = this.config.alerts.cadenceChecks || 0
        return alert.missedChecks >= threshold
      })

      if (!filtered.length) {
        const info = document.createElement('p')
        info.className = 'muted'
        info.textContent = 'No missed intervals detected.'
        column.appendChild(info)
      } else {
        const reversed = [...filtered].reverse()
        const maxVisible = Math.min(this.config.alerts.max || 3, reversed.length)
        reversed.slice(0, maxVisible).forEach((alert) => {
          column.appendChild(this.createAlertCard(alert))
        })
      }

      columns.appendChild(column)
    }

    list.appendChild(columns)

    if (this.elements.alertToggle) {
      this.elements.alertToggle.style.display = 'none'
    }
  }

  createAlertCard (alert) {
    const item = document.createElement('div')
    if (alert.type === 'ipchange') {
      item.className = 'alert alert-card ipchange'
      item.innerHTML = `<strong>IP changed</strong> from ${alert.oldIp} to ${alert.newIp} at ${this.helpers.formatDateTime(alert.timestamp)}`
    } else if (alert.type === 'failure') {
      item.className = 'alert alert-card failure'
      item.innerHTML = `<strong>Connection failure</strong> at ${this.helpers.formatDateTime(alert.timestamp)} (${alert.message})`
    } else {
      item.className = 'alert alert-card'
      if (alert.open) item.classList.add('open')
      const endLabel = alert.open ? 'now' : this.helpers.formatDateTime(alert.end)
      const duration = this.helpers.formatDuration(alert.end.getTime() - alert.start.getTime())
      const countLabel = alert.missedChecks === 1 ? 'check' : 'checks'
      item.innerHTML = `<strong>${alert.missedChecks} ${countLabel} missed</strong> from ${this.helpers.formatDateTime(alert.start)} to ${endLabel} (${duration})`
    }
    return item
  }

  resolveNowOverride (entries = null) {
    const isDemoEnabled = window.monitor?.demoEnabled === true
    const sourceEntries = entries || this.state.entries
    if (!isDemoEnabled || !sourceEntries?.length) {
      return null
    }
    const lastEntry = sourceEntries[sourceEntries.length - 1]
    return new Date(lastEntry.timestamp.getTime() + NET_MINUTE_MS)
  }
}

function mergeNetworkConfig (config) {
  const cfg = config || {}
  const intervalSeconds = cfg.chirper?.interval_seconds
  const minutesPerCheck = (intervalSeconds * 1000) / 60000
  const cadenceRaw = Number(cfg.alerts?.cadence)
  const cadenceMinutes = Number.isFinite(cadenceRaw) ? Math.max(0, cadenceRaw) : 0
  const cadenceChecks = Math.max(0, Math.ceil(cadenceMinutes / minutesPerCheck))

  return {
    ...cfg,
    alerts: {
      ...cfg.alerts,
      cadenceChecks
    }
  }
}

function parseLog (text) {
  const entries = []
  const lines = text.split(/\r?\n/)
  const detectedPattern = /^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+[^\s]+\s+[^\s]+(?:\[\d+\])?:\s+[A-Z]+:\s+(?:\[[^\]]+\]>\s+)?detected IPv4 address\s+([0-9.]+)/i
  const failedPattern = /^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+[^\s]+\s+[^\s]+(?:\[\d+\])?:\s+FAILED:\s+(.*)$/i
  let lastIp = null

  for (const line of lines) {
    if (line.includes('detected IPv4 address')) {
      const match = line.match(detectedPattern)
      if (!match) continue
      const timestamp = parseTimestamp(match[1])
      if (!timestamp) continue
      lastIp = match[2].trim()
      entries.push({ timestamp, ip: lastIp })
      continue
    }
    if (line.includes('FAILED:')) {
      const match = line.match(failedPattern)
      if (!match) continue
      const timestamp = parseTimestamp(match[1])
      if (!timestamp) continue
      if (!lastIp) continue
      const message = normalizeFailureMessage(match[2].trim())
      entries.push({ timestamp, ip: lastIp, failure: true, message })
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp)
  return entries
}

function normalizeFailureMessage (message) {
  let cleaned = message.replace(/^\[[^\]]+]>\s*/, '')
  cleaned = cleaned.replace(/^updating\s+[^:]+:\s*/i, '')
  return cleaned || message
}

function computeLogFingerprint (text) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return `${text.length}:${hash}`
}

function parseTimestamp (label) {
  if (!label) return null
  const normalized = label.replace(/\s+/g, ' ').trim()
  const match = normalized.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null

  const [, monthName, dayStr, hourStr, minuteStr, secondStr] = match
  const monthIndex = MONTH_INDEX[monthName]
  if (monthIndex === undefined) return null

  const day = parseInt(dayStr, 10)
  const hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  const second = parseInt(secondStr, 10)
  if ([day, hour, minute, second].some(Number.isNaN)) return null

  const now = new Date()
  const halfYearMs = 182 * NET_DAY_MS
  let candidate = new Date(now.getFullYear(), monthIndex, day, hour, minute, second)

  if (candidate.getTime() - now.getTime() > halfYearMs) {
    candidate = new Date(now.getFullYear() - 1, monthIndex, day, hour, minute, second)
  } else if (now.getTime() - candidate.getTime() > halfYearMs && monthIndex > now.getMonth()) {
    candidate = new Date(now.getFullYear() - 1, monthIndex, day, hour, minute, second)
  }

  return Number.isNaN(candidate.getTime()) ? null : candidate
}

function analyzeEntries (entries, periodsConfig, expectedIntervalMs, nowOverride = null) {
  if (!entries.length) {
    const now = nowOverride || new Date()
    return {
      entries: [],
      alerts: [],
      missedChecks: 0,
      expectedChecks: 0,
      uptimeValue: null,
      uptimeText: '–',
      firstEntry: null,
      lastEntry: null,
      windowStats: computeWindowStats([], [], now, periodsConfig, expectedIntervalMs, [])
    }
  }

  const alerts = []
  let missed = 0
  const slotNumbers = buildSlotNumbers(entries, expectedIntervalMs)

  for (let index = 0; index < entries.length - 1; index += 1) {
    const current = entries[index]
    const next = entries[index + 1]
    const diff = next.timestamp - current.timestamp

    // Adjust for DST: if timezone offset changed, the wall-clock gap isn't a real outage
    const dstShiftMs = (current.timestamp.getTimezoneOffset() - next.timestamp.getTimezoneOffset()) * 60000
    const missing = Math.floor((diff + dstShiftMs - NET_TOLERANCE_MS) / expectedIntervalMs)

    if (missing > 0) {
      missed += missing
      alerts.push({
        type: 'outage',
        start: new Date(current.timestamp.getTime() + expectedIntervalMs),
        end: new Date(next.timestamp.getTime()),
        missedChecks: missing,
        open: false
      })
    }
    if (current.ip && next.ip && current.ip !== next.ip) {
      alerts.push({
        type: 'ipchange',
        timestamp: next.timestamp,
        oldIp: current.ip,
        newIp: next.ip
      })
    }
    if (current.failure) {
      alerts.push({
        type: 'failure',
        timestamp: current.timestamp,
        message: current.message || 'Failed to resolve current IP'
      })
    }
  }

  if (entries.length && entries[entries.length - 1].failure) {
    const lastEntry = entries[entries.length - 1]
    alerts.push({
      type: 'failure',
      timestamp: lastEntry.timestamp,
      message: lastEntry.message || 'Failed to resolve current IP'
    })
  }

  const lastEntry = entries[entries.length - 1]
  const now = nowOverride || new Date()
  const tailMissing = Math.floor((now.getTime() - lastEntry.timestamp.getTime() - NET_TOLERANCE_MS) / expectedIntervalMs)
  if (tailMissing > 0) {
    missed += tailMissing
    alerts.push({
      type: 'outage',
      start: new Date(lastEntry.timestamp.getTime() + expectedIntervalMs),
      end: now,
      missedChecks: tailMissing,
      open: true
    })
  }

  alerts.sort((a, b) => {
    const aTime = a.type === 'ipchange' ? a.timestamp : a.start
    const bTime = b.type === 'ipchange' ? b.timestamp : b.start
    return aTime - bTime
  })

  const expectedChecks = entries.length + missed
  const uptimeValue = expectedChecks ? (entries.length / expectedChecks) * 100 : 100
  const uptimeText = expectedChecks ? `${uptimeValue.toFixed(2)}%` : '100%'
  const windowStats = computeWindowStats(entries, slotNumbers, now, periodsConfig, expectedIntervalMs, alerts)

  return {
    entries,
    alerts,
    missedChecks: missed,
    expectedChecks,
    uptimeValue,
    uptimeText,
    firstEntry: entries[0].timestamp,
    lastEntry: lastEntry.timestamp,
    windowStats
  }
}

function buildSlotNumbers (entries, expectedIntervalMs) {
  const slots = []
  let previous = null
  entries.forEach((entry) => {
    const slot = Math.round(entry.timestamp.getTime() / expectedIntervalMs)
    if (slot !== previous) {
      slots.push(slot)
      previous = slot
    }
  })
  return slots
}

function computeWindowStats (entries, slotNumbers, now, periodsConfig, expectedIntervalMs, alerts) {
  const definitions = buildPeriodsDefinitions(now, periodsConfig, expectedIntervalMs)
  if (!entries.length) {
    return definitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      segments: definition.segments.map((segment) => ({
        ...segment,
        available: 0,
        expected: 0,
        observed: 0,
        missed: 0,
        uptime: null,
        coverage: 0,
        start: new Date(segment.startMs),
        end: new Date(segment.endMs)
      })),
      observed: 0,
      expected: 0,
      missed: 0,
      uptime: null,
      coverage: 0
    }))
  }

  const nowMs = now.getTime()
  const nowSlot = Math.floor(nowMs / expectedIntervalMs)
  const firstSlot = Math.floor(entries[0].timestamp.getTime() / expectedIntervalMs)

  return definitions.map((definition) => {
    const segments = definition.segments.map((segment) => analyzeSegment(segment, slotNumbers, firstSlot, nowSlot, expectedIntervalMs, alerts))
    const observed = segments.reduce((sum, item) => sum + item.observed, 0)
    const expected = segments.reduce((sum, item) => sum + item.expected, 0)
    const available = segments.reduce((sum, item) => sum + item.available, 0)
    const missed = Math.max(0, expected - observed)
    const uptime = expected > 0 ? (observed / expected) * 100 : null
    const coverage = available > 0 ? expected / available : 0

    return {
      key: definition.key,
      label: definition.label,
      segments,
      observed,
      expected,
      missed,
      uptime,
      coverage
    }
  })
}

function buildPeriodsDefinitions (now, periodsConfig, expectedIntervalMs) {
  const nowMs = now.getTime()

  return periodsConfig.map((periodConfig, index) => {
    const periodMs = parseNaturalTime(periodConfig.period)
    const segmentMs = parseNaturalTime(periodConfig.segment_size)

    if (!periodMs || !segmentMs) {
      console.warn('Invalid period configuration:', periodConfig)
      return { key: `period-${index}`, label: periodConfig.period || 'Invalid', segments: [] }
    }

    const segmentCount = Math.ceil(periodMs / segmentMs)
    const segments = buildCustomPeriodSegments(periodConfig.period, periodMs, segmentMs, segmentCount, nowMs, expectedIntervalMs)

    return {
      key: `period-${index}`,
      label: `Past ${periodConfig.period}`,
      segments
    }
  })
}

function buildCustomPeriodSegments (periodLabel, periodMs, segmentMs, segmentCount, nowMs, expectedIntervalMs) {
  const segmentSlots = Math.max(1, Math.round(segmentMs / expectedIntervalMs))
  const endSlot = Math.floor(nowMs / expectedIntervalMs)
  const firstStartSlot = endSlot - (segmentCount * segmentSlots) + 1
  const segments = []

  for (let index = 0; index < segmentCount; index += 1) {
    const startSlot = firstStartSlot + index * segmentSlots
    const endSlotForSegment = startSlot + segmentSlots - 1
    const startMs = startSlot * expectedIntervalMs
    const endMs = (endSlotForSegment + 1) * expectedIntervalMs

    segments.push({
      key: `${periodLabel.replace(/\s+/g, '-')}-${index}`,
      label: formatCustomSegmentLabel(periodLabel, segmentMs, startMs, endMs),
      startSlot,
      endSlot: endSlotForSegment,
      startMs,
      endMs
    })
  }

  return segments
}

function analyzeSegment (segment, slotNumbers, firstSlot, nowSlot, expectedIntervalMs, alerts) {
  const startSlot = segment.startSlot
  const endSlot = segment.endSlot
  const startMs = segment.startMs
  const endMs = segment.endMs

  const clampedEndSlot = Math.min(endSlot, nowSlot)
  const isFuture = startSlot > nowSlot
  const available = isFuture ? 0 : Math.max(0, clampedEndSlot - startSlot + 1)
  const effectiveStart = Math.max(startSlot, firstSlot)
  const expected = (!isFuture && clampedEndSlot >= effectiveStart) ? (clampedEndSlot - effectiveStart + 1) : 0
  const observed = expected > 0 ? countSlotsInRange(slotNumbers, effectiveStart, clampedEndSlot) : 0
  const missed = Math.max(0, expected - observed)
  const uptime = expected > 0 ? (observed / expected) * 100 : null
  const coverage = available > 0 ? expected / available : 0
  const endMsClamped = Math.min(endMs, (clampedEndSlot + 1) * expectedIntervalMs)

  return {
    ...segment,
    available,
    expected,
    observed,
    missed,
    uptime,
    coverage,
    start: new Date(Math.max(startMs, 0)),
    end: new Date(Math.max(endMsClamped, Math.max(startMs, 0))),
    status: resolveSegmentStatus(startMs, endMsClamped, alerts)
  }
}

function countSlotsInRange (slots, startSlot, endSlot) {
  if (startSlot > endSlot) {
    return 0
  }
  const startIndex = lowerBound(slots, startSlot)
  const endIndex = upperBound(slots, endSlot)
  return Math.max(0, endIndex - startIndex)
}

function lowerBound (array, value) {
  let low = 0
  let high = array.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (array[mid] < value) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

function upperBound (array, value) {
  let low = 0
  let high = array.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (array[mid] <= value) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

function formatCustomSegmentLabel (periodLabel, segmentMs, startMs, endMs) {
  const startDate = new Date(startMs)
  const endDate = new Date(endMs)

  // For segments less than an hour, show time
  if (segmentMs <= NET_HOUR_MS) {
    return endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  // For segments of a day or more, show date
  if (segmentMs >= NET_DAY_MS) {
    return startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // For segments between hour and day, show time
  return startDate.toLocaleTimeString(undefined, { hour: 'numeric' })
}

function formatPercent (value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–'
  }
  const clamped = Math.min(100, Math.max(0, value))
  if (clamped >= 99.995) {
    return '100%'
  }
  if (clamped >= 10) {
    return `${clamped.toFixed(2)}%`
  }
  return `${clamped.toFixed(2)}%`
}

function applySegmentClasses (pill, segment) {
  if (segment.available === 0) {
    pill.classList.add('future')
  } else if (!segment.expected) {
    pill.classList.add('idle')
  } else if (segment.status === 'systemDown') {
    pill.classList.add('bad')
  } else if (segment.status === 'connectionFailure') {
    pill.classList.add('warn')
  } else {
    pill.classList.add('ok')
  }
}

function resolveSegmentStatus (startMs, endMs, alerts) {
  if (!alerts || !alerts.length) {
    return 'normal'
  }
  let hasFailure = false
  for (const alert of alerts) {
    if (alert.type === 'outage') {
      const alertStart = alert.start.getTime()
      const alertEnd = alert.end.getTime()
      if (startMs <= alertEnd && endMs >= alertStart) {
        return 'systemDown'
      }
    } else if (alert.type === 'failure') {
      const failureTime = alert.timestamp.getTime()
      if (failureTime >= startMs && failureTime <= endMs) {
        hasFailure = true
      }
    }
  }
  return hasFailure ? 'connectionFailure' : 'normal'
}

function buildSegmentTooltip (windowLabel, segment, expectedIntervalMs) {
  const lines = []
  if (segment.label) {
    lines.push(`${windowLabel} • ${segment.label}`)
  } else {
    lines.push(windowLabel)
  }
  lines.push(`${formatDateTime(segment.start)} → ${formatDateTime(segment.end)}`)
  if (!segment.expected) {
    if (segment.available === 0) {
      lines.push('Period has not started yet.')
    } else {
      lines.push('No log data for this period.')
    }
  } else {
    lines.push(`${formatNumber(segment.observed)} / ${formatNumber(segment.expected)} checks (${formatPercent(segment.uptime)})`)
    if (segment.missed) {
      lines.push(`${segment.missed} missed (~${formatDuration(segment.missed * expectedIntervalMs)})`)
    } else {
      lines.push('No missed checks.')
    }
    if (segment.coverage < 0.98) {
      lines.push(`${Math.round(segment.coverage * 100)}% coverage (partial log range)`)
    }
  }
  return lines.join(String.fromCharCode(10))
}

function setText (element, text) {
  if (element) {
    element.textContent = text
  }
}

function formatDateTime (date) {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
}

function formatDuration (ms) {
  const safeMs = Math.max(0, ms)
  const minutes = Math.round(safeMs / 60000)
  if (minutes < 1) {
    return '<1 min'
  }
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  const parts = []
  if (hours > 0) {
    parts.push(`${hours} hr${hours === 1 ? '' : 's'}`)
  }
  if (remaining > 0) {
    parts.push(`${remaining} min`)
  }
  return parts.join(' ')
}

function formatNumber (value) {
  if (value === null || value === undefined) {
    return '–'
  }
  return Number(value).toLocaleString()
}

window.widgets = window.widgets || {}
window.widgets.network = NetworkWidget
