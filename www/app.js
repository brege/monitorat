const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

const privacyState = {
  originalContent: new Map(),
  masked: false,
  config: null
};

document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig();
  
  privacyState.config = config.privacy;
  
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
    
    // Skip disabled widgets but keep their placeholder in ordering
    if (widgetConfig?.enabled === false) {
      continue;
    }
 
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
    if (config?.collapsible === true) {
      setupCollapsibleWidget(container, widgetName, config);
    }
 
    const contentContainer = config?.collapsible === true 
      ? container.querySelector('.widget-content')
      : container;
 
    const widgetClass = window.widgets[widgetType];
    const widget = new widgetClass(config || {});
 
    const widgetConfig = config?.collapsible === true 
      ? { ...config, _suppressHeader: true }
      : config;
 
    if (widgetType === 'speedtest') {
      await widget.init(contentContainer, widgetConfig);
    } else if (widgetType === 'wiki') {
      await widget.init(contentContainer, { ...widgetConfig, _widgetName: widgetName });
    } else {
      await widget.init(contentContainer, widgetConfig || {});
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

function setupCollapsibleWidget(container, widgetName, config) {
  const widgetTitle = config?.name || widgetName;
  const isHidden = config?.hidden === true;
  
  container.innerHTML = `
    <div class="widget-header">
      <h2 class="widget-title">
        ${widgetTitle}
      </h2>
      <button type="button" class="widget-toggle" onclick="toggleWidget('${widgetName}')">
        ${isHidden ? 'Show' : 'Hide'}
      </button>
    </div>
    <div class="widget-content" style="display: ${isHidden ? 'none' : 'block'}"></div>
  `;
}

function toggleWidget(widgetName) {
  const container = document.getElementById(`${widgetName}-widget`);
  if (!container) return;
  
  const content = container.querySelector('.widget-content');
  const toggle = container.querySelector('.widget-toggle');
  if (!content || !toggle) return;
  
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  toggle.textContent = isHidden ? 'Hide' : 'Show';
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
