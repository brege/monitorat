const REMINDER_MODAL_ICONS = {
  reset:
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 16c1.671 0 3-1.331 3-3s-1.329-3-3-3-3 1.331-3 3 1.329 3 3 3z"></path><path d="M20.817 11.186a8.94 8.94 0 0 0-1.355-3.219 9.053 9.053 0 0 0-2.43-2.43 8.95 8.95 0 0 0-3.219-1.355 9.028 9.028 0 0 0-1.838-.18V2L8 5l3.975 3V6.002c.484-.002.968.044 1.435.14a6.961 6.961 0 0 1 2.502 1.053 7.005 7.005 0 0 1 1.892 1.892A6.967 6.967 0 0 1 19 13a7.032 7.032 0 0 1-.55 2.725 7.11 7.11 0 0 1-.644 1.188 7.2 7.2 0 0 1-.858 1.039 7.028 7.028 0 0 1-3.536 1.907 7.13 7.13 0 0 1-2.822 0 6.961 6.961 0 0 1-2.503-1.054 7.002 7.002 0 0 1-1.89-1.89A6.996 6.996 0 0 1 5 13H3a9.02 9.02 0 0 0 1.539 5.034 9.096 9.096 0 0 0 2.428 2.428A8.95 8.95 0 0 0 12 22a9.09 9.09 0 0 0 1.814-.183 9.014 9.014 0 0 0 3.218-1.355 8.886 8.886 0 0 0 1.331-1.099 9.228 9.228 0 0 0 1.1-1.332A8.952 8.952 0 0 0 21 13a9.09 9.09 0 0 0-.183-1.814z"></path></svg>',
  confirm:
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M186.301 339.893L96 249.461l-32 30.507L186.301 402 448 140.506 416 110z"></path></svg>',
};

const RemindersModal = (() => {
  function open(options) {
    const { reminder, imgBase, onConfirm, onReset } = options;
    if (!window.Modal || !reminder) {
      return;
    }

    const content = document.createElement('div');
    content.className = 'reminder-action-modal';
    content.innerHTML = `
      <div class="reminder-action-header">
        <div class="reminder-action-icon"></div>
        <div class="reminder-action-text">
          <div class="reminder-action-name"></div>
          <div class="reminder-action-description"></div>
        </div>
      </div>
      <div class="reminder-action-actions">
        <button type="button" class="icon-label reminder-action-reset">
          <span class="icon-label-icon">${REMINDER_MODAL_ICONS.reset}</span>
          <span class="icon-label-text">Reset</span>
        </button>
        <button type="button" class="icon-label status-ok reminder-action-confirm">
          <span class="icon-label-icon">${REMINDER_MODAL_ICONS.confirm}</span>
          <span class="icon-label-text">Confirm</span>
        </button>
      </div>
    `;

    const iconContainer = content.querySelector('.reminder-action-icon');
    const nameEl = content.querySelector('.reminder-action-name');
    const descriptionEl = content.querySelector('.reminder-action-description');

    if (iconContainer) {
      if (reminder.icon && window.IconHandler) {
        window.IconHandler.renderIcon(
          iconContainer,
          `${imgBase}/${reminder.icon}`,
          reminder.name,
          { chrome: Boolean(reminder.chrome) },
        );
      } else {
        iconContainer.innerHTML =
          '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M368.5 240H272v-96.5c0-8.8-7.2-16-16-16s-16 7.2-16 16V240h-96.5c-8.8 0-16 7.2-16 16 0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7H240v96.5c0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7 8.8 0 16-7.2 16-16V272h96.5c8.8 0 16-7.2 16-16s-7.2-16-16-16z"></path></svg>';
      }
    }

    if (nameEl) {
      nameEl.textContent = reminder.name || reminder.id || '';
    }
    if (descriptionEl) {
      descriptionEl.textContent = reminder.reason || '';
    }

    window.Modal.show({
      title: 'Reminder',
      content,
    });

    const resetButton = content.querySelector('.reminder-action-reset');
    const confirmButton = content.querySelector('.reminder-action-confirm');

    resetButton?.addEventListener('click', async () => {
      if (typeof onReset === 'function') {
        await onReset();
      }
      window.Modal.hide();
    });

    confirmButton?.addEventListener('click', async () => {
      if (typeof onConfirm === 'function') {
        await onConfirm();
      }
      window.Modal.hide();
    });
  }

  return { open };
})();

window.RemindersModal = RemindersModal;
