class RemindersControls {
  constructor(widget) {
    this.widget = widget;
    this.listingControls = null;
  }

  initialize() {
    this.initializeListingControls();
    this.initializeTestNotification();
  }

  initializeListingControls() {
    const ListingControls = window.monitorShared.ListingControls;
    this.listingControls = new ListingControls({
      container: this.widget.container,
      selectors: {
        field: '.reminders-sort-field',
        direction: '.reminders-sort-dir',
        source: '.reminders-source-filter',
        add: '.reminders-add',
      },
      sort: {
        initialSortBy: this.widget.config.sort_by,
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
      },
      source: {
        onChange: (value) => {
          this.widget.selectedSource = value;
          this.widget.render();
        },
      },
      add: {
        enabled: this.widget.canEditReminders(),
        onClick: () => {
          this.widget.openReminderEditor();
        },
      },
    });
    this.listingControls.initialize();
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

  updateSources(sources, selectedSource) {
    this.listingControls?.updateSources(sources, selectedSource);
  }
}

window.RemindersControls = RemindersControls;
