/* global localStorage ResizeObserver */
const REMEMBER_EXPANSIONS_KEY = 'monitor-remember-expansions'
const EXPANSIONS_STATE_KEY = 'monitor-expansions'

const monitorAPI = window.monitor = window.monitor || {}

const layoutGroups = new Map()
const sectionHeaders = new Map()
let layoutObserver = null

monitorAPI.applyWidgetHeader = function applyWidgetHeader (container, options = {}) {
  if (!container) {
    return
  }

  const {
    selector = 'h2',
    suppressHeader = false,
    name,
    preserveChildren = false,
    downloadUrl = null,
    downloadCsv = false
  } = options

  const header = container.querySelector(selector)
  if (!header) {
    return
  }

  const headerControls = (() => {
    const candidate = header.nextElementSibling
    if (!candidate) return null
    const controlClasses = ['widget-controls', 'speedtest-controls']
    if (controlClasses.some((className) => candidate.classList.contains(className))) {
      return candidate
    }
    return null
  })()

  if (suppressHeader) {
    header.remove()
    return
  }

  if (name === null || name === false) {
    header.remove()
    return
  }

  let wrapper = null
  if ((downloadCsv && downloadUrl) || headerControls) {
    const headerParent = header.parentElement
    if (headerParent && headerParent.classList.contains('widget-header-wrapper')) {
      wrapper = headerParent
    } else if (headerParent) {
      wrapper = document.createElement('div')
      wrapper.className = 'widget-header-wrapper'
      headerParent.insertBefore(wrapper, header)
      wrapper.appendChild(header)
    }
    if (wrapper && headerControls && headerControls.parentElement !== wrapper) {
      wrapper.appendChild(headerControls)
    }
  }

  // Add download link if configured
  if (downloadCsv && downloadUrl) {
    const downloadLink = document.createElement('a')
    downloadLink.href = '#'
    downloadLink.textContent = 'Download CSV'
    downloadLink.style.fontSize = '0.85rem'
    downloadLink.style.color = 'var(--accent)'
    downloadLink.style.textDecoration = 'none'
    downloadLink.style.cursor = 'pointer'
    downloadLink.addEventListener('mouseover', () => {
      downloadLink.style.textDecoration = 'underline'
    })
    downloadLink.addEventListener('mouseout', () => {
      downloadLink.style.textDecoration = 'none'
    })
    downloadLink.addEventListener('click', (e) => {
      e.preventDefault()
      const link = document.createElement('a')
      link.href = downloadUrl + '?' + Date.now()
      link.download = downloadUrl.split('/').pop() + '.csv'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })

    if (wrapper) {
      wrapper.appendChild(downloadLink)
    }
  }

  if (typeof name === 'string' && name.length > 0) {
    if (preserveChildren) {
      const preservedChildren = Array.from(header.children)
      header.textContent = name
      if (preservedChildren.length) {
        header.appendChild(document.createTextNode(' '))
        preservedChildren.forEach((child, index) => {
          if (index > 0) {
            header.appendChild(document.createTextNode(' '))
          }
          header.appendChild(child)
        })
      }
    } else {
      header.textContent = name
    }
  }
}

function resolveLayoutGroupKey (widgetName, widgetConfig) {
  const group = widgetConfig?.group
  if (group && typeof group === 'string') {
    return `group:${group}`
  }
  return `widget:${widgetName}`
}

function resolveLayoutColumns (widgetConfig) {
  const columns = Number(widgetConfig?.columns)
  if (Number.isFinite(columns) && columns > 0) {
    return Math.floor(columns)
  }
  return 1
}

function ensureLayoutObserver () {
  if (layoutObserver) return
  layoutObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      updateLayoutGroup(entry.target)
    })
  })
}

