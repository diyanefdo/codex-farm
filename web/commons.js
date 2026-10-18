(function (root) {
  'use strict';

  const seated = Object.freeze({x: 0, y: 0, armLeft: 0, armRight: 0,
    step: 0, facing: 1, activity: 'sitting'});

  /**
   * Draw decorative office neighbours, never Codex workers. The area geometry
   * belongs to the shared layout; its first 32 pixels are reserved for a DOM
   * heading. Helpers are injected so this also works on the main scene canvas.
   */
  function drawCommonAreas(ctx, areas, {rect, person, tick = 0, motion = true}) {
    for (const area of areas) {
      if (!['break', 'lunch', 'coffee'].includes(area.type)) continue;
      const {x, y, width, height} = area;
      // Furniture sits directly in the shared meadow. Layout bounds reserve
      // room for the activity, without painting a surrounding room or panel.
      const ox = x + (width - 180) / 2;
      const oy = y + 32 + (height - 132) / 2;
      const r = (px, py, w, h, color) => rect(ctx, ox + px, oy + py, w, h, color);
      const guest = (px, py, color) => person(ctx, ox + px, oy + py, color, 0, false, seated);

      function plant(px, py) {
        r(px + 3, py + 12, 12, 11, '#c47e65');
        r(px + 2, py + 12, 14, 3, '#e2a17c');
        r(px + 4, py + 4, 10, 10, '#4e9d6b');
        r(px, py + 6, 8, 5, '#75c17d');
        r(px + 10, py, 6, 10, '#92d392');
      }
      function cup(px, py, color = '#fff3cf') {
        r(px, py, 6, 6, color);
        r(px + 6, py + 1, 2, 4, color);
        r(px + 1, py, 4, 1, '#895e41');
      }
      function chair(px, py, color) {
        r(px + 2, py + 3, 24, 30, '#735e59');
        r(px, py, 26, 25, color);
        r(px + 3, py + 3, 20, 16, '#ffffff35');
      }

      if (area.type === 'break') {
        // Open lounge, with a soft rug and a freestanding little library.
        r(37, 47, 105, 44, '#b8b2dc');r(25, 53, 129, 32, '#b8b2dc');r(19, 61, 141, 16, '#b8b2dc');
        r(39, 51, 101, 36, '#dbd3ec');r(29, 57, 121, 24, '#dbd3ec');
        r(64, 5, 57, 19, '#907151');
        for (let book = 0; book < 8; book++) {
          r(68 + book * 6, 8 + book % 3, 4, 12 - book % 3,
            ['#ee9c80', '#74b9ac', '#d9b865', '#9b90cd'][book % 4]);
        }
        plant(151, 9);
        r(9, 25, 62, 30, '#9b83bf');
        r(14, 29, 52, 22, '#c4aadf');
        r(11, 53, 5, 8, '#7d6557'); r(63, 53, 5, 8, '#7d6557');
        guest(35, 39, '#e89073');
        // Seat cushions cover standing legs, making the injected sprite sit.
        r(13, 47, 54, 9, '#b294d1'); r(13, 47, 54, 2, '#d9c3ed');
        r(8, 35, 8, 20, '#a48ac6'); r(65, 35, 8, 20, '#a48ac6');
        chair(125, 25, '#a38acb');
        guest(135, 40, '#67a89e');
        r(125, 48, 26, 9, '#b99cdb'); r(125, 48, 26, 2, '#dfcaed');
        r(121, 37, 7, 20, '#a68dca'); r(149, 37, 7, 20, '#a68dca');
        r(80, 58, 4, 19, '#88694d'); r(108, 58, 4, 19, '#88694d');
        r(76, 53, 40, 15, '#b18458'); r(76, 51, 40, 12, '#d5a876');
        cup(82, 54); r(99, 55, 10, 6, '#96b69c'); r(101, 56, 6, 1, '#eff1c9');
        r(16, 78, 27, 10, '#e1b86d'); r(19, 76, 21, 3, '#f5d895');
      } else if (area.type === 'lunch') {
        // Three neighbours share lunch; the seats and trays are decorative.
        r(8, 7, 164, 14, '#ba8c5a'); r(8, 5, 164, 8, '#e6bc7e');
        r(15, 6, 19, 5, '#9bc6b8'); r(16, 7, 17, 1, '#e8f3dc');
        r(144, 3, 18, 7, '#d9e9d9'); r(147, 1, 12, 3, '#ebf5e5');
        for (const [px, color] of [[48, '#78bca3'], [83, '#cb8ab6'], [118, '#76acd1']]) {
          chair(px - 9, 22, color);
          guest(px, 38, color);
        }
        r(35, 72, 6, 17, '#99734f'); r(140, 72, 6, 17, '#99734f');
        r(30, 51, 123, 28, '#a97549'); r(30, 48, 123, 25, '#d8a365');
        r(34, 51, 115, 1, '#ebbd7e'); r(34, 70, 115, 1, '#bb8755');
        for (const px of [46, 81, 116]) {
          r(px - 5, 53, 25, 14, '#92bfb3');
          r(px - 2, 55, 16, 10, '#fff3d7'); r(px, 54, 12, 12, '#fff3d7');
          r(px + 1, 57, 8, 5, '#86b95a'); r(px + 5, 57, 5, 4, '#e79754');
          r(px + 15, 56, 2, 8, '#f4e7c9');
        }
        r(62, 80, 22, 12, '#78bca3'); r(100, 80, 22, 12, '#d5ac68');
        plant(5, 68); plant(157, 68);
      } else {
        // Espresso station: dark machine, buttons, spouts, mugs and a sink.
        r(9, 42, 77, 24, '#aa8056'); r(13, 47, 31, 17, '#c79b69');
        r(48, 47, 34, 17, '#c79b69'); r(39, 54, 2, 3, '#f1d19b');
        r(76, 54, 2, 3, '#f1d19b'); r(7, 39, 81, 8, '#edc992');
        r(15, 12, 42, 29, '#434d55'); r(18, 15, 36, 11, '#263944');
        r(20, 17, 14, 6, '#8bc5b4'); r(22, 19, 9, 1, '#e2efbb');
        r(38, 18, 4, 4, '#ed8c74'); r(46, 18, 4, 4, '#efc867');
        r(22, 26, 4, 5, '#acb8b3'); r(39, 26, 4, 5, '#acb8b3');
        r(18, 38, 36, 3, '#202e36');
        cup(21, 32, '#fff4d5'); cup(38, 32, '#eea38c');
        r(63, 41, 18, 4, '#6b9e9e'); r(65, 42, 14, 2, '#b8ddd1');
        r(75, 33, 3, 9, '#9aaea6'); r(69, 32, 9, 3, '#c9d7ca');
        r(145, 6, 25, 31, '#f1e7c9'); r(147, 8, 21, 12, '#d6e1d5');
        r(147, 22, 21, 13, '#e4ebdc'); r(149, 15, 2, 4, '#7b9992');
        r(149, 24, 2, 5, '#7b9992');
        r(107, 8, 23, 20, '#b88a58'); r(110, 11, 17, 14, '#ffe5a6');
        r(117, 13, 3, 6, '#b57950'); r(114, 19, 9, 3, '#b57950');
        chair(101, 40, '#e7ad65'); chair(142, 40, '#81b7bb');
        guest(111, 55, '#b183c9'); guest(152, 55, '#e6a163');
        r(104, 80, 4, 11, '#886b50'); r(156, 80, 4, 11, '#886b50');
        r(99, 68, 64, 17, '#ab7c51'); r(99, 65, 64, 14, '#dbb67a');
        cup(112, 69, '#f7e9d2'); cup(147, 69, '#a5d5cb');
        r(127, 70, 13, 7, '#fff2d1'); r(130, 72, 7, 3, '#d89554');
        r(11, 76, 66, 14, '#72b7ad'); r(15, 79, 58, 2, '#a6d6c2');
        plant(79, 70);
        // Reduced motion freezes the steam as well as the seated neighbours.
        const drift = motion && Number.isFinite(tick) ? Math.floor(tick / 350) % 3 : 0;
        r(27 + drift, 5, 2, 4, '#ffffffb0');
        r(30 - drift, 1, 2, 3, '#ffffff85');
        r(43 - drift, 5, 2, 4, '#ffffffb0');
      }
    }
  }

  root.drawCommonAreas = drawCommonAreas;
  if (typeof module !== 'undefined' && module.exports) module.exports = {drawCommonAreas};
})(typeof globalThis !== 'undefined' ? globalThis : this);
