/* global alert */
window.FormFields = (() => {
  const ICON_PLACEHOLDER =
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M368.5 240H272v-96.5c0-8.8-7.2-16-16-16s-16 7.2-16 16V240h-96.5c-8.8 0-16 7.2-16 16 0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7H240v96.5c0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7 8.8 0 16-7.2 16-16V272h96.5c8.8 0 16-7.2 16-16s-7.2-16-16-16z"></path></svg>';
  const INFO_ICON =
    '<svg aria-hidden="true" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><circle cx="256" cy="256" r="184" style="stroke-miterlimit:10"/><polyline points="220 220 252 220 252 336"/><line x1="208" y1="340" x2="296" y2="340" style="stroke-miterlimit:10"/><circle cx="256" cy="156" r="26" fill="currentColor" stroke="none"/></svg>';

  function setFormState(form, state, fieldConfig) {
    for (const [name, value] of Object.entries(state)) {
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) {
        continue;
      }
      const config = fieldConfig?.[name] || {};
      if (input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else if (config.type === 'array' && Array.isArray(value)) {
        input.value = value.join(', ');
      } else {
        input.value = value ?? '';
      }
    }
  }

  function getFormState(form, fieldConfig) {
    const state = {};
    const inputs = form.querySelectorAll('[name]');
    for (const input of inputs) {
      const name = input.name;
      const config = fieldConfig?.[name] || {};
      if (input.type === 'checkbox') {
        state[name] = input.checked;
      } else if (config.type === 'array') {
        const raw = input.value.trim();
        state[name] = raw
          ? raw
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
      } else {
        state[name] = input.value.trim();
      }
    }
    return state;
  }

  function setFieldsDisabled(form, fieldNames, disabled) {
    for (const name of fieldNames) {
      const input = form.querySelector(`[name="${name}"]`);
      if (input) {
        input.disabled = disabled;
      }
    }
  }

  function renderIconPreview(element, iconPath, placeholder) {
    if (!element) {
      return;
    }
    element.innerHTML = '';
    if (iconPath && window.IconHandler) {
      const temp = document.createElement('span');
      window.IconHandler.renderIcon(temp, iconPath, 'Icon');
      element.appendChild(temp);
    } else {
      element.innerHTML = placeholder || ICON_PLACEHOLDER;
    }
  }

  async function handleIconUpload(fileInput, apiEndpoint, callbacks) {
    if (!fileInput.files || !fileInput.files[0]) {
      return null;
    }
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      const payload = await response.json();
      fileInput.value = '';
      if (callbacks?.onSuccess) {
        callbacks.onSuccess(payload);
      }
      return payload;
    } catch (error) {
      if (callbacks?.onError) {
        callbacks.onError(error);
      } else {
        alert(`Icon upload failed: ${error.message}`);
      }
      return null;
    }
  }

  function setupIconField(options) {
    const {
      form,
      triggerSelector,
      previewSelector,
      inputSelector,
      fileInputSelector,
      infoSelector,
      apiEndpoint,
      imgPrefix,
      imgRoot,
      onUpdate,
    } = options;

    const trigger = form.querySelector(triggerSelector);
    const preview = form.querySelector(previewSelector);
    const iconInput = form.querySelector(inputSelector);
    const fileInput = form.querySelector(fileInputSelector);
    const infoButton = form.querySelector(infoSelector);

    let lastUploadedPath = '';

    const updatePreview = () => {
      const iconValue = iconInput?.value?.trim();
      const iconPath = iconValue ? `${imgPrefix || 'img/'}${iconValue}` : '';
      renderIconPreview(preview, iconPath, ICON_PLACEHOLDER);
    };

    const resolveFullPath = () => {
      if (lastUploadedPath) {
        return lastUploadedPath;
      }
      const iconValue = iconInput?.value?.trim();
      if (iconValue && imgRoot) {
        return `${imgRoot.replace(/[\\/]+$/g, '')}/${iconValue}`;
      }
      return '';
    };

    const updateInfo = () => {
      if (!infoButton) {
        return;
      }
      const fullPath = resolveFullPath();
      infoButton.title = fullPath || 'Icon path will appear here after upload';
    };

    if (trigger && fileInput) {
      trigger.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', async () => {
        const payload = await handleIconUpload(fileInput, apiEndpoint, {
          onSuccess: (result) => {
            lastUploadedPath = result.full_path || '';
            if (iconInput) {
              iconInput.value = result.path || '';
              iconInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            updatePreview();
            updateInfo();
            if (onUpdate) {
              onUpdate(result);
            }
          },
        });
        return payload;
      });
    }

    if (infoButton) {
      infoButton.addEventListener('click', async () => {
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

    if (iconInput) {
      iconInput.addEventListener('input', () => {
        updatePreview();
        updateInfo();
      });
    }

    updatePreview();
    updateInfo();

    return {
      updatePreview,
      updateInfo,
      setLastUploadedPath: (path) => {
        lastUploadedPath = path;
      },
    };
  }

  function calculateDaysUntil(dateString) {
    const dateValue = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(dateValue.getTime())) {
      throw new Error('Date must be a valid YYYY-MM-DD format.');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = dateValue.getTime() - today.getTime();
    return Math.ceil(diffMs / 86400000);
  }

  return {
    ICON_PLACEHOLDER,
    INFO_ICON,
    setFormState,
    getFormState,
    setFieldsDisabled,
    renderIconPreview,
    handleIconUpload,
    setupIconField,
    calculateDaysUntil,
  };
})();
