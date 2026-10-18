(function (root) {
  'use strict';

  const PADDING = 40;
  const OFFICE_WIDTH = 320;
  const OFFICE_GAP = 40;
  const WORLD_WIDTH = PADDING * 2 + OFFICE_WIDTH * 2 + OFFICE_GAP;
  const MIN_OFFICE_HEIGHT = 224;

  /**
   * Place every manager and worker in one shared world.
   *
   * The first worker belongs to the manager's desk. Remaining workers get one
   * desk each, growing the room downward in rows of three. Desk bounds include
   * space for the character, furniture, name and three-line task preview. All
   * coordinates are absolute world pixels; input objects are never modified.
   */
  function layoutOffices(farms) {
    const offices = [];
    let nextRowY = PADDING;

    for (let index = 0; index < farms.length; index += 2) {
      let rowHeight = 0;
      for (let column = 0; column < 2 && index + column < farms.length; column++) {
        const farm = farms[index + column];
        const workers = farm.workers || [];
        const x = PADDING + column * (OFFICE_WIDTH + OFFICE_GAP);
        const y = nextRowY;
        const agentRows = Math.ceil(Math.max(0, workers.length - 1) / 3);
        const height = Math.max(MIN_OFFICE_HEIGHT, 196 + agentRows * 128);
        const desks = workers.map((worker, workerIndex) => {
          const manager = workerIndex === 0;
          const agentIndex = workerIndex - 1;
          return {
            workerId: worker.id,
            index: workerIndex,
            x: x + (manager ? 120 : 24 + (agentIndex % 3) * 96),
            y: y + (manager ? 52 : 188 + Math.floor(agentIndex / 3) * 128),
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

    return {
      width: WORLD_WIDTH,
      height: offices.length ? nextRowY : PADDING * 2 + MIN_OFFICE_HEIGHT,
      offices
    };
  }

  root.layoutOffices = layoutOffices;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {layoutOffices};
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
