class RemindersControls {
  constructor (widget) {
    this.widget = widget
  }

  initialize () {
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
}

window.RemindersControls = RemindersControls
