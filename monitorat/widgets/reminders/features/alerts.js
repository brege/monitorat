// RemindersAlerts: Unified reminder renderer
//
// Handles both single-source and multi-source (federation) cases.
// Single-source is the trivial case: one source, no badges.
// Multi-source merges all reminders with source badges.

class RemindersAlerts {
  constructor(widget) {
    this.widget = widget;
  }

  getIconPlaceholder() {
    return '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M368.5 240H272v-96.5c0-8.8-7.2-16-16-16s-16 7.2-16 16V240h-96.5c-8.8 0-16 7.2-16 16 0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7H240v96.5c0 4.4 1.8 8.4 4.7 11.3 2.9 2.9 6.9 4.7 11.3 4.7 8.8 0 16-7.2 16-16V272h96.5c8.8 0 16-7.2 16-16s-7.2-16-16-16z"></path></svg>';
  }

  render() {
    const alertsContainer =
      this.widget.container.querySelector('.reminder-alerts');
    if (!alertsContainer || !this.widget.remindersConfig) return;

    alertsContainer.innerHTML = '';

    const reminders =
      this.widget.filteredReminders || this.widget.remindersConfig || [];
    const isMultiSource = this.hasMultipleSources(reminders);
    const sortedReminders = this.widget.sortReminders(reminders);

    if (!sortedReminders.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = 'No reminders configured.';
      alertsContainer.appendChild(info);
      return;
    }

    sortedReminders.forEach((reminder) => {
      alertsContainer.appendChild(
        this.createReminderCard(reminder, isMultiSource),
      );
    });
  }

  hasMultipleSources(reminders) {
    const sources = new Set(reminders.map((r) => r._source).filter(Boolean));
    return sources.size > 1;
  }

  createReminderCard(reminder, showBadge, options = {}) {
    const { disableActions = false } = options;
    const hasBadge = showBadge && reminder._source;
    const isDisabled = reminder.disabled === true;
    const statusClass = isDisabled ? 'disabled' : reminder.status;
    const classes = [
      'reminder-alert',
      'status-card',
      `status-${statusClass}`,
      'hover-expand-parent',
      isDisabled ? 'is-disabled' : '',
    ];

    const iconContainer = document.createElement('div');
    iconContainer.className = 'reminder-alert-icon hover-expand';
    const imgBase = reminder._source
      ? `api/proxy/${reminder._source}/img`
      : this.widget.getImgBase();
    if (reminder.icon) {
      IconHandler.renderIcon(
        iconContainer,
        `${imgBase}/${reminder.icon}`,
        reminder.name,
        { chrome: Boolean(reminder.chrome) },
      );
    } else {
      iconContainer.innerHTML = this.getIconPlaceholder();
    }

    const content = document.createElement('div');
    content.className = 'reminder-alert-content';

    const textDiv = document.createElement('div');
    textDiv.className = 'reminder-alert-text';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'reminder-alert-name';
    nameDiv.textContent = reminder.name;

    const descDiv = document.createElement('div');
    descDiv.className = 'reminder-alert-description';
    descDiv.textContent = reminder.reason || '';

    textDiv.appendChild(nameDiv);
    if (reminder.reason) {
      textDiv.appendChild(descDiv);
    }

    const statsDiv = document.createElement('div');
    statsDiv.className = 'reminder-alert-stats';

    const daysSpan = document.createElement('span');
    if (isDisabled) {
      daysSpan.textContent = 'Disabled';
    } else if (reminder.status === 'never') {
      daysSpan.textContent = 'Never';
    } else if (reminder.status === 'expired') {
      daysSpan.textContent = `${Math.abs(reminder.days_remaining)}d overdue`;
    } else {
      daysSpan.textContent = `${reminder.days_remaining}d left`;
    }

    const lastTouchSpan = document.createElement('span');
    if (isDisabled) {
      lastTouchSpan.textContent = '';
    } else if (reminder.days_since !== null) {
      lastTouchSpan.textContent = `${reminder.days_since}d ago`;
    } else {
      lastTouchSpan.textContent = 'Never';
    }

    statsDiv.appendChild(daysSpan);
    statsDiv.appendChild(lastTouchSpan);

    content.appendChild(textDiv);
    content.appendChild(statsDiv);

    const canEdit =
      !disableActions && this.widget.canEditReminders() && !reminder._source;

    const actions = [];
    if (canEdit) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className =
        'reminder-edit-button editor-edit-btn hover-expand';
      editButton.title = 'Edit reminder';
      editButton.setAttribute('aria-label', 'Edit reminder');
      editButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      `;
      editButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.widget.openReminderEditor(reminder);
      });
      actions.push(editButton);
    }

    const Alerts = window.monitorShared.Alerts;
    return Alerts.createCard({
      classes,
      badge: hasBadge
        ? {
            text: reminder._source,
            title: `Source: ${reminder._source}`,
            className: `source-${reminder._source}`,
          }
        : null,
      content: [iconContainer, content],
      actions,
      title: reminder.url && !disableActions && !isDisabled ? reminder.url : '',
      onClick:
        !disableActions && !isDisabled
          ? () => {
              this.widget.openReminderModal(reminder);
            }
          : null,
    });
  }
}

window.RemindersAlerts = RemindersAlerts;
