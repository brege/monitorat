// ServicesSnapshot: Unified service renderer
//
// Handles both single-source and multi-source (federation) cases.
// Single-source is the trivial case: one source, no badges.
// Multi-source merges all services with source badges.

class ServicesSnapshot {
  constructor(widget) {
    this.widget = widget;
    this.modal = widget.features.modal;
  }

  render() {
    const cardsContainer = this.widget.container.querySelector('.service-grid');
    if (!cardsContainer || !this.widget.servicesData) return;

    cardsContainer.innerHTML = '';
    const isCompact = this.widget.getDisplayMode() === 'compact';
    cardsContainer.classList.toggle('compact', isCompact);
    if (isCompact) {
      this.applyCompactSizing();
    } else {
      this.clearCompactSizing();
    }

    const services =
      this.widget.filteredServices || this.widget.servicesData || [];
    const isMultiSource = this.hasMultipleSources(services);
    const sorted = this.widget.sortServices(services);

    if (!sorted.length) {
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = 'No services configured.';
      cardsContainer.appendChild(info);
      return;
    }

    sorted.forEach((service) => {
      cardsContainer.appendChild(
        this.createServiceCard(service, isMultiSource),
      );
    });
  }

  hasMultipleSources(services) {
    const sources = new Set(services.map((s) => s._source).filter(Boolean));
    return sources.size > 1;
  }

  applyCompactSizing() {
    const container = this.widget.container;
    if (!container) return;

    const scale = this.widget.getCompactIconScale();
    container.style.setProperty(
      '--service-compact-icon-size',
      `${Math.round(28 * scale)}px`,
    );
    container.style.setProperty(
      '--service-compact-card-size',
      `${Math.round(52 * scale)}px`,
    );
    container.style.setProperty(
      '--service-compact-padding',
      `${Math.round(8 * scale)}px`,
    );
    container.style.setProperty(
      '--service-compact-dot-size',
      `${Math.round(10 * scale)}px`,
    );
    container.style.setProperty(
      '--service-compact-dot-offset',
      `${Math.round(6 * scale)}px`,
    );
  }

  clearCompactSizing() {
    const container = this.widget.container;
    if (!container) return;

    container.style.removeProperty('--service-compact-icon-size');
    container.style.removeProperty('--service-compact-card-size');
    container.style.removeProperty('--service-compact-padding');
    container.style.removeProperty('--service-compact-dot-size');
    container.style.removeProperty('--service-compact-dot-offset');
  }

