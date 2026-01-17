// RemindersAlerts: Unified reminder renderer
//
// Handles both single-source and multi-source (federation) cases.
// Single-source is the trivial case: one source, no badges.
// Multi-source merges all reminders with source badges.

class RemindersAlerts {
  constructor(widget) {
    this.widget = widget;
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
    const alertElement = document.createElement('div');
    const hasBadge = showBadge && reminder._source;
    alertElement.className = `reminder-alert alert-card status-card status-${reminder.status} hover-expand-parent${hasBadge ? ' has-badge' : ''}`;
    if (reminder.url && !disableActions) {
      alertElement.title = reminder.url;
      alertElement.style.cursor = 'pointer';
    }

    if (hasBadge) {
      const badge = document.createElement('span');
      badge.className = `source-badge source-${reminder._source}`;
      badge.textContent = reminder._source;
      badge.title = `Source: ${reminder._source}`;
      alertElement.appendChild(badge);
    }

    const iconContainer = document.createElement('div');
    iconContainer.className = 'reminder-alert-icon hover-expand';
    const imgBase = reminder._source
      ? `api/proxy/${reminder._source}/img`
      : this.widget.getImgBase();
    IconHandler.renderIcon(
      iconContainer,
      `${imgBase}/${reminder.icon}`,
      reminder.name,
      { chrome: Boolean(reminder.chrome) },
    );

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
    if (reminder.status === 'never') {
      daysSpan.textContent = 'Never';
    } else if (reminder.status === 'expired') {
      daysSpan.textContent = `${Math.abs(reminder.days_remaining)}d overdue`;
    } else {
      daysSpan.textContent = `${reminder.days_remaining}d left`;
    }

    const lastTouchSpan = document.createElement('span');
    if (reminder.days_since !== null) {
      lastTouchSpan.textContent = `${reminder.days_since}d ago`;
    } else {
      lastTouchSpan.textContent = 'Never';
    }

    statsDiv.appendChild(daysSpan);
    statsDiv.appendChild(lastTouchSpan);

    content.appendChild(textDiv);
    content.appendChild(statsDiv);

    alertElement.appendChild(iconContainer);
    alertElement.appendChild(content);

    const canEdit =
      !disableActions && this.widget.canEditReminders() && !reminder._source;

    if (canEdit) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'reminder-edit-button';
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
      alertElement.appendChild(editButton);
    }

    if (!disableActions) {
      alertElement.addEventListener('click', async () => {
        if (reminder.url) {
          alertElement.className = alertElement.className.replace(
            /status-\w+/,
            'status-ok',
          );

          const stats = alertElement.querySelector('.reminder-alert-stats');
          if (stats) {
            const spans = stats.querySelectorAll('span');
            if (spans.length >= 2) {
              spans[1].textContent = '0d ago';
            }
          }

          try {
            const touchBase = reminder._source
              ? `api/reminders-${reminder._source}`
              : this.widget.getApiBase();
            await fetch(`${touchBase}/${reminder.id}/touch`, {
              method: 'POST',
            });
            setTimeout(() => this.widget.loadData(), 500);
          } catch (error) {
            console.error('Failed to touch reminder:', error);
          }

          window.open(reminder.url, '_blank');
        }
      });
    }

    return alertElement;
  }
}

window.RemindersAlerts = RemindersAlerts;
