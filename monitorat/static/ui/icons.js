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
    wrench:
      '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke-width="2" d="M16,15 C20.0089021,14.9354541 23,11.9673591 23,8 C23,4.98813056 22.0029673,5.9851632 21,7 C20.0089021,7.97922849 18,10 18,10 L14,6 C14,6 16.0207715,3.99109792 17,3 C18.0148368,1.99703264 18.0148368,1 16,1 C12.0326409,0.999999999 9.05307486,3.99109792 9,8 C9.04154304,8.97626113 9,11 9,11 C7.11486635,12.8970031 4.65923194,15.3526375 3,17 C0.0682492584,19.9436202 4.05637975,23.9317507 7,21 C8.65052042,19.3376102 11.1126942,16.8754364 13,15 C13,15 15.0237389,14.958457 16,15 Z"></path></svg>',
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
