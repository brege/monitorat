/* global NodeFilter, localStorage */
window.monitor = window.monitor || {};
window.monitorHeader = window.monitorHeader || {};
const monitorHeader = window.monitorHeader;

const THEME_STORAGE_KEY = 'monitor-theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';
const COLOR_THEME_STORAGE_KEY = 'monitor-color-theme';

// Matches IPv4 addresses to support privacy masking.
const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

const privacyState = {
  originalContent: new Map(),
  masked: false,
  config: null,
};

let cachedAppInfo = null;

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === THEME_DARK || stored === THEME_LIGHT) {
      return stored;
    }
  } catch (_) {
    /* localStorage may be unavailable */
  }
  return null;
}

function hasStoredTheme() {
  return getStoredTheme() !== null;
}

function getPreferredTheme() {
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    return storedTheme;
  }

  if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) {
    return THEME_DARK;
  }
  return THEME_LIGHT;
}

function applyTheme(theme) {
  const resolvedTheme = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolvedTheme);
  root.dataset.theme = resolvedTheme;

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.dataset.theme = resolvedTheme;
    themeToggle.setAttribute(
      'aria-pressed',
      resolvedTheme === THEME_DARK ? 'true' : 'false',
    );
  }
}

function initializeThemeToggle() {
  applyTheme(getPreferredTheme());

  if (!window.matchMedia) {
    return;
  }

  const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSchemeChange = (event) => {
    if (!hasStoredTheme()) {
      applyTheme(event.matches ? THEME_DARK : THEME_LIGHT);
    }
  };

  if (typeof darkSchemeQuery.addEventListener === 'function') {
    darkSchemeQuery.addEventListener('change', handleSchemeChange);
  } else if (typeof darkSchemeQuery.addListener === 'function') {
    darkSchemeQuery.addListener(handleSchemeChange);
  }
}

function syncPrivacyToggleState(button) {
  const toggle = button || document.getElementById('privacy-toggle');
  if (!toggle) {
    return;
  }

  toggle.dataset.privacy = privacyState.masked ? 'masked' : 'revealed';
  toggle.setAttribute('aria-pressed', privacyState.masked ? 'true' : 'false');
}

function togglePrivacyMask() {
  if (!privacyState.config) {
    return;
  }

  const wasMasked = privacyState.masked;
  privacyState.masked = !privacyState.masked;
  syncPrivacyToggleState();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (
    let nextNode = walker.nextNode();
    nextNode;
    nextNode = walker.nextNode()
  ) {
    nodes.push(nextNode);
  }

  const replacements = wasMasked
    ? Object.fromEntries(
        Object.entries(privacyState.config.replacements || {}).map(
          ([key, value]) => [value, key],
        ),
      )
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
window.togglePrivacyMask = togglePrivacyMask;

function toggleTheme() {
  const currentTheme =
    document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const nextTheme = currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK;

  applyTheme(nextTheme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (_) {
    /* localStorage may be unavailable */
  }
}
window.toggleTheme = toggleTheme;

function getStoredColorTheme() {
  try {
    return localStorage.getItem(COLOR_THEME_STORAGE_KEY) || 'default';
  } catch (_) {
    return 'default';
  }
}

function applyColorTheme(themeName) {
  document
    .querySelectorAll('link[href*="theme-overlay"], link[data-color-theme]')
    .forEach((link) => {
      link.remove();
    });

  if (themeName !== 'default') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `themes/${themeName}.css`;
    link.dataset.colorTheme = themeName;
    const defaultTheme = document.querySelector(
      'link[href*="themes/default.css"]',
    );
    if (defaultTheme?.nextSibling) {
      defaultTheme.parentNode.insertBefore(link, defaultTheme.nextSibling);
    } else {
      document.head.appendChild(link);
    }
  }

  try {
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, themeName);
  } catch (_) {
    /* localStorage may be unavailable */
  }
}

function getDefaultAppInfo() {
  return {
    version: 'unknown',
    github: 'https://github.com/brege/monitorat',
    themes: ['default'],
  };
}

