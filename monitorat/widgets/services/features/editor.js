const ServicesEditor = (() => {
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

  const serviceSchema = {
    title: 'Service Editor',
    labels: { edit: 'Edit', preview: 'Preview' },
    fieldConfig: {
      containers: { type: 'array' },
      services: { type: 'array' },
      timers: { type: 'array' },
    },
    iconField: {
      triggerSelector: '.form-icon-trigger',
      previewSelector: '.form-icon-preview',
      inputSelector: '[name="icon"]',
      fileInputSelector: '.form-file-input',
      infoSelector: '.form-icon-info',
      apiEndpoint: 'api/services/icon',
      imgPrefix: 'img/',
    },
    preview: null,
    buildForm: ({ isEditing }) => buildServiceEditorForm(isEditing),
    buildInitialState: ({ item, itemKey, parseArrayValue }) => ({
      id: itemKey || 'new-service',
      name: item.name || itemKey || '',
      url: item.url || '',
      local: item.local || '',
      icon: item.icon || '',
      containers: parseArrayValue(item.containers),
      services: parseArrayValue(item.services),
      timers: parseArrayValue(item.timers),
      user: item.user === true,
      chrome: item.chrome === true,
    }),
    buildPayload: (state) => ({
      name: state.name ?? '',
      url: state.url ?? '',
      local: state.local ?? '',
      icon: state.icon ?? '',
      containers: state.containers || [],
      services: state.services || [],
      timers: state.timers || [],
      user: state.user === true,
      chrome: state.chrome === true,
    }),
  };

  async function open(options) {
    const { editorKey, serviceKey, item, path, imgRoot, onSave, onDelete } =
      options;

    return window.monitorShared.ItemEditor.open({
      editorKey,
      itemKey: serviceKey,
      item,
      path,
      imgRoot,
      onSave,
      onDelete,
      schema: serviceSchema,
    });
  }

  return { open };
})();

window.ServicesEditor = ServicesEditor;
