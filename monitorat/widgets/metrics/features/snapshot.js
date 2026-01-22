class MetricsSnapshot {
  constructor(widget) {
    this.widget = widget;
    this.tiles = null;
    this.warnedMissingUnits = new Set();
  }

  render(data) {
    if (!data?.values || !data?.statuses) return;

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
      this.tiles = TileBuilder.renderInto(
        statsContainer,
        this.buildTileSpec(data),
      );
    }

    TileBuilder.updateValues(this.tiles, this.formatTileValues(data.values));

    for (const [key, status] of Object.entries(data.statuses)) {
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
    const values = data?.values || {};
    const statuses = data?.statuses || {};
    const tiles = this.buildTiles(values, statuses);

    return TileBuilder.build({
      containerClass: 'stats',
      rows: [
        {
          tiles,
        },
      ],
    }).container;
  }

  buildTileSpec(data) {
    return {
      containerClass: 'stats',
      rows: [
        {
          tiles: this.buildTiles(data.values || {}, data.statuses || {}),
        },
      ],
    };
  }

  buildTiles(values, statuses) {
    const schemaQuantities = this.widget.schema?.quantities || [];
    const configuredKeys = this.widget.config?.snapshots?.quantities;
    const keys =
      Array.isArray(configuredKeys) && configuredKeys.length
        ? configuredKeys
        : schemaQuantities.map((quantity) => quantity.key);

    return keys.map((key) => {
      const quantity = schemaQuantities.find((item) => item.key === key);
      const label = quantity?.title || quantity?.label || key;
      const unitSpec = this.resolveUnitSpec(quantity?.unit);
      const value = values[key]?.value ?? null;
      const formatted = this.formatValue(value, unitSpec);
      const statusKey = quantity?.status_key || key;
      const status = statuses[statusKey];
      const tileClass = status
        ? `stat status-card status-${status}`
        : 'stat status-card';

      return {
        key,
        label,
        value: formatted,
        options: { tileClass },
      };
    });
  }

  resolveUnitSpec(unitName) {
    if (!unitName) {
      return {};
    }
    const unitSpec = this.widget.schema?.units?.[unitName] || {};
    if (!this.widget.schema?.units?.[unitName]) {
      if (!this.warnedMissingUnits.has(unitName)) {
        this.warnedMissingUnits.add(unitName);
        console.warn(`Missing unit spec for ${unitName}`);
      }
    }
    return unitSpec;
  }

  formatTileValues(values) {
    const schemaQuantities = this.widget.schema?.quantities || [];
    const result = {};
    for (const [key, payload] of Object.entries(values || {})) {
      const quantity = schemaQuantities.find((item) => item.key === key);
      const unitSpec = this.resolveUnitSpec(quantity?.unit);
      result[key] = this.formatValue(payload?.value ?? null, unitSpec);
    }
    return result;
  }

  formatValue(value, unitSpec) {
    const DataFormatter = window.monitorShared?.DataFormatter;
    if (!DataFormatter || !unitSpec) {
      return value ?? '–';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (unitSpec.format === 'text') {
      return value ?? '–';
    }
    const schema = {
      unit: unitSpec.suffix ?? '',
      format: unitSpec.format,
      decimals: unitSpec.decimals,
    };
    return DataFormatter.formatBySchema(value, schema);
  }
}

window.MetricsSnapshot = MetricsSnapshot;
