/* global document ResizeObserver */
const layoutGroups = new Map();
let layoutObserver = null;

function resolveLayoutGroupKey(widgetName, widgetConfig) {
  const sectionKey = window.monitorSections.resolveSectionKey(widgetConfig);
  if (!sectionKey) {
    return `widget:${widgetName}`;
  }
  const group = widgetConfig?.group;
  const groupKey = group && typeof group === 'string' ? group : 'default';
  return `section:${sectionKey}:group:${groupKey}`;
}

function resolveLayoutColumns(widgetConfig) {
  const columns = Number(widgetConfig?.columns);
  if (Number.isFinite(columns) && columns > 0) {
    return Math.floor(columns);
  }
  return 1;
}

function ensureLayoutObserver() {
  if (layoutObserver) return;
  layoutObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      updateLayoutGroup(entry.target);
    });
  });
}

function createLayoutGroup(groupKey, sectionKey, sectionConfig) {
  const widgetStack = document.querySelector('.widget-stack');
  const { sectionHeaders } = window.monitorSections;

  if (sectionKey && !sectionHeaders.has(sectionKey)) {
    const sectionTitle =
      sectionConfig && Object.hasOwn(sectionConfig, 'title')
        ? sectionConfig.title
        : sectionKey;
    if (sectionTitle !== null) {
      const section = document.createElement('div');
      section.className = 'section-separator';
      section.dataset.sectionKey = sectionKey;
      section.id = `section-${sectionKey}`;

      const collapsible = sectionConfig?.collapsible !== false;
      const headerClass = collapsible
        ? 'section-header section-header-collapsible'
        : 'section-header';
      const chevronSvg = collapsible
        ? '<svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
        : '';

      section.innerHTML = `
        <div class="${headerClass}" data-section="${sectionKey}">
          ${chevronSvg}
          <h2 class="section-title">
            ${sectionTitle}
            <a class="header-anchor" href="#section-${sectionKey}">#</a>
          </h2>
        </div>
      `;

      widgetStack.appendChild(section);
      sectionHeaders.set(sectionKey, section);
      if (collapsible) {
        const header = section.querySelector('.section-header-collapsible');
        const anchor = section.querySelector('.header-anchor');
        header.addEventListener('click', (event) => {
          if (event.target === anchor || anchor.contains(event.target)) {
            return;
          }
          window.monitorSections.toggleSection(sectionKey);
        });
      }
    } else {
      sectionHeaders.set(sectionKey, null);
    }
  }

  const group = document.createElement('div');
  group.className = 'layout-columns layout-group';
  group.dataset.layoutGroup = groupKey;
  if (sectionKey) {
    group.dataset.section = sectionKey;
  }
  group.dataset.layoutColumns = '1';
  group.style.setProperty('--layout-group-columns', '1');
  const sectionContainer = sectionKey ? sectionHeaders.get(sectionKey) : null;
  const groupParent = sectionContainer || widgetStack;
  groupParent.appendChild(group);
  ensureLayoutObserver();
  layoutObserver.observe(group);
  layoutGroups.set(groupKey, group);
  return group;
}

function getLayoutGroup(widgetName, widgetConfig) {
  const groupKey = resolveLayoutGroupKey(widgetName, widgetConfig);
  const columns = resolveLayoutColumns(widgetConfig);
  const sectionKey = window.monitorSections.resolveSectionKey(widgetConfig);
  const sectionConfig = window.monitorSections.getSectionConfig(sectionKey);
  let group = layoutGroups.get(groupKey);
  if (!group) {
    group = createLayoutGroup(groupKey, sectionKey, sectionConfig);
  }
  const existingColumns = Number(group.dataset.layoutColumns || 1);
  if (columns > existingColumns) {
    group.dataset.layoutColumns = String(columns);
  }
  return group;
}

function updateLayoutGroup(group) {
  if (!group) return;
  const maxColumns = Math.max(1, Number(group.dataset.layoutColumns || 1));
  const styles = window.getComputedStyle(group);
  const gapValue = parseFloat(styles.columnGap || styles.gap) || 0;
  const containerWidth = group.clientWidth;

  const children = Array.from(group.children).filter((child) => {
    return window.getComputedStyle(child).display !== 'none';
  });

  let minWidthValue =
    parseFloat(styles.getPropertyValue('--layout-group-min')) || 320;
  for (const child of children) {
    const childMin = parseFloat(
      window.getComputedStyle(child).getPropertyValue('--widget-min-width'),
    );
    if (childMin && childMin > minWidthValue) {
      minWidthValue = childMin;
    }
  }

  group.style.setProperty('--layout-group-min', `${minWidthValue}px`);
  const availableColumns = Math.max(
    1,
    Math.min(
      maxColumns,
      Math.floor((containerWidth + gapValue) / (minWidthValue + gapValue)),
    ),
  );
  group.style.setProperty('--layout-group-columns', String(availableColumns));
  applyLayoutSpan(group, availableColumns);
}

function updateLayoutGroups() {
  for (const group of layoutGroups.values()) {
    updateLayoutGroup(group);
  }
}

function applyLayoutSpan(group, columns) {
  const items = Array.from(group.children).filter((item) => {
    const display = window.getComputedStyle(item).display;
    return display !== 'none';
  });
  items.forEach((item) => {
    item.style.gridColumn = '';
  });
  if (columns <= 1) return;
  const hasPosition = items.some((item) => item.dataset.position !== undefined);
  if (hasPosition) return;
  if (items.length === 0) return;
  const remainder = items.length % columns;
  if (remainder === 1) {
    const lastItem = items[items.length - 1];
    lastItem.style.gridColumn = `span ${columns}`;
  }
}

function orderLayoutGroup(group) {
  const items = Array.from(group.children);
  const hasPosition = items.some((item) => item.dataset.position !== undefined);
  if (!hasPosition) return;
  const ordered = items.sort((left, right) => {
    const leftPos =
      left.dataset.position !== undefined
        ? Number(left.dataset.position)
        : null;
    const rightPos =
      right.dataset.position !== undefined
        ? Number(right.dataset.position)
        : null;
    if (leftPos === null && rightPos === null) {
      return Number(left.dataset.order) - Number(right.dataset.order);
    }
    if (leftPos === null) return 1;
    if (rightPos === null) return -1;
    if (leftPos === rightPos) {
      return Number(left.dataset.order) - Number(right.dataset.order);
    }
    return leftPos - rightPos;
  });
  ordered.forEach((item) => {
    group.appendChild(item);
  });
}

function orderLayoutGroups() {
  for (const group of layoutGroups.values()) {
    orderLayoutGroup(group);
  }
}

window.monitorLayout = {
  layoutGroups,
  getLayoutGroup,
  updateLayoutGroup,
  updateLayoutGroups,
  orderLayoutGroups,
};
