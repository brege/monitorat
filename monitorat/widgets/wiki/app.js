/* global alert */

class WikiWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = config;
    this.apiPrefix = config._apiPrefix || 'wiki';
    this.editor = null;
  }

  initializeFeatureHeaders() {
    const features = this.config.features || {};
    for (const [featureId, featureConfig] of Object.entries(features)) {
      const headerEl = this.container.querySelector(
        `[data-wiki-section-header="${featureId}"]`,
      );
      if (headerEl && featureConfig.header) {
        headerEl.textContent = featureConfig.header;
      }
    }
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };
    this.apiPrefix = config._apiPrefix || this.apiPrefix;

    const response = await fetch('widgets/wiki/index.html');
    const html = await response.text();
    container.innerHTML = html;

    const applyWidgetHeader = window.monitor?.applyWidgetHeader;
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
      });
    }

    this.initializeFeatureHeaders();

    if (window.monitorShared?.isEditModeEnabled?.() === true) {
      if (!window.WikiEditor && window.monitorShared?.loadScript) {
        await window.monitorShared.loadScript(
          'widgets/wiki/features/editor.js',
          'WikiEditor',
        );
      }
      if (window.WikiEditor) {
        this.editor = new window.WikiEditor(this);
        this.addEditButton();
      }
    }

    const mode = this.config.mode || 'featured';
    const allowedModes = new Set(['featured', 'seamless', 'rail']);
    if (!allowedModes.has(mode)) {
      throw new Error(`Unknown wiki mode: ${mode}`);
    }
    const notesContainer = this.container.querySelector('.notes');
    if (notesContainer) {
      notesContainer.dataset.mode = mode;
    }

    await this.loadContent();
  }

  getDisplayStrategy() {
    return this.config.columns === 1 ? 'sources' : 'columnate';
  }

  getMarkdownRenderer() {
    return window
      .markdownit({ html: true })
      .use(window.markdownItAnchor, {
        permalink: window.markdownItAnchor.permalink.linkInsideHeader({
          symbol: '#',
          placement: 'after',
        }),
      })
      .use(window.markdownItTocDoneRight);
  }

  async loadContent() {
    const mergeSources = this.config.federation?.nodes;
    if (mergeSources && Array.isArray(mergeSources)) {
      await this.loadMergedContent(mergeSources);
    } else {
      await this.loadSingleContent();
    }
  }

  async loadSingleContent() {
    try {
      const widgetName = this.config._widgetName || 'wiki';
      const isRemote = this.config._apiPrefix !== undefined;
      let docPath;
      if (this.config.doc) {
        docPath = isRemote
          ? `api/${this.apiPrefix}/doc`
          : `api/${this.apiPrefix}/doc?widget=${widgetName}`;
      } else {
        docPath = 'README.md';
      }
      const response = await fetch(docPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();

      const md = this.getMarkdownRenderer();
      const notesElement = this.container.querySelector('#about-notes');
      if (notesElement) {
        notesElement.innerHTML = md.render(text);
        this.wrapTables(notesElement);
        this.renderMermaid(notesElement);
      }
    } catch (error) {
      const notesElement = this.container.querySelector('#about-notes');
      if (notesElement) {
        notesElement.innerHTML = `<p class="muted">Unable to load documentation: ${error.message}</p>`;
      }
    }
  }

  async loadMergedContent(sources) {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/wiki-${source}/doc`);
          if (!response.ok) {
            return { source, content: null, error: `HTTP ${response.status}` };
          }
          const text = await response.text();
          return { source, content: text, error: null };
        } catch (error) {
          return { source, content: null, error: error.message };
        }
      }),
    );

    const notesElement = this.container.querySelector('#about-notes');
    if (!notesElement) return;

    const strategy = this.getDisplayStrategy();
    const md = this.getMarkdownRenderer();

    if (strategy === 'columnate') {
      this.renderColumnated(notesElement, results, md);
    } else {
      this.renderSources(notesElement, results, md);
    }

    this.renderMermaid(notesElement);
  }

  wrapTables(container) {
    const tables = container.querySelectorAll('table');
    tables.forEach((table) => {
      if (table.parentElement?.classList.contains('table-wrapper')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  renderMermaid(notesElement) {
    const mermaidApi = window.mermaid;
    if (!mermaidApi || !notesElement) return;

    if (!window.monitorMermaidInitialized) {
      mermaidApi.initialize({ startOnLoad: false });
      window.monitorMermaidInitialized = true;
    }

    const mermaidBlocks = notesElement.querySelectorAll(
      'pre code.language-mermaid',
    );
    if (mermaidBlocks.length === 0) return;

    for (const mermaidBlock of mermaidBlocks) {
      const diagramContainer = document.createElement('div');
      diagramContainer.className = 'mermaid';
      diagramContainer.textContent = mermaidBlock.textContent;

      const preElement = mermaidBlock.closest('pre');
      if (preElement) {
        preElement.replaceWith(diagramContainer);
      } else {
        mermaidBlock.replaceWith(diagramContainer);
      }
    }

    const diagramNodes = notesElement.querySelectorAll('.mermaid');
    if (diagramNodes.length === 0) return;

    const mermaidRun = mermaidApi.run;
    if (typeof mermaidRun === 'function') {
      mermaidRun({ nodes: diagramNodes });
      return;
    }

    const mermaidInit = mermaidApi.init;
    if (typeof mermaidInit === 'function') {
      mermaidInit(undefined, diagramNodes);
    }
  }

  shouldShowBadges() {
    return this.config.federation?.show_badges !== false;
  }

  renderSources(container, results, md) {
    container.innerHTML = '';
    const showBadges = this.shouldShowBadges();

    for (const result of results) {
      if (showBadges) {
        const header = document.createElement('div');
        header.className = 'feature-header';
        header.textContent = result.source;
        container.appendChild(header);
      }

      const content = document.createElement('div');
      content.className = 'wiki-source-content';
      if (result.content) {
        content.innerHTML = md.render(result.content);
        this.wrapTables(content);
      } else {
        content.innerHTML = `<p class="muted">Unable to load: ${result.error}</p>`;
      }
      container.appendChild(content);
    }
  }

  renderColumnated(container, results, md) {
    container.innerHTML = '';
    const showBadges = this.shouldShowBadges();

    const columns = document.createElement('div');
    columns.className = 'layout-columns wiki-columns';

    for (const result of results) {
      const column = document.createElement('div');
      column.className = 'layout-column';

      if (showBadges) {
        const header = document.createElement('div');
        header.className = 'feature-header';
        header.textContent = result.source;
        column.appendChild(header);
      }

      const content = document.createElement('div');
      content.className = 'wiki-source-content';
      if (result.content) {
        content.innerHTML = md.render(result.content);
        this.wrapTables(content);
      } else {
        content.innerHTML = `<p class="muted">Unable to load: ${result.error}</p>`;
      }
      column.appendChild(content);

      columns.appendChild(column);
    }

    container.appendChild(columns);
  }

  addEditButton() {
    const targetElement =
      this.container.querySelector('.notes') ||
      this.container.querySelector('.markdown-body');

    if (!targetElement) return;

    const editBtn = document.createElement('button');
    editBtn.className = 'editor-edit-btn hover-expand';
    editBtn.type = 'button';
    editBtn.title = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit document');
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    `;

    editBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.editor) {
        this.editor.openEditor();
      }
    });

    targetElement.appendChild(editBtn);
  }
}

window.widgets = window.widgets || {};
window.widgets.wiki = WikiWidget;
