const RemindersEditor = (() => {
  const DEFAULT_EXPIRY_DAYS = 30;

  function buildReminderPayload(state, { strict }) {
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

    return {
      name: state.name ?? '',
      url: state.url ?? '',
      icon: state.icon ?? '',
      expires_on: state.expires_on || '',
      expiry_days: expiryDays,
      reason: state.reason ?? '',
      disabled: !state.enabled,
    };
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
      item,
      path,
      imgRoot,
      previewRenderer,
      onSave,
      onDelete,
    } = options;

    const renderer =
      typeof previewRenderer === 'function'
        ? (value, previewElement) => previewRenderer(value, previewElement)
        : null;

    const reminderSchema = {
      title: 'Reminder Editor',
      labels: { edit: 'Edit', preview: 'Preview' },
      buildForm: ({ isEditing }) => buildReminderEditorForm(isEditing),
      buildInitialState: ({ item: initialItem, itemKey }) => ({
        id: itemKey || 'new-reminder',
        name: initialItem.name || itemKey || '',
        url: initialItem.url || '',
        icon: initialItem.icon || '',
        expiry_days:
          initialItem.expiry_days !== undefined
            ? initialItem.expiry_days
            : DEFAULT_EXPIRY_DAYS,
        expires_on: initialItem.expires_on || '',
        reason: initialItem.reason || '',
        enabled: initialItem.disabled !== true,
      }),
      buildPayload: (state) => buildReminderPayload(state, { strict: true }),
      iconField: {
        triggerSelector: '.form-icon-trigger',
        previewSelector: '.form-icon-preview',
        inputSelector: '[name="icon"]',
        fileInputSelector: '.form-file-input',
        infoSelector: '.form-icon-info',
        apiEndpoint: 'api/reminders/icon',
        imgPrefix: 'img/',
      },
      preview: renderer ? { renderer } : null,
      onFormReady: (form, helpers) => {
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
          });
        }

        const currentState = helpers.getState();
        applyEnabledState(form, currentState.enabled);

        return () => {
          const state = helpers.getState();
          try {
            return {
              id: state.id,
              item: buildReminderPayload(state, { strict: false }),
            };
          } catch (error) {
            return null;
          }
        };
      },
    };

    return window.monitorShared.ItemEditor.open({
      editorKey,
      itemKey: reminderId,
      item,
      path,
      imgRoot,
      schema: reminderSchema,
      onSave,
      onDelete,
    });
  }

  return { open };
})();

window.RemindersEditor = RemindersEditor;
