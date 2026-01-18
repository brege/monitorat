/* global alert */
const ServicesEditor = (() => {
  function parseValue(rawValue) {
    if (rawValue === 'true') {
      return true;
    }
    if (rawValue === 'false') {
      return false;
    }
    if (rawValue.startsWith('"')) {
      try {
        return JSON.parse(rawValue);
      } catch (error) {
        return rawValue.replaceAll('"', '');
      }
    }
    const numberValue = Number(rawValue);
    if (!Number.isNaN(numberValue) && rawValue !== '') {
      return numberValue;
    }
    return rawValue;
  }

  function serializeValue(value) {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
    return JSON.stringify(String(value ?? ''));
  }

  function parseServiceContent(content) {
    const lines = content.split('\n');
    let serviceKey = '';
    const service = {};

    lines.forEach((line) => {
      const cleaned = line.replace('\r', '');
      const trimmed = cleaned.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      if (!cleaned.startsWith(' ')) {
        const colonIndex = cleaned.indexOf(':');
        if (colonIndex === -1) {
          return;
        }
        serviceKey = cleaned.slice(0, colonIndex).trim();
        return;
      }
      if (!serviceKey) {
        return;
      }
      const fieldLine = cleaned.trim();
      const colonIndex = fieldLine.indexOf(':');
      if (colonIndex === -1) {
        return;
      }
      const key = fieldLine.slice(0, colonIndex).trim();
      const rawValue = fieldLine.slice(colonIndex + 1).trim();
      if (!key) {
        return;
      }
      service[key] = parseValue(rawValue);
    });

    return { serviceKey, service };
  }

  function serializeServiceContent(state) {
    const serialize = serializeValue;
    const lines = [];
    lines.push(`${state.id}:`);
    lines.push(`  name: ${serialize(state.name)}`);
    lines.push(`  url: ${serialize(state.url)}`);
    if (state.local && state.local !== state.url) {
      lines.push(`  local: ${serialize(state.local)}`);
    }
    lines.push(`  icon: ${serialize(state.icon)}`);
    if (state.containers && state.containers.length > 0) {
      lines.push(
        `  containers: [${state.containers.map((c) => serialize(c)).join(', ')}]`,
      );
    }
    if (state.services && state.services.length > 0) {
      lines.push(
        `  services: [${state.services.map((s) => serialize(s)).join(', ')}]`,
      );
    }
    if (state.timers && state.timers.length > 0) {
      lines.push(
        `  timers: [${state.timers.map((t) => serialize(t)).join(', ')}]`,
      );
    }
    if (state.user) {
      lines.push('  user: true');
    }
    if (state.chrome) {
      lines.push('  chrome: true');
    }
    return `${lines.join('\n')}\n`;
  }

  function parseArrayValue(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          return JSON.parse(value);
        } catch (error) {
          return value
            .slice(1, -1)
            .split(',')
            .map((item) => item.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean);
        }
      }
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function buildServiceEditorForm(isEditing) {
    const form = document.createElement('div');
    form.className = 'form-container';
    form.innerHTML = `
      <div class="form-field form-id-row">
        <span class="form-label">ID</span>
        <div class="form-id-controls">
          <input class="form-input" type="text" name="id" ${isEditing ? 'readonly' : ''}>
        </div>
      </div>
      <label class="form-field">
        <span class="form-label">Name</span>
        <input class="form-input" type="text" name="name">
      </label>
      <label class="form-field">
        <span class="form-label">URL</span>
        <input class="form-input" type="url" name="url">
      </label>
      <label class="form-field">
        <span class="form-label">Local URL</span>
        <input class="form-input" type="url" name="local" placeholder="Optional local/LAN address">
      </label>
      <label class="form-field">
        <span class="form-label">Icon</span>
        <div class="form-icon-row">
          <input class="form-input" type="text" name="icon" placeholder="services/icon.png">
          <button type="button" class="form-icon-trigger" aria-label="Upload icon">
            <span class="form-icon-preview hover-expand"></span>
          </button>
          <button type="button" class="form-icon-info info-button" aria-label="Copy icon path">
            <span class="form-icon-info-icon">${window.FormFields.INFO_ICON}</span>
          </button>
          <input class="form-file-input" type="file" accept=".png,.jpg,.jpeg,.svg,.webp">
        </div>
      </label>
      <label class="form-field">
        <span class="form-label">Containers</span>
        <input class="form-input" type="text" name="containers" placeholder="container1, container2">
      </label>
      <label class="form-field">
        <span class="form-label">Systemd Services</span>
        <input class="form-input" type="text" name="services" placeholder="service1, service2">
      </label>
      <label class="form-field">
        <span class="form-label">Systemd Timers</span>
        <input class="form-input" type="text" name="timers" placeholder="timer1, timer2">
      </label>
      <div class="form-field form-inline">
        <label class="form-checkbox">
          <input type="checkbox" name="user">
          <span>User-level systemd</span>
        </label>
        <label class="form-checkbox">
          <input type="checkbox" name="chrome">
          <span>Chrome icon</span>
        </label>
      </div>
    `;
    return form;
  }

  const fieldConfig = {
    containers: { type: 'array' },
    services: { type: 'array' },
    timers: { type: 'array' },
  };

  function setServiceFormState(form, state) {
    window.FormFields.setFormState(form, state, fieldConfig);
  }

  function getServiceFormState(form) {
    return window.FormFields.getFormState(form, fieldConfig);
  }

  async function open(options) {
    const { editorKey, serviceKey, content, path, imgRoot, onSave, onDelete } =
      options;

    if (!window.Editor) {
      throw new Error('Editor modal is unavailable');
    }

    let handleSave = async () => {};

    await window.Editor.open({
      widget: editorKey,
      file: path,
      content,
      initialMode: 'edit',
      title: 'Service Editor',
      labels: { edit: 'Edit', preview: 'Preview' },
      previewRenderer: null,
      onSave: async () => handleSave(),
      onDelete,
    });

    const modalContent = document.querySelector('.editor-modal-content');
    if (!modalContent) {
      return;
    }

    const editPane = modalContent.querySelector('.editor-edit-pane');
    const textarea = modalContent.querySelector('.editor-textarea');
    if (!editPane || !textarea) {
      return;
    }

    textarea.classList.add('service-editor-textarea-hidden');

    const curtain = modalContent.querySelector('.editor-curtain');
    if (curtain) {
      curtain.style.display = 'none';
    }

    const { serviceKey: parsedKey, service } = parseServiceContent(content);
    const initialState = {
      id: parsedKey || serviceKey || 'new-service',
      name: service.name || parsedKey || serviceKey || '',
      url: service.url || '',
      local: service.local || '',
      icon: service.icon || '',
      containers: parseArrayValue(service.containers),
      services: parseArrayValue(service.services),
      timers: parseArrayValue(service.timers),
      user: service.user === true,
      chrome: service.chrome === true,
    };

    const form = buildServiceEditorForm(Boolean(serviceKey));
    setServiceFormState(form, initialState);
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'form-scroll';
    scrollContainer.appendChild(form);
    editPane.appendChild(scrollContainer);

    const updateTextarea = () => {
      const state = getServiceFormState(form);
      if (!state.id) {
        return;
      }
      try {
        textarea.value = serializeServiceContent(state);
      } catch (error) {
        textarea.value = '';
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };

    window.FormFields.setupIconField({
      form,
      triggerSelector: '.form-icon-trigger',
      previewSelector: '.form-icon-preview',
      inputSelector: '[name="icon"]',
      fileInputSelector: '.form-file-input',
      infoSelector: '.form-icon-info',
      apiEndpoint: 'api/services/icon',
      imgPrefix: 'img/',
      imgRoot,
      onUpdate: () => {
        updateTextarea();
      },
    });

    form.addEventListener('input', updateTextarea);
    updateTextarea();

    handleSave = async () => {
      const state = getServiceFormState(form);
      const serialized = serializeServiceContent(state);
      await onSave(serialized);
    };
  }

  return { open };
})();

window.ServicesEditor = ServicesEditor;
