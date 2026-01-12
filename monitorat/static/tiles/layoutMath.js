const TileLayoutMath = (() => {
  const scoreRows = (rows, widths, containerWidth, gap) => {
    let totalSlack = 0;
    let singletonCount = 0;

    for (const row of rows) {
      const tilesCount = row.length;
      const availableWidth =
        containerWidth - Math.max(0, (tilesCount - 1) * gap);
      if (availableWidth <= 0) {
        return Number.POSITIVE_INFINITY;
      }

      const tileWidth = availableWidth / tilesCount;
      for (const index of row) {
        if (widths[index] > tileWidth) {
          return Number.POSITIVE_INFINITY;
        }
        totalSlack += tileWidth - widths[index];
      }

      if (tilesCount === 1 && rows.length > 1) {
        singletonCount += 1;
      }
    }

    const singletonPenalty = singletonCount * containerWidth ** 2;
    return totalSlack + singletonPenalty;
  };

  const getRowMinWidth = (row, widths, gap) => {
    const tilesWidth = row.reduce((sum, index) => sum + widths[index], 0);
    const gapWidth = Math.max(0, (row.length - 1) * gap);
    return tilesWidth + gapWidth;
  };

  const compactRows = (rows, widths, containerWidth, gap) => {
    if (rows.length <= 1) return rows;

    const compacted = [];
    let i = 0;

    while (i < rows.length) {
      let currentMerged = [...rows[i]];
      let j = i + 1;

      while (j < rows.length) {
        const nextRow = rows[j];
        const mergedWidth =
          getRowMinWidth(currentMerged, widths, gap) +
          getRowMinWidth(nextRow, widths, gap) +
          gap;
        if (mergedWidth <= containerWidth) {
          currentMerged = [...currentMerged, ...nextRow];
          j++;
        } else {
          break;
        }
      }

      compacted.push(currentMerged);
      i = j;
    }

    return compacted;
  };

  const packGreedy = (widths, containerWidth, gap) => {
    const rows = [];
    let currentRow = [];
    let currentWidth = 0;

    widths.forEach((width, index) => {
      const nextWidth =
        currentRow.length === 0 ? width : currentWidth + gap + width;

      if (currentRow.length === 0 || nextWidth <= containerWidth) {
        currentRow.push(index);
        currentWidth = nextWidth;
      } else {
        rows.push(currentRow);
        currentRow = [index];
        currentWidth = width;
      }
    });

    if (currentRow.length) {
      rows.push(currentRow);
    }

    return rows;
  };

  const findBestPartition = (widths, containerWidth, gap) => {
    let bestRows = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const walk = (startIndex, currentRows) => {
      // Depth-first recursion explores ordered row partitions.
      if (startIndex >= widths.length) {
        const score = scoreRows(currentRows, widths, containerWidth, gap);
        if (score < bestScore) {
          bestScore = score;
          bestRows = currentRows.map((row) => row.slice());
        }
        return;
      }

      let rowMinWidth = 0;
      for (let endIndex = startIndex; endIndex < widths.length; endIndex++) {
        rowMinWidth += widths[endIndex];
        if (endIndex > startIndex) {
          rowMinWidth += gap;
        }
        if (rowMinWidth > containerWidth) {
          break;
        }

        const row = [];
        for (let index = startIndex; index <= endIndex; index++) {
          row.push(index);
        }
        currentRows.push(row);
        walk(endIndex + 1, currentRows);
        currentRows.pop();
      }
    };

    walk(0, []);

    return bestRows;
  };

  return {
    compactRows,
    findBestPartition,
    getRowMinWidth,
    packGreedy,
    scoreRows,
  };
})();

window.monitorTiles = window.monitorTiles || {};
window.monitorTiles.LayoutMath = TileLayoutMath;
