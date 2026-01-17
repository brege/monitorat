// Services Widget
class ServicesWidget {
  constructor(config = {}) {
    this.container = null;
    this.servicesData = [];
    this.statusBySource = {};
    this.statusSchema = null;
    this.config = config;
    this.selectedSource = 'all';
    this.filteredServices = null;
    this.features = {
      controls: null,
      snapshot: null,
    };
  }

  initializeFeatureHeaders() {
    const features = this.config.features || {};
    for (const [featureId, featureConfig] of Object.entries(features)) {
      const headerEl = this.container.querySelector(
        `[data-services-section-header="${featureId}"]`,
      );
      if (headerEl && featureConfig.header) {
        headerEl.textContent = featureConfig.header;
      }
    }
  }

  getApiBase() {
    return this.config._apiPrefix
      ? `api/${this.config._apiPrefix}`
      : 'api/services';
  }

  getImgBase() {
    return this.config.remote ? `api/proxy/${this.config.remote}/img` : 'img';
  }

  getDisplayMode() {
    return this.config.mode || 'tiles';
  }

  getCompactIconScale() {
    const scale = this.config.compact_icon_scale;
    if (typeof scale !== 'number' || Number.isNaN(scale)) {
      throw new Error('Services compact_icon_scale must be a number');
    }
    return scale;
  }

  sortServices(services) {
    const sortBy = this.config.sort_by || 'name.asc';
    const [field, direction] = sortBy.split('.');
    const ascending = direction !== 'desc';

    const statusOrder = this.getStatusOrder().reduce(
      (accumulator, status, index) => {
        accumulator[status] = index;
        return accumulator;
      },
      {},
    );

    return [...services].sort((a, b) => {
      let valueA, valueB;

      switch (field) {
        case 'name':
          valueA = (a.name || '').toLowerCase();
          valueB = (b.name || '').toLowerCase();
          break;
        case 'status':
          valueA = statusOrder[this.getServiceStatus(a)] ?? 1;
          valueB = statusOrder[this.getServiceStatus(b)] ?? 1;
          break;
        default:
          return 0;
      }

      if (valueA < valueB) return ascending ? -1 : 1;
      if (valueA > valueB) return ascending ? 1 : -1;
      return 0;
    });
  }

