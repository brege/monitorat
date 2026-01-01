/* global Element */
class TileRenderer {
  static createTile (label, value, options = {}) {
    const { tileClass = 'stat', labelClass = 'label', valueClass = 'value' } = options

    const tile = document.createElement('div')
    tile.className = tileClass

    const labelElement = document.createElement('span')
    labelElement.className = labelClass
    labelElement.textContent = label

    const valueElement = document.createElement('span')
    valueElement.className = valueClass
    valueElement.textContent = value ?? '–'

    tile.appendChild(labelElement)
    tile.appendChild(valueElement)
    return tile
  }

  static createRow (tiles, rowClass = 'stats-row') {
    const row = document.createElement('div')
    row.className = rowClass

    for (const tile of tiles) {
      if (tile instanceof Element) {
        row.appendChild(tile)
      } else if (tile && typeof tile === 'object') {
        row.appendChild(this.createTile(tile.label, tile.value, tile.options))
      }
    }

    return row
  }

  static createContainer (rows, containerClass = 'stats') {
    const container = document.createElement('div')
    container.className = containerClass

    for (const row of rows) {
      if (row instanceof Element) {
        container.appendChild(row)
      } else if (Array.isArray(row)) {
        container.appendChild(this.createRow(row.tiles || row, row.className))
      } else if (row && typeof row === 'object') {
        container.appendChild(this.createRow(row.tiles, row.className))
      }
    }

    return container
  }

  static createTilesFromSpec (spec) {
    const container = document.createElement('div')
    container.className = spec.containerClass || 'stats'

    for (const rowSpec of (spec.rows || [])) {
      const row = document.createElement('div')
      row.className = rowSpec.className || 'stats-row'

      for (const tileSpec of (rowSpec.tiles || [])) {
        row.appendChild(this.createTile(tileSpec.label, tileSpec.value, tileSpec.options))
      }

      container.appendChild(row)
    }

    return container
  }

  static updateTileValue (container, selector, value) {
    const element = container.querySelector(selector)
    if (element) {
      element.textContent = value ?? '–'
    }
  }

  static updateTileValues (container, attributeName, values) {
    for (const [key, value] of Object.entries(values)) {
      const element = container.querySelector(`[${attributeName}="${key}"]`)
      if (element) {
        element.textContent = value ?? '–'
      }
    }
  }
}

window.monitorShared = window.monitorShared || {}
window.monitorShared.TileRenderer = TileRenderer
