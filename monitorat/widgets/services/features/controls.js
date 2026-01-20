class ServicesControls {
  constructor(widget) {
    this.widget = widget;
    this.listingControls = null;
  }

  initialize() {
    const ListingControls = window.monitorShared.ListingControls;
    this.listingControls = new ListingControls({
      container: this.widget.container,
      selectors: {
        field: '.services-sort-field',
        direction: '.services-sort-dir',
        source: '.services-source-filter',
        add: '.services-add',
      },
      sort: {
        initialSortBy: this.widget.config.sort_by,
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
      },
      source: {
        onChange: (value) => {
          this.widget.selectedSource = value;
          this.widget.render();
          this.widget.updateStatus();
        },
      },
      add: {
        enabled: this.widget.canEditServices(),
        onClick: () => {
          this.widget.openServiceEditor(null);
        },
      },
    });
    this.listingControls.initialize();
  }

  updateSources(sources, selectedSource) {
    this.listingControls?.updateSources(sources, selectedSource);
  }
}

window.ServicesControls = ServicesControls;