function createLayoutGroup (groupKey, sectionTitle = null) {
  const widgetStack = document.querySelector('.widget-stack')

  if (sectionTitle && !sectionHeaders.has(groupKey)) {
    const section = document.createElement('div')
    section.className = 'section-separator'
    section.dataset.sectionGroup = groupKey
    section.innerHTML = `<h2 class="section-title">${sectionTitle}</h2>`
    widgetStack.appendChild(section)
    sectionHeaders.set(groupKey, section)
  }

  const group = document.createElement('div')
  group.className = 'layout-columns layout-group'
  group.dataset.layoutGroup = groupKey
  group.dataset.layoutColumns = '1'
  group.style.setProperty('--layout-group-columns', '1')
  widgetStack.appendChild(group)
  ensureLayoutObserver()
  layoutObserver.observe(group)
  layoutGroups.set(groupKey, group)
  return group
}

function getLayoutGroup (widgetName, widgetConfig) {
  const groupKey = resolveLayoutGroupKey(widgetName, widgetConfig)
  const columns = resolveLayoutColumns(widgetConfig)
  const sectionTitle = widgetConfig?.section || null
  let group = layoutGroups.get(groupKey)
  if (!group) {
    group = createLayoutGroup(groupKey, sectionTitle)
  } else if (sectionTitle && !sectionHeaders.has(groupKey)) {
    const widgetStack = document.querySelector('.widget-stack')
    const section = document.createElement('div')
    section.className = 'section-separator'
    section.dataset.sectionGroup = groupKey
    section.innerHTML = `<h2 class="section-title">${sectionTitle}</h2>`
    widgetStack.insertBefore(section, group)
    sectionHeaders.set(groupKey, section)
  }
  const existingColumns = Number(group.dataset.layoutColumns || 1)
  if (columns > existingColumns) {
    group.dataset.layoutColumns = String(columns)
  }
  return group
}

function updateLayoutGroup (group) {
  if (!group) return
  const maxColumns = Math.max(1, Number(group.dataset.layoutColumns || 1))
  const styles = window.getComputedStyle(group)
  const gapValue = parseFloat(styles.columnGap || styles.gap) || 0
  const containerWidth = group.clientWidth

  const children = Array.from(group.children).filter((child) => {
    return window.getComputedStyle(child).display !== 'none'
  })

  let minWidthValue = parseFloat(styles.getPropertyValue('--layout-group-min')) || 320
  for (const child of children) {
    const childMin = parseFloat(window.getComputedStyle(child).getPropertyValue('--widget-min-width'))
    if (childMin && childMin > minWidthValue) {
      minWidthValue = childMin
    }
  }

  group.style.setProperty('--layout-group-min', `${minWidthValue}px`)
  const availableColumns = Math.max(1, Math.min(maxColumns, Math.floor((containerWidth + gapValue) / (minWidthValue + gapValue))))
  group.style.setProperty('--layout-group-columns', String(availableColumns))
  applyLayoutSpan(group, availableColumns)
}

function updateLayoutGroups () {
  layoutGroups.forEach((group) => updateLayoutGroup(group))
}

function applyLayoutSpan (group, columns) {
  const items = Array.from(group.children).filter((item) => {
    const display = window.getComputedStyle(item).display
    return display !== 'none'
  })
  items.forEach((item) => {
    item.style.gridColumn = ''
  })
  if (columns <= 1) return
  const hasPosition = items.some((item) => item.dataset.position !== undefined)
  if (hasPosition) return
  if (items.length === 0) return
  const remainder = items.length % columns
  if (remainder === 1) {
    const lastItem = items[items.length - 1]
    lastItem.style.gridColumn = `span ${columns}`
  }
}

function orderLayoutGroup (group) {
  const items = Array.from(group.children)
  const hasPosition = items.some((item) => item.dataset.position !== undefined)
  if (!hasPosition) return
  const ordered = items.sort((left, right) => {
    const leftPos = left.dataset.position !== undefined ? Number(left.dataset.position) : null
    const rightPos = right.dataset.position !== undefined ? Number(right.dataset.position) : null
    if (leftPos === null && rightPos === null) {
      return Number(left.dataset.order) - Number(right.dataset.order)
    }
    if (leftPos === null) return 1
    if (rightPos === null) return -1
    if (leftPos === rightPos) {
      return Number(left.dataset.order) - Number(right.dataset.order)
    }
    return leftPos - rightPos
  })
  ordered.forEach((item) => {
    group.appendChild(item)
  })
}

