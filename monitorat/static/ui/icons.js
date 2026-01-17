/**
 * IconHandler - unified icon rendering for SVG, PNG, and WebP
 *
 * SVGs use currentColor for theme-aware rendering
 * PNG/WebP are rendered as standard img elements
 */

const IconHandler = (() => {
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
    if (root && root.tagName.toLowerCase().endsWith('svg')) {
      return root;
    }
    return null;
  }

  return {
    renderIcon,
  };
})();

window.IconHandler = IconHandler;
window.monitorShared = window.monitorShared || {};
window.monitorShared.IconHandler = IconHandler;
