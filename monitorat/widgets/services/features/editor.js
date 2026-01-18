/* global alert */
const ServicesEditor = (() => {
  function buildServicePayload(state) {
    return {
      name: state.name ?? '',
      url: state.url ?? '',
      local: state.local ?? '',
      icon: state.icon ?? '',
      containers: state.containers || [],
      services: state.services || [],
      timers: state.timers || [],
      user: state.user === true,
      chrome: state.chrome === true,
    };
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
        <span class="form-label">External URL</span>
        <input class="form-input" type="url" name="url">
      </label>
      <label class="form-field">
        <span class="form-label">Local URL</span>
        <input class="form-input" type="url" name="local" placeholder="Optional local/LAN address">
      </label>
      <label class="form-field">
        <span class="form-label">Icon</span>
        <div class="form-inline-row">
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
          <label class="form-checkbox">
            <input type="checkbox" name="chrome">
            <span>Monochrome</span>
          </label>
        </div>
      </label>
      <label class="form-field">
        <span class="form-label">Containers</span>
        <input class="form-input" type="text" name="containers" placeholder="container1, container2">
      </label>
      <label class="form-field">
        <span class="form-label">Systemd Services</span>
        <div class="form-inline-row">
          <input class="form-input" type="text" name="services" placeholder="service1, service2">
          <label class="form-checkbox">
            <input type="checkbox" name="user">
            <span>User-level systemd</span>
          </label>
        </div>
      </label>
      <label class="form-field">
        <span class="form-label">Systemd Timers</span>
        <input class="form-input" type="text" name="timers" placeholder="timer1, timer2">
      </label>
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
    const { editorKey, serviceKey, item, path, imgRoot, onSave, onDelete } =
      options;

    if (!window.Editor) {
      throw new Error('Editor modal is unavailable');
    }

    let handleSave = async () => {};

    await window.Editor.open({
      widget: editorKey,
      file: path,
      content: '',
      initialMode: 'edit',
      title: 'Service Editor',
      labels: { edit: 'Edit', preview: 'Preview' },
      previewRenderer: null,
      useForm: true,
      onSave: async () => handleSave(),
      onDelete,
    });

    const modalContent = document.querySelector('.editor-modal-content');
    if (!modalContent) {
      return;
    }

    const editPane =
      modalContent.querySelector('.editor-form-pane') ||
      modalContent.querySelector('.editor-edit-pane');
    if (!editPane) {
      return;
    }

    const curtain = modalContent.querySelector('.editor-curtain');
    if (curtain) {
      curtain.style.display = 'none';
    }

    const service = item || {};
    const initialState = {
      id: serviceKey || 'new-service',
      name: service.name || serviceKey || '',
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
      onUpdate: () => {},
    });

    handleSave = async () => {
      const state = getServiceFormState(form);
      const payload = buildServicePayload(state);
      await onSave({ id: state.id, item: payload });
    };
  }

  return { open };
})();

window.ServicesEditor = ServicesEditor;
