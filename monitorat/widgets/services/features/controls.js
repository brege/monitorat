class ServicesControls {
  constructor (widget) {
    this.widget = widget
  }

  initialize () {
    const fieldSelect = this.widget.container.querySelector('.services-sort-field')
    const directionSelect = this.widget.container.querySelector('.services-sort-dir')
    if (!fieldSelect || !directionSelect) return

    const SortByController = window.monitorShared.SortByController
    const initialSortBy = this.widget.config.sort_by

    this.sortController = new SortByController({
      fieldSelect,
      directionSelect,
      initialSortBy,
      defaultSortBy: 'name.asc',
      directionLabelsByField: {
        name: { asc: 'A - Z', desc: 'Z - A' },
        status: { asc: 'Up first', desc: 'Down first' }
      },
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
