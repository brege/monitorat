// Reminders Widget
/* global alert */
class RemindersWidget {
  constructor(config = {}) {
    this.container = null;
    this.remindersConfig = null;
    this.config = config;
    this.selectedSource = 'all';
    this.filteredReminders = null;
    this.features = {
      controls: null,
      alerts: null,
    };
  }

  initializeFeatureHeaders() {
    const features = this.config.features || {};
    for (const [featureId, featureConfig] of Object.entries(features)) {
      const headerEl = this.container.querySelector(
        `[data-reminders-section-header="${featureId}"]`,
      );
      if (headerEl && featureConfig.header) {
        headerEl.textContent = featureConfig.header;
      }
    }
  }

  getApiBase() {
    return this.config._apiPrefix
      ? `api/${this.config._apiPrefix}`
      : 'api/reminders';
  }

  getImgBase() {
    return this.config.remote ? `api/proxy/${this.config.remote}/img` : 'img';
  }

  canEditReminders() {
    if (this.config._apiPrefix || this.config.remote) {
      return false;
    }
    if (this.config.federation?.nodes) {
      return false;
    }
    return this.config.edit === true;
  }

  async openReminderEditor(reminder = null) {
    if (!this.canEditReminders()) {
      return;
    }

    const reminderId = reminder?.id || null;
    const requestUrl = new URL(`${this.getApiBase()}/source`, window.location);
    if (reminderId) {
      requestUrl.searchParams.set('reminder', reminderId);
    }

    try {
      const response = await fetch(requestUrl, { cache: 'no-store' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      const data = await response.json();

      const editorKey = reminderId
        ? `reminders:${reminderId}`
        : 'reminders:new';

      window.Editor.open({
        widget: editorKey,
        file: data.path,
        content: data.content,
        initialMode: 'edit',
        previewRenderer: (content, previewElement) =>
          this.renderReminderPreview(content, previewElement),
        onSave: async (newContent) => {
          const saveUrl = new URL(
            `${this.getApiBase()}/source`,
            window.location,
          );
          if (reminderId) {
            saveUrl.searchParams.set('reminder', reminderId);
          }
          const saveResponse = await fetch(saveUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent }),
          });
          if (!saveResponse.ok) {
            const error = await saveResponse.json();
            throw new Error(error.error || `HTTP ${saveResponse.status}`);
          }
          await this.loadData();
        },
        onDelete: reminderId
          ? async () => {
              const deleteUrl = new URL(
                `${this.getApiBase()}/source`,
                window.location,
              );
              deleteUrl.searchParams.set('reminder', reminderId);
              const deleteResponse = await fetch(deleteUrl, {
                method: 'DELETE',
              });
              if (!deleteResponse.ok) {
                const error = await deleteResponse.json();
                throw new Error(error.error || `HTTP ${deleteResponse.status}`);
              }
              await this.loadData();
            }
          : null,
      });
    } catch (error) {
      alert(`Failed to load reminder editor: ${error.message}`);
    }
  }

  async renderReminderPreview(content, previewElement) {
    if (!previewElement) return;
    previewElement.innerHTML = '';
    previewElement.classList.add('reminder-editor-preview');

    if (!content.trim()) {
      previewElement.textContent = 'Add reminder YAML to preview.';
      return;
    }

    const requestUrl = new URL(`${this.getApiBase()}/preview`, window.location);
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json();
      previewElement.textContent = error.error || `HTTP ${response.status}`;
      return;
    }

    const payload = await response.json();
    const reminderData = payload.reminder;
    if (!reminderData) {
      previewElement.textContent = 'Preview unavailable.';
      return;
    }

    const previewCard = this.features.alerts.createReminderCard(
      reminderData,
      false,
      { disableActions: true },
    );
    previewElement.appendChild(previewCard);
  }

  sortReminders(reminders) {
    const sortBy = this.config.sort_by || 'due.asc';
    const [field, direction] = sortBy.split('.');
    const ascending = direction !== 'desc';

    return [...reminders].sort((a, b) => {
      let valueA, valueB;

      switch (field) {
        case 'name':
          valueA = (a.name || '').toLowerCase();
          valueB = (b.name || '').toLowerCase();
          break;
        case 'due':
          valueA = a.days_remaining ?? Infinity;
          valueB = b.days_remaining ?? Infinity;
          break;
        case 'touched':
          valueA = a.days_since ?? Infinity;
          valueB = b.days_since ?? Infinity;
          break;
        default:
          return 0;
      }

      if (valueA < valueB) return ascending ? -1 : 1;
      if (valueA > valueB) return ascending ? 1 : -1;
      return 0;
    });
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };

    const response = await fetch('widgets/reminders/index.html');
    const html = await response.text();
    container.innerHTML = html;

    const applyWidgetHeader = window.monitor?.applyWidgetHeader;
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
        preserveChildren: true,
      });
    }

    this.initializeFeatureHeaders();
    await this.loadFeatureScripts();
    this.initializeFeatures();
    this.features.controls.initialize();
    await this.loadData();
  }

  async loadData() {
    try {
      const mergeSources = this.config.federation?.nodes;
      if (mergeSources && Array.isArray(mergeSources)) {
        await this.loadMergedData(mergeSources);
      } else {
        const response = await fetch(this.getApiBase());
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const reminders = await response.json();
        this.remindersConfig = reminders;
      }
      this.updateSourceFilter();
      this.render();
    } catch (error) {
      console.error('Unable to load reminders:', error.message);
    }
  }

  async loadMergedData(sources) {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/reminders-${source}`);
          if (!response.ok) {
            console.warn(
              `Failed to fetch reminders from ${source}: HTTP ${response.status}`,
            );
            return [];
          }
          const reminders = await response.json();
          return reminders.map((r) => ({ ...r, _source: source }));
        } catch (error) {
          console.warn(
            `Failed to fetch reminders from ${source}:`,
            error.message,
          );
          return [];
        }
      }),
    );

    this.remindersConfig = results.flat();
    this.updateSourceFilter();
  }

  render() {
    this.filteredReminders = this.getFilteredReminders();
    this.features.alerts.render();
  }

  async loadFeatureScripts() {
    const featureScripts = [
      {
        globalName: 'IconHandler',
        source: 'ui/icons.js',
      },
      {
        globalName: 'RemindersControls',
        source: 'widgets/reminders/features/controls.js',
      },
      {
        globalName: 'RemindersAlerts',
        source: 'widgets/reminders/features/alerts.js',
      },
    ];

    await window.monitorShared.loadFeatureScripts(featureScripts);
  }

  initializeFeatures() {
    const ControlsFeature = window.RemindersControls;
    const AlertsFeature = window.RemindersAlerts;

    if (!ControlsFeature || !AlertsFeature) {
      throw new Error('Reminders feature scripts not loaded');
    }

    this.features.controls = new ControlsFeature(this);
    this.features.alerts = new AlertsFeature(this);
  }

  getFilteredReminders() {
    const reminders = this.remindersConfig || [];
    if (this.selectedSource === 'all') {
      return reminders;
    }
    return reminders.filter(
      (reminder) => reminder._source === this.selectedSource,
    );
  }

  resolveSources() {
    const configSources = this.config.federation?.nodes;
    if (configSources && Array.isArray(configSources)) {
      return configSources;
    }
    const sources = new Set(
      (this.remindersConfig || [])
        .map((reminder) => reminder._source)
        .filter(Boolean),
    );
    return Array.from(sources);
  }

  updateSourceFilter() {
    if (!this.features.controls?.updateSources) return;
    const sources = this.resolveSources();
    this.features.controls.updateSources(sources, this.selectedSource);
  }
}

// Test notification function (global)
async function testNotification() {
  try {
    const response = await fetch('api/reminders/test-notification', {
      method: 'POST',
    });
    const result = await response.json();
    if (result.success) {
      alert('Test notification sent!');
    } else {
      alert('Failed to send test notification');
    }
  } catch {
    alert('Error sending test notification');
  }
}
window.testNotification = testNotification;

// Register widget
window.widgets = window.widgets || {};
window.widgets.reminders = RemindersWidget;
