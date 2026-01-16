/* global document */
window.monitor = window.monitor || {};
const monitorAPI = window.monitor;

const sectionHeaders = new Map();

function resolveSectionKey(widgetConfig) {
  if (!widgetConfig || widgetConfig.section === undefined) {
    return null;
  }
  if (widgetConfig.section === null) {
    return null;
  }
  if (typeof widgetConfig.section !== 'string') {
    throw new Error('section must be a string or null');
  }
  return widgetConfig.section;
}

function getSectionConfig(sectionKey) {
  if (!sectionKey) {
    return null;
  }
  return monitorAPI.sectionsConfig?.[sectionKey] || {};
}

function toggleSection(sectionKey, forceState) {
  const header = document.querySelector(
    `.section-header-collapsible[data-section="${sectionKey}"]`,
  );
  const groups = document.querySelectorAll(
    `.layout-group[data-section="${sectionKey}"]`,
  );
  if (!groups.length) return;

  const isHidden = Array.from(groups).every(
    (group) => group.style.display === 'none',
  );
  const shouldShow = forceState !== undefined ? forceState : isHidden;

  groups.forEach((group) => {
    group.style.display = shouldShow ? '' : 'none';
  });

  if (header) {
    header.classList.toggle('collapsed', !shouldShow);
  }

  if (window.monitorLayout?.updateLayoutGroups) {
    window.monitorLayout.updateLayoutGroups();
  }
  if (window.monitorShared?.expansion?.saveExpansionStates) {
    window.monitorShared.expansion.saveExpansionStates();
  }
}

window.toggleSection = toggleSection;

window.monitorSections = {
  sectionHeaders,
  resolveSectionKey,
  getSectionConfig,
  toggleSection,
};
