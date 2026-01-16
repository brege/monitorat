/* global localStorage */
window.monitor = window.monitor || {};
window.monitorShared = window.monitorShared || {};
window.monitorShared._scriptPromises =
  window.monitorShared._scriptPromises || {};

window.monitorShared.loadScript = (source, globalName) => {
  const cache = window.monitorShared._scriptPromises;

  if (window[globalName]) {
    return Promise.resolve();
  }

  if (cache[source]) {
    return cache[source];
  }

  const promise = new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script');
    scriptElement.src = source;
    scriptElement.async = true;
    scriptElement.onload = () => {
      if (!window[globalName]) {
        reject(
          new Error(`Script loaded but ${globalName} not defined: ${source}`),
        );
        return;
      }
      resolve();
    };
    scriptElement.onerror = () => {
      delete cache[source];
      reject(new Error(`Failed to load script: ${source}`));
    };
    document.head.appendChild(scriptElement);
  });

  cache[source] = promise;
  return promise;
};

window.monitorShared.loadFeatureScripts = async (featureScripts) => {
  const loadScript = window.monitorShared.loadScript;

  await Promise.all(
    featureScripts.map((feature) =>
      loadScript(feature.source, feature.globalName),
    ),
  );

  const missing = featureScripts.filter(
    (feature) => !window[feature.globalName],
  );
  if (missing.length) {
    const names = missing.map((feature) => feature.globalName).join(', ');
    throw new Error(`Feature scripts missing after load: ${names}`);
  }
};

