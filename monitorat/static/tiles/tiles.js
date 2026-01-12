/* global Element */
class TileBuilder {
  static addClasses (element, classNames) {
    if (!classNames) {
      return
    }
    for (const className of classNames.split(' ')) {
      if (className) {
        element.classList.add(className)
      }
    }
  }

  static createTileElements (label, value, options = {}) {
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

    return { tile, labelElement, valueElement }
  }

  static renderInto (container, spec = {}) {
    if (!container) {
      throw new Error('Tile container is required')
    }

    container.innerHTML = ''
    this.addClasses(container, spec.containerClass || 'stats')

    const tiles = new Map()
    const values = new Map()

    for (const rowSpec of (spec.rows || [])) {
      const row = document.createElement('div')
      this.addClasses(row, rowSpec.className || 'stats-row')

      for (const tileSpec of (rowSpec.tiles || [])) {
        if (tileSpec instanceof Element) {
          row.appendChild(tileSpec)
          continue
        }
        if (!tileSpec || typeof tileSpec !== 'object') {
          continue
        }

        const { tile, valueElement } = this.createTileElements(tileSpec.label, tileSpec.value, tileSpec.options)
        if (tileSpec.key) {
          tile.dataset.tileKey = tileSpec.key
          tiles.set(tileSpec.key, tile)
          values.set(tileSpec.key, valueElement)
        }
        row.appendChild(tile)
      }

      container.appendChild(row)
    }

    return { container, tiles, values }
  }

  static build (spec = {}) {
    const container = document.createElement('div')
    const handle = this.renderInto(container, spec)
    return handle
  }

  static updateValues (handle, values = {}) {
    if (!handle || !handle.values) {
      return
    }
    for (const [key, value] of Object.entries(values)) {
      const element = handle.values.get(key)
      if (element) {
        element.textContent = value ?? '–'
      }
    }
  }
}

window.monitorTiles = window.monitorTiles || {}
window.monitorTiles.TileBuilder = TileBuilder
window.monitorShared = window.monitorShared || {}
window.monitorShared.TileBuilder = TileBuilder
