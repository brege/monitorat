class TableManager {
  constructor(config) {
    this.statusElement = config.statusElement;
    this.rowsElement = config.rowsElement;
    this.toggleElement = config.toggleElement;
    this.previewCount = config.previewCount || 5;
    this.emptyMessage = config.emptyMessage || 'No data yet.';
    this.rowFormatter = config.rowFormatter;
    this.isTableViewActive = config.isTableViewActive || (() => true);

    this.entries = [];
    this.expanded = false;

    if (this.toggleElement) {
      this.toggleElement.addEventListener('click', () =>
        this.toggleExpansion(),
      );
    }
  }

  setEntries(entries) {
    this.entries = entries;
    this.render();
  }

  setStatus(message) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
      this.statusElement.style.display = '';
    }
  }

  render() {
    if (!this.rowsElement) return;

    this.rowsElement.innerHTML = '';

    if (!this.entries.length) {
      this.setStatus(this.emptyMessage);
      this.updateToggleVisibility();
      return;
    }

    const previewCount = Math.max(1, this.previewCount);
    const showCount = this.expanded
      ? this.entries.length
      : Math.min(previewCount, this.entries.length);
    const latest = this.entries.slice(0, showCount);

    latest.forEach((entry) => {
      const tr = document.createElement('tr');
      const cells = this.rowFormatter ? this.rowFormatter(entry) : [entry];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      this.rowsElement.appendChild(tr);
    });

    if (this.statusElement) {
      this.statusElement.style.display = 'none';
    }

    this.updateToggleVisibility();
  }

  updateToggleVisibility() {
    if (!this.toggleElement) return;

    const previewCount = Math.max(1, this.previewCount);
    const shouldShow =
      this.entries.length > previewCount && this.isTableViewActive();

    if (shouldShow) {
      this.toggleElement.style.display = '';
      const remaining = this.entries.length - previewCount;
      this.toggleElement.textContent = this.expanded
        ? 'Show fewer'
        : `Show ${remaining} more`;
    } else {
      this.toggleElement.style.display = 'none';
    }
  }

  toggleExpansion() {
    this.expanded = !this.expanded;
    this.render();
  }

  static updateTableHeaders(thead, headers) {
    if (!thead) return;
    thead.innerHTML = '';
    for (const header of headers) {
      const th = document.createElement('th');
      th.textContent = header;
      thead.appendChild(th);
    }
  }

  static buildTableHeaders(
    container,
    metricFields = [],
    metadataLabel = 'Source',
    metadataFields = [],
  ) {
    const headerRow = container?.querySelector('thead tr');
    if (!headerRow) return;

    const headers = ['Timestamp'];
    for (const metric of metricFields) {
      headers.push(metric.label);
    }
    if (Array.isArray(metadataFields) && metadataFields.length > 0) {
      for (const field of metadataFields) {
        if (typeof field === 'string') {
          headers.push(field);
        } else if (field && typeof field.label === 'string') {
          headers.push(field.label);
        } else if (field && typeof field.field === 'string') {
          headers.push(field.field);
        }
      }
    } else {
      headers.push(metadataLabel);
    }

    TableManager.updateTableHeaders(headerRow, headers);
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.TableManager = TableManager;
