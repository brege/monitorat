/* global localStorage */
const REMEMBER_EXPANSIONS_KEY = 'monitor-remember-expansions';
const EXPANSIONS_STATE_KEY = 'monitor-expansions';

function isRememberExpansionsEnabled() {
  try {
    return localStorage.getItem(REMEMBER_EXPANSIONS_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function setRememberExpansions(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(REMEMBER_EXPANSIONS_KEY, 'true');
      saveExpansionStates();
    } else {
      localStorage.removeItem(REMEMBER_EXPANSIONS_KEY);
      localStorage.removeItem(EXPANSIONS_STATE_KEY);
    }
  } catch (_) {
    /* localStorage may be unavailable */
  }
}

function saveExpansionStates() {
  if (!isRememberExpansionsEnabled()) {
    return;
  }

  const states = {};
  document.querySelectorAll('.section-header-collapsible').forEach((header) => {
    const sectionKey = header.dataset.section;
    if (sectionKey) {
      states[sectionKey] = !header.classList.contains('collapsed');
    }
  });

  try {
    localStorage.setItem(EXPANSIONS_STATE_KEY, JSON.stringify(states));
  } catch (_) {
    /* localStorage may be unavailable */
  }
}

function restoreExpansionStates() {
  if (!isRememberExpansionsEnabled()) {
    return;
  }

  try {
    const stored = localStorage.getItem(EXPANSIONS_STATE_KEY);
    if (!stored) {
      return;
    }

    const states = JSON.parse(stored);
    Object.entries(states).forEach(([sectionKey, expanded]) => {
      const groups = document.querySelectorAll(
        `.layout-group[data-section="${sectionKey}"]`,
      );
      if (!groups.length) return;
      groups.forEach((group) => {
        group.style.display = expanded ? '' : 'none';
      });
      const header = document.querySelector(
        `.section-header-collapsible[data-section="${sectionKey}"]`,
      );
      if (header) {
        header.classList.toggle('collapsed', !expanded);
      }
    });
  } catch (_) {
    /* localStorage may be unavailable or corrupted */
  }
}

window.isRememberExpansionsEnabled = isRememberExpansionsEnabled;
window.setRememberExpansions = setRememberExpansions;

window.monitorShared = window.monitorShared || {};
window.monitorShared.expansion = {
  isRememberExpansionsEnabled,
  setRememberExpansions,
  saveExpansionStates,
  restoreExpansionStates,
};