function orderLayoutGroups () {
  layoutGroups.forEach((group) => orderLayoutGroup(group))
}

document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig()
  const federationStatus = window.StatusIndicator
    ? await window.StatusIndicator.fetchStatus()
    : { enabled: false, remotes: {} }

  monitorAPI.demoEnabled = config.demo === true
  monitorAPI.federationStatus = federationStatus
  initializeConfigReloadControl({ demoEnabled: monitorAPI.demoEnabled })
  if (!monitorAPI.demoEnabled) {
    fetch('api/snapshot', { method: 'POST', cache: 'no-store' })
  }

  window.monitorHeader.applySiteConfig(config)

  // Initialize widgets in configured order (in parallel)
  const fallbackWidgetOrder = Object.keys(config.widgets || {}).filter((key) => key !== 'enabled')
  const widgetOrder = Array.isArray(config.widgets?.enabled) && config.widgets.enabled.length > 0
    ? config.widgets.enabled
    : fallbackWidgetOrder

  const containersByWidget = new Map()

  widgetOrder.forEach((widgetName, index) => {
    const widgetConfig = config.widgets?.[widgetName]
    if (!widgetConfig) {
      return
    }
    const container = createWidgetContainer(widgetName, widgetConfig, index)
    containersByWidget.set(widgetName, container)
  })
  orderLayoutGroups()
  updateLayoutGroups()

  await Promise.all(
    widgetOrder.map((widgetName) => {
      const widgetConfig = config.widgets?.[widgetName]
      if (!widgetConfig) return Promise.resolve()
      const widgetType = widgetConfig?.type || widgetName
      return ensureWidgetScript(widgetType)
    })
  )

  for (const widgetName of widgetOrder) {
    const widgetConfig = config.widgets?.[widgetName]
    if (!widgetConfig) {
      continue
    }

    const widgetType = widgetConfig?.type || widgetName
    const container = containersByWidget.get(widgetName)
    if (!container) {
      continue
    }

    await initializeWidget(widgetName, widgetType, widgetConfig, container)
  }

  restoreExpansionStates()
})