window.monitor.applyWidgetHeader = function applyWidgetHeader(
  container,
  options = {},
) {
  if (!container) {
    return;
  }

  const {
    selector = 'h2',
    suppressHeader = false,
    name,
    preserveChildren = false,
    downloadUrl = null,
    downloadCsv = false,
  } = options;

  const header = container.querySelector(selector);
  if (!header) {
    return;
  }

  const headerControls = (() => {
    const candidate = header.nextElementSibling;
    if (!candidate) return null;
    const controlClasses = ['widget-controls', 'speedtest-controls'];
    if (
      controlClasses.some((className) =>
        candidate.classList.contains(className),
      )
    ) {
      return candidate;
    }
    return null;
  })();

  if (suppressHeader) {
    if (typeof name === 'string' && name.length > 0) {
      const featureHeader = document.createElement('div');
      featureHeader.className = 'feature-header';
      featureHeader.textContent = name;
      header.replaceWith(featureHeader);
    } else {
      header.remove();
    }
    return;
  }

  if (name === null || name === false) {
    header.remove();
    return;
  }

  let wrapper = null;
  if ((downloadCsv && downloadUrl) || headerControls) {
    const headerParent = header.parentElement;
    if (headerParent?.classList.contains('widget-header-wrapper')) {
      wrapper = headerParent;
    } else if (headerParent) {
      wrapper = document.createElement('div');
      wrapper.className = 'widget-header-wrapper';
      headerParent.insertBefore(wrapper, header);
      wrapper.appendChild(header);
    }
    if (wrapper && headerControls && headerControls.parentElement !== wrapper) {
      wrapper.appendChild(headerControls);
    }
  }

  if (downloadCsv && downloadUrl) {
    const downloadLink = document.createElement('a');
    downloadLink.href = '#';
    downloadLink.textContent = 'Download CSV';
    downloadLink.style.fontSize = '0.85rem';
    downloadLink.style.color = 'var(--accent)';
    downloadLink.style.textDecoration = 'none';
    downloadLink.style.cursor = 'pointer';
    downloadLink.addEventListener('mouseover', () => {
      downloadLink.style.textDecoration = 'underline';
    });
    downloadLink.addEventListener('mouseout', () => {
      downloadLink.style.textDecoration = 'none';
    });
    downloadLink.addEventListener('click', (e) => {
      e.preventDefault();
      const link = document.createElement('a');
      link.href = `${downloadUrl}?${Date.now()}`;
      link.download = `${downloadUrl.split('/').pop()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    if (wrapper) {
      wrapper.appendChild(downloadLink);
    }
  }

  if (typeof name === 'string' && name.length > 0) {
    if (preserveChildren) {
      const preservedChildren = Array.from(header.children);
      header.textContent = name;
      if (preservedChildren.length) {
        header.appendChild(document.createTextNode(' '));
        preservedChildren.forEach((child, index) => {
          if (index > 0) {
            header.appendChild(document.createTextNode(' '));
          }
          header.appendChild(child);
        });
      }
    } else {
      header.textContent = name;
    }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig();
  const federationStatus = window.StatusIndicator
    ? await window.StatusIndicator.fetchStatus()
    : { enabled: false, remotes: {} };

  window.monitor.demoEnabled = config.demo === true;
  window.monitor.federationStatus = federationStatus;
  window.monitor.sectionsConfig = config.sections || {};

  const { initializeConfigReloadControl } = window.monitorShared;
  initializeConfigReloadControl({ demoEnabled: window.monitor.demoEnabled });

  if (!window.monitor.demoEnabled) {
    fetch('api/snapshot', { method: 'POST', cache: 'no-store' });
  }

  window.monitorHeader.applySiteConfig(config);

  const fallbackWidgetOrder = Object.keys(config.widgets || {}).filter(
    (key) => key !== 'enabled',
  );
  const widgetOrder =
    Array.isArray(config.widgets?.enabled) && config.widgets.enabled.length > 0
      ? config.widgets.enabled
      : fallbackWidgetOrder;

  const containersByWidget = new Map();

  widgetOrder.forEach((widgetName, index) => {
    const widgetConfig = config.widgets?.[widgetName];
    if (!widgetConfig) {
      return;
    }
    const container = createWidgetContainer(widgetName, widgetConfig, index);
    containersByWidget.set(widgetName, container);
  });

  window.monitorLayout.orderLayoutGroups();
  window.monitorLayout.updateLayoutGroups();

  await Promise.all(
    widgetOrder.map((widgetName) => {
      const widgetConfig = config.widgets?.[widgetName];
      if (!widgetConfig) return Promise.resolve();
      const widgetType = widgetConfig?.type || widgetName;
      return ensureWidgetScript(widgetType);
    }),
  );

  for (const widgetName of widgetOrder) {
    const widgetConfig = config.widgets?.[widgetName];
    if (!widgetConfig) {
      continue;
    }

    const widgetType = widgetConfig?.type || widgetName;
    const container = containersByWidget.get(widgetName);
    if (!container) {
      continue;
    }

    await initializeWidget(widgetName, widgetType, widgetConfig, container);
  }

  const { expansion } = window.monitorShared;
  expansion.restoreExpansionStates();
});

async function loadConfig() {
  try {
    const response = await fetch('api/config', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Unable to load config:', error.message);
    return {};
  }
}

async function initializeWidget(
  widgetName,
  widgetType,
  config,
  containerOverride,
) {
  await ensureWidgetScript(widgetType);

  if (config?.show === false) {
    return;
  }

  let container =
    containerOverride || document.getElementById(`${widgetName}-widget`);
  if (!container) {
    container = createWidgetContainer(widgetName, config, 0);
  }
  if (!window.widgets || !window.widgets[widgetType]) {
    return;
  }

  try {
    const contentContainer = container;
    const widgetConfig = { ...config, _suppressHeader: true };

    if (config?.remote || config?.federation?.nodes) {
      widgetConfig._apiPrefix = widgetName;
    }

    if (widgetType === 'wiki') {
      widgetConfig._widgetName = widgetName;
    }

    const WidgetClass = window.widgets[widgetType];
    const widget = new WidgetClass(widgetConfig);
    await widget.init(contentContainer, widgetConfig);
  } catch (error) {
    const widgetDisplayName = config?.name || widgetName;
    container.innerHTML = `<p class="muted">Unable to load ${widgetDisplayName}: ${error.message}</p>`;
  }
}

const widgetScriptPromises = new Map();

async function ensureWidgetScript(widgetType) {
  if (widgetScriptPromises.has(widgetType)) {
    return widgetScriptPromises.get(widgetType);
  }

  const promise = new Promise((resolve, reject) => {
    if (window.widgets?.[widgetType]) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `widgets/${widgetType}/app.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`Failed to load widget script: ${widgetType}`));
    document.head.appendChild(script);
  });

  widgetScriptPromises.set(widgetType, promise);
  return promise;
}

function createWidgetContainer(widgetName, widgetConfig, orderIndex) {
  const group = window.monitorLayout.getLayoutGroup(widgetName, widgetConfig);
  let container = document.getElementById(`${widgetName}-widget`);
  if (!container) {
    container = document.createElement('div');
    container.id = `${widgetName}-widget`;
  }
  container.dataset.order = String(orderIndex);
  if (widgetConfig?.position !== undefined) {
    container.dataset.position = String(widgetConfig.position);
  } else {
    delete container.dataset.position;
  }
  if (
    widgetConfig?.min_width !== undefined &&
    widgetConfig?.min_width !== null
  ) {
    const minWidthValue = Number(widgetConfig.min_width);
    if (!Number.isFinite(minWidthValue)) {
      throw new Error(`${widgetName} min_width must be a number`);
    }
    container.style.setProperty('--widget-min-width', `${minWidthValue}px`);
  } else {
    container.style.removeProperty('--widget-min-width');
  }
  if (container.parentElement !== group) {
    group.appendChild(container);
  }
  return container;
}
