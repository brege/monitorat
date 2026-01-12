class ServicesControls {
  constructor(widget) {
    this.widget = widget;
  }

  initialize() {
    const fieldSelect = this.widget.container.querySelector(
      '.services-sort-field',
    );
    const directionSelect =
      this.widget.container.querySelector('.services-sort-dir');
    if (!fieldSelect || !directionSelect) return;

    const SortByController = window.monitorShared.SortByController;
    const initialSortBy = this.widget.config.sort_by;

    this.sortController = new SortByController({
      fieldSelect,
      directionSelect,
      initialSortBy,
      defaultSortBy: 'name.asc',
      directionLabelsByField: {
        name: { asc: 'A - Z', desc: 'Z - A' },
        status: { asc: 'Up first', desc: 'Down first' },
      },
      onApply: (sortBy) => {
        this.widget.config.sort_by = sortBy;
        this.widget.render();
        this.widget.updateStatus();
      },
    });
    this.sortController.initialize();

    this.initializeSourceFilter();
  }

  initializeSourceFilter() {
    const sourceSelect = this.widget.container.querySelector(
      '.services-source-filter',
    );
    if (!sourceSelect) return;

    sourceSelect.addEventListener('change', () => {
      this.widget.selectedSource = sourceSelect.value;
      this.widget.render();
      this.widget.updateStatus();
    });
    this.sourceSelect = sourceSelect;
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

window.ServicesControls = ServicesControls;
