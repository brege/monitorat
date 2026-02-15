/* global localStorage */
window.monitor = window.monitor || {};
window.monitorShared = window.monitorShared || {};
window.monitorShared._scriptPromises =
  window.monitorShared._scriptPromises || {};

const EDIT_MODE_KEY = 'monitor-edit-mode';

window.monitorShared.isEditModeEnabled = () => {
  try {
    return localStorage.getItem(EDIT_MODE_KEY) === 'true';
  } catch (_) {
    return false;
  }
};

window.monitorShared.setEditModeEnabled = (enabled) => {
  try {
    localStorage.setItem(EDIT_MODE_KEY, enabled ? 'true' : 'false');
  } catch (_) {
    /* localStorage unavailable */
  }
};

window.monitorShared.toggleEditMode = () => {
  const enabled = !window.monitorShared.isEditModeEnabled();
  window.monitorShared.setEditModeEnabled(enabled);
  return enabled;
};

window.monitorShared.ensureEditMode = (enabled) => {
  try {
    if (localStorage.getItem(EDIT_MODE_KEY) === null) {
      window.monitorShared.setEditModeEnabled(enabled === true);
    }
  } catch (_) {
    /* localStorage unavailable */
  }
};

window.monitorShared.setEditingAvailable = (enabled) => {
  window.monitorShared._editingAvailable = enabled === true;
};

window.monitorShared.isEditingAvailable = () =>
  window.monitorShared._editingAvailable === true;

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

window.monitorShared.ensureStylesheet = (href) =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[href="${href}"]`);
    if (existing) {
      resolve();
      return;
    }

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = href;
    stylesheet.onload = () => resolve();
    stylesheet.onerror = () =>
      reject(new Error(`Failed to load stylesheet: ${href}`));
    const colorThemeLink = document.querySelector('link[data-color-theme]');
    if (colorThemeLink?.parentNode) {
      colorThemeLink.parentNode.insertBefore(stylesheet, colorThemeLink);
      return;
    }
    document.head.appendChild(stylesheet);
  });

window.monitorShared.renderWidgetTemplate = async (container, html) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  const stylesheetLinks = Array.from(
    template.content.querySelectorAll('link[rel="stylesheet"][href]'),
  );
  await Promise.all(
    stylesheetLinks.map((link) => {
      const href = link.getAttribute('href');
      return href
        ? window.monitorShared.ensureStylesheet(href)
        : Promise.resolve();
    }),
  );
  stylesheetLinks.forEach((link) => {
    link.remove();
  });
  container.replaceChildren(template.content);
};

window.monitorShared.ensureEditorAssets = async () => {
  await Promise.all([
    window.monitorShared.ensureStylesheet('editor/editor.css'),
    window.monitorShared.ensureStylesheet('editor/fields.css'),
  ]);
  await window.monitorShared.loadScript('editor/editor.js', 'Editor');
  await window.monitorShared.loadScript('editor/item.js', 'ItemEditor');
};

document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig();
  const federationStatus = window.StatusIndicator
    ? await window.StatusIndicator.fetchStatus()
    : { enabled: false, remotes: {} };

  window.monitor.demoEnabled = config.demo === true;
  window.monitor.federationStatus = federationStatus;
  window.monitor.sectionsConfig = config.sections || {};
  const editingAvailable = config.site?.editing === true;
  window.monitorShared.setEditingAvailable(editingAvailable);
  if (editingAvailable) {
    window.monitorShared.ensureEditMode(true);
    await window.monitorShared.ensureEditorAssets();
  } else {
    window.monitorShared.setEditModeEnabled(false);
  }

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

  const [firstWidget, ...remainingWidgets] = widgetOrder;

  if (firstWidget) {
    const widgetConfig = config.widgets?.[firstWidget];
    if (widgetConfig) {
      const widgetType = widgetConfig?.type || firstWidget;
      const container = containersByWidget.get(firstWidget);
      if (container) {
        await initializeWidget(
          firstWidget,
          widgetType,
          widgetConfig,
          container,
        );
      }
    }
  }

  await Promise.all(
    remainingWidgets.map((widgetName) => {
      const widgetConfig = config.widgets?.[widgetName];
      if (!widgetConfig) {
        return Promise.resolve();
      }

      const widgetType = widgetConfig?.type || widgetName;
      const container = containersByWidget.get(widgetName);
      if (!container) {
        return Promise.resolve();
      }

      return initializeWidget(widgetName, widgetType, widgetConfig, container);
    }),
  );

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
    const widgetConfig = { ...config };

    if (config?.remote || config?.federation?.nodes) {
      widgetConfig._apiPrefix = widgetName;
    } else if (config?.api_prefix) {
      widgetConfig._apiPrefix = config.api_prefix;
    }

    if (widgetType === 'wiki' || widgetType === 'metrics') {
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
    let minWidthValue = null;
    if (typeof widgetConfig.min_width === 'number') {
      if (widgetName === 'network') {
        throw new Error(`${widgetName} min_width must be a px length`);
      }
      minWidthValue = widgetConfig.min_width;
    } else if (typeof widgetConfig.min_width === 'string') {
      // Match a CSS px length like "320px".
      const match = widgetConfig.min_width.trim().match(/^(\d+(?:\.\d+)?)px$/);
      if (!match) {
        throw new Error(`${widgetName} min_width must be a px length`);
      }
      minWidthValue = Number(match[1]);
    } else {
      throw new Error(`${widgetName} min_width must be a px length`);
    }
    if (!Number.isFinite(minWidthValue)) {
      throw new Error(`${widgetName} min_width must be a px length`);
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