async function loadConfig () {
  try {
    const response = await fetch('api/config', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Unable to load config:', error.message)
    return {}
  }
}

function initializeConfigReloadControl (options = {}) {
  const { demoEnabled = false } = options
  const button = document.getElementById('config-reload')
  if (!button) {
    return
  }

  const defaultTitle = button.getAttribute('title') || 'Reload configuration'
  const resetState = ({ keepTitle = false } = {}) => {
    button.dataset.state = 'idle'
    button.disabled = false
    if (!keepTitle) {
      button.setAttribute('title', defaultTitle)
    }
  }

  resetState()

  button.addEventListener('click', async () => {
    if (button.dataset.state === 'loading') {
      return
    }

    if (demoEnabled) {
      window.location.reload()
      return
    }

    button.dataset.state = 'loading'
    button.disabled = true
    button.setAttribute('title', 'Reloading configuration...')

    try {
      const response = await fetch('api/config/reload', {
        method: 'POST',
        cache: 'no-store'
      })

      let payload = null
      try {
        payload = await response.json()
      } catch (_) {
        /* ignore JSON decode issues */
      }

      if (!response.ok || (payload && payload.status !== 'ok')) {
        const errorDetail = payload?.error || `HTTP ${response.status}`
        throw new Error(errorDetail)
      }

      button.dataset.state = 'success'
      button.setAttribute('title', 'Config reloaded. Refresh the page to apply changes.')

      // Give the backend a moment, then refresh the UI to pick up new config.
      setTimeout(() => {
        window.location.reload()
      }, 600)
    } catch (error) {
      console.error('Failed to reload config:', error)
      button.dataset.state = 'error'
      const reason = error instanceof Error ? error.message : String(error)
      button.setAttribute('title', `Reload failed: ${reason}`)
    } finally {
      const finalState = button.dataset.state
      setTimeout(() => {
        resetState({ keepTitle: finalState === 'success' })
      }, 2000)
    }
  })
}

async function initializeWidget (widgetName, widgetType, config, containerOverride) {
  await ensureWidgetScript(widgetType)

  if (config?.show === false) {
    return
  }

  let container = containerOverride || document.getElementById(`${widgetName}-widget`)
  if (!container) {
    container = createWidgetContainer(widgetName, config, 0)
  }
  if (!window.widgets || !window.widgets[widgetType]) {
    return
  }

  if (config?.parent) {
    container.dataset.parent = config.parent
    const parentContainer = document.getElementById(`${config.parent}-widget`)
    const parentContent = parentContainer?.querySelector('.widget-content')
    if (parentContent && parentContent.style.display === 'none') {
      container.style.display = 'none'
    }
  }

  try {
    const groupKey = resolveLayoutGroupKey(widgetName, config)
    const hasSection = sectionHeaders.has(groupKey)
    const isColumnated = hasSection && resolveLayoutColumns(config) > 1
    const useCollapsible = config?.collapsible === true && !isColumnated

    if (useCollapsible) {
      setupCollapsibleWidget(container, widgetName, config)
    }

    const contentContainer = useCollapsible
      ? container.querySelector('.widget-content')
      : container

    const widgetConfig = useCollapsible || isColumnated
      ? { ...config, _suppressHeader: true }
      : { ...config }

    if (config?.remote || config?.federation?.nodes) {
      widgetConfig._apiPrefix = widgetName
    }

    if (widgetType === 'wiki') {
      widgetConfig._widgetName = widgetName
    }

    const WidgetClass = window.widgets[widgetType]
    const widget = new WidgetClass(widgetConfig)
    await widget.init(contentContainer, widgetConfig)
  } catch (error) {
    const widgetDisplayName = config?.name || widgetName
    container.innerHTML = `<p class="muted">Unable to load ${widgetDisplayName}: ${error.message}</p>`
  }
}

const widgetScriptPromises = new Map()

async function ensureWidgetScript (widgetType) {
  if (widgetScriptPromises.has(widgetType)) {
    return widgetScriptPromises.get(widgetType)
  }

  const promise = new Promise((resolve, reject) => {
    if (window.widgets?.[widgetType]) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = `widgets/${widgetType}/app.js`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load widget script: ${widgetType}`))
    document.head.appendChild(script)
  })

  widgetScriptPromises.set(widgetType, promise)
  return promise
}

function createWidgetContainer (widgetName, widgetConfig, orderIndex) {
  const group = getLayoutGroup(widgetName, widgetConfig)
  let container = document.getElementById(`${widgetName}-widget`)
  if (!container) {
    container = document.createElement('div')
    container.id = `${widgetName}-widget`
  }
  container.dataset.order = String(orderIndex)
  if (widgetConfig?.position !== undefined) {
    container.dataset.position = String(widgetConfig.position)
  } else {
    delete container.dataset.position
  }
  if (widgetConfig?.min_width !== undefined && widgetConfig?.min_width !== null) {
    const minWidthValue = Number(widgetConfig.min_width)
    if (!Number.isFinite(minWidthValue)) {
      throw new Error(`${widgetName} min_width must be a number`)
    }
    container.style.setProperty('--widget-min-width', `${minWidthValue}px`)
  } else {
    container.style.removeProperty('--widget-min-width')
  }
  if (container.parentElement !== group) {
    group.appendChild(container)
  }
  return container
}

function setupCollapsibleWidget (container, widgetName, config) {
  const widgetTitle = config?.name || widgetName
  const isHidden = config?.hidden === true
  const remoteName = config?.remote
  const parentWidget = config?.parent

  const chevronSvg = '<svg class="widget-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
  const anchorId = `${widgetName}-widget`

  container.innerHTML = `
    <div class="widget-header widget-header-collapsible${isHidden ? ' collapsed' : ''}" data-widget="${widgetName}"${parentWidget ? ` data-parent="${parentWidget}"` : ''}>
      ${chevronSvg}
      <h2 class="widget-title">
        ${widgetTitle}
        <a class="header-anchor" href="#${anchorId}">#</a>
      </h2>
    </div>
    <div class="widget-content" style="display: ${isHidden ? 'none' : 'block'}"></div>
  `

  const header = container.querySelector('.widget-header-collapsible')
  const anchor = header.querySelector('.header-anchor')

  header.addEventListener('click', (event) => {
    if (event.target === anchor || anchor.contains(event.target)) {
      return
    }
    toggleWidget(widgetName)
  })

  if (remoteName && window.StatusIndicator && monitorAPI.federationStatus?.enabled) {
    const healthResult = monitorAPI.federationStatus.remotes?.[remoteName]
    const indicator = window.StatusIndicator.create(remoteName, healthResult)
    const titleElement = container.querySelector('.widget-title')
    if (titleElement) {
      titleElement.insertBefore(indicator, anchor)
    }
  }
}

function toggleWidget (widgetName, forceState) {
  const container = document.getElementById(`${widgetName}-widget`)
  if (!container) return

  const content = container.querySelector('.widget-content')
  const header = container.querySelector('.widget-header-collapsible')
  if (!content) return

  const isHidden = content.style.display === 'none'
  const shouldShow = forceState !== undefined ? forceState : isHidden
  content.style.display = shouldShow ? 'block' : 'none'

  if (header) {
    header.classList.toggle('collapsed', !shouldShow)
  }

  const childWidgets = document.querySelectorAll(`[data-parent="${widgetName}"]`)
  childWidgets.forEach((child) => {
    child.style.display = shouldShow ? '' : 'none'
  })

  updateLayoutGroups()
  saveExpansionStates()
}
window.toggleWidget = toggleWidget

function isRememberExpansionsEnabled () {
  try {
    return localStorage.getItem(REMEMBER_EXPANSIONS_KEY) === 'true'
  } catch (_) {
    return false
  }
}

function setRememberExpansions (enabled) {
  try {
    if (enabled) {
      localStorage.setItem(REMEMBER_EXPANSIONS_KEY, 'true')
      saveExpansionStates()
    } else {
      localStorage.removeItem(REMEMBER_EXPANSIONS_KEY)
      localStorage.removeItem(EXPANSIONS_STATE_KEY)
    }
  } catch (_) {
    /* localStorage may be unavailable */
  }
}

window.isRememberExpansionsEnabled = isRememberExpansionsEnabled
window.setRememberExpansions = setRememberExpansions

function saveExpansionStates () {
  if (!isRememberExpansionsEnabled()) {
    return
  }

  const states = {}
  document.querySelectorAll('.widget-header-collapsible').forEach((header) => {
    const widgetName = header.dataset.widget
    if (widgetName) {
      states[widgetName] = !header.classList.contains('collapsed')
    }
  })

  try {
    localStorage.setItem(EXPANSIONS_STATE_KEY, JSON.stringify(states))
  } catch (_) {
    /* localStorage may be unavailable */
  }
}

function restoreExpansionStates () {
  if (!isRememberExpansionsEnabled()) {
    return
  }

  try {
    const stored = localStorage.getItem(EXPANSIONS_STATE_KEY)
    if (!stored) {
      return
    }

    const states = JSON.parse(stored)
    Object.entries(states).forEach(([widgetName, expanded]) => {
      const container = document.getElementById(`${widgetName}-widget`)
      if (!container) return

      const content = container.querySelector('.widget-content')
      const header = container.querySelector('.widget-header-collapsible')
      if (!content || !header) return

      content.style.display = expanded ? 'block' : 'none'
      header.classList.toggle('collapsed', !expanded)

      const childWidgets = document.querySelectorAll(`[data-parent="${widgetName}"]`)
      childWidgets.forEach((child) => {
        child.style.display = expanded ? '' : 'none'
      })
    })
  } catch (_) {
    /* localStorage may be unavailable or corrupted */
  }
}
