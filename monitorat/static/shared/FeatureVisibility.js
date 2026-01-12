const FeatureVisibility = {
  apply(container, showConfig, featureMap) {
    if (!container || !featureMap) return;

    const config = showConfig || {};

    for (const [feature, selector] of Object.entries(featureMap)) {
      const element =
        typeof selector === 'string'
          ? container.querySelector(selector)
          : selector;

      if (!element) continue;

      const isVisible = config[feature] !== false;
      if (isVisible) {
        element.classList.remove('hidden');
        element.style.display = '';
      } else {
        element.classList.add('hidden');
        element.style.display = 'none';
      }
    }
  },

  isVisible(showConfig, feature, defaultValue = true) {
    if (!showConfig) return defaultValue;
    return showConfig[feature] !== false;
  },
};

window.monitorShared = window.monitorShared || {};
window.monitorShared.FeatureVisibility = FeatureVisibility;
