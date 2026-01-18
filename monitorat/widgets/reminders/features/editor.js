/* global alert */
const RemindersEditor = (() => {
  const DEFAULT_EXPIRY_DAYS = 30;

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

  function parseReminderContent(content) {
    const lines = content.split('\n');
    let reminderId = '';
    const reminder = {};

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
        reminderId = cleaned.slice(0, colonIndex).trim();
        return;
      }
      if (!reminderId) {
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
      reminder[key] = parseValue(rawValue);
    });

    return { reminderId, reminder };
  }

  function serializeReminderContent(state, { strict }) {
    let expiryDays = state.expiry_days;
    if (state.expires_on) {
      const computedDays = window.FormFields.calculateDaysUntil(
        state.expires_on,
      );
      if (computedDays <= 0) {
        throw new Error('Expires on must be in the future.');
      }
      expiryDays = computedDays;
    }
    if (strict) {
      const numericExpiry = Number(expiryDays);
      if (!Number.isFinite(numericExpiry) || numericExpiry <= 0) {
        throw new Error('Expiry days must be greater than zero.');
      }
      expiryDays = numericExpiry;
    }

    const serialize = serializeValue;
    const lines = [];
    lines.push(`${state.id}:`);
    lines.push(`  name: ${serialize(state.name)}`);
    lines.push(`  url: ${serialize(state.url)}`);
    lines.push(`  icon: ${serialize(state.icon)}`);
    if (state.expires_on) {
      lines.push(`  expires_on: ${serialize(state.expires_on)}`);
    }
    if (!state.enabled) {
      lines.push('  disabled: true');
    }
    lines.push(`  expiry_days: ${serialize(expiryDays)}`);
    lines.push(`  reason: ${serialize(state.reason)}`);
    return `${lines.join('\n')}\n`;
  }

  function buildReminderEditorForm(isEditing) {
    const form = document.createElement('div');
    form.className = 'form-container';
    form.innerHTML = `
      <div class="form-field form-id-row">
        <span class="form-label">ID</span>
        <div class="form-id-controls">
          <input class="form-input" type="text" name="id" ${isEditing ? 'readonly' : ''}>
          <label class="form-inline form-checkbox">
            <input type="checkbox" name="enabled">
            <span>Enabled</span>
          </label>
        </div>
      </div>
      <label class="form-field">
        <span class="form-label">Name</span>
        <input class="form-input" type="text" name="name">
      </label>
      <label class="form-field">
        <span class="form-label">On click URL</span>
        <input class="form-input" type="url" name="url">
      </label>
      <label class="form-field">
        <span class="form-label">Icon</span>
        <div class="form-icon-row">
          <input class="form-input" type="text" name="icon" placeholder="reminders/icon.png">
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
        <span class="form-label">Expiry</span>
        <div class="form-inline">
          <input class="form-input" type="number" name="expiry_days" min="1">
          <span class="form-suffix">days</span>
          <span class="form-or">or</span>
          <input class="form-input" type="date" name="expires_on">
        </div>
      </label>
      <label class="form-field">
        <span class="form-label">Reason</span>
        <textarea class="form-textarea" name="reason"></textarea>
      </label>
    `;
    return form;
  }

  function setReminderFormState(form, state) {
    window.FormFields.setFormState(form, state, {});
  }

  function getReminderFormState(form) {
    return window.FormFields.getFormState(form, {});
  }

  function applyEnabledState(form, enabled) {
    const fieldNames = [
      'name',
      'url',
      'icon',
      'expiry_days',
      'expires_on',
      'reason',
    ];
    window.FormFields.setFieldsDisabled(form, fieldNames, !enabled);
    const iconButton = form.querySelector('.form-icon-trigger');
    const iconInput = form.querySelector('.form-file-input');
    if (iconButton) {
      iconButton.disabled = !enabled;
    }
    if (iconInput) {
      iconInput.disabled = !enabled;
    }
  }

  async function open(options) {
    const {
      editorKey,
      reminderId,
      content,
      path,
      imgRoot,
      previewRenderer,
      onSave,
      onDelete,
    } = options;

    if (!window.Editor) {
      throw new Error('Editor modal is unavailable');
    }

    let handleSave = async () => {};

    await window.Editor.open({
      widget: editorKey,
      file: path,
      content,
      initialMode: 'edit',
      title: 'Reminder Editor',
      labels: { edit: 'Edit', preview: 'Preview' },
      previewRenderer: (value, previewElement) =>
        previewRenderer(value, previewElement),
      onSave: async () => handleSave(),
      onDelete,
    });

    const modalContent = document.querySelector('.editor-modal-content');
    if (!modalContent) {
      return;
    }

    const editPane = modalContent.querySelector('.editor-edit-pane');
    const previewElement = modalContent.querySelector('.editor-preview');
    const textarea = modalContent.querySelector('.editor-textarea');
    if (!editPane || !previewElement || !textarea) {
      return;
    }

    textarea.classList.add('reminder-editor-textarea-hidden');

    const { reminderId: parsedId, reminder } = parseReminderContent(content);
    const initialState = {
      id: parsedId || reminderId || 'new-reminder',
      name: reminder.name || parsedId || reminderId || '',
      url: reminder.url || '',
      icon: reminder.icon || '',
      expiry_days:
        reminder.expiry_days !== undefined
          ? reminder.expiry_days
          : DEFAULT_EXPIRY_DAYS,
      expires_on: reminder.expires_on || '',
      reason: reminder.reason || '',
      enabled: reminder.disabled !== true,
    };

    const form = buildReminderEditorForm(Boolean(reminderId));
    setReminderFormState(form, initialState);
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'form-scroll';
    scrollContainer.appendChild(form);
    editPane.appendChild(scrollContainer);

    const updateTextarea = () => {
      const state = getReminderFormState(form);
      if (!state.id) {
        return;
      }
      try {
        textarea.value = serializeReminderContent(state, { strict: false });
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
      apiEndpoint: 'api/reminders/icon',
      imgPrefix: 'img/',
      imgRoot,
      onUpdate: () => {
        updateTextarea();
      },
    });

    const expiresInput = form.querySelector('[name="expires_on"]');
    const expiryInput = form.querySelector('[name="expiry_days"]');
    if (expiresInput && expiryInput) {
      expiresInput.addEventListener('change', () => {
        if (!expiresInput.value) {
          return;
        }
        try {
          const computedDays = window.FormFields.calculateDaysUntil(
            expiresInput.value,
          );
          expiryInput.value = computedDays > 0 ? computedDays : '';
        } catch (error) {
          expiryInput.value = '';
        }
      });
    }

    const enabledInput = form.querySelector('[name="enabled"]');
    if (enabledInput) {
      enabledInput.addEventListener('change', () => {
        applyEnabledState(form, enabledInput.checked);
        updateTextarea();
      });
    }

    form.addEventListener('input', updateTextarea);
    updateTextarea();
    applyEnabledState(form, initialState.enabled);

    handleSave = async () => {
      const state = getReminderFormState(form);
      const serialized = serializeReminderContent(state, { strict: true });
      await onSave(serialized);
    };
  }

  return { open };
})();

window.RemindersEditor = RemindersEditor;
