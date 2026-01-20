const ChartLegend = {
  createMetricLegend(container, metrics, options = {}) {
    if (!container) return;

    const { onToggle, activeMetric = 'all', activeMetrics = null } = options;
    container.innerHTML = '';

    metrics.forEach((metric) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chart-legend-item';
      item.dataset.value = metric.field;
      const isActive = Array.isArray(activeMetrics)
        ? activeMetrics.includes(metric.field)
        : activeMetric === 'all' || activeMetric === metric.field;
      if (isActive) {
        item.classList.add('active');
      }

      const swatch = document.createElement('span');
      swatch.className = 'chart-legend-swatch';
      swatch.style.backgroundColor = metric.color || 'currentColor';

      const label = document.createElement('span');
      label.textContent = metric.label || metric.field;

      item.appendChild(swatch);
      item.appendChild(label);

      if (typeof onToggle === 'function') {
        item.addEventListener('click', () => onToggle(metric.field));
        item.classList.add('clickable');
      }

      container.appendChild(item);
    });
  },

  createNodeLegend(container, nodes, options = {}) {
    if (!container) return;

    const {
      lineStyles = [],
      activeNode = 'all',
      activeNodes = null,
      onToggle,
    } = options;
    const defaultStyles = [[], [5, 5]];
    const styles = lineStyles.length > 0 ? lineStyles : defaultStyles;

    container.innerHTML = '';

    nodes.forEach((node, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chart-legend-item';
      item.dataset.value = node;
      const isActive = Array.isArray(activeNodes)
        ? activeNodes.includes(node)
        : activeNode === 'all' || activeNode === node;
      if (isActive) {
        item.classList.add('active');
      }

      const swatch = document.createElement('span');
      swatch.className = 'chart-legend-swatch';
      const dashPattern = styles[index % styles.length];
      if (Array.isArray(dashPattern) && dashPattern.length) {
        swatch.classList.add('dashed');
      }

      const label = document.createElement('span');
      label.textContent = node;

      item.appendChild(swatch);
      item.appendChild(label);

      if (typeof onToggle === 'function') {
        item.addEventListener('click', () => onToggle(node));
        item.classList.add('clickable');
      }

      container.appendChild(item);
    });
  },

  updateActiveState(container, activeValue, allValue = 'all') {
    if (!container) return;

    const items = container.querySelectorAll('.chart-legend-item');
    items.forEach((item) => {
      const isActive =
        activeValue === allValue || item.dataset.value === activeValue;
      item.classList.toggle('active', isActive);
    });
  },
};

const LegendControls = {
  getLegendElements(widget) {
    const legendNames = ['chart-legend', 'metric-legend', 'node-legend'];
    return legendNames.map((name) => widget.getElement(name)).filter(Boolean);
  },

  updateVisibility(widget) {
    const chartContainer = widget.getElement('chart-container');
    const overlay = chartContainer.querySelector('.chart-overlay');
    const legends = LegendControls.getLegendElements(widget);
    const hasLegendItems = legends.some(
      (legend) => legend.childElementCount > 0,
    );
    const show =
      widget.currentView === 'chart' && widget.legendVisible !== false;

    legends.forEach((legend) => {
      legend.style.display = show && legend.childElementCount ? '' : 'none';
    });

    chartContainer.classList.toggle('legend-hidden', !show);
    overlay.style.display = show && hasLegendItems ? '' : 'none';

    if (show && hasLegendItems) {
      const ChartManager = window.monitorShared.ChartManager;
      ChartManager.applyLegendDock(chartContainer);
    }
  },

  setupToggle(widget) {
    const toggle = widget.getElement('legend-toggle');
    const chartContainer = widget.getElement('chart-container');
    const overlay = chartContainer.querySelector('.chart-overlay');
    if (!toggle || !chartContainer || !overlay) return;

    widget.legendVisible = true;
    const applyState = () => {
      chartContainer.classList.toggle('legend-hidden', !widget.legendVisible);
      toggle.classList.toggle('active', widget.legendVisible);
      toggle.setAttribute(
        'aria-pressed',
        widget.legendVisible ? 'true' : 'false',
      );
      LegendControls.updateVisibility(widget);
    };

    applyState();
    toggle.addEventListener('click', () => {
      widget.legendVisible = !widget.legendVisible;
      applyState();
    });
  },
};

window.monitorShared = window.monitorShared || {};
window.monitorShared.ChartLegend = ChartLegend;
window.monitorShared.LegendControls = LegendControls;
