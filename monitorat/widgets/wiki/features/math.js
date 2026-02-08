class WikiMath {
  constructor() {
    this.assetsReady = false;
  }

  async ensureAssets() {
    if (this.assetsReady) {
      return;
    }

    const shared = window.monitorShared;
    if (!shared?.ensureStylesheet || !shared?.loadScript) {
      throw new Error('Shared asset loader is unavailable');
    }

    await shared.ensureStylesheet('assets/katex.min.css');
    await shared.loadScript('assets/katex.min.js', 'katex');
    await shared.loadScript('assets/auto-render.min.js', 'renderMathInElement');

    this.assetsReady = true;
  }

  async render(container, enabled) {
    if (enabled !== true || !container) {
      return;
    }

    try {
      await this.ensureAssets();
      if (typeof window.renderMathInElement !== 'function') {
        return;
      }

      window.renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      });
    } catch (error) {
      console.error('Failed to render wiki math:', error);
    }
  }
}

window.WikiMath = WikiMath;