  createServiceCard(service, showBadge) {
    const card = document.createElement('div');
    const mode = this.widget.getDisplayMode();
    const hasBadge = showBadge && service._source;
    const baseClass =
      mode === 'compact'
        ? 'service-card compact'
        : 'service-card card status-card hover-expand-parent';
    card.className = `${baseClass}${hasBadge ? ' has-badge' : ''}`;
    card.setAttribute('data-service-key', service._key);
    card.setAttribute('data-service-source', service._source || '');

    if (hasBadge) {
      const badge = document.createElement('span');
      badge.className = `source-badge source-${service._source}`;
      badge.textContent = service._source;
      badge.title = `Source: ${service._source}`;
      card.appendChild(badge);
    }

    const iconContainer = document.createElement('div');
    iconContainer.className = 'service-icon hover-expand';
    const imgBase = service._source
      ? `api/proxy/${service._source}/img`
      : this.widget.getImgBase();
    IconHandler.renderIcon(
      iconContainer,
      `${imgBase}/${service.icon}`,
      service.name,
      { chrome: Boolean(service.chrome) },
    );

    const info = document.createElement('div');
    info.className = 'service-info';

    const name = document.createElement('div');
    name.className = 'service-name';
    name.textContent = service.name;

    const status = document.createElement('div');
    status.className = 'service-status';
    status.textContent = 'Loading...';

    info.appendChild(name);
    info.appendChild(status);

    card.appendChild(iconContainer);
    card.appendChild(info);

    if (mode === 'compact') {
      const statusDot = document.createElement('button');
      statusDot.type = 'button';
      statusDot.className = 'service-status-dot';
      statusDot.title = 'Service details';
      statusDot.setAttribute(
        'aria-label',
        `Service details for ${service.name}`,
      );
      statusDot.addEventListener('click', (event) => {
        event.stopPropagation();
        this.modal.open(service);
      });
      card.appendChild(statusDot);
    } else {
      const infoBtn = document.createElement('button');
      infoBtn.type = 'button';
      infoBtn.className = 'service-info-btn hover-expand';
      infoBtn.innerHTML = this.modal.getInfoIcon();
      infoBtn.title = 'Service details';
      infoBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.modal.open(service);
      });
      card.appendChild(infoBtn);
    }

    let longPressTriggered = false;

    card.addEventListener('click', (event) => {
      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }
      if (
        event.target.closest('.service-info-btn') ||
        event.target.closest('.service-status-dot')
      ) {
        return;
      }
      const useLocal = event.shiftKey && (event.ctrlKey || event.metaKey);
      const url = useLocal ? service.local || service.url : service.url;
      if (url) {
        window.open(url, '_blank');
      }
    });

    let longPressTimer = null;
    const longPressDelay = 500;

    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    card.addEventListener(
      'touchstart',
      () => {
        longPressTriggered = false;
        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          this.modal.open(service);
        }, longPressDelay);
      },
      { passive: true },
    );

    card.addEventListener('touchend', cancelLongPress);
    card.addEventListener('touchmove', cancelLongPress);
    card.addEventListener('touchcancel', cancelLongPress);

    return card;
  }

  updateStatus() {
    if (!this.widget.servicesData) return;

    this.widget.servicesData.forEach((service) => {
      const selector = `[data-service-key="${service._key}"][data-service-source="${service._source || ''}"]`;
      const card = this.widget.container.querySelector(selector);
      if (!card) return;

      const statusData = service._source
        ? this.widget.statusBySource[service._source] || {}
        : this.widget.statusBySource._local || {};

      const severityOrder = this.widget.getStatusSeverity();
      let overallStatus = 'ok';
      let worstIndex = this.widget.getStatusRank(overallStatus, severityOrder);
      const statusParts = [];

      if (service.containers) {
        service.containers.forEach((container) => {
          const entry = this.widget.getStatusEntry(statusData, container);
          const statusIndex = this.widget.getStatusRank(
            entry.status,
            severityOrder,
          );
          if (statusIndex > worstIndex) {
            overallStatus = entry.status;
            worstIndex = statusIndex;
          }
          const label = this.widget.getStatusLabel(entry.status);
          const reasonText = entry.reason ? ` (${entry.reason})` : '';
          statusParts.push(`${container}: ${label}${reasonText}`);
        });
      }

      if (service.services) {
        service.services.forEach((serviceName) => {
          const entry = this.widget.getStatusEntry(statusData, serviceName);
          const statusIndex = this.widget.getStatusRank(
            entry.status,
            severityOrder,
          );
          if (statusIndex > worstIndex) {
            overallStatus = entry.status;
            worstIndex = statusIndex;
          }
          const label = this.widget.getStatusLabel(entry.status);
          const reasonText = entry.reason ? ` (${entry.reason})` : '';
          statusParts.push(`${serviceName}: ${label}${reasonText}`);
        });
      }

      if (service.timers) {
        service.timers.forEach((timer) => {
          const entry = this.widget.getStatusEntry(statusData, timer);
          const statusIndex = this.widget.getStatusRank(
            entry.status,
            severityOrder,
          );
          if (statusIndex > worstIndex) {
            overallStatus = entry.status;
            worstIndex = statusIndex;
          }
          const label = this.widget.getStatusLabel(entry.status);
          const reasonText = entry.reason ? ` (${entry.reason})` : '';
          statusParts.push(`${timer}: ${label}${reasonText}`);
        });
      }

      const hasBadge = card.classList.contains('has-badge');
      const isCompact = card.classList.contains('compact');
      const baseClass = isCompact
        ? 'service-card compact'
        : 'service-card card status-card hover-expand-parent';
      const statusClass = this.widget.getStatusClass(overallStatus);
      card.className = `${baseClass}${hasBadge ? ' has-badge' : ''} ${statusClass}`;

      const statusTextElement = card.querySelector('.service-status');
      if (statusTextElement) {
        statusTextElement.textContent =
          this.widget.getStatusLabel(overallStatus);
      }

      const clickTip = `Click: ${service.url}\nCtrl+Shift+Click: ${service.local || service.url}`;
      card.title = `${statusParts.join('\n')}\n\n${clickTip}`;
    });
  }
}

window.ServicesSnapshot = ServicesSnapshot;
