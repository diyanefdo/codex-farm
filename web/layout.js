(function (root) {
  'use strict';

  const PADDING = 40;
  const OFFICE_WIDTH = 320;
  const OFFICE_GAP = 40;
  const MIN_OFFICE_HEIGHT = 180;
  const COMMON_AREA_HEIGHT = 132;
  const COMMON_AREA_GAP = 16;
  const MIN_COMMON_AREA_WIDTH = 180;
  const COMMON_AREAS = [
    {id: 'break', name: 'Break area', type: 'break'},
    {id: 'lunch', name: 'Lunch area', type: 'lunch'},
    {id: 'coffee', name: 'Coffee machine', type: 'coffee'}
  ];

  function worldWidth(columns) {
    return PADDING * 2 + OFFICE_WIDTH * columns + OFFICE_GAP * (columns - 1);
  }

  function worldHeight(heights, columns) {
    if (!heights.length) return PADDING * 2 + MIN_OFFICE_HEIGHT;
    let height = PADDING;
    for (let index = 0; index < heights.length; index += columns) {
      let rowHeight = 0;
      for (let column = 0; column < columns && index + column < heights.length; column++) {
        rowHeight = Math.max(rowHeight, heights[index + column]);
      }
      height += rowHeight + OFFICE_GAP;
    }
    return height;
  }

  function commonAreas(width, top) {
    const availableWidth = width - PADDING * 2;
    const columns = Math.min(COMMON_AREAS.length, Math.max(1,
      Math.floor((availableWidth + COMMON_AREA_GAP) /
        (MIN_COMMON_AREA_WIDTH + COMMON_AREA_GAP))));
    const areaWidth = (availableWidth - COMMON_AREA_GAP * (columns - 1)) / columns;
    return COMMON_AREAS.map((area, index) => ({
      ...area,
      x: PADDING + index % columns * (areaWidth + COMMON_AREA_GAP),
      y: top + Math.floor(index / columns) * (COMMON_AREA_HEIGHT + COMMON_AREA_GAP),
      width: areaWidth,
      height: COMMON_AREA_HEIGHT
    }));
  }

  function totalWorldHeight(heights, columns, includeCommons) {
    const height = worldHeight(heights, columns);
    if (!includeCommons) return height;
    const areas = commonAreas(worldWidth(columns), heights.length ? height : PADDING);
    const lastArea = areas[areas.length - 1];
    return lastArea.y + lastArea.height + PADDING;
  }

  function fitColumns(heights, options) {
    const {viewportWidth, viewportHeight} = options;
    if (!heights.length || !Number.isFinite(viewportWidth) || viewportWidth <= 0 ||
        !Number.isFinite(viewportHeight) || viewportHeight <= 0) return 2;
    let bestColumns = 1;
    let bestScale = 0;
    const maxColumns = options.includeCommons ? Math.max(2, heights.length) : heights.length;
    for (let columns = 1; columns <= maxColumns; columns++) {
      const scale = Math.min(viewportWidth / worldWidth(columns),
        viewportHeight / totalWorldHeight(heights, columns, options.includeCommons));
      if (scale > bestScale + 1e-10) {
        bestColumns = columns;
        bestScale = scale;
      }
    }
    return bestColumns;
  }

  /**
   * Place every manager and worker in one shared world.
   *
   * The manager is centered in the first row, with up to two workers beside it.
   * Further workers grow the room downward in rows of three. Desk bounds include
   * space for the character, furniture, name and three-line task preview. All
   * coordinates are absolute world pixels; input objects are never modified.
   * Without viewport dimensions offices use two columns. With usable viewport
   * dimensions, choose the columns giving the largest scale with every office
   * visible. Ties retain the smaller column count. With includeCommons, place
   * shared break, lunch and coffee areas below the offices, including them in
   * the viewport fit and world bounds.
   */
  function layoutOffices(farms, options = {}) {
    const offices = [];
    const heights = farms.map(farm => 44 + Math.ceil(Math.max(1,
      (farm.workers || []).length) / 3) * 116 + 20);
    const columns = fitColumns(heights, options);
    let nextRowY = PADDING;

    for (let index = 0; index < farms.length; index += columns) {
      let rowHeight = 0;
      for (let column = 0; column < columns && index + column < farms.length; column++) {
        const farm = farms[index + column];
        const workers = farm.workers || [];
        const x = PADDING + column * (OFFICE_WIDTH + OFFICE_GAP);
        const y = nextRowY;
        const height = heights[index + column];
        const desks = workers.map((worker, workerIndex) => {
          const manager = workerIndex === 0;
          const slot = workerIndex < 3 ? [1, 0, 2][workerIndex] : workerIndex % 3;
          return {
            workerId: worker.id,
            index: workerIndex,
            x: x + 24 + slot * 96,
            y: y + 44 + Math.floor(workerIndex / 3) * 116,
            width: 80,
            height: 104,
            manager
          };
        });
        offices.push({farmId: farm.id, x, y, width: OFFICE_WIDTH, height, desks});
        rowHeight = Math.max(rowHeight, height);
      }
      nextRowY += rowHeight + OFFICE_GAP;
    }

    const layout = {
      width: worldWidth(columns),
      height: offices.length ? nextRowY : PADDING * 2 + MIN_OFFICE_HEIGHT,
      offices
    };
    if (options.includeCommons) {
      layout.commonAreas = commonAreas(layout.width, offices.length ? nextRowY : PADDING);
      layout.height = totalWorldHeight(heights, columns, true);
    }
    return layout;
  }

  root.layoutOffices = layoutOffices;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {layoutOffices};
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
