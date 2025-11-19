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
    this.periodsConfig = this.config.uptime.periods
    // mergeNetworkConfig guarantees chirper.interval_seconds exists
    const intervalSeconds = this.config.chirper.interval_seconds
    this.expectedIntervalMs = intervalSeconds * 1000
    this.minutesPerCheck = this.expectedIntervalMs / 60000
    this.state = {
      entries: [],
      analysis: null,
      gapsExpanded: false,
      logFingerprint: null
    }
    this.elements = {}
    this.uptimeCache = {
      rows: new Map()
    }
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }

    const response = await fetch('widgets/network/network.html')
    const html = await response.text()
    container.innerHTML = html

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name
      })
    }

    this.cacheElements()
    this.applySectionVisibility()
    this.attachEvents()
    await this.loadLog()
  }

  cacheElements () {
    this.elements = {
      logStatus: this.container.querySelector('[data-network="log-status"]'),
      uptimeRows: this.container.querySelector('[data-network="uptime-rows"]'),
      gapList: this.container.querySelector('[data-network="gap-list"]'),
      gapToggle: this.container.querySelector('[data-network="gaps-toggle"]'),
      sections: {
        metrics: this.container.querySelector('[data-network-section="metrics"]'),
        uptime: this.container.querySelector('[data-network-section="uptime"]'),
        gaps: this.container.querySelector('[data-network-section="gaps"]')
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
    if (this.elements.sections.metrics && !this.config.metrics.show) {
      this.elements.sections.metrics.classList.add('hidden')
    }
    if (this.elements.sections.uptime && !this.config.uptime.show) {
      this.elements.sections.uptime.classList.add('hidden')
    }
    if (this.elements.sections.gaps && !this.config.gaps.show) {
      this.elements.sections.gaps.classList.add('hidden')
    }
  }

  attachEvents () {
    if (this.elements.gapToggle) {
      this.elements.gapToggle.addEventListener('click', () => {
        this.state.gapsExpanded = !this.state.gapsExpanded
        this.renderGaps()
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
    setText(this.elements.logStatus, 'Loading log…')

    if (!this.config.log_file) {
      this.state.gapsExpanded = false
      setText(this.elements.logStatus, 'No log file configured.')
      this.state.entries = []
      this.state.analysis = analyzeEntries([], this.periodsConfig, this.expectedIntervalMs)
      this.state.logFingerprint = null
      this.updateSummary()
      this.renderUptime()
      this.renderGaps()
      return
    }

    try {
      const response = await fetch(`api/network/log?${Date.now()}`, { cache: 'no-store' })

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
      this.state.analysis = analyzeEntries(this.state.entries, this.periodsConfig, this.expectedIntervalMs)
      this.state.gapsExpanded = false
      this.updateSummary()
      this.renderUptime()
      this.renderGaps()

      if (this.state.entries.length) {
        setText(this.elements.logStatus, `Loaded ${this.state.entries.length.toLocaleString()} log entries.`)
      } else {
        setText(this.elements.logStatus, 'No log entries found.')
      }
    } catch (error) {
      console.error('Network log API call failed:', error)
      setText(this.elements.logStatus, `Unable to load log: ${error.message}`)
      this.state.gapsExpanded = false
      this.state.entries = []
      this.state.analysis = analyzeEntries([], this.periodsConfig, this.expectedIntervalMs)
      this.state.logFingerprint = null
      this.updateSummary()
      this.renderUptime()
      this.renderGaps()
    }
  }

  downloadLog () {
    if (!this.config.log_file) {
      return
    }
    const logFilename = this.config.log_file.split('/').pop()
    const link = document.createElement('a')
    link.href = `api/network/log?${Date.now()}`
    link.download = logFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  updateSummary () {
    if (!this.config.metrics.show || !this.elements.summary) {
      return
    }
    const summary = this.elements.summary
    const analysis = this.state.analysis
    if (!analysis || !analysis.entries.length) {
      summary.uptime.textContent = '–'
      summary.total.textContent = '–'
      summary.expected.textContent = '–'
      summary.missed.textContent = '–'
      summary.first.textContent = '–'
      summary.last.textContent = '–'
      return
    }

    summary.uptime.textContent = analysis.uptimeText
    summary.total.textContent = formatNumber(analysis.entries.length)
    summary.expected.textContent = formatNumber(analysis.expectedChecks)
    summary.missed.textContent = formatNumber(analysis.missedChecks)
    summary.first.textContent = formatDateTime(analysis.firstEntry)
    summary.last.textContent = formatDateTime(analysis.lastEntry)
  }

  renderUptime () {
    if (!this.config.uptime.show || !this.elements.uptimeRows) {
      return
    }

    const container = this.elements.uptimeRows
    const analysis = this.state.analysis
    const stats = analysis?.windowStats || []
    if (!stats.length) {
      const info = document.createElement('p')
      info.className = 'muted'
      info.textContent = 'No log data available yet.'
      container.replaceChildren(info)
      this.uptimeCache.rows.clear()
      return
    }

    const fragment = document.createDocumentFragment()
    const seenKeys = new Set()

    stats.forEach((stat) => {
      const entry = this.ensureUptimeRow(stat.key)
      this.updateUptimeRow(entry, stat)
      fragment.appendChild(entry.root)
      seenKeys.add(stat.key)
    })

    container.replaceChildren(fragment)

    for (const key of Array.from(this.uptimeCache.rows.keys())) {
      if (!seenKeys.has(key)) {
        this.uptimeCache.rows.delete(key)
      }
    }
  }

  ensureUptimeRow (key) {
    if (!this.uptimeCache.rows.has(key)) {
      const item = document.createElement('div')
      item.className = 'uptime-item'

      const row = document.createElement('div')
      row.className = 'uptime-row'

      const label = document.createElement('div')
      label.className = 'uptime-label'

      const pills = document.createElement('div')
      pills.className = 'uptime-pills'

      const value = document.createElement('div')
      value.className = 'uptime-value'

      row.append(label, pills, value)

      const meta = document.createElement('div')
      meta.className = 'uptime-meta'

      item.append(row, meta)

      this.uptimeCache.rows.set(key, {
        root: item,
        label,
        pills,
        value,
        meta,
        segments: new Map(),
        emptyNode: null
      })
    }
    return this.uptimeCache.rows.get(key)
  }

  updateUptimeRow (entry, stat) {
    entry.label.textContent = stat.label
    entry.value.textContent = formatPercent(stat.uptime)
    this.updateUptimePills(entry, stat)
    this.updateUptimeMeta(entry, stat)
  }

  updateUptimePills (entry, stat) {
    const pills = entry.pills
    const segmentMap = entry.segments
    const seenSegments = new Set()

    if (!stat.segments.length) {
      if (!entry.emptyNode) {
        const blank = document.createElement('div')
        blank.className = 'muted'
        blank.textContent = 'No data'
        entry.emptyNode = blank
      }
      segmentMap.clear()
      pills.replaceChildren(entry.emptyNode)
      pills.style.gridTemplateColumns = ''
      return
    }

    if (entry.emptyNode && entry.emptyNode.parentNode === pills) {
      pills.removeChild(entry.emptyNode)
    }
    entry.emptyNode = null

    const fragment = document.createDocumentFragment()
    pills.style.gridTemplateColumns = `repeat(${Math.max(1, stat.segments.length)}, minmax(0, 1fr))`

    stat.segments.forEach((segment) => {
      let pill = segmentMap.get(segment.key)
      if (!pill) {
        pill = document.createElement('div')
        segmentMap.set(segment.key, pill)
      }
      pill.className = 'uptime-pill'
      applySegmentClasses(pill, segment)
      pill.title = buildSegmentTooltip(stat.label, segment, this.expectedIntervalMs)
      fragment.appendChild(pill)
      seenSegments.add(segment.key)
    })

    pills.replaceChildren(fragment)

    for (const key of Array.from(segmentMap.keys())) {
      if (!seenSegments.has(key)) {
        segmentMap.delete(key)
      }
    }
  }

  updateUptimeMeta (entry, stat) {
    const meta = entry.meta
    meta.replaceChildren()

    if (!stat.expected) {
      const span = document.createElement('span')
      span.textContent = 'No data collected for this window yet.'
      meta.appendChild(span)
      return
    }

    const counts = document.createElement('span')
    counts.textContent = `${formatNumber(stat.observed)} of ${formatNumber(stat.expected)} checks`
    meta.appendChild(counts)

    const misses = document.createElement('span')
    if (stat.missed) {
      misses.textContent = `${formatNumber(stat.missed)} missed (${formatDuration(stat.missed * this.expectedIntervalMs)})`
    } else {
      misses.textContent = 'No missed checks'
    }
    meta.appendChild(misses)

    if (stat.coverage < 0.98) {
      const coverage = document.createElement('span')
      coverage.textContent = `${Math.round(stat.coverage * 100)}% coverage`
      meta.appendChild(coverage)
    }
  }

  renderGaps () {
    if (!this.config.gaps.show || !this.elements.gapList) {
      return
    }

    const list = this.elements.gapList
    list.innerHTML = ''
    const toggle = this.elements.gapToggle

    const analysis = this.state.analysis
    if (!analysis || !analysis.entries.length) {
      const info = document.createElement('p')
      info.className = 'muted'
      info.textContent = 'No log entries to inspect yet.'
      list.appendChild(info)
      if (toggle) toggle.style.display = 'none'
      return
    }

    const filtered = analysis.gaps.filter((gap) => {
      if (gap.type !== 'outage') {
        return true
      }
      const threshold = this.config.gaps.cadenceChecks || 0
      return gap.missedChecks >= threshold
    })

    if (!filtered.length) {
      const info = document.createElement('p')
      info.className = 'muted'
      info.textContent = 'No missed 5-minute intervals detected.'
      list.appendChild(info)
      if (toggle) toggle.style.display = 'none'
      return
    }

    const reversed = [...filtered].reverse()
    const maxVisible = this.state.gapsExpanded ? reversed.length : Math.min(this.config.gaps.max, reversed.length)
    reversed.slice(0, maxVisible).forEach((gap) => {
      const item = document.createElement('div')
      if (gap.type === 'ipchange') {
        item.className = 'gap ipchange'
        item.innerHTML = `<strong>IP address changed</strong> from ${gap.oldIp} to ${gap.newIp} at ${formatDateTime(gap.timestamp)}`
      } else {
        item.className = 'gap'
        if (gap.open) {
          item.classList.add('open')
        }
        const endLabel = gap.open ? 'now' : formatDateTime(gap.end)
        const duration = formatDuration(gap.end.getTime() - gap.start.getTime())
        const countLabel = gap.missedChecks === 1 ? 'check' : 'checks'
        item.innerHTML = `<strong>${gap.missedChecks} ${countLabel} missed</strong> from ${formatDateTime(gap.start)} to ${endLabel} (${duration})`
      }
      list.appendChild(item)
    })

    if (toggle) {
      const maxVisible = this.config.gaps.max
      if (filtered.length <= maxVisible) {
        toggle.style.display = 'none'
      } else {
        toggle.style.display = ''
        const remaining = filtered.length - maxVisible
        toggle.textContent = this.state.gapsExpanded ? 'Show less' : `Show ${remaining} more`
      }
    }
  }
}

function mergeNetworkConfig (config) {
  // Trust that confuse provides complete merged config
  // Just add computed values that depend on config values
  const cfg = config || {}
  const intervalSeconds = cfg.chirper?.interval_seconds ?? 300
  const minutesPerCheck = (intervalSeconds * 1000) / 60000
  const cadenceRaw = Number(cfg.gaps?.cadence)
  const cadenceMinutes = Number.isFinite(cadenceRaw) ? Math.max(0, cadenceRaw) : 0
  const cadenceChecks = Math.max(0, Math.ceil(cadenceMinutes / minutesPerCheck))

  return {
    ...cfg,
    chirper: {
      ...cfg.chirper,
      interval_seconds: intervalSeconds
    },
    gaps: {
      ...cfg.gaps,
      cadenceChecks
    }
  }
}

function parseLog (text) {
  const entries = []
  const lines = text.split(/\r?\n/)
  const detectedPattern = /^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+[^\s]+\s+[^\s]+(?:\[\d+\])?:\s+[A-Z]+:\s+(?:\[[^\]]+\]>\s+)?detected IPv4 address\s+([0-9.]+)/i

  for (const line of lines) {
    if (!line.includes('detected IPv4 address')) continue
    const match = line.match(detectedPattern)
    if (!match) continue
    const timestamp = parseTimestamp(match[1])
    if (!timestamp) continue
    entries.push({ timestamp, ip: match[2].trim() })
  }

  entries.sort((a, b) => a.timestamp - b.timestamp)
  return entries
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

function analyzeEntries (entries, periodsConfig, expectedIntervalMs) {
  if (!entries.length) {
    const now = new Date()
    return {
      entries: [],
      gaps: [],
      missedChecks: 0,
      expectedChecks: 0,
      uptimeValue: null,
      uptimeText: '–',
      firstEntry: null,
      lastEntry: null,
      windowStats: computeWindowStats([], [], now, periodsConfig, expectedIntervalMs)
    }
  }

  const gaps = []
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
      gaps.push({
        type: 'outage',
        start: new Date(current.timestamp.getTime() + expectedIntervalMs),
        end: new Date(next.timestamp.getTime()),
        missedChecks: missing,
        open: false
      })
    }
    if (current.ip !== next.ip) {
      gaps.push({
        type: 'ipchange',
        timestamp: next.timestamp,
        oldIp: current.ip,
        newIp: next.ip
      })
    }
  }

  const lastEntry = entries[entries.length - 1]
  const now = new Date()
  const tailMissing = Math.floor((now.getTime() - lastEntry.timestamp.getTime() - NET_TOLERANCE_MS) / expectedIntervalMs)
  if (tailMissing > 0) {
    missed += tailMissing
    gaps.push({
      type: 'outage',
      start: new Date(lastEntry.timestamp.getTime() + expectedIntervalMs),
      end: now,
      missedChecks: tailMissing,
      open: true
    })
  }

  gaps.sort((a, b) => {
    const aTime = a.type === 'ipchange' ? a.timestamp : a.start
    const bTime = b.type === 'ipchange' ? b.timestamp : b.start
    return aTime - bTime
  })

  const expectedChecks = entries.length + missed
  const uptimeValue = expectedChecks ? (entries.length / expectedChecks) * 100 : 100
  const uptimeText = expectedChecks ? `${uptimeValue.toFixed(2)}%` : '100%'
  const windowStats = computeWindowStats(entries, slotNumbers, now, periodsConfig, expectedIntervalMs)

  return {
    entries,
    gaps,
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

function computeWindowStats (entries, slotNumbers, now, periodsConfig, expectedIntervalMs) {
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
    const segments = definition.segments.map((segment) => analyzeSegment(segment, slotNumbers, firstSlot, nowSlot, expectedIntervalMs))
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

function analyzeSegment (segment, slotNumbers, firstSlot, nowSlot, expectedIntervalMs) {
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
    end: new Date(Math.max(endMsClamped, Math.max(startMs, 0)))
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
  } else if (segment.uptime >= 99) {
    pill.classList.add('ok')
  } else if (segment.uptime >= 95) {
    pill.classList.add('warn')
  } else {
    pill.classList.add('bad')
  }
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