async function fetchAppInfo() {
  if (cachedAppInfo) {
    return cachedAppInfo;
  }

  try {
    const response = await fetch('api/info', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    cachedAppInfo = await response.json();
    return cachedAppInfo;
  } catch (error) {
    console.error('Unable to load app info:', error.message);
    return getDefaultAppInfo();
  }
}

function preloadAppInfo() {
  fetchAppInfo();
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const MENU_ICONS = {
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  reload:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1 .36-5.36"/></svg>',
  eyeOpen:
    '<svg stroke="currentColor" fill="none" stroke-width="0" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.5 11C4.80285 11 2.52952 9.62184 1.09622 7.50001C2.52952 5.37816 4.80285 4 7.5 4C10.1971 4 12.4705 5.37816 13.9038 7.50001C12.4705 9.62183 10.1971 11 7.5 11ZM7.5 3C4.30786 3 1.65639 4.70638 0.0760002 7.23501C-0.0253338 7.39715 -0.0253334 7.60288 0.0760014 7.76501C1.65639 10.2936 4.30786 12 7.5 12C10.6921 12 13.3436 10.2936 14.924 7.76501C15.0253 7.60288 15.0253 7.39715 14.924 7.23501C13.3436 4.70638 10.6921 3 7.5 3ZM7.5 9.5C8.60457 9.5 9.5 8.60457 9.5 7.5C9.5 6.39543 8.60457 5.5 7.5 5.5C6.39543 5.5 5.5 6.39543 5.5 7.5C5.5 8.60457 6.39543 9.5 7.5 9.5Z" fill="currentColor"></path></svg>',
  eyeOff:
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="m4.736 1.968-.892 3.269-.014.058C2.113 5.568 1 6.006 1 6.5 1 7.328 4.134 8 8 8s7-.672 7-1.5c0-.494-1.113-.932-2.83-1.205l-.014-.058-.892-3.27c-.146-.533-.698-.849-1.239-.734C9.411 1.363 8.62 1.5 8 1.5s-1.411-.136-2.025-.267c-.541-.115-1.093.2-1.239.735m.015 3.867a.25.25 0 0 1 .274-.224c.9.092 1.91.143 2.975.143a30 30 0 0 0 2.975-.143.25.25 0 0 1 .05.498c-.918.093-1.944.145-3.025.145s-2.107-.052-3.025-.145a.25.25 0 0 1-.224-.274M3.5 10h2a.5.5 0 0 1 .5.5v1a1.5 1.5 0 0 1-3 0v-1a.5.5 0 0 1 .5-.5m-1.5.5q.001-.264.085-.5H2a.5.5 0 0 1 0-1h3.5a1.5 1.5 0 0 1 1.488 1.312 3.5 3.5 0 0 1 2.024 0A1.5 1.5 0 0 1 10.5 9H14a.5.5 0 0 1 0 1h-.085q.084.236.085.5v1a2.5 2.5 0 0 1-5 0v-.14l-.21-.07a2.5 2.5 0 0 0-1.58 0l-.21.07v.14a2.5 2.5 0 0 1-5 0zm8.5-.5h2a.5.5 0 0 1 .5.5v1a1.5 1.5 0 0 1-3 0v-1a.5.5 0 0 1 .5-.5"></path></svg>',
  github:
    '<svg viewBox="0 0 496 512" fill="currentColor"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.007 8.222A3.738 3.738 0 0 0 15.045 5.2a3.737 3.737 0 0 0 1.156 6.583 2.988 2.988 0 0 1-2.668 1.67h-2.99a4.456 4.456 0 0 0-2.989 1.165V7.4a3.737 3.737 0 1 0-1.494 0v9.117a3.776 3.776 0 1 0 1.816.099 2.99 2.99 0 0 1 2.668-1.667h2.99a4.484 4.484 0 0 0 4.223-3.039 3.736 3.736 0 0 0 3.25-3.687zM4.565 3.738a2.242 2.242 0 1 1 4.484 0 2.242 2.242 0 0 1-4.484 0zm4.484 16.441a2.242 2.242 0 1 1-4.484 0 2.242 2.242 0 0 1 4.484 0zm8.221-9.715a2.242 2.242 0 1 1 0-4.485 2.242 2.242 0 0 1 0 4.485z"/></svg>',
  collapse:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  expand:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  readOnly:
    '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 7v14"></path><path d="M16 12h2"></path><path d="M16 8h2"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path><path d="M6 12h2"></path><path d="M6 8h2"></path></svg>',
};

function areAllSectionsCollapsed() {
  const headers = document.querySelectorAll('.section-header-collapsible');
  if (headers.length === 0) return false;
  return Array.from(headers).every((header) =>
    header.classList.contains('collapsed'),
  );
}

function toggleAllWidgets() {
  const shouldExpand = areAllSectionsCollapsed();
  document.querySelectorAll('.section-header-collapsible').forEach((header) => {
    const sectionKey = header.dataset.section;
    if (sectionKey) {
      window.toggleSection(sectionKey, shouldExpand);
    }
  });
}
window.toggleAllWidgets = toggleAllWidgets;

async function showMenuModal() {
  const info = await fetchAppInfo();
  const currentColorTheme = getStoredColorTheme();
  const currentTheme =
    document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const isDark = currentTheme === THEME_DARK;
  const allCollapsed = areAllSectionsCollapsed();
  const rememberExpansions = window.isRememberExpansionsEnabled();
  const editModeEnabled = window.monitorShared?.isEditModeEnabled?.() === true;
  const editingAvailable =
    window.monitorShared?.isEditingAvailable?.() === true;

  const themesHtml = info.themes
    .map((theme) => {
      const isSelected = theme === currentColorTheme ? ' selected' : '';
      const isChecked = theme === currentColorTheme ? ' checked' : '';
      return `
      <label class="menu-modal-theme${isSelected}">
        <input type="radio" name="color-theme" value="${theme}"${isChecked}>
        <span class="menu-modal-theme-name">${capitalizeFirst(theme)}</span>
      </label>
    `;
    })
    .join('');

  const content = `
    <div class="menu-modal-controls">
      <button type="button" class="menu-modal-control" id="menu-theme-toggle">
        <span class="menu-modal-icon">${isDark ? MENU_ICONS.sun : MENU_ICONS.moon}</span>
        <span class="menu-modal-label">${isDark ? 'Light Mode' : 'Dark Mode'}</span>
      </button>
      <button type="button" class="menu-modal-control" id="menu-collapse-toggle">
        <span class="menu-modal-icon">${allCollapsed ? MENU_ICONS.expand : MENU_ICONS.collapse}</span>
        <span class="menu-modal-label">${allCollapsed ? 'Expand All' : 'Collapse All'}</span>
      </button>
      ${
        editingAvailable
          ? `<button type="button" class="menu-modal-control" id="menu-edit-toggle">
            <span class="menu-modal-icon">${editModeEnabled ? MENU_ICONS.readOnly : MENU_ICONS.edit}</span>
            <span class="menu-modal-label">${editModeEnabled ? 'Read Only' : 'Use Editor'}</span>
          </button>`
          : ''
      }
      <button type="button" class="menu-modal-control" id="menu-reload">
        <span class="menu-modal-icon">${MENU_ICONS.reload}</span>
        <span class="menu-modal-label">Reload Page</span>
      </button>
      <button type="button" class="menu-modal-control" id="menu-privacy-toggle">
        <span class="menu-modal-icon">${privacyState.masked ? MENU_ICONS.eyeOpen : MENU_ICONS.eyeOff}</span>
        <span class="menu-modal-label">${privacyState.masked ? 'Show Original' : 'Privacy Mask'}</span>
      </button>
    </div>
    <div class="menu-modal-section">
      <h4>Color Theme</h4>
      <div class="menu-modal-themes">
        ${themesHtml}
      </div>
    </div>
    <div class="menu-modal-section">
      <label class="menu-modal-checkbox">
        <input type="checkbox" id="menu-remember-expansions"${rememberExpansions ? ' checked' : ''}>
        <span>Remember expansions</span>
      </label>
    </div>
    <div class="menu-modal-footer">
      <a href="${info.github}" target="_blank" rel="noopener" class="menu-modal-link hover-expand-parent" title="GitHub Repository">
        <span class="menu-modal-link-icon hover-expand">${MENU_ICONS.github}</span>
        <span>brege/monitorat</span>
      </a>
      <a href="${info.github}/releases/tag/v${info.version}" target="_blank" rel="noopener" class="menu-modal-link hover-expand-parent" title="Release v${info.version}">
        <span class="menu-modal-link-icon hover-expand">${MENU_ICONS.fork}</span>
        <span>v${info.version}</span>
      </a>
    </div>
  `;

  window.Modal.show({
    title: 'Menu',
    content,
    onClose: () => {},
  });

  document
    .getElementById('menu-theme-toggle')
    ?.addEventListener('click', () => {
      toggleTheme();
      window.Modal.hide();
    });

  document
    .getElementById('menu-collapse-toggle')
    ?.addEventListener('click', () => {
      toggleAllWidgets();
      window.Modal.hide();
    });

  document.getElementById('menu-edit-toggle')?.addEventListener('click', () => {
    window.monitorShared?.toggleEditMode?.();
    window.Modal.hide();
    window.location.reload();
  });

  document
    .getElementById('menu-reload')
    ?.addEventListener('click', async () => {
      window.Modal.hide();
      const monitorAPI = window.monitor || {};
      if (monitorAPI.demoEnabled) {
        window.location.reload();
        return;
      }
      try {
        await fetch('api/config/reload', { method: 'POST', cache: 'no-store' });
        setTimeout(() => window.location.reload(), 600);
      } catch (_) {
        window.location.reload();
      }
    });

  document
    .getElementById('menu-privacy-toggle')
    ?.addEventListener('click', () => {
      togglePrivacyMask();
      window.Modal.hide();
    });

  document.querySelectorAll('.menu-modal-theme').forEach((label) => {
    label.addEventListener('click', () => {
      document.querySelectorAll('.menu-modal-theme').forEach((entry) => {
        entry.classList.remove('selected');
      });
      label.classList.add('selected');
      const radio = label.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        applyColorTheme(radio.value);
      }
    });
  });

  document
    .getElementById('menu-remember-expansions')
    ?.addEventListener('change', (event) => {
      window.setRememberExpansions(event.target.checked);
    });
}

function initializeMenuButton() {
  const button = document.getElementById('menu-button');
  if (button) {
    button.addEventListener('click', showMenuModal);
  }

  const storedColorTheme = getStoredColorTheme();
  if (storedColorTheme && storedColorTheme !== 'default') {
    applyColorTheme(storedColorTheme);
  }
}

function showTocModal() {
  const headers = document.querySelectorAll('.section-header-collapsible');
  if (headers.length === 0) {
    return;
  }

  const items = Array.from(headers).map((header) => {
    const sectionKey = header.dataset.section;
    const titleElement = header.querySelector('.section-title');
    const title = titleElement
      ? titleElement.textContent.replace('#', '').trim()
      : sectionKey;
    return { sectionKey, title };
  });

  const linksHtml = items
    .map(({ sectionKey, title }) => {
      return `<a href="#section-${sectionKey}" class="toc-modal-link" data-section="${sectionKey}">${title}</a>`;
    })
    .join('');

  const content = `
    <div class="toc-modal-links">
      ${linksHtml}
    </div>
  `;

  window.Modal.show({
    title: 'Contents',
    content,
    onClose: () => {},
  });

  document.querySelectorAll('.toc-modal-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.Modal.hide();
      const href = link.getAttribute('href');
      if (href === '#') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

function initializeTocButton() {
  const button = document.getElementById('toc-button');
  if (button) {
    button.addEventListener('click', showTocModal);
  }
}

monitorHeader.applySiteConfig = function applySiteConfig(config) {
  privacyState.config = config?.privacy || null;

  if (config?.site?.name) {
    document.title = config.site.name;
  }

  if (config?.site?.title) {
    const headerTitle = document.querySelector('h1');
    if (headerTitle) {
      headerTitle.textContent = config.site.title;
    }
  }

  syncPrivacyToggleState();
};

document.addEventListener('DOMContentLoaded', () => {
  initializeThemeToggle();
  syncPrivacyToggleState();
  preloadAppInfo();
  initializeMenuButton();
  initializeTocButton();
});
