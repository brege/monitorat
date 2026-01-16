class SortByController {
  constructor({
    fieldSelect,
    directionSelect,
    initialSortBy,
    defaultSortBy,
    directionLabelsByField,
    onApply,
  }) {
    if (!fieldSelect || !directionSelect) {
      throw new Error('SortByController requires field and direction selects');
    }
    if (typeof onApply !== 'function') {
      throw new Error('SortByController requires an apply callback');
    }

    this.fieldSelect = fieldSelect;
    this.directionSelect = directionSelect;
    this.directionLabelsByField = directionLabelsByField || {};
    this.onApply = onApply;

    const sortBy = initialSortBy || defaultSortBy;
    const [field, direction] = (sortBy || '').split('.');
    this.sortField = field || '';
    this.sortDirection = direction || 'asc';
  }

  initialize() {
    this.fieldSelect.value = this.sortField;
    this.updateDirectionLabels(this.sortField);
    this.directionSelect.value = this.sortDirection;

    this.fieldSelect.addEventListener('change', () => {
      this.sortField = this.fieldSelect.value;
      this.updateDirectionLabels(this.sortField);
      this.apply();
    });

    this.directionSelect.addEventListener('change', () => {
      this.sortDirection = this.directionSelect.value;
      this.apply();
    });
  }

  apply() {
    this.onApply(`${this.sortField}.${this.sortDirection}`);
  }

  updateDirectionLabels(field) {
    const optionLabels = this.directionLabelsByField[field] || {
      asc: 'Asc',
      desc: 'Desc',
    };
    const options = Array.from(this.directionSelect.options);
    options.forEach((option) => {
      if (option.value === 'asc') {
        option.textContent = optionLabels.asc;
      } else if (option.value === 'desc') {
        option.textContent = optionLabels.desc;
      }
    });
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.SortByController = SortByController;