  getServiceStatus(service) {
    const statusData = service._source
      ? this.statusBySource[service._source] || {}
      : this.statusBySource._local || {};

    const checks = [
      ...(service.containers || []),
      ...(service.services || []),
      ...(service.timers || []),
    ];

    if (checks.length === 0) return 'ok';

    const severityOrder = this.getStatusSeverity();
    let worstStatus = 'ok';
    let worstIndex = this.getStatusRank(worstStatus, severityOrder);

    for (const check of checks) {
      const entry = this.getStatusEntry(statusData, check);
      const statusIndex = this.getStatusRank(entry.status, severityOrder);
      if (statusIndex > worstIndex) {
        worstStatus = entry.status;
        worstIndex = statusIndex;
      }
    }

    return worstStatus;
  }

  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };

    const response = await fetch('widgets/services/index.html');
    const html = await response.text();
    container.innerHTML = html;

    const applyWidgetHeader = window.monitor?.applyWidgetHeader;
    if (applyWidgetHeader) {
      applyWidgetHeader(container, {
        suppressHeader: this.config._suppressHeader,
        name: this.config.name,
      });
    }

    this.initializeFeatureHeaders();
    await this.loadFeatureScripts();
    this.initializeFeatures();
    this.features.controls.initialize();
    await this.loadSchema();
    await this.loadData();
  }

  async loadData() {
    try {
      const mergeSources = this.config.federation?.nodes;
      if (mergeSources && Array.isArray(mergeSources)) {
        await this.loadMergedServices(mergeSources);
      } else {
        await this.loadServices();
      }

      this.updateSourceFilter();
      this.render();

      if (this.config.federation?.nodes) {
        await this.loadMergedStatus();
      } else {
        await this.loadStatus();
      }
    } catch (error) {
      console.error('Unable to load services:', error.message);
    }
  }

  async loadSchema() {
    const response = await fetch(`${this.getApiBase()}/schema`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const schema = await response.json();
    this.statusSchema = schema;
  }

  getStatusConfig() {
    return this.statusSchema.status;
  }

  getStatusDefault() {
    return this.getStatusConfig().default;
  }

  getStatusOrder() {
    return this.getStatusConfig().order;
  }

  getStatusSeverity() {
    return this.getStatusConfig().severity;
  }

  getStatusLabel(status) {
    return this.getStatusConfig().labels[status];
  }

  getStatusClass(status) {
    return this.getStatusConfig().classes[status];
  }

  getStatusRank(status, order) {
    return order.indexOf(status);
  }

  getStatusEntry(statusData, key) {
    const entry = statusData[key];
    if (!entry) {
      return { status: this.getStatusDefault(), reason: null };
    }
    if (typeof entry === 'string') {
      return { status: entry, reason: null };
    }
    return entry;
  }

  async loadServices() {
    try {
      const configResponse = await fetch(this.getApiBase());
      if (!configResponse.ok) {
        throw new Error(`HTTP ${configResponse.status}`);
      }
      const servicesConfig = await configResponse.json();
      this.servicesData = Object.entries(servicesConfig.services || {}).map(
        ([key, service]) => ({
          ...service,
          _key: key,
          _source: this.config.remote || null,
        }),
      );
    } catch (error) {
      console.error('Unable to load services config:', error.message);
      throw error;
    }
  }

  async loadMergedServices(sources) {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/services-${source}`);
          if (!response.ok) {
            console.warn(
              `Failed to fetch services from ${source}: HTTP ${response.status}`,
            );
            return [];
          }
          const config = await response.json();
          return Object.entries(config.services || {}).map(
            ([key, service]) => ({
              ...service,
              _key: key,
              _source: source,
            }),
          );
        } catch (error) {
          console.warn(
            `Failed to fetch services from ${source}:`,
            error.message,
          );
          return [];
        }
      }),
    );

    this.servicesData = results.flat();
    this.updateSourceFilter();
  }

  async loadStatus() {
    try {
      const response = await fetch(`${this.getApiBase()}/status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const statusData = await response.json();
      this.statusBySource = { _local: statusData };
      this.updateStatus();
    } catch (error) {
      console.error('Unable to load service status:', error.message);
    }
  }

  async loadMergedStatus() {
    const sources = this.config.federation?.nodes || [];
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(`api/services-${source}/status`);
          if (!response.ok) return { source, status: {} };
          const status = await response.json();
          return { source, status };
        } catch {
          return { source, status: {} };
        }
      }),
    );

    this.statusBySource = {};
    results.forEach(({ source, status }) => {
      this.statusBySource[source] = status;
    });
    this.updateStatus();
  }

  render() {
    this.filteredServices = this.getFilteredServices();
    this.features.snapshot.render();
  }

  updateStatus() {
    this.features.snapshot.updateStatus();
  }

  async loadFeatureScripts() {
    const featureScripts = [
      {
        globalName: 'IconHandler',
        source: 'ui/icons.js',
      },
      {
        globalName: 'ServicesControls',
        source: 'widgets/services/features/controls.js',
      },
      {
        globalName: 'ServicesModal',
        source: 'widgets/services/features/modal.js',
      },
      {
        globalName: 'ServicesSnapshot',
        source: 'widgets/services/features/snapshot.js',
      },
    ];

    await window.monitorShared.loadFeatureScripts(featureScripts);
  }

  initializeFeatures() {
    const ControlsFeature = window.ServicesControls;
    const ModalFeature = window.ServicesModal;
    const SnapshotFeature = window.ServicesSnapshot;

    if (!ControlsFeature || !ModalFeature || !SnapshotFeature) {
      throw new Error('Services feature scripts not loaded');
    }

    this.features.controls = new ControlsFeature(this);
    this.features.modal = new ModalFeature(this);
    this.features.snapshot = new SnapshotFeature(this);
  }

  getFilteredServices() {
    const services = this.servicesData || [];
    if (this.selectedSource === 'all') {
      return services;
    }
    return services.filter(
      (service) => service._source === this.selectedSource,
    );
  }

  resolveSources() {
    const configSources = this.config.federation?.nodes;
    if (configSources && Array.isArray(configSources)) {
      return configSources;
    }
    const sources = new Set(
      (this.servicesData || [])
        .map((service) => service._source)
        .filter(Boolean),
    );
    return Array.from(sources);
  }

  updateSourceFilter() {
    if (!this.features.controls?.updateSources) return;
    const sources = this.resolveSources();
    this.features.controls.updateSources(sources, this.selectedSource);
  }
}

// Register widget
window.widgets = window.widgets || {};
window.widgets.services = ServicesWidget;
