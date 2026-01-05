class WikiWidget {
  constructor (config = {}) {
    this.container = null
    this.config = config
    this.apiPrefix = config._apiPrefix || 'wiki'
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }
    this.apiPrefix = config._apiPrefix || this.apiPrefix

    const response = await fetch('widgets/wiki/index.html')
    const html = await response.text()
    container.innerHTML = html

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name
      })
    }

    const mode = this.config.mode || 'featured'
    const allowedModes = new Set(['featured', 'seamless', 'rail'])
    if (!allowedModes.has(mode)) {
      throw new Error(`Unknown wiki mode: ${mode}`)
    }
    const notesContainer = this.container.querySelector('.notes')
    if (notesContainer) {
      notesContainer.dataset.mode = mode
    }

    await this.loadContent()
  }

  getDisplayStrategy () {
    return this.config.federation?.display?.document || 'stack'
  }

  getMarkdownRenderer () {
    return window.markdownit({ html: true })
      .use(window.markdownItAnchor, {
        permalink: window.markdownItAnchor.permalink.linkInsideHeader({
          symbol: '#',
          placement: 'after'
        })
      })
      .use(window.markdownItTocDoneRight)
  }

  async loadContent () {
    const mergeSources = this.config.federation?.nodes
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedContent(mergeSources)
    } else {
      await this.loadSingleContent()
    }
  }

  async loadSingleContent () {
    try {
      const widgetName = this.config._widgetName || 'wiki'
      const isRemote = this.config._apiPrefix !== undefined
      let docPath
      if (this.config.doc) {
        docPath = isRemote
          ? `api/${this.apiPrefix}/doc`
          : `api/${this.apiPrefix}/doc?widget=${widgetName}`
      } else {
        docPath = 'README.md'
      }
      const response = await fetch(docPath)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const text = await response.text()

      const md = this.getMarkdownRenderer()
      const notesElement = this.container.querySelector('#about-notes')
      if (notesElement) {
        notesElement.innerHTML = md.render(text)
        this.renderMermaid(notesElement)
      }
    } catch (error) {
      const notesElement = this.container.querySelector('#about-notes')
      if (notesElement) {
        notesElement.innerHTML = `<p class="muted">Unable to load documentation: ${error.message}</p>`
      }
    }
  }

  async loadMergedContent (sources) {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/wiki-${source}/doc`)
          if (!response.ok) {
            return { source, content: null, error: `HTTP ${response.status}` }
          }
          const text = await response.text()
          return { source, content: text, error: null }
        } catch (error) {
          return { source, content: null, error: error.message }
        }
      })
    )

    const notesElement = this.container.querySelector('#about-notes')
    if (!notesElement) return

    const strategy = this.getDisplayStrategy()
    const md = this.getMarkdownRenderer()

    if (strategy === 'columnate') {
      this.renderColumnated(notesElement, results, md)
    } else {
      this.renderStacked(notesElement, results, md)
    }

    this.renderMermaid(notesElement)
  }

  renderMermaid (notesElement) {
    const mermaidApi = window.mermaid
    if (!mermaidApi || !notesElement) return

    if (!window.monitorMermaidInitialized) {
      mermaidApi.initialize({ startOnLoad: false })
      window.monitorMermaidInitialized = true
    }

    const mermaidBlocks = notesElement.querySelectorAll('pre code.language-mermaid')
    if (mermaidBlocks.length === 0) return

    for (const mermaidBlock of mermaidBlocks) {
      const diagramContainer = document.createElement('div')
      diagramContainer.className = 'mermaid'
      diagramContainer.textContent = mermaidBlock.textContent

      const preElement = mermaidBlock.closest('pre')
      if (preElement) {
        preElement.replaceWith(diagramContainer)
      } else {
        mermaidBlock.replaceWith(diagramContainer)
      }
    }

    const diagramNodes = notesElement.querySelectorAll('.mermaid')
    if (diagramNodes.length === 0) return

    const mermaidRun = mermaidApi.run
    if (typeof mermaidRun === 'function') {
      mermaidRun({ nodes: diagramNodes })
      return
    }

    const mermaidInit = mermaidApi.init
    if (typeof mermaidInit === 'function') {
      mermaidInit(undefined, diagramNodes)
    }
  }

  shouldShowBadges () {
    return this.config.federation?.show_badges !== false
  }

  renderStacked (container, results, md) {
    container.innerHTML = ''
    const showBadges = this.shouldShowBadges()

    for (const result of results) {
      const section = document.createElement('div')
      section.className = 'federation-stack-section'

      if (showBadges) {
        const header = document.createElement('div')
        header.className = 'federation-source-header'
        header.textContent = result.source
        section.appendChild(header)
      }

      const content = document.createElement('div')
      content.className = 'wiki-source-content'
      if (result.content) {
        content.innerHTML = md.render(result.content)
      } else {
        content.innerHTML = `<p class="muted">Unable to load: ${result.error}</p>`
      }
      section.appendChild(content)

      container.appendChild(section)
    }
  }

  renderColumnated (container, results, md) {
    container.innerHTML = ''
    const showBadges = this.shouldShowBadges()

    const columns = document.createElement('div')
    columns.className = 'federation-columns wiki-columns'

    for (const result of results) {
      const column = document.createElement('div')
      column.className = 'federation-column'

      if (showBadges) {
        const header = document.createElement('div')
        header.className = 'federation-source-header'
        header.textContent = result.source
        column.appendChild(header)
      }

      const content = document.createElement('div')
      content.className = 'wiki-source-content'
      if (result.content) {
        content.innerHTML = md.render(result.content)
      } else {
        content.innerHTML = `<p class="muted">Unable to load: ${result.error}</p>`
      }
      column.appendChild(content)

      columns.appendChild(column)
    }

    container.appendChild(columns)
  }
}

window.widgets = window.widgets || {}
window.widgets.wiki = WikiWidget
