const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

const privacyState = {
  originalContent: new Map(),
  masked: false,
  config: null
};

document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig();
  
  // Store privacy config
  privacyState.config = config.privacy;
  
  
  // Update page title and heading from config
  if (config.site?.name) {
    document.title = config.site.name;
  }
  if (config.site?.title) {
    const h1 = document.querySelector('h1');
    if (h1) {
      h1.textContent = config.site.title;
    }
  }
  
  // Initialize widgets in configured order
  const widgetOrder = config.widgets?.enabled || ["network", "services", "metrics", "speedtest", "reminders", "wiki"];
  for (const widgetName of widgetOrder) {
    const widgetConfig = config.widgets?.[widgetName];
    const widgetType = widgetConfig?.type || widgetName;
    await initializeWidget(widgetName, widgetType, widgetConfig);
  }
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

async function initializeWidget(widgetName, widgetType, config) {
  if (config?.show === false) {
    return;
  }
  
  let container = document.getElementById(`${widgetName}-widget`);
  if (!container) {
    container = createWidgetContainer(widgetName);
  }
  if (!window.widgets || !window.widgets[widgetType]) {
    return;
  }
  
  try {
    const widgetClass = window.widgets[widgetType];
    const widget = new widgetClass(config || {});
    
    // Special handling for different widget init signatures
    if (widgetType === 'speedtest') {
      await widget.init(container, {
        preview_count: config?.preview ?? config?.min ?? 5,
        history_limit: config?.history_limit ?? 200
      });
    } else if (widgetType === 'wiki') {
      await widget.init(container, config || {});
    } else {
      await widget.init(container);
    }
  } catch (error) {
    const widgetDisplayName = config?.name || widgetName;
    container.innerHTML = `<p class="muted">Unable to load ${widgetDisplayName}: ${error.message}</p>`;
  }
}

function createWidgetContainer(widgetName) {
  const container = document.createElement('div');
  container.id = `${widgetName}-widget`;
  document.querySelector('.widget-stack').appendChild(container);
  return container;
}

async function initializeNetworkWidget(config) {
  await initializeWidget('network', 'network', config);
}

async function initializeServicesWidget(config) {
  await initializeWidget('services', 'services', config);
}

async function initializeMetricsWidget(config) {
  await initializeWidget('metrics', 'metrics', config);
}

async function initializeSpeedtestWidget(config) {
  await initializeWidget('speedtest', 'speedtest', config);
}

async function initializeRemindersWidget(config) {
  await initializeWidget('reminders', 'reminders', config);
}

async function initializeWikiWidget(config) {
  await initializeWidget('wiki', 'wiki', config);
}

function togglePrivacyMask() {
  const button = document.getElementById('privacy-toggle');
  if (!button || !privacyState.config) {
    return;
  }

  const wasMasked = button.classList.contains('masked');
  button.classList.toggle('masked');
  privacyState.masked = !wasMasked;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }

  const replacements = wasMasked
    ? Object.fromEntries(Object.entries(privacyState.config.replacements || {}).map(([key, value]) => [value, key]))
    : privacyState.config.replacements || {};

  nodes.forEach((textNode) => {
    let text = textNode.textContent;

    if (wasMasked) {
      if (privacyState.originalContent.has(textNode)) {
        text = privacyState.originalContent.get(textNode);
        privacyState.originalContent.delete(textNode);
      }
    } else {
      privacyState.originalContent.set(textNode, text);
      if (privacyState.config.mask_ips) {
        text = text.replace(IP_PATTERN, 'xxx.xxx.xxx.xxx');
      }
    }

    for (const [from, to] of Object.entries(replacements)) {
      text = text.replaceAll(from, to);
    }

    textNode.textContent = text;
  });
}
