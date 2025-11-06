class WikiWidget {
  constructor (config = {}) {
    this.container = null
    this.config = config
  }

  async init (container, config = {}) {
    this.container = container
    this.config = { ...this.config, ...config }

    const response = await fetch('widgets/wiki/wiki.html')
    const html = await response.text()
    container.innerHTML = html

    const applyWidgetHeader = window.monitor?.applyWidgetHeader
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name
      })
    }

    await this.loadContent()
  }

  async loadContent () {
    try {
      const docPath = this.config.doc?.startsWith('/')
        ? `api/wiki/doc?widget=${this.config._widgetName || 'wiki'}`
        : this.config.doc || 'README.md'
      const response = await fetch(docPath)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const text = await response.text()

      const md = window.markdownit({ html: true })
        .use(window.markdownItAnchor, {
          permalink: window.markdownItAnchor.permalink.linkInsideHeader({
            symbol: '#',
            placement: 'after'
          })
        })
        .use(window.markdownItTocDoneRight)

      const notesElement = this.container.querySelector('#about-notes')
      if (notesElement) {
        notesElement.innerHTML = md.render(text)
      }
    } catch (error) {
      const notesElement = this.container.querySelector('#about-notes')
      if (notesElement) {
        notesElement.innerHTML = `<p class="muted">Unable to load documentation: ${error.message}</p>`
      }
    }
  }
}

window.widgets = window.widgets || {}
window.widgets.wiki = WikiWidget
