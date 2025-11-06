class TableManager {
  constructor(config) {
    this.statusElement = config.statusElement;
    this.rowsElement = config.rowsElement;
    this.toggleElement = config.toggleElement;
    this.previewCount = config.previewCount || 5;
    this.emptyMessage = config.emptyMessage || 'No data yet.';
    this.rowFormatter = config.rowFormatter;
    
    this.entries = [];
    this.expanded = false;
    
    if (this.toggleElement) {
      this.toggleElement.addEventListener('click', () => this.toggleExpansion());
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
      if (this.toggleElement) {
        this.toggleElement.style.display = 'none';
      }
      return;
    }

    const previewCount = Math.max(1, this.previewCount);
    const showCount = this.expanded ? this.entries.length : Math.min(previewCount, this.entries.length);
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

    if (this.toggleElement) {
      if (this.entries.length <= previewCount) {
        this.toggleElement.style.display = 'none';
      } else {
        this.toggleElement.style.display = '';
        const remaining = this.entries.length - previewCount;
        this.toggleElement.textContent = this.expanded ? 'Show less' : `Show ${remaining} more`;
      }
    }
  }

  toggleExpansion() {
    this.expanded = !this.expanded;
    this.render();
  }
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.TableManager = TableManager;