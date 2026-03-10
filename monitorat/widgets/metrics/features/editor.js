/* global alert */
class MetricsEditor {
  constructor(widget) {
    this.widget = widget;
  }

  async openEditor() {
    const widgetName = this.widget.config._widgetName || 'metrics';
    const apiBase = this.widget.getApiBase();

    let data;
    try {
      const response = await fetch(
        `${apiBase}/source?widget=${encodeURIComponent(widgetName)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      data = await response.json();
    } catch (error) {
      alert(`Failed to load metrics editor: ${error.message}`);
      return;
    }

    const quantities = data.quantities || [];
    const available = data.available || [];
    const sourcePath = data.path;

    let formContainer = null;

    await window.Editor.open({
      widget: widgetName,
      file: sourcePath,
      content: '',
      useForm: true,
      title: 'Metrics Snapshot Tiles',
      labels: { edit: 'Configure', preview: 'Preview' },
      onSave: async () => {
        const payload = this.collectQuantities(formContainer);
        const saveResponse = await fetch(
          `${apiBase}/source?widget=${encodeURIComponent(widgetName)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantities: payload }),
          },
        );
        if (!saveResponse.ok) {
          const error = await saveResponse.json();
          throw new Error(error.error || `HTTP ${saveResponse.status}`);
        }
        await this.widget.applySnapshotQuantities(payload);
      },
    });

    const modalContent = document.querySelector('.editor-modal-content');
    if (!modalContent) return;

    const editPane =
      modalContent.querySelector('.editor-form-pane') ||
      modalContent.querySelector('.editor-edit-pane');
    if (!editPane) return;

    const curtain = modalContent.querySelector('.editor-curtain');
    if (curtain) {
      curtain.style.display = 'none';
    }

    formContainer = this.buildForm(quantities, available);
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'form-scroll';
    scrollContainer.appendChild(formContainer);
    editPane.appendChild(scrollContainer);
  }

  buildOrderedList(enabledKeys, available) {
    const ordered = [];
    const seen = new Set();

    for (const key of enabledKeys) {
      const entry = available.find((item) => item.key === key);
      ordered.push({
        key,
        label: entry?.label || key,
        enabled: true,
      });
      seen.add(key);
    }

    for (const entry of available) {
      if (seen.has(entry.key)) continue;
      ordered.push({
        key: entry.key,
        label: entry.label,
        enabled: false,
      });
    }

    return ordered;
  }

  buildForm(enabledKeys, available) {
    const container = document.createElement('div');
    container.className = 'form-container';
    const ordered = this.buildOrderedList(enabledKeys || [], available);
    const list = document.createElement('div');
    list.className = 'metrics-editor-list';
    for (const item of ordered) {
      list.appendChild(this.buildRow(item));
    }
    container.appendChild(list);
    return container;
  }

  buildRow(item) {
    const row = document.createElement('div');
    row.className = 'metrics-editor-row';
    row.dataset.key = item.key;

    const checkboxId = `metrics-snapshot-${item.key}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.enabled;
    checkbox.className = 'metrics-editor-checkbox';
    checkbox.id = checkboxId;

    const label = document.createElement('label');
    label.className = 'metrics-editor-label';
    label.htmlFor = checkboxId;
    label.textContent = item.label;

    const key = document.createElement('span');
    key.className = 'metrics-editor-key';
    key.textContent = item.key;

    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'metrics-editor-move';
    moveUp.title = 'Move up';
    moveUp.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>';
    moveUp.addEventListener('click', () => this.moveRow(row, -1));

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'metrics-editor-move';
    moveDown.title = 'Move down';
    moveDown.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
    moveDown.addEventListener('click', () => this.moveRow(row, 1));

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(key);
    row.appendChild(moveUp);
    row.appendChild(moveDown);

    return row;
  }

  moveRow(row, direction) {
    const parent = row.parentElement;
    if (!parent) return;

    if (direction === -1 && row.previousElementSibling) {
      parent.insertBefore(row, row.previousElementSibling);
    } else if (direction === 1 && row.nextElementSibling) {
      parent.insertBefore(row.nextElementSibling, row);
    }
  }

  collectQuantities(formContainer) {
    if (!formContainer) return [];
    const result = [];
    const rows = formContainer.querySelectorAll('.metrics-editor-row');
    for (const row of rows) {
      const checkbox = row.querySelector('.metrics-editor-checkbox');
      if (checkbox?.checked) {
        result.push(row.dataset.key);
      }
    }
    return result;
  }
}

window.MetricsEditor = MetricsEditor;
