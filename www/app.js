/* global localStorage, NodeFilter */
const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g

const privacyState = {
  originalContent: new Map(),
  masked: false,
  config: null
}

const THEME_STORAGE_KEY = 'monitor-theme'
const THEME_LIGHT = 'light'
const THEME_DARK = 'dark'

const monitorAPI = window.monitor = window.monitor || {}

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

  if (suppressHeader) {
    header.remove()
    return
  }

  if (name === null || name === false) {
    header.remove()
    return
  }

  // Add download link if configured
  if (downloadCsv && downloadUrl) {
    const headerParent = header.parentElement
    const wrapper = document.createElement('div')
    wrapper.style.display = 'flex'
    wrapper.style.alignItems = 'center'
    wrapper.style.justifyContent = 'space-between'
    wrapper.style.marginBottom = '16px'

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

    headerParent.insertBefore(wrapper, header)
    wrapper.appendChild(header)
    wrapper.appendChild(downloadLink)
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

document.addEventListener('DOMContentLoaded', async () => {
  initializeThemeToggle()
  initializeConfigReloadControl()
  syncPrivacyToggleState()

  const config = await loadConfig()

  privacyState.config = config.privacy

  if (config.site?.name) {
    document.title = config.site.name
  }
  if (config.site?.title) {
    const h1 = document.querySelector('h1')
    if (h1) {
      h1.textContent = config.site.title
    }
  }

  // Initialize widgets in configured order (in parallel)
  const fallbackWidgetOrder = Object.keys(config.widgets || {}).filter((key) => key !== 'enabled')
  const widgetOrder = Array.isArray(config.widgets?.enabled) && config.widgets.enabled.length > 0
    ? config.widgets.enabled
    : fallbackWidgetOrder

  const containersByWidget = new Map()

  widgetOrder.forEach((widgetName) => {
    const widgetConfig = config.widgets?.[widgetName]
    if (!widgetConfig) {
      return
    }
    const container = document.getElementById(`${widgetName}-widget`) || createWidgetContainer(widgetName)
    containersByWidget.set(widgetName, container)
  })

  await Promise.all(
    widgetOrder.map(async (widgetName) => {
      const widgetConfig = config.widgets?.[widgetName]
      if (!widgetConfig) {
        return
      }

      const widgetType = widgetConfig?.type || widgetName
      const container = containersByWidget.get(widgetName)
      if (!container) {
        return
      }

      return initializeWidget(widgetName, widgetType, widgetConfig, container)
    })
  )
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

function initializeConfigReloadControl () {
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
    container = createWidgetContainer(widgetName)
  }
  if (!window.widgets || !window.widgets[widgetType]) {
    return
  }

  try {
    if (config?.collapsible === true) {
      setupCollapsibleWidget(container, widgetName, config)
    }

    const contentContainer = config?.collapsible === true
      ? container.querySelector('.widget-content')
      : container

    const WidgetClass = window.widgets[widgetType]
    const widget = new WidgetClass(config || {})

    const widgetConfig = config?.collapsible === true
      ? { ...config, _suppressHeader: true }
      : config

    if (widgetType === 'speedtest') {
      await widget.init(contentContainer, widgetConfig)
    } else if (widgetType === 'wiki') {
      await widget.init(contentContainer, { ...widgetConfig, _widgetName: widgetName })
    } else {
      await widget.init(contentContainer, widgetConfig || {})
    }
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
    script.src = `widgets/${widgetType}/${widgetType}.js`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load widget script: ${widgetType}`))
    document.head.appendChild(script)
  })

  widgetScriptPromises.set(widgetType, promise)
  return promise
}

function createWidgetContainer (widgetName) {
  const container = document.createElement('div')
  container.id = `${widgetName}-widget`
  document.querySelector('.widget-stack').appendChild(container)
  return container
}

function setupCollapsibleWidget (container, widgetName, config) {
  const widgetTitle = config?.name || widgetName
  const isHidden = config?.hidden === true

  container.innerHTML = `
    <div class="widget-header">
      <h2 class="widget-title">
        ${widgetTitle}
      </h2>
      <button type="button" class="gaps-toggle" onclick="toggleWidget('${widgetName}')">
        ${isHidden ? 'Show' : 'Hide'}
      </button>
    </div>
    <div class="widget-content" style="display: ${isHidden ? 'none' : 'block'}"></div>
  `
}

function toggleWidget (widgetName) {
  const container = document.getElementById(`${widgetName}-widget`)
  if (!container) return

  const content = container.querySelector('.widget-content')
  const toggle = container.querySelector('.gaps-toggle')
  if (!content || !toggle) return

  const isHidden = content.style.display === 'none'
  content.style.display = isHidden ? 'block' : 'none'
  toggle.textContent = isHidden ? 'Hide' : 'Show'
}
window.toggleWidget = toggleWidget

function getStoredTheme () {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === THEME_DARK || stored === THEME_LIGHT) {
      return stored
    }
  } catch (_) {
    /* localStorage may be unavailable */
  }
  return null
}

function hasStoredTheme () {
  return getStoredTheme() !== null
}

function getPreferredTheme () {
  const storedTheme = getStoredTheme()
  if (storedTheme) {
    return storedTheme
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return THEME_DARK
  }
  return THEME_LIGHT
}

function applyTheme (theme) {
  const resolvedTheme = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT
  const root = document.documentElement
  root.setAttribute('data-theme', resolvedTheme)
  root.dataset.theme = resolvedTheme

  const themeToggle = document.getElementById('theme-toggle')
  if (themeToggle) {
    themeToggle.dataset.theme = resolvedTheme
    themeToggle.setAttribute('aria-pressed', resolvedTheme === THEME_DARK ? 'true' : 'false')
  }
}

function initializeThemeToggle () {
  applyTheme(getPreferredTheme())

  if (!window.matchMedia) {
    return
  }

  const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSchemeChange = (event) => {
    if (!hasStoredTheme()) {
      applyTheme(event.matches ? THEME_DARK : THEME_LIGHT)
    }
  }

  if (typeof darkSchemeQuery.addEventListener === 'function') {
    darkSchemeQuery.addEventListener('change', handleSchemeChange)
  } else if (typeof darkSchemeQuery.addListener === 'function') {
    darkSchemeQuery.addListener(handleSchemeChange)
  }
}

function syncPrivacyToggleState (button) {
  const toggle = button || document.getElementById('privacy-toggle')
  if (!toggle) {
    return
  }

  toggle.dataset.privacy = privacyState.masked ? 'masked' : 'revealed'
  toggle.setAttribute('aria-pressed', privacyState.masked ? 'true' : 'false')
}

function togglePrivacyMask () {
  const button = document.getElementById('privacy-toggle')
  if (!button || !privacyState.config) {
    return
  }

  const wasMasked = privacyState.masked
  privacyState.masked = !privacyState.masked
  syncPrivacyToggleState(button)

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  let node
  while ((node = walker.nextNode())) {
    nodes.push(node)
  }

  const replacements = wasMasked
    ? Object.fromEntries(Object.entries(privacyState.config.replacements || {}).map(([key, value]) => [value, key]))
    : privacyState.config.replacements || {}

  nodes.forEach((textNode) => {
    let text = textNode.textContent

    if (wasMasked) {
      if (privacyState.originalContent.has(textNode)) {
        text = privacyState.originalContent.get(textNode)
        privacyState.originalContent.delete(textNode)
      }
    } else {
      privacyState.originalContent.set(textNode, text)
      if (privacyState.config.mask_ips) {
        text = text.replace(IP_PATTERN, 'xxx.xxx.xxx.xxx')
      }
    }

    for (const [from, to] of Object.entries(replacements)) {
      text = text.replaceAll(from, to)
    }

    textNode.textContent = text
  })
}
window.togglePrivacyMask = togglePrivacyMask

function toggleTheme () {
  const currentTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme()
  const nextTheme = currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK

  applyTheme(nextTheme)

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  } catch (_) {
    /* localStorage may be unavailable */
  }
}
window.toggleTheme = toggleTheme
