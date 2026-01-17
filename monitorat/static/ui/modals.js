/* global document */

const Modal = (() => {
  let backdrop = null;
  let container = null;
  let closeCallback = null;

  function create() {
    if (backdrop) {
      return;
    }

    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        hide();
      }
    });

    container = document.createElement('div');
    container.className = 'modal-container';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');

    backdrop.appendChild(container);
    document.body.appendChild(backdrop);

    document.addEventListener('keydown', handleKeyDown);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && isOpen()) {
      hide();
    }
  }

  function show(options = {}) {
    const { title, content, actions, onClose } = options;

    create();
    closeCallback = onClose || null;

    let html = '';

    if (title) {
      html += `
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button type="button" class="modal-close" aria-label="Close">&times;</button>
        </div>
      `;
    }

    html += '<div class="modal-body">';
    if (typeof content === 'string') {
      html += content;
    }
    html += '</div>';

    if (actions && actions.length > 0) {
      html += '<div class="modal-footer">';
      actions.forEach((action, index) => {
        const isPrimary = action.primary ? ' modal-action-primary' : '';
        html += `<button type="button" class="modal-action${isPrimary}" data-action-index="${index}">${action.label}</button>`;
      });
      html += '</div>';
    }

    container.innerHTML = html;

    if (content && typeof content === 'object' && content.nodeType === 1) {
      container.querySelector('.modal-body').appendChild(content);
    }

    const closeButton = container.querySelector('.modal-close');
    if (closeButton) {
      closeButton.addEventListener('click', hide);
    }

    if (actions && actions.length > 0) {
      container.querySelectorAll('.modal-action').forEach((button) => {
        button.addEventListener('click', () => {
          const index = parseInt(button.dataset.actionIndex, 10);
          const action = actions[index];
          if (action && typeof action.onClick === 'function') {
            action.onClick();
          }
          if (action && action.closeOnClick !== false) {
            hide();
          }
        });
      });
    }

    backdrop.classList.add('modal-visible');
    container.querySelector('.modal-close')?.focus();
  }

  function hide() {
    if (!backdrop) {
      return;
    }

    backdrop.classList.remove('modal-visible');

    if (typeof closeCallback === 'function') {
      closeCallback();
      closeCallback = null;
    }
  }

  function isOpen() {
    return backdrop?.classList.contains('modal-visible');
  }

  return { show, hide, isOpen };
})();

window.Modal = Modal;
window.monitorShared = window.monitorShared || {};
window.monitorShared.Modal = Modal;
