class ListingControls {
  constructor(config) {
    if (!config?.container) {
      throw new Error('ListingControls requires a container');
    }

    this.container = config.container;
    this.selectors = config.selectors || {};
    this.sortConfig = config.sort || null;
    this.sourceConfig = config.source || null;
    this.addConfig = config.add || null;

    this.sortController = null;
    this.sourceSelect = null;
  }

  initialize() {
    this.initializeSorting();
    this.initializeSourceFilter();
    this.initializeAddButton();
  }

  initializeSorting() {
    if (!this.sortConfig) return;

    const fieldSelector = this.selectors.field;
    const directionSelector = this.selectors.direction;
    if (!fieldSelector || !directionSelector) {
      throw new Error(
        'ListingControls requires field and direction selectors for sorting',
      );
    }

    const fieldSelect = this.container.querySelector(fieldSelector);
    const directionSelect = this.container.querySelector(directionSelector);
    if (!fieldSelect || !directionSelect) return;

    const SortByController = window.monitorShared.SortByController;
    this.sortController = new SortByController({
      fieldSelect,
      directionSelect,
      initialSortBy: this.sortConfig.initialSortBy,
      defaultSortBy: this.sortConfig.defaultSortBy,
      directionLabelsByField: this.sortConfig.directionLabelsByField,
      onApply: this.sortConfig.onApply,
    });
    this.sortController.initialize();
  }

  initializeSourceFilter() {
    if (!this.sourceConfig) return;

    const sourceSelect = this.container.querySelector(this.selectors.source);
    if (!sourceSelect) return;

    sourceSelect.addEventListener('change', () => {
      if (typeof this.sourceConfig.onChange === 'function') {
        this.sourceConfig.onChange(sourceSelect.value);
      }
    });
    this.sourceSelect = sourceSelect;
  }

  initializeAddButton() {
    if (!this.addConfig) return;

    const addButton = this.container.querySelector(this.selectors.add);
    if (!addButton) return;

    if (this.addConfig.enabled === false) {
      addButton.remove();
      return;
    }

    if (typeof this.addConfig.onClick === 'function') {
      addButton.addEventListener('click', () => this.addConfig.onClick());
    }
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

window.monitorShared = window.monitorShared || {};
window.monitorShared.ListingControls = ListingControls;
