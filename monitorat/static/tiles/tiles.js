/* global Element */
class TylerLayout {
  constructor (containerElement, options = {}) {
    this.container = containerElement
    this.containerWidth = this.container.offsetWidth
    this.tiles = []
    this.rows = []
    this.rowElements = []
    this.gap = options.gap || 0
    this.rowHeight = options.rowHeight || 'auto'
    this._isNormalized = false
    this.maxGlobalTiles = options.maxGlobalTiles ?? 12

    this.resizeObserver = new ResizeObserver(() => {
      this.containerWidth = this.container.offsetWidth
      this.layout()
      if (this._isNormalized) {
        this.normalizeRows()
      }
    })
    this.resizeObserver.observe(this.container)
  }

  registerTiles (elements) {
    this.tiles = elements.map((element) => ({
      element,
      minWidth: this.measureMinWidth(element),
      index: this.tiles.length
    }))
    this.layout()
  }

  measureMinWidth (element) {
    const clone = element.cloneNode(true)
    clone.style.position = 'absolute'
    clone.style.visibility = 'hidden'
    clone.style.width = 'auto'
    clone.style.whiteSpace = 'nowrap'
    clone.style.wordBreak = 'normal'
    clone.style.overflowWrap = 'normal'
    document.body.appendChild(clone)
    const width = clone.scrollWidth
    document.body.removeChild(clone)

    const maxWidthValue = window.getComputedStyle(element).maxWidth
    const maxWidth = Number.parseFloat(maxWidthValue)
    if (Number.isFinite(maxWidth) && maxWidth > 0) {
      return Math.min(width, maxWidth)
    }

    return width
  }

  layout () {
    const widths = this.tiles.map((tile) => tile.minWidth)
    const LayoutMath = window.monitorTiles?.LayoutMath
    if (!LayoutMath) {
      throw new Error('Tile layout math is not loaded')
    }

    let rows = null
    if (widths.length > 0 && widths.length <= this.maxGlobalTiles) {
      rows = LayoutMath.findBestPartition(widths, this.containerWidth, this.gap)
    }
    if (!rows) {
      rows = LayoutMath.packGreedy(widths, this.containerWidth, this.gap)
    }

    rows = LayoutMath.compactRows(rows, widths, this.containerWidth, this.gap)
    this.rows = rows.map((row) => row.map((index) => this.tiles[index]))
    this.renderRows()
  }

  renderRows () {
    this.applyRowStructure()
    this.tiles.forEach((tile) => {
      tile.element.style.flex = ''
      tile.element.style.width = ''
      tile.element.style.minWidth = ''
    })

    this.rows.forEach((row, rowIndex) => {
      const totalMinWidth = row.reduce((sum, tile) => sum + tile.minWidth, 0)
      const totalGap = Math.max(0, (row.length - 1) * this.gap)
      const availableWidth = this.containerWidth - totalGap
      if (availableWidth <= 0) {
        return
      }

      row.forEach((tile) => {
        const proportion = tile.minWidth / totalMinWidth
        const scaledWidth = availableWidth * proportion

        tile.element.style.width = `${scaledWidth}px`
        tile.element.style.flex = `0 0 ${scaledWidth}px`
        tile.element.style.minWidth = `${tile.minWidth}px`
        tile.element.dataset.row = rowIndex
      })
    })
  }

  normalizeRows () {
    this._isNormalized = true
    this.rows.forEach((row) => {
      const totalGaps = Math.max(0, (row.length - 1)) * this.gap
      const availableWidth = this.containerWidth - totalGaps
      const equalWidth = availableWidth / row.length

      row.forEach((tile) => {
        tile.element.style.width = `${equalWidth}px`
        tile.element.style.flex = `0 0 ${equalWidth}px`
      })
    })
  }

  disableNormalization () {
    this._isNormalized = false
    this.renderRows()
  }

  destroy () {
    this.resizeObserver.disconnect()
  }

  applyRowStructure () {
    // Rebuild row wrappers so flex does not reflow tiles into unintended rows.
    this.container.innerHTML = ''
    this.rowElements = []

    this.rows.forEach((row) => {
      const rowElement = document.createElement('div')
      rowElement.className = 'tyler-row'
      row.forEach((tile) => {
        rowElement.appendChild(tile.element)
      })
      this.container.appendChild(rowElement)
      this.rowElements.push(rowElement)
    })
  }
}

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
    this.addClasses(tile, tileClass)
    tile.classList.add('tyler-tile')

    const labelElement = document.createElement('span')
    this.addClasses(labelElement, labelClass)
    labelElement.classList.add('tyler-tile-label')
    labelElement.textContent = label

    const valueElement = document.createElement('span')
    this.addClasses(valueElement, valueClass)
    valueElement.classList.add('tyler-tile-value')
    valueElement.textContent = value ?? '–'

    tile.appendChild(labelElement)
    tile.appendChild(valueElement)

    return { tile, labelElement, valueElement }
  }

  static getGapPixels (container, fallback = 0) {
    const computed = window.getComputedStyle(container)
    const gapValue = computed.columnGap || computed.gap
    const gap = Number.parseFloat(gapValue)
    return Number.isFinite(gap) ? gap : fallback
  }

  static renderInto (container, spec = {}) {
    if (!container) {
      throw new Error('Tile container is required')
    }

    container.innerHTML = ''
    container.classList.add('tyler-container')
    this.addClasses(container, spec.containerClass || 'stats')

    const tiles = new Map()
    const values = new Map()
    const tileElements = []

    const rows = spec.rows || []
    for (const rowSpec of rows) {
      const tilesSpec = Array.isArray(rowSpec) ? rowSpec : (rowSpec.tiles || [])
      for (const tileSpec of tilesSpec) {
        if (tileSpec instanceof Element) {
          container.appendChild(tileSpec)
          tileElements.push(tileSpec)
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
        container.appendChild(tile)
        tileElements.push(tile)
      }
    }

    const gap = Number.isFinite(spec.gap) ? spec.gap : this.getGapPixels(container, 0)
    const layout = new TylerLayout(container, { gap })
    layout.registerTiles(tileElements)
    if (spec.normalize !== false) {
      layout.normalizeRows()
    }

    return { container, tiles, values, tileElements, layout }
  }

  static build (spec = {}) {
    const container = document.createElement('div')
    return this.renderInto(container, spec)
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

    if (handle.layout && handle.tileElements) {
      handle.layout.registerTiles(handle.tileElements)
    }
  }
}

window.monitorTiles = window.monitorTiles || {}
window.monitorTiles.TylerLayout = TylerLayout
window.monitorTiles.TileBuilder = TileBuilder
window.monitorShared = window.monitorShared || {}
window.monitorShared.TylerLayout = TylerLayout
window.monitorShared.TileBuilder = TileBuilder
