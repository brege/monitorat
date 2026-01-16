/* global alert */
class NotificationTester {
  constructor(options = {}) {
    this.container = options.container;
    this.buttonSelector = options.buttonSelector;
    this.apiBase = options.apiBase || 'reminders';
    this.sources = options.sources || null;
    this.onSuccess = options.onSuccess || null;
    this.onError = options.onError || null;
  }

  initialize() {
    if (!this.container) return;

    const button = this.container.querySelector(this.buttonSelector);
    if (!button) return;

    if (
      this.sources &&
      Array.isArray(this.sources) &&
      this.sources.length > 1
    ) {
      this.replaceWithDropdown(button);
    } else {
      this.attachSingleHandler(button);
    }
  }

  attachSingleHandler(button) {
    button.removeAttribute('onclick');
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.sendNotification(null);
    });
  }

  replaceWithDropdown(button) {
    button.removeAttribute('onclick');

    const dropdown = document.createElement('select');
    dropdown.className = button.className;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = button.textContent || 'Test Notification';
    placeholder.disabled = true;
    placeholder.selected = true;
    dropdown.appendChild(placeholder);

    for (const source of this.sources) {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source;
      dropdown.appendChild(option);
    }

    dropdown.addEventListener('change', async () => {
      if (dropdown.value) {
        await this.sendNotification(dropdown.value);
        dropdown.value = '';
      }
    });

    button.replaceWith(dropdown);
  }

  async sendNotification(source) {
    const endpoint = source
      ? `api/${this.apiBase}-${source}/test-notification`
      : `api/${this.apiBase}/test-notification`;

    try {
      const response = await fetch(endpoint, { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        if (this.onSuccess) {
          this.onSuccess(source, result);
        } else {
          const label = source ? ` to ${source}` : '';
          alert(`Test notification sent${label}!`);
        }
      } else {
        if (this.onError) {
          this.onError(source, result);
        } else {
          const label = source ? ` to ${source}` : '';
          alert(`Failed to send test notification${label}`);
        }
      }
    } catch (error) {
      if (this.onError) {
        this.onError(source, { error: error.message });
      } else {
        const label = source ? ` to ${source}` : '';
        alert(`Error sending test notification${label}`);
      }
    }
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.NotificationTester = NotificationTester;
