class SortByController {
  constructor ({ fieldSelect, directionButton, initialSortBy, defaultSortBy, onApply }) {
    if (!fieldSelect || !directionButton) {
      throw new Error('SortByController requires field and direction controls')
    }
    if (typeof onApply !== 'function') {
      throw new Error('SortByController requires an apply callback')
    }

    this.fieldSelect = fieldSelect
    this.directionButton = directionButton
    this.onApply = onApply

    const sortBy = initialSortBy || defaultSortBy
    const [field, direction] = (sortBy || '').split('.')
    this.sortField = field || ''
    this.sortDirection = direction || 'asc'
  }

  initialize () {
    this.fieldSelect.value = this.sortField
    this.updateDirectionIcon()

    this.fieldSelect.addEventListener('change', () => {
      this.sortField = this.fieldSelect.value
      this.apply()
    })

    this.directionButton.addEventListener('click', () => {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
      this.updateDirectionIcon()
      this.apply()
    })
  }

  updateDirectionIcon () {
    const ascendingIcon = this.directionButton.querySelector('.sort-asc')
    const descendingIcon = this.directionButton.querySelector('.sort-desc')
    if (this.sortDirection === 'asc') {
      ascendingIcon.style.display = ''
      descendingIcon.style.display = 'none'
    } else {
      ascendingIcon.style.display = 'none'
      descendingIcon.style.display = ''
    }
  }

  apply () {
    this.onApply(`${this.sortField}.${this.sortDirection}`)
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.SortByController = SortByController
