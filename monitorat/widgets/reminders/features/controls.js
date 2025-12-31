class RemindersControls {
  constructor (widget) {
    this.widget = widget
  }

  initialize () {
    const fieldSelect = this.widget.container.querySelector('.reminders-sort-field')
    const directionButton = this.widget.container.querySelector('.reminders-sort-dir')
    if (!fieldSelect || !directionButton) return

    const SortByController = window.monitorShared.SortByController
    const initialSortBy = this.widget.config.sort_by

    this.sortController = new SortByController({
      fieldSelect,
      directionButton,
      initialSortBy,
      defaultSortBy: 'due.asc',
      onApply: (sortBy) => {
        this.widget.config.sort_by = sortBy
        this.widget.render()
      }
    })
    this.sortController.initialize()
  }
}

window.RemindersControls = RemindersControls
