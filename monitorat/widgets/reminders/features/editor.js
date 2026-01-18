/* global alert */
const RemindersEditor = (() => {
  const DEFAULT_EXPIRY_DAYS = 30;
  const ICON_PLACEHOLDER =
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M368.5 240H272v-96.5c0-8.8-7.2-16-16-16s-16 7.2-16 16V240h-96.5c-8.8 0-16 7.2-16 16 0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7H240v96.5c0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7 8.8 0 16-7.2 16-16V272h96.5c8.8 0 16-7.2 16-16s-7.2-16-16-16z"></path></svg>';
  const INFO_ICON =
    '<svg aria-hidden="true" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><circle cx="256" cy="256" r="184" style="stroke-miterlimit:10"/><polyline points="220 220 252 220 252 336"/><line x1="208" y1="340" x2="296" y2="340" style="stroke-miterlimit:10"/><circle cx="256" cy="156" r="26" fill="currentColor" stroke="none"/></svg>';

  function parseReminderValue(rawValue) {
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

  function serializeReminderValue(value) {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
    return JSON.stringify(String(value ?? ''));
  }

  function parseReminderContent(content) {
    // Parse the single-entry reminder YAML produced by the editor.
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
      reminder[key] = parseReminderValue(rawValue);
    });

    return { reminderId, reminder };
  }

  function calculateExpiryDays(expiresOn) {
    // Convert YYYY-MM-DD into remaining days.
    const dateValue = new Date(`${expiresOn}T00:00:00`);
    if (Number.isNaN(dateValue.getTime())) {
      throw new Error('Expires on must be a valid YYYY-MM-DD date.');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = dateValue.getTime() - today.getTime();
    return Math.ceil(diffMs / 86400000);
  }

  function serializeReminderContent(state, { strict }) {
    let expiryDays = state.expiry_days;
    if (state.expires_on) {
      const computedDays = calculateExpiryDays(state.expires_on);
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

    const lines = [];
    lines.push(`${state.id}:`);
    lines.push(`  name: ${serializeReminderValue(state.name)}`);
    lines.push(`  url: ${serializeReminderValue(state.url)}`);
    lines.push(`  icon: ${serializeReminderValue(state.icon)}`);
    if (state.expires_on) {
      lines.push(`  expires_on: ${serializeReminderValue(state.expires_on)}`);
    }
    if (!state.enabled) {
      lines.push('  disabled: true');
    }
    lines.push(`  expiry_days: ${serializeReminderValue(expiryDays)}`);
    lines.push(`  reason: ${serializeReminderValue(state.reason)}`);
    return `${lines.join('\n')}\n`;
  }

  function buildReminderEditorForm(isEditing) {
    const form = document.createElement('div');
    form.className = 'reminder-editor-form';
    form.innerHTML = `
      <div class="reminder-editor-field reminder-editor-id-row">
        <span class="reminder-editor-label">ID</span>
        <div class="reminder-editor-id-controls">
          <input class="reminder-editor-input" type="text" name="id" ${isEditing ? 'readonly' : ''}>
          <label class="reminder-editor-inline reminder-editor-checkbox">
            <input type="checkbox" name="enabled">
            <span>Enabled</span>
          </label>
        </div>
      </div>
      <label class="reminder-editor-field">
        <span class="reminder-editor-label">Name</span>
        <input class="reminder-editor-input" type="text" name="name">
      </label>
      <label class="reminder-editor-field">
        <span class="reminder-editor-label">On click URL</span>
        <input class="reminder-editor-input" type="url" name="url">
      </label>
      <label class="reminder-editor-field">
        <span class="reminder-editor-label">Icon</span>
        <div class="reminder-editor-icon-row">
          <input class="reminder-editor-input" type="text" name="icon" placeholder="reminders/icon.png">
          <button type="button" class="reminder-editor-icon-trigger" aria-label="Upload icon">
            <span class="reminder-editor-icon-preview hover-expand"></span>
          </button>
          <button type="button" class="reminder-editor-icon-info info-button" aria-label="Copy icon path">
            <span class="reminder-editor-icon-info-icon">${INFO_ICON}</span>
          </button>
          <input class="reminder-editor-icon-input" type="file" accept=".png,.jpg,.jpeg,.svg,.webp">
        </div>
      </label>
      <label class="reminder-editor-field">
        <span class="reminder-editor-label">Expiry</span>
        <div class="reminder-editor-inline">
          <input class="reminder-editor-input" type="number" name="expiry_days" min="1">
          <span class="reminder-editor-suffix">days</span>
          <span class="reminder-editor-or">or</span>
          <input class="reminder-editor-input" type="date" name="expires_on">
        </div>
      </label>
      <label class="reminder-editor-field">
        <span class="reminder-editor-label">Reason</span>
        <textarea class="reminder-editor-textarea" name="reason"></textarea>
      </label>
    `;
    return form;
  }

  function setReminderFormState(form, state) {
    const setValue = (name, value) => {
      const input = form.querySelector(`[name="${name}"]`);
      if (input) {
        input.value = value ?? '';
      }
    };
    setValue('id', state.id);
    setValue('name', state.name);
    setValue('url', state.url);
    setValue('icon', state.icon);
    setValue('expiry_days', state.expiry_days);
    setValue('expires_on', state.expires_on);
    setValue('reason', state.reason);
    const enabledInput = form.querySelector('[name="enabled"]');
    if (enabledInput) {
      enabledInput.checked = state.enabled;
    }
    applyEnabledState(form, state.enabled);
  }

  function getReminderFormState(form) {
    const getValue = (name) =>
      form.querySelector(`[name="${name}"]`)?.value ?? '';
    return {
      id: getValue('id').trim(),
      name: getValue('name').trim(),
      url: getValue('url').trim(),
      icon: getValue('icon').trim(),
      expiry_days: getValue('expiry_days').trim(),
      expires_on: getValue('expires_on').trim(),
      reason: getValue('reason').trim(),
      enabled: form.querySelector('[name="enabled"]')?.checked !== false,
    };
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
    fieldNames.forEach((name) => {
      const input = form.querySelector(`[name="${name}"]`);
      if (input) {
        input.disabled = !enabled;
      }
    });
    const iconButton = form.querySelector('.reminder-editor-icon-trigger');
    const iconInput = form.querySelector('.reminder-editor-icon-input');
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
    scrollContainer.className = 'reminder-editor-scroll';
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

    const iconInput = form.querySelector('.reminder-editor-icon-input');
    const iconButton = form.querySelector('.reminder-editor-icon-trigger');
    const iconPreview = form.querySelector('.reminder-editor-icon-preview');
    const iconField = form.querySelector('[name="icon"]');
    const iconInfo = form.querySelector('.reminder-editor-icon-info');
    const iconInfoIcon = form.querySelector('.reminder-editor-icon-info-icon');
    let lastUploadedPath = '';

    const renderIconPreview = () => {
      if (!iconPreview) {
        return;
      }
      iconPreview.innerHTML = '';
      const iconValue = iconField?.value?.trim();
      if (iconValue && window.IconHandler) {
        const temp = document.createElement('span');
        window.IconHandler.renderIcon(temp, `img/${iconValue}`, 'Icon');
        iconPreview.appendChild(temp);
      } else {
        iconPreview.innerHTML = ICON_PLACEHOLDER;
      }
    };

    const resolveFullPath = () => {
      if (lastUploadedPath) {
        return lastUploadedPath;
      }
      const iconValue = iconField?.value?.trim();
      if (iconValue && imgRoot) {
        // Trim trailing slashes/backslashes from imgRoot.
        return `${imgRoot.replace(/[\\/]+$/g, '')}/${iconValue}`;
      }
      return '';
    };

    const updateIconInfo = () => {
      if (!iconInfo) {
        return;
      }
      const fullPath = resolveFullPath();
      iconInfo.title = fullPath || 'Icon path will appear here after upload';
    };

    if (iconButton && iconInput) {
      iconButton.addEventListener('click', () => {
        iconInput.click();
      });
      iconInput.addEventListener('change', async () => {
        if (!iconInput.files || !iconInput.files[0]) {
          return;
        }
        const formData = new FormData();
        formData.append('file', iconInput.files[0]);
        try {
          const response = await fetch('api/reminders/icon', {
            method: 'POST',
            body: formData,
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
          }
          const payload = await response.json();
          lastUploadedPath = payload.full_path || '';
          if (iconField) {
            iconField.value = payload.path || '';
            iconField.dispatchEvent(new Event('input', { bubbles: true }));
          }
          iconInput.value = '';
          renderIconPreview();
          updateIconInfo();
        } catch (error) {
          alert(`Icon upload failed: ${error.message}`);
        }
      });
    }

    if (iconInfo && iconInfoIcon) {
      iconInfo.addEventListener('click', async () => {
        const fullPath = resolveFullPath();
        if (!fullPath) {
          return;
        }
        try {
          await navigator.clipboard.writeText(fullPath);
        } catch (error) {
          alert('Failed to copy icon path.');
        }
      });
    }

    const expiresInput = form.querySelector('[name="expires_on"]');
    const expiryInput = form.querySelector('[name="expiry_days"]');
    if (expiresInput && expiryInput) {
      expiresInput.addEventListener('change', () => {
        if (!expiresInput.value) {
          return;
        }
        try {
          const computedDays = calculateExpiryDays(expiresInput.value);
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
    iconField?.addEventListener('input', () => {
      renderIconPreview();
      updateIconInfo();
    });
    updateTextarea();
    renderIconPreview();
    updateIconInfo();

    handleSave = async () => {
      const state = getReminderFormState(form);
      const serialized = serializeReminderContent(state, { strict: true });
      await onSave(serialized);
    };
  }

  return { open };
})();

window.RemindersEditor = RemindersEditor;
