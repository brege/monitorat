class WikiWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = { display: 'open', ...config };
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };

    const response = await fetch('widgets/wiki/wiki.html');
    const html = await response.text();
    container.innerHTML = html;
    
    // Update section title from config
    const title = container.querySelector('h2');
    if (title && this.config.name !== null && this.config.name !== false) {
      if (this.config.name) {
        title.textContent = this.config.name;
      }
    } else if (title && (this.config.name === null || this.config.name === false)) {
      title.remove();
    }

    await this.loadContent();
  }

  async loadContent() {
    try {
      const docPath = this.config.doc?.startsWith('/') ? 'api/wiki/doc' : this.config.doc || 'README.md';
      const response = await fetch(docPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();

      const md = window.markdownit({ html: true })
        .use(window.markdownItAnchor, {
          permalink: window.markdownItAnchor.permalink.linkInsideHeader({
            symbol: '#',
            placement: 'after'
          })
        })
        .use(window.markdownItTocDoneRight);

      const notesElement = this.container.querySelector('#about-notes');
      if (notesElement) {
        notesElement.innerHTML = md.render(text);
        this.applyDisplayPreference(notesElement);
      }
    } catch (error) {
      const notesElement = this.container.querySelector('#about-notes');
      if (notesElement) {
        notesElement.innerHTML = `<p class="muted">Unable to load documentation: ${error.message}</p>`;
      }
    }
  }

  applyDisplayPreference(root) {
    if (!root || !this.config.display) {
      return;
    }
    const desired = String(this.config.display).toLowerCase();
    const shouldOpen = desired !== 'closed';
    root.querySelectorAll('details').forEach((details) => {
      if (shouldOpen) {
        details.setAttribute('open', 'open');
      } else {
        details.removeAttribute('open');
      }
    });
  }
}

window.widgets = window.widgets || {};
window.widgets.wiki = WikiWidget;