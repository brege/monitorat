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

document.addEventListener('DOMContentLoaded', async () => {
  initializeThemeToggle()
  initializeMenuButton()
  syncPrivacyToggleState()

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
    container = createWidgetContainer(widgetName)
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
    if (config?.collapsible === true) {
      setupCollapsibleWidget(container, widgetName, config)
    }

    const contentContainer = config?.collapsible === true
      ? container.querySelector('.widget-content')
      : container

    const widgetConfig = config?.collapsible === true
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

function createWidgetContainer (widgetName) {
  const container = document.createElement('div')
  container.id = `${widgetName}-widget`
  document.querySelector('.widget-stack').appendChild(container)
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

const COLOR_THEME_STORAGE_KEY = 'monitor-color-theme'

function getStoredColorTheme () {
  try {
    return localStorage.getItem(COLOR_THEME_STORAGE_KEY) || 'default'
  } catch (_) {
    return 'default'
  }
}

function applyColorTheme (themeName) {
  document.querySelectorAll('link[href*="theme-overlay"], link[data-color-theme]').forEach((link) => link.remove())

  if (themeName !== 'default') {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `themes/${themeName}.css`
    link.dataset.colorTheme = themeName
    const defaultTheme = document.querySelector('link[href*="themes/default.css"]')
    if (defaultTheme && defaultTheme.nextSibling) {
      defaultTheme.parentNode.insertBefore(link, defaultTheme.nextSibling)
    } else {
      document.head.appendChild(link)
    }
  }

  try {
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, themeName)
  } catch (_) {
    /* localStorage may be unavailable */
  }
}

async function fetchAppInfo () {
  try {
    const response = await fetch('api/info', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Unable to load app info:', error.message)
    return { version: 'unknown', github: 'https://github.com/brege/monitorat', themes: ['default'] }
  }
}

function capitalizeFirst (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const MENU_ICONS = {
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1 .36-5.36"/></svg>',
  eyeOpen: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>',
  github: '<svg viewBox="0 0 496 512" fill="currentColor"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.007 8.222A3.738 3.738 0 0 0 15.045 5.2a3.737 3.737 0 0 0 1.156 6.583 2.988 2.988 0 0 1-2.668 1.67h-2.99a4.456 4.456 0 0 0-2.989 1.165V7.4a3.737 3.737 0 1 0-1.494 0v9.117a3.776 3.776 0 1 0 1.816.099 2.99 2.99 0 0 1 2.668-1.667h2.99a4.484 4.484 0 0 0 4.223-3.039 3.736 3.736 0 0 0 3.25-3.687zM4.565 3.738a2.242 2.242 0 1 1 4.484 0 2.242 2.242 0 0 1-4.484 0zm4.484 16.441a2.242 2.242 0 1 1-4.484 0 2.242 2.242 0 0 1 4.484 0zm8.221-9.715a2.242 2.242 0 1 1 0-4.485 2.242 2.242 0 0 1 0 4.485z"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
}

function areAllWidgetsCollapsed () {
  const headers = document.querySelectorAll('.widget-header-collapsible')
  if (headers.length === 0) return false
  return Array.from(headers).every((h) => h.classList.contains('collapsed'))
}

function toggleAllWidgets () {
  const shouldExpand = areAllWidgetsCollapsed()
  document.querySelectorAll('.widget-header-collapsible').forEach((header) => {
    const widgetName = header.dataset.widget
    if (widgetName) {
      toggleWidget(widgetName, shouldExpand)
    }
  })
}
window.toggleAllWidgets = toggleAllWidgets

async function showMenuModal () {
  const info = await fetchAppInfo()
  const currentColorTheme = getStoredColorTheme()
  const currentTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme()
  const isDark = currentTheme === THEME_DARK
  const allCollapsed = areAllWidgetsCollapsed()

  const themesHtml = info.themes.map((theme) => {
    const isSelected = theme === currentColorTheme ? ' selected' : ''
    const isChecked = theme === currentColorTheme ? ' checked' : ''
    return `
      <label class="menu-modal-theme${isSelected}">
        <input type="radio" name="color-theme" value="${theme}"${isChecked}>
        <span class="menu-modal-theme-name">${capitalizeFirst(theme)}</span>
      </label>
    `
  }).join('')

  const content = `
    <div class="menu-modal-controls">
      <button type="button" class="menu-modal-control" id="menu-theme-toggle">
        <span class="menu-modal-icon">${isDark ? MENU_ICONS.sun : MENU_ICONS.moon}</span>
        <span class="menu-modal-label">${isDark ? 'Light Mode' : 'Dark Mode'}</span>
      </button>
      <button type="button" class="menu-modal-control" id="menu-collapse-toggle">
        <span class="menu-modal-icon">${allCollapsed ? MENU_ICONS.expand : MENU_ICONS.collapse}</span>
        <span class="menu-modal-label">${allCollapsed ? 'Expand All' : 'Collapse All'}</span>
      </button>
      <button type="button" class="menu-modal-control" id="menu-reload">
        <span class="menu-modal-icon">${MENU_ICONS.reload}</span>
        <span class="menu-modal-label">Reload Page</span>
      </button>
      <button type="button" class="menu-modal-control" id="menu-privacy-toggle">
        <span class="menu-modal-icon">${privacyState.masked ? MENU_ICONS.eyeOpen : MENU_ICONS.eyeOff}</span>
        <span class="menu-modal-label">${privacyState.masked ? 'Show Original' : 'Privacy Mask'}</span>
      </button>
    </div>
    <div class="menu-modal-section">
      <h4>Color Theme</h4>
      <div class="menu-modal-themes">
        ${themesHtml}
      </div>
    </div>
    <div class="menu-modal-footer">
      <a href="${info.github}" target="_blank" rel="noopener" class="menu-modal-link" title="GitHub Repository">
        ${MENU_ICONS.github}
        <span>brege/monitorat</span>
      </a>
      <a href="${info.github}/releases/tag/v${info.version}" target="_blank" rel="noopener" class="menu-modal-link" title="Release v${info.version}">
        ${MENU_ICONS.fork}
        <span>v${info.version}</span>
      </a>
    </div>
  `

  window.Modal.show({
    title: 'Menu',
    content,
    onClose: () => {}
  })

  document.getElementById('menu-theme-toggle')?.addEventListener('click', () => {
    toggleTheme()
    window.Modal.hide()
  })

  document.getElementById('menu-collapse-toggle')?.addEventListener('click', () => {
    toggleAllWidgets()
    window.Modal.hide()
  })

  document.getElementById('menu-reload')?.addEventListener('click', async () => {
    window.Modal.hide()
    if (monitorAPI.demoEnabled) {
      window.location.reload()
      return
    }
    try {
      await fetch('api/config/reload', { method: 'POST', cache: 'no-store' })
      setTimeout(() => window.location.reload(), 600)
    } catch (_) {
      window.location.reload()
    }
  })

  document.getElementById('menu-privacy-toggle')?.addEventListener('click', () => {
    togglePrivacyMask()
    window.Modal.hide()
  })

  document.querySelectorAll('.menu-modal-theme').forEach((label) => {
    label.addEventListener('click', () => {
      document.querySelectorAll('.menu-modal-theme').forEach((l) => l.classList.remove('selected'))
      label.classList.add('selected')
      const radio = label.querySelector('input[type="radio"]')
      if (radio) {
        radio.checked = true
        applyColorTheme(radio.value)
      }
    })
  })
}

function initializeMenuButton () {
  const button = document.getElementById('menu-button')
  if (button) {
    button.addEventListener('click', showMenuModal)
  }

  const storedColorTheme = getStoredColorTheme()
  if (storedColorTheme && storedColorTheme !== 'default') {
    applyColorTheme(storedColorTheme)
  }
}
