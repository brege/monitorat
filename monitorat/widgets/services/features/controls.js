class ServicesControls {
  constructor (widget) {
    this.widget = widget
  }

  initialize () {
    const fieldSelect = this.widget.container.querySelector('.services-sort-field')
    const directionButton = this.widget.container.querySelector('.services-sort-dir')
    if (!fieldSelect || !directionButton) return

    const SortByController = window.monitorShared.SortByController
    const initialSortBy = this.widget.config.sort_by

    this.sortController = new SortByController({
      fieldSelect,
      directionButton,
      initialSortBy,
      defaultSortBy: 'name.asc',
      onApply: (sortBy) => {
        this.widget.config.sort_by = sortBy
        this.widget.render()
        this.widget.updateStatus()
      }
    })
    this.sortController.initialize()
  }
}

window.ServicesControls = ServicesControls
