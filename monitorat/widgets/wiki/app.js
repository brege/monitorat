/* global alert */

class WikiWidget {
  constructor(config = {}) {
    this.container = null;
    this.config = config;
    this.apiPrefix = config._apiPrefix || 'wiki';
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

    if (this.config.edit === true) {
      this.addEditButton();
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
    editBtn.className = 'wiki-edit-btn';
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
      this.openEditor();
    });

    targetElement.appendChild(editBtn);
  }

  async loadVersions(filePath) {
    try {
      const response = await fetch(
        `api/wiki/versions?path=${encodeURIComponent(filePath)}`,
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.versions || [];
    } catch {
      return [];
    }
  }

  async openEditor() {
    const widgetName = this.config._widgetName || 'wiki';

    try {
      const response = await fetch(`api/wiki/source?widget=${widgetName}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      window.Editor.open({
        widget: widgetName,
        file: data.path,
        content: data.content,
        onSave: async (newContent) => {
          const saveResponse = await fetch(
            `api/wiki/source?widget=${widgetName}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: newContent }),
            },
          );

          if (!saveResponse.ok) {
            const error = await saveResponse.json();
            throw new Error(error.error || `HTTP ${saveResponse.status}`);
          }

          await this.loadContent();
        },
      });

      await this.addRestoreDropdown(data.path);
    } catch (error) {
      alert(`Failed to load source: ${error.message}`);
    }
  }

  async addRestoreDropdown(filePath) {
    const versions = await this.loadVersions(filePath);
    if (versions.length === 0) {
      return;
    }

    const editorActionsLeft = document.querySelector('.editor-actions-left');
    if (!editorActionsLeft) {
      return;
    }

    const ICON_RESTORE =
      '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path fill="none" d="M0 0h24v24H0V0z"></path><path d="M13 3a9 9 0 0 0-9 9H1l4 3.99L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z"></path></svg>';
    const CHEVRON_DOWN =
      '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';

    const restoreContainer = document.createElement('div');
    restoreContainer.style.position = 'relative';
    restoreContainer.style.display = 'inline-block';

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'icon-label';
    restoreBtn.style.display = 'flex';
    restoreBtn.style.alignItems = 'center';
    restoreBtn.style.gap = '4px';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon-label-icon';
    iconSpan.innerHTML = ICON_RESTORE;
    iconSpan.style.width = '16px';
    iconSpan.style.height = '16px';

    const textSpan = document.createElement('span');
    textSpan.className = 'icon-label-text';
    textSpan.textContent = 'Restore';

    const chevronSpan = document.createElement('span');
    chevronSpan.style.width = '12px';
    chevronSpan.style.height = '12px';
    chevronSpan.innerHTML = CHEVRON_DOWN;

    restoreBtn.appendChild(iconSpan);
    restoreBtn.appendChild(textSpan);
    restoreBtn.appendChild(chevronSpan);

    const menu = document.createElement('div');
    menu.style.display = 'none';
    menu.style.position = 'absolute';
    menu.style.bottom = '100%';
    menu.style.left = '0';
    menu.style.marginBottom = '8px';
    menu.style.background = 'var(--bg-primary)';
    menu.style.border = '1px solid var(--border-color)';
    menu.style.borderRadius = '6px';
    menu.style.zIndex = '1001';
    menu.style.minWidth = '220px';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    menu.style.overflow = 'hidden';
    menu.style.maxHeight = '300px';
    menu.style.overflowY = 'auto';

    const computed = window.getComputedStyle(
      document.querySelector('.editor-modal') || document.body,
    );
    const bgColor = computed.backgroundColor;
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
      menu.style.backgroundColor = bgColor;
    }

    versions.forEach((version, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.style.display = 'block';
      item.style.width = '100%';
      item.style.padding = '10px 12px';
      item.style.textAlign = 'left';
      item.style.border = 'none';
      item.style.background = 'transparent';
      item.style.cursor = 'pointer';
      item.style.fontSize = '0.85rem';
      item.style.color = 'var(--text-primary)';
      item.style.transition = 'background-color 0.15s';
      if (index < versions.length - 1) {
        item.style.borderBottom = '1px solid var(--border-color)';
      }

      item.textContent = version.label;

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'var(--bg-hover)';
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });

      item.addEventListener('click', async () => {
        try {
          const restoreResponse = await fetch(
            `api/wiki/restore?path=${encodeURIComponent(filePath)}&version=${encodeURIComponent(version.filename)}`,
          );
          if (!restoreResponse.ok) {
            throw new Error(`HTTP ${restoreResponse.status}`);
          }
          const restoreData = await restoreResponse.json();
          const textarea = document.querySelector('.editor-textarea');
          if (textarea) {
            textarea.value = restoreData.content;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
          menu.style.display = 'none';
        } catch (error) {
          alert(`Failed to restore: ${error.message}`);
        }
      });

      menu.appendChild(item);
    });

    restoreBtn.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!restoreContainer.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    restoreContainer.appendChild(restoreBtn);
    restoreContainer.appendChild(menu);
    editorActionsLeft.insertBefore(
      restoreContainer,
      editorActionsLeft.firstChild,
    );
  }
}

window.widgets = window.widgets || {};
window.widgets.wiki = WikiWidget;
