/* global alert */
class WikiEditor {
  constructor(widget) {
    this.widget = widget;
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
    const widgetName = this.widget.config._widgetName || 'wiki';

    try {
      const response = await fetch(`api/wiki/source?widget=${widgetName}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const displayPath = data.display_path || data.path;
      const titlePath = this.escapeTitle(displayPath);

      window.Editor.open({
        widget: widgetName,
        file: data.path,
        content: data.content,
        title: `Edit: <span class="editor-title-path">${titlePath}</span>`,
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

          await this.widget.loadContent();
        },
      });

      await this.addRestoreDropdown(data.path);
    } catch (error) {
      alert(`Failed to load source: ${error.message}`);
    }
  }

  escapeTitle(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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

    document.addEventListener('click', (event) => {
      if (!restoreContainer.contains(event.target)) {
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

window.WikiEditor = WikiEditor;
