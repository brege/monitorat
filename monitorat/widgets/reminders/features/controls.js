class RemindersControls {
  constructor (widget) {
    this.widget = widget
  }

  initialize () {
    this.initializeSortController()
    this.initializeTestNotification()
  }

  initializeSortController () {
    const fieldSelect = this.widget.container.querySelector('.reminders-sort-field')
    const directionSelect = this.widget.container.querySelector('.reminders-sort-dir')
    if (!fieldSelect || !directionSelect) return

    const SortByController = window.monitorShared.SortByController
    const initialSortBy = this.widget.config.sort_by

    this.sortController = new SortByController({
      fieldSelect,
      directionSelect,
      initialSortBy,
      defaultSortBy: 'due.asc',
      directionLabelsByField: {
        due: { asc: 'Soonest', desc: 'Latest' },
        name: { asc: 'A - Z', desc: 'Z - A' },
        touched: { asc: 'Recent', desc: 'Oldest' }
      },
      onApply: (sortBy) => {
        this.widget.config.sort_by = sortBy
        this.widget.render()
      }
    })
    this.sortController.initialize()
  }

  initializeTestNotification () {
    const NotificationTester = window.monitorShared.NotificationTester
    if (!NotificationTester) return

    const mergeSources = this.widget.config.federation?.nodes

    this.notificationTester = new NotificationTester({
      container: this.widget.container,
      buttonSelector: 'button[onclick="testNotification()"]',
      apiBase: 'reminders',
      sources: mergeSources
    })
    this.notificationTester.initialize()
  }
}

window.RemindersControls = RemindersControls
