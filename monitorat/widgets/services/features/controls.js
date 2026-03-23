const MODE_ICONS = {
  tiles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  compact:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="5" cy="6" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="19" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/><circle cx="12" cy="18" r="1.5"/><circle cx="19" cy="18" r="1.5"/></svg>',
};

class ServicesControls {
  constructor(widget) {
    this.widget = widget;
    this.listingControls = null;
    this.modeBtn = null;
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
        affordance: {
          type: 'overflow',
          visible: true,
          title: 'Add service',
          label: 'Add service',
        },
        onClick: () => {
          this.widget.openServiceEditor(null);
        },
      },
    });
    this.listingControls.initialize();
    this.addModeToggle();
    this.syncVisibility();
  }

  addModeToggle() {
    const row = this.widget.container.querySelector(
      '[data-services="widget-controls"]',
    );
    if (!row) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'affordance-btn affordance-visible';
    this.modeBtn = btn;
    this.syncModeIcon();

    btn.addEventListener('click', () => {
      const next =
        this.widget.getDisplayMode() === 'compact' ? 'tiles' : 'compact';
      this.widget.config.mode = next;
      this.syncModeIcon();
      this.widget.render();
      this.widget.updateStatus();
    });

    const addBtn = row.querySelector('.services-add');
    row.insertBefore(btn, addBtn);
  }

  syncModeIcon() {
    if (!this.modeBtn) return;
    const current = this.widget.getDisplayMode();
    const target = current === 'compact' ? 'tiles' : 'compact';
    this.modeBtn.innerHTML = MODE_ICONS[target];
    this.modeBtn.title = `Switch to ${target}`;
    this.modeBtn.setAttribute('aria-label', `Switch to ${target}`);
  }

  updateSources(sources, selectedSource) {
    this.listingControls?.updateSources(sources, selectedSource);
  }

  syncVisibility() {
    const controlsRow = this.widget.container?.querySelector(
      '[data-services="widget-controls"]',
    );
    if (!controlsRow) {
      return;
    }
    controlsRow.style.display = this.widget.showControls() ? '' : 'none';
  }
}

window.ServicesControls = ServicesControls;
