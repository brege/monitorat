class RemindersControls {
  constructor(widget) {
    this.widget = widget;
  }

  initialize() {
    this.initializeSortController();
    this.initializeSourceFilter();
    this.initializeAddReminderButton();
    this.initializeTestNotification();
  }

  initializeSortController() {
    const fieldSelect = this.widget.container.querySelector(
      '.reminders-sort-field',
    );
    const directionSelect = this.widget.container.querySelector(
      '.reminders-sort-dir',
    );
    if (!fieldSelect || !directionSelect) return;

    const SortByController = window.monitorShared.SortByController;
    const initialSortBy = this.widget.config.sort_by;

    this.sortController = new SortByController({
      fieldSelect,
      directionSelect,
      initialSortBy,
      defaultSortBy: 'due.asc',
      directionLabelsByField: {
        due: { asc: 'Soonest', desc: 'Latest' },
        name: { asc: 'A - Z', desc: 'Z - A' },
        touched: { asc: 'Recent', desc: 'Oldest' },
      },
      onApply: (sortBy) => {
        this.widget.config.sort_by = sortBy;
        this.widget.render();
      },
    });
    this.sortController.initialize();
  }

  initializeTestNotification() {
    const NotificationTester = window.monitorShared.NotificationTester;
    if (!NotificationTester) return;

    const mergeSources = this.widget.config.federation?.nodes;

    this.notificationTester = new NotificationTester({
      container: this.widget.container,
      buttonSelector: 'button[onclick="testNotification()"]',
      apiBase: 'reminders',
      sources: mergeSources,
    });
    this.notificationTester.initialize();
  }

  initializeSourceFilter() {
    const sourceSelect = this.widget.container.querySelector(
      '.reminders-source-filter',
    );
    if (!sourceSelect) return;

    sourceSelect.addEventListener('change', () => {
      this.widget.selectedSource = sourceSelect.value;
      this.widget.render();
    });
    this.sourceSelect = sourceSelect;
  }

  initializeAddReminderButton() {
    if (!this.widget.canEditReminders()) {
      return;
    }

    const controlsDiv = this.widget.container.querySelector('.widget-controls');
    if (!controlsDiv) return;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'alerts-toggle';
    addButton.textContent = 'Add Reminder';
    addButton.addEventListener('click', () => {
      this.widget.openReminderEditor();
    });
    controlsDiv.appendChild(addButton);
  }

  updateSources(sources, selectedSource) {
    if (!this.sourceSelect) return;
    if (!Array.isArray(sources) || sources.length < 2) {
      this.sourceSelect.style.display = 'none';
      return;
    }

    this.sourceSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Nodes';
    this.sourceSelect.appendChild(allOption);

    sources.forEach((source) => {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source;
      this.sourceSelect.appendChild(option);
    });

    this.sourceSelect.value =
      selectedSource && selectedSource !== 'all' ? selectedSource : 'all';
    this.sourceSelect.style.display = '';
  }
}

window.RemindersControls = RemindersControls;
