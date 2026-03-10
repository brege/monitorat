/**
 * IconHandler - unified icon rendering for SVG, PNG, and WebP
 *
 * SVGs use currentColor for theme-aware rendering
 * PNG/WebP are rendered as standard img elements
 */

const IconHandler = (() => {
  const ACTION_ICONS = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
    'edit-doc':
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    overflow:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6.5" cy="12" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="17.5" cy="12" r="1.75"/></svg>',
  };

  function getFileExtension(path) {
    return path?.split('.')?.pop()?.toLowerCase() || '';
  }

  async function fetchAndInlineSvg(container, iconPath, altText, options) {
    try {
      const response = await fetch(iconPath);
      if (!response.ok) throw new Error(`Failed to load ${iconPath}`);
      const svgText = await response.text();

      container.textContent = '';
      container.style.overflow = 'hidden';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';

      const svg = parseSvg(svgText);
      if (!svg) throw new Error(`Invalid SVG: ${iconPath}`);

      const svgNode =
        svg.ownerDocument === document ? svg : document.importNode(svg, true);
      normalizeSvg(svgNode, options);
      if (altText) {
        svgNode.setAttribute('aria-label', altText);
      }
      container.appendChild(svgNode);
    } catch (error) {
      console.error('Failed to render SVG icon:', error);
      fallbackImg(container, iconPath, altText);
    }
  }

  function fallbackImg(container, iconPath, altText) {
    const img = document.createElement('img');
    img.src = iconPath;
    if (altText) {
      img.alt = altText;
    }
    sizeToContainer(img);
    container.appendChild(img);
  }

  function renderIcon(element, iconPath, altText, options = {}) {
    if (!element || !iconPath) return;

    const ext = getFileExtension(iconPath);

    if (ext === 'svg') {
      fetchAndInlineSvg(element, iconPath, altText, options);
    } else {
      const img = document.createElement('img');
      img.src = iconPath;
      if (altText) {
        img.alt = altText;
      }
      sizeToContainer(img);
      element.appendChild(img);
    }
  }

  function sizeToContainer(node) {
    node.style.width = '100%';
    node.style.height = '100%';
    node.style.display = 'block';
    node.style.objectFit = 'contain';
  }

  function normalizeSvg(svg, options) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
    svg.classList.add('icon-svg');

    if (options.chrome) {
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('stroke', 'currentColor');
      svg.style.color = 'currentColor';
    }
  }

  function parseSvg(svgText) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svgText, 'image/svg+xml');
    const root = parsed.documentElement;
    if (root?.tagName.toLowerCase().endsWith('svg')) {
      return root;
    }
    return null;
  }

  function getActionIcon(name) {
    return ACTION_ICONS[name] || '';
  }

  return {
    getActionIcon,
    renderIcon,
  };
})();

window.IconHandler = IconHandler;
window.monitorShared = window.monitorShared || {};
window.monitorShared.IconHandler = IconHandler;
