class MetricsSnapshot {
  constructor(widget) {
    this.widget = widget;
    this.tiles = null;
  }

  render(data) {
    if (!data.metrics || !data.metric_statuses) return;

    const TileBuilder =
      window.monitorTiles?.TileBuilder || window.monitorShared?.TileBuilder;
    if (!TileBuilder) {
      throw new Error('Tile builder not loaded');
    }

    const statsContainer = this.widget.container.querySelector(
      '[data-metrics="snapshot-tiles"]',
    );
    if (!statsContainer) return;

    const baseTiles = statsContainer.querySelectorAll('.tyler-tile');
    baseTiles.forEach((tile) => {
      tile.style.display = '';
    });

    const mergedContainer = statsContainer.querySelector(
      '.layout-merged-tiles',
    );
    if (mergedContainer) {
      mergedContainer.remove();
    }

    if (!this.tiles) {
      this.tiles = TileBuilder.renderInto(statsContainer, this.getTileSpec());
    }

    TileBuilder.updateValues(this.tiles, {
      uptime: data.metrics.uptime,
      load: data.metrics.load,
      memory: data.metrics.memory,
      temp: data.metrics.temp,
      disk: data.metrics.disk,
      storage: data.metrics.storage,
    });

    for (const [key, status] of Object.entries(data.metric_statuses)) {
      const tile = this.tiles.tiles.get(key);
      if (!tile) {
        continue;
      }
      // Regex strips any existing status- class before applying the current status.
      tile.className = tile.className.replace(/status-\w+/g, '');
      tile.classList.add(`status-${status}`);
    }
  }

  renderMerged(results, displayStrategy) {
    const statsContainer = this.widget.container.querySelector(
      '[data-metrics="snapshot-tiles"]',
    );
    if (!statsContainer) return;

    const baseTiles = statsContainer.querySelectorAll('.tyler-tile');
    baseTiles.forEach((tile) => {
      tile.style.display = 'none';
    });

    let mergedContainer = statsContainer.querySelector('.layout-merged-tiles');
    if (!mergedContainer) {
      mergedContainer = document.createElement('div');
      mergedContainer.className = 'layout-merged-tiles';
      statsContainer.appendChild(mergedContainer);
    }
    mergedContainer.innerHTML = '';

    if (displayStrategy === 'columnate') {
      this.renderColumnated(mergedContainer, results);
    } else {
      this.renderSources(mergedContainer, results);
    }
  }

  renderColumnated(container, results) {
    const columns = document.createElement('div');
    columns.className = 'layout-columns metrics-tile-columns';

    for (const result of results) {
      const column = document.createElement('div');
      column.className = 'layout-column';

      const header = document.createElement('div');
      header.className = 'feature-header';
      header.textContent = result.source;
      column.appendChild(header);

      if (result.data) {
        const tiles = this.createTilesForSource(result.data);
        column.appendChild(tiles);
      } else {
        const error = document.createElement('p');
        error.className = 'muted';
        error.textContent = result.error || 'Unable to load';
        column.appendChild(error);
      }

      columns.appendChild(column);
    }

    container.appendChild(columns);
  }

  renderSources(container, results) {
    for (const result of results) {
      const header = document.createElement('div');
      header.className = 'feature-header';
      header.textContent = result.source;
      container.appendChild(header);

      if (result.data) {
        const tiles = this.createTilesForSource(result.data);
        container.appendChild(tiles);
      } else {
        const error = document.createElement('p');
        error.className = 'muted';
        error.textContent = result.error || 'Unable to load';
        container.appendChild(error);
      }
    }
  }

  createTilesForSource(data) {
    const TileBuilder =
      window.monitorTiles?.TileBuilder || window.monitorShared?.TileBuilder;
    if (!TileBuilder) {
      throw new Error('Tile builder not loaded');
    }
    const metrics = data.metrics || {};
    const statuses = data.metric_statuses || {};

    const resolveTileClass = (key) => {
      const status = statuses[key] || 'ok';
      return `stat status-card status-${status}`;
    };

    return TileBuilder.build({
      containerClass: 'stats',
      rows: [
        {
          className: 'stats-row primary',
          tiles: [
            {
              label: 'Uptime',
              value: metrics.uptime || '–',
              options: { tileClass: resolveTileClass('uptime') },
            },
            {
              label: 'Load Average',
              value: metrics.load || '–',
              options: { tileClass: resolveTileClass('load') },
            },
            {
              label: 'Memory Usage',
              value: metrics.memory || '–',
              options: { tileClass: resolveTileClass('memory') },
            },
            {
              label: 'Temperature',
              value: metrics.temp || '–',
              options: { tileClass: resolveTileClass('temp') },
            },
          ],
        },
        {
          className: 'stats-row dates',
          tiles: [
            {
              label: 'Disk Usage',
              value: metrics.disk || '–',
              options: { tileClass: resolveTileClass('disk') },
            },
            {
              label: 'NFS Storage',
              value: metrics.storage || '–',
              options: { tileClass: resolveTileClass('storage') },
            },
          ],
        },
      ],
    }).container;
  }

  getTileSpec() {
    return {
      containerClass: 'stats',
      rows: [
        {
          className: 'stats-row primary',
          tiles: [
            {
              key: 'uptime',
              label: 'Uptime',
              value: '–',
              options: { tileClass: 'stat status-card' },
            },
            {
              key: 'load',
              label: 'Load Average',
              value: '–',
              options: { tileClass: 'stat status-card' },
            },
            {
              key: 'memory',
              label: 'Memory Usage',
              value: '–',
              options: { tileClass: 'stat status-card' },
            },
            {
              key: 'temp',
              label: 'Temperature',
              value: '–',
              options: { tileClass: 'stat status-card' },
            },
          ],
        },
        {
          className: 'stats-row dates',
          tiles: [
            {
              key: 'disk',
              label: 'Disk Usage',
              value: '–',
              options: { tileClass: 'stat status-card' },
            },
            {
              key: 'storage',
              label: 'NFS Storage',
              value: '–',
              options: { tileClass: 'stat status-card' },
            },
          ],
        },
      ],
    };
  }
}

window.MetricsSnapshot = MetricsSnapshot;
