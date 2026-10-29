/**
 * QQ Bubble Dragon Shooter 3D (QQ泡泡龙 3D)
 * Deterministic 120Hz Substepped Offset Hex-Grid Physics, Cluster BFS Pop,
 * Ceiling-Detachment Avalanche Drop, Special Bubbles & 8-Stage + Endless Simulation Engine.
 */

export const FIXED_DT = 1 / 60;
export const SUBSTEPS = 2; // 120Hz substepped projectile flight & wall ricochet
export const SUB_DT = FIXED_DT / SUBSTEPS;

export const BUBBLE_RADIUS = 0.5;
export const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2; // 1.0 world unit
export const EVEN_COLS = 8;
export const ODD_COLS = 7;
export const MAX_GRID_ROWS = 16;
export const ROW_DY = BUBBLE_RADIUS * Math.sqrt(3); // ~0.8660254037844386

// Chamber world bounds:
// Even-parity row (8 cols) centers sit at x = -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5
// Odd-parity row (7 cols) centers sit at x = -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0
export const LEFT_WALL_X = -4.0;
export const RIGHT_WALL_X = 4.0;
export const BASE_CEILING_Y = 5.4;
export const DANGER_LINE_Y = -2.2;
export const LAUNCHER_X = 0.0;
export const LAUNCHER_Y = -3.28;
export const CAULDRON_Y = -4.68;
export const PROJECTILE_SPEED = 21.0;

// Aim clamp: -78 deg to +78 deg (0 rad = straight up +Y)
export const MAX_AIM_DEG = 78;
export const MAX_AIM_RAD = (MAX_AIM_DEG * Math.PI) / 180;

export const BUBBLE_COLORS = Object.freeze([
  'red',
  'yellow',
  'blue',
  'green',
  'purple',
  'orange',
]);

export const SPECIAL_TYPES = Object.freeze([
  'bomb',
  'rainbow',
  'lightning',
]);

export const CAULDRON_SPECS = Object.freeze([
  { index: 0, points: 50, x: -3.1, width: 1.45, label: '50' },
  { index: 1, points: 100, x: -1.55, width: 1.45, label: '100' },
  { index: 2, points: 250, x: 0.0, width: 1.55, label: '250' },
  { index: 3, points: 100, x: 1.55, width: 1.45, label: '100' },
  { index: 4, points: 50, x: 3.1, width: 1.45, label: '50' },
]);

/**
 * 8 Progressive Stages (闯关模式 — Clear All & Star-Critter Egg Rescue stages)
 */
export const STAGE_DEFS = Object.freeze([
  {
    id: 1,
    name: '第一关：彩虹初遇',
    subtitle: '消除顶层同色泡泡，触发大片掉落加分！',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue'],
    shotsPerDrop: 9,
    parShots: 8,
    rows: [
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'red', 'red'],
      ['red', 'yellow', 'yellow', 'blue', 'blue', 'red', 'red'],
      ['blue', 'blue', 'red', 'red', 'yellow', 'yellow', 'blue', 'blue'],
      [null, 'blue', 'red', 'yellow', 'yellow', 'blue', null],
    ],
  },
  {
    id: 2,
    name: '第二关：双翼回旋',
    subtitle: '利用左右水晶墙壁反弹，击穿顶层支点！',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue', 'green'],
    shotsPerDrop: 9,
    parShots: 10,
    rows: [
      ['green', 'green', null, 'red', 'red', null, 'blue', 'blue'],
      ['green', 'yellow', 'red', 'red', 'yellow', 'blue', 'blue'],
      ['yellow', 'yellow', null, 'blue', 'blue', null, 'yellow', 'yellow'],
      [null, 'red', 'red', 'green', 'green', 'red', null],
      [null, null, 'red', 'green', 'green', 'red', null, null],
    ],
  },
  {
    id: 3,
    name: '第三关：萌宠龙蛋营救 I',
    subtitle: '消除或震落守护泡泡，解救中央星星龙蛋！',
    objective: 'egg_rescue',
    colors: ['red', 'yellow', 'blue', 'green'],
    shotsPerDrop: 9,
    parShots: 10,
    rows: [
      [null, 'red', 'red', 'yellow', 'yellow', 'blue', 'blue', null],
      [null, 'red', 'green', 'yellow', 'green', 'blue', null],
      [null, null, 'green', { color: 'yellow', isEgg: true }, 'blue', 'green', null, null],
      [null, null, 'blue', 'blue', 'blue', null, null],
    ],
  },
  {
    id: 4,
    name: '第四关：水晶双拱门',
    subtitle: '击碎拱门顶部同色泡泡，引发瀑布式雪崩掉落！',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue', 'purple'],
    shotsPerDrop: 8,
    parShots: 11,
    rows: [
      ['purple', 'purple', null, null, null, null, 'yellow', 'yellow'],
      ['purple', 'red', null, null, null, 'blue', 'yellow'],
      ['red', 'red', 'blue', null, null, 'blue', 'blue', 'red'],
      ['blue', 'yellow', 'purple', null, 'purple', 'yellow', 'blue'],
      ['blue', null, 'purple', null, null, 'purple', null, 'blue'],
    ],
  },
  {
    id: 5,
    name: '第五关：齿轮蜂巢阵',
    subtitle: '巧用换球与连击必杀球，横扫五彩蜂巢！',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue', 'green', 'purple'],
    shotsPerDrop: 8,
    parShots: 12,
    rows: [
      ['red', 'yellow', 'yellow', 'blue', 'blue', 'green', 'green', 'red'],
      ['red', 'yellow', 'blue', 'purple', 'blue', 'green', 'red'],
      [null, 'purple', 'purple', 'red', 'red', 'purple', 'purple', null],
      [null, 'green', 'blue', 'red', 'blue', 'green', null],
      [null, null, 'green', 'blue', 'blue', 'green', null, null],
    ],
  },
  {
    id: 6,
    name: '第六关：双星龙蛋大营救',
    subtitle: '左右双塔悬挂两颗星星龙蛋，切断顶梁一举营救！',
    objective: 'egg_rescue',
    colors: ['red', 'yellow', 'blue', 'green', 'orange'],
    shotsPerDrop: 8,
    parShots: 12,
    rows: [
      ['orange', 'orange', null, 'blue', 'blue', null, 'green', 'green'],
      ['orange', 'red', null, 'blue', null, 'yellow', 'green'],
      ['red', { color: 'red', isEgg: true }, null, null, null, null, { color: 'yellow', isEgg: true }, 'yellow'],
      ['red', 'yellow', null, null, null, 'red', 'yellow'],
    ],
  },
  {
    id: 7,
    name: '第七关：深海珊瑚旋塔',
    subtitle: '六色珊瑚层层环绕，精准反弹直击核心！',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue', 'green', 'purple', 'orange'],
    shotsPerDrop: 8,
    parShots: 14,
    rows: [
      [null, 'blue', 'blue', 'orange', 'orange', 'purple', 'purple', null],
      [null, 'blue', 'green', 'orange', 'green', 'purple', null],
      [null, 'green', 'green', 'red', 'red', 'yellow', 'yellow', null],
      [null, null, 'red', 'yellow', 'red', 'yellow', null],
      [null, null, null, 'purple', 'purple', null, null, null],
    ],
  },
  {
    id: 8,
    name: '第八关：泡泡龙王座决战',
    subtitle: '终极三龙蛋王座！用闪电、彩虹与炸弹泡泡创造满星奇迹！',
    objective: 'egg_rescue',
    colors: ['red', 'yellow', 'blue', 'green', 'purple', 'orange'],
    shotsPerDrop: 7,
    parShots: 15,
    rows: [
      ['red', 'red', 'blue', 'blue', 'yellow', 'yellow', 'green', 'green'],
      ['red', { color: 'orange', isEgg: true }, 'blue', 'purple', 'yellow', { color: 'purple', isEgg: true }, 'green'],
      [null, 'orange', 'orange', 'purple', 'purple', 'orange', 'orange', null],
      [null, null, 'green', { color: 'blue', isEgg: true }, 'red', 'green', null],
      [null, null, null, 'red', 'red', null, null, null],
    ],
  },
]);

/**
 * Seeded Mulberry32 PRNG (deterministic [0, 1) floats)
 */
export function createMulberry32(seed = 20261029) {
  let a = (Number(seed) || 20261029) >>> 0;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isOddRow(row, parityOffset = 0) {
  return Math.abs(row + parityOffset) % 2 === 1;
}

export function colsForRow(row, parityOffset = 0) {
  return isOddRow(row, parityOffset) ? ODD_COLS : EVEN_COLS;
}

export function rowToWorldY(row, ceilingY = BASE_CEILING_Y) {
  return ceilingY - BUBBLE_RADIUS - row * ROW_DY;
}

export function colToWorldX(row, col, parityOffset = 0) {
  const isOdd = isOddRow(row, parityOffset);
  return LEFT_WALL_X + BUBBLE_RADIUS + (isOdd ? BUBBLE_RADIUS : 0) + col * BUBBLE_DIAMETER;
}

export function cellToWorld(row, col, ceilingY = BASE_CEILING_Y, parityOffset = 0) {
  return {
    x: colToWorldX(row, col, parityOffset),
    y: rowToWorldY(row, ceilingY),
  };
}

/**
 * Returns all valid in-bounds hex neighbor coordinates [row, col] for (row, col).
 * Even-parity row (8 cols) -> odd-parity row offsets are (col - 1, col)
 * Odd-parity row (7 cols)  -> even-parity row offsets are (col, col + 1)
 */
export function getHexNeighbors(row, col, maxRows = MAX_GRID_ROWS, parityOffset = 0) {
  const isOdd = isOddRow(row, parityOffset);
  const diagCols = isOdd ? [col, col + 1] : [col - 1, col];
  const raw = [
    [row, col - 1],
    [row, col + 1],
    [row - 1, diagCols[0]],
    [row - 1, diagCols[1]],
    [row + 1, diagCols[0]],
    [row + 1, diagCols[1]],
  ];
  const out = [];
  for (const [nr, nc] of raw) {
    if (nr >= 0 && nr < maxRows && nc >= 0 && nc < colsForRow(nr, parityOffset)) {
      out.push([nr, nc]);
    }
  }
  return out;
}

export function clampAimAngle(rad) {
  const n = Number(rad);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_AIM_RAD, Math.min(MAX_AIM_RAD, n));
}

function normalizeBubbleSpec(raw, fallbackColor = 'red') {
  if (raw === null || raw === undefined || raw === false || raw === 0 || raw === '') {
    return null;
  }
  if (typeof raw === 'number') {
    const idx = Math.max(0, Math.min(BUBBLE_COLORS.length - 1, Math.floor(raw) - 1));
    return { color: BUBBLE_COLORS[idx], special: null, isEgg: false };
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (!s || s === '.' || s === 'none' || s === 'empty' || s === 'null') return null;
    if (SPECIAL_TYPES.includes(s)) {
      return { color: s === 'bomb' ? 'red' : s === 'rainbow' ? 'yellow' : 'blue', special: s, isEgg: false };
    }
    if (s === 'egg' || s === 'star_egg') {
      return { color: 'yellow', special: null, isEgg: true };
    }
    const color = BUBBLE_COLORS.includes(s) ? s : fallbackColor;
    return { color, special: null, isEgg: false };
  }
  if (typeof raw === 'object') {
    const rawSpecial = raw.special ? String(raw.special).toLowerCase() : null;
    const special = SPECIAL_TYPES.includes(rawSpecial) ? rawSpecial : null;
    let color = raw.color ? String(raw.color).toLowerCase() : '';
    if (SPECIAL_TYPES.includes(color) && !special) {
      return {
        color: color === 'bomb' ? 'red' : color === 'rainbow' ? 'yellow' : 'blue',
        special: color,
        isEgg: Boolean(raw.isEgg),
      };
    }
    if (!BUBBLE_COLORS.includes(color)) {
      color = special === 'bomb' ? 'red' : special === 'rainbow' ? 'yellow' : special === 'lightning' ? 'blue' : fallbackColor;
    }
    return {
      color,
      special,
      isEgg: Boolean(raw.isEgg),
    };
  }
  return null;
}

export function createEmptyGrid(maxRows = MAX_GRID_ROWS, parityOffset = 0) {
  return Array.from({ length: maxRows }, (_, r) => Array(colsForRow(r, parityOffset)).fill(null));
}

function populateGridFromInput(gridInput, ceilingY, maxRows = MAX_GRID_ROWS, parityOffset = 0) {
  const grid = createEmptyGrid(maxRows, parityOffset);
  if (!Array.isArray(gridInput)) return grid;

  // Support flat list of { row, col, color, special, isEgg } objects
  if (
    gridInput.length > 0 &&
    gridInput.every((item) => item && typeof item === 'object' && !Array.isArray(item) && Number.isInteger(item.row) && Number.isInteger(item.col))
  ) {
    for (const item of gridInput) {
      const r = item.row;
      const c = item.col;
      if (r >= 0 && r < maxRows && c >= 0 && c < colsForRow(r, parityOffset)) {
        const spec = normalizeBubbleSpec(item);
        if (spec) {
          const pos = cellToWorld(r, c, ceilingY, parityOffset);
          grid[r][c] = {
            row: r,
            col: c,
            color: spec.color,
            special: spec.special,
            isEgg: spec.isEgg,
            x: pos.x,
            y: pos.y,
          };
        }
      }
    }
    return grid;
  }

  // Standard 2D array rows[r][c]
  for (let r = 0; r < Math.min(gridInput.length, maxRows); r++) {
    const rowArr = gridInput[r];
    if (!Array.isArray(rowArr)) continue;
    const maxCols = colsForRow(r, parityOffset);
    for (let c = 0; c < Math.min(rowArr.length, maxCols); c++) {
      const spec = normalizeBubbleSpec(rowArr[c]);
      if (spec) {
        const pos = cellToWorld(r, c, ceilingY, parityOffset);
        grid[r][c] = {
          row: r,
          col: c,
          color: spec.color,
          special: spec.special,
          isEgg: spec.isEgg,
          x: pos.x,
          y: pos.y,
        };
      }
    }
  }
  return grid;
}

export function syncGridWorldPositions(grid, ceilingY, parityOffset = 0) {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell) {
        cell.row = r;
        cell.col = c;
        const pos = cellToWorld(r, c, ceilingY, parityOffset);
        cell.x = pos.x;
        cell.y = pos.y;
      }
    }
  }
}

/**
 * Deterministic Hex Snap:
 * Given contact coordinate (x, y) and contact context, chooses the nearest
 * unoccupied valid hex cell (r, c) that is guaranteed:
 * 1. Unoccupied (!grid[r][c]) -> 0 overlapping cells
 * 2. In-bounds (0 <= r < maxRows, 0 <= c < colsForRow(r, parityOffset)) -> 0 OOB cells
 * 3. Anchored (either r === 0 OR has >= 1 occupied hex neighbor in grid) -> 0 floating snaps
 */
export function resolveHexSnap(x, y, hitInfo, grid, ceilingY, parityOffset = 0) {
  const maxRows = grid.length;
  const candidateMap = new Map();

  const addCandidate = (r, c, priorityBonus = 0) => {
    if (r < 0 || r >= maxRows) return;
    const maxCols = colsForRow(r, parityOffset);
    if (c < 0 || c >= maxCols) return;
    if (grid[r][c] !== null) return;

    // Must be anchored: either row 0 or adjacent to at least one occupied cell
    let anchored = r === 0;
    if (!anchored) {
      for (const [nr, nc] of getHexNeighbors(r, c, maxRows, parityOffset)) {
        if (grid[nr][nc] !== null) {
          anchored = true;
          break;
        }
      }
    }
    if (!anchored) return;

    const pos = cellToWorld(r, c, ceilingY, parityOffset);
    const distSq = (pos.x - x) * (pos.x - x) + (pos.y - y) * (pos.y - y);
    const score = distSq - priorityBonus;
    const key = `${r},${c}`;
    const prev = candidateMap.get(key);
    if (!prev || score < prev.score) {
      candidateMap.set(key, { row: r, col: c, x: pos.x, y: pos.y, distSq, score });
    }
  };

  // If ceiling hit or very close to top ceiling row, include unoccupied row 0 cells
  const topRowY = rowToWorldY(0, ceilingY);
  if ((hitInfo && hitInfo.type === 'ceiling') || y >= topRowY - ROW_DY * 0.65) {
    for (let c = 0; c < colsForRow(0, parityOffset); c++) {
      addCandidate(0, c, 0.08);
    }
  }

  // If collided with an occupied bubble, prioritize unoccupied neighbors of nearby occupied bubbles
  if (hitInfo && hitInfo.type === 'bubble' && Number.isInteger(hitInfo.row)) {
    for (const [nr, nc] of getHexNeighbors(hitInfo.row, hitInfo.col, maxRows, parityOffset)) {
      addCandidate(nr, nc, 0.12);
    }
  }

  // Also include unoccupied neighbors of any occupied bubble within 2.55 * R of (x, y)
  const nearThreshSq = (BUBBLE_DIAMETER * 1.35) ** 2;
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const dSq = (cell.x - x) * (cell.x - x) + (cell.y - y) * (cell.y - y);
      if (dSq <= nearThreshSq) {
        for (const [nr, nc] of getHexNeighbors(r, c, maxRows, parityOffset)) {
          addCandidate(nr, nc, 0.05);
        }
      }
    }
  }

  // Fallback: if all close neighbors were occupied, search all valid anchored unoccupied cells
  if (candidateMap.size === 0) {
    for (let c = 0; c < colsForRow(0, parityOffset); c++) {
      addCandidate(0, c, 0);
    }
    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] !== null) {
          for (const [nr, nc] of getHexNeighbors(r, c, maxRows, parityOffset)) {
            addCandidate(nr, nc, 0);
          }
        }
      }
    }
  }

  let best = null;
  for (const cand of candidateMap.values()) {
    if (
      !best ||
      cand.score < best.score - 1e-9 ||
      (Math.abs(cand.score - best.score) <= 1e-9 && (cand.row < best.row || (cand.row === best.row && cand.col < best.col)))
    ) {
      best = cand;
    }
  }

  if (!best) {
    const pos = cellToWorld(0, 0, ceilingY, parityOffset);
    return { row: 0, col: 0, x: pos.x, y: pos.y };
  }
  return { row: best.row, col: best.col, x: best.x, y: best.y };
}

/**
 * Single 120Hz substep of projectile flight + elastic wall ricochet + collision check.
 * Shared 100% identically between live projectile flight and computeTrajectoryPreview!
 */
export function stepProjectileSubstep(proj, grid, ceilingY, parityOffset = 0) {
  let x = proj.x + proj.vx * SUB_DT;
  let y = proj.y + proj.vy * SUB_DT;
  let vx = proj.vx;
  let vy = proj.vy;
  let bounces = proj.bounces || 0;
  let bouncedWall = null;

  const minX = LEFT_WALL_X + BUBBLE_RADIUS;
  const maxX = RIGHT_WALL_X - BUBBLE_RADIUS;

  if (x < minX) {
    x = minX + (minX - x);
    vx = Math.abs(vx);
    bounces += 1;
    bouncedWall = 'left';
  } else if (x > maxX) {
    x = maxX - (x - maxX);
    vx = -Math.abs(vx);
    bounces += 1;
    bouncedWall = 'right';
  }

  proj.x = x;
  proj.y = y;
  proj.vx = vx;
  proj.vy = vy;
  proj.bounces = bounces;

  // Check collision with occupied hex bubbles first
  const hitDistSq = (BUBBLE_DIAMETER * 0.94) ** 2;
  let closestBubble = null;
  let closestDistSq = Infinity;

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const dx = x - cell.x;
      const dy = y - cell.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= hitDistSq && dSq < closestDistSq) {
        closestDistSq = dSq;
        closestBubble = cell;
      }
    }
  }

  if (closestBubble) {
    const snapCell = resolveHexSnap(
      x,
      y,
      { type: 'bubble', row: closestBubble.row, col: closestBubble.col },
      grid,
      ceilingY,
      parityOffset
    );
    return {
      collided: true,
      hitType: 'bubble',
      hitRow: closestBubble.row,
      hitCol: closestBubble.col,
      bouncedWall,
      snapCell,
    };
  }

  // Check collision with ceiling (row 0 center Y)
  const topRowY = rowToWorldY(0, ceilingY);
  if (y >= topRowY) {
    y = topRowY;
    proj.y = y;
    const snapCell = resolveHexSnap(x, y, { type: 'ceiling', row: 0, col: 0 }, grid, ceilingY, parityOffset);
    return {
      collided: true,
      hitType: 'ceiling',
      hitRow: 0,
      hitCol: snapCell.col,
      bouncedWall,
      snapCell,
    };
  }

  return {
    collided: false,
    hitType: null,
    hitRow: null,
    hitCol: null,
    bouncedWall,
    snapCell: null,
  };
}

/**
 * Computes the exact 120Hz substepped trajectory preview & landing snapCell.
 * Because this executes stepProjectileSubstep with the exact same constants,
 * trajectory.snapCell is mathematically guaranteed to match actual projectile landing!
 */
export function computeTrajectoryPreview(aimAngle, grid, ceilingY, parityOffset = 0) {
  const clamped = clampAimAngle(aimAngle);
  const simProj = {
    x: LAUNCHER_X,
    y: LAUNCHER_Y,
    vx: Math.sin(clamped) * PROJECTILE_SPEED,
    vy: Math.cos(clamped) * PROJECTILE_SPEED,
    bounces: 0,
  };

  const points = [{ x: LAUNCHER_X, y: LAUNCHER_Y }];
  const pearls = [];
  let snapCell = null;
  let hitType = null;
  let hitRow = null;
  let hitCol = null;

  const maxSubsteps = 600;
  for (let step = 1; step <= maxSubsteps; step++) {
    const res = stepProjectileSubstep(simProj, grid, ceilingY, parityOffset);
    if (res.bouncedWall) {
      points.push({ x: simProj.x, y: simProj.y, bounce: res.bouncedWall });
    }
    if (step % 2 === 0 && simProj.bounces <= 2) {
      pearls.push({ x: simProj.x, y: simProj.y, bounces: simProj.bounces });
    }
    if (res.collided) {
      snapCell = res.snapCell;
      hitType = res.hitType;
      hitRow = res.hitRow;
      hitCol = res.hitCol;
      points.push({ x: simProj.x, y: simProj.y });
      points.push({ x: snapCell.x, y: snapCell.y, snap: true });
      break;
    }
  }

  if (!snapCell) {
    snapCell = resolveHexSnap(simProj.x, simProj.y, { type: 'ceiling', row: 0, col: 0 }, grid, ceilingY, parityOffset);
    points.push({ x: snapCell.x, y: snapCell.y, snap: true });
  }

  return {
    aimAngle: clamped,
    bounces: simProj.bounces,
    points,
    pearls,
    snapCell,
    hitType,
    hitRow,
    hitCol,
  };
}

/**
 * Connected same-color BFS from startPositions = [[r, c], ...]
 */
export function findConnectedColorCluster(grid, startPositions, targetColor, parityOffset = 0) {
  const maxRows = grid.length;
  const visited = new Set();
  const queue = [];
  const cluster = [];

  for (const [sr, sc] of startPositions) {
    if (sr < 0 || sr >= maxRows || sc < 0 || sc >= colsForRow(sr, parityOffset)) continue;
    const key = `${sr},${sc}`;
    if (visited.has(key)) continue;
    const cell = grid[sr][sc];
    if (!cell) continue;
    if (cell.color === targetColor || (sr === startPositions[0][0] && sc === startPositions[0][1])) {
      visited.add(key);
      queue.push([sr, sc]);
    }
  }

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const cell = grid[r][c];
    if (!cell) continue;
    cluster.push({ row: r, col: c, color: cell.color, special: cell.special, isEgg: cell.isEgg, x: cell.x, y: cell.y });
    for (const [nr, nc] of getHexNeighbors(r, c, maxRows, parityOffset)) {
      const nKey = `${nr},${nc}`;
      if (visited.has(nKey)) continue;
      const nCell = grid[nr][nc];
      if (nCell && nCell.color === targetColor) {
        visited.add(nKey);
        queue.push([nr, nc]);
      }
    }
  }
  return cluster;
}

/**
 * Ceiling-Anchor BFS from row === 0:
 * Any bubble in grid not connected via a path of occupied hex neighbors to row === 0
 * detaches simultaneously for the Avalanche Drop!
 */
export function findFloatingDisconnectedCells(grid, parityOffset = 0) {
  const maxRows = grid.length;
  const anchored = new Set();
  const queue = [];

  for (let c = 0; c < colsForRow(0, parityOffset); c++) {
    if (grid[0][c] !== null) {
      const key = `0,${c}`;
      anchored.add(key);
      queue.push([0, c]);
    }
  }

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    for (const [nr, nc] of getHexNeighbors(r, c, maxRows, parityOffset)) {
      const nKey = `${nr},${nc}`;
      if (!anchored.has(nKey) && grid[nr][nc] !== null) {
        anchored.add(nKey);
        queue.push([nr, nc]);
      }
    }
  }

  const detached = [];
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell && !anchored.has(`${r},${c}`)) {
        detached.push({
          row: r,
          col: c,
          color: cell.color,
          special: cell.special,
          isEgg: Boolean(cell.isEgg),
          x: cell.x,
          y: cell.y,
        });
      }
    }
  }
  return detached;
}

/**
 * Maps horizontal x position to one of the 5 bottom Bonus Cauldrons (50 / 100 / 250 / 100 / 50)
 */
export function pickCauldronForX(x) {
  let best = CAULDRON_SPECS[2];
  let bestDist = Infinity;
  for (const spec of CAULDRON_SPECS) {
    const d = Math.abs(x - spec.x);
    if (d < bestDist) {
      bestDist = d;
      best = spec;
    }
  }
  return best;
}

export class BubbleDragonSim {
  constructor(opts = {}) {
    this.eventQueue = [];
    this.startMatch(opts);
  }

  startMatch(opts = {}) {
    this.seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) >>> 0 : 20261029;
    this.rng = createMulberry32(this.seed);

    this.modeId = opts.modeId === 'endless' ? 'endless' : 'stage';
    const rawStageId = Number(opts.stageId) || 1;
    this.stageId = Math.max(1, Math.min(STAGE_DEFS.length, Math.floor(rawStageId)));
    this.stageDef = STAGE_DEFS[this.stageId - 1];

    this.rowParityOffset = 0;
    this.ceilingDropSteps = 0;
    this.ceilingY = BASE_CEILING_Y;
    this.shotsPerCeilingDrop = Number(opts.shotsPerCeilingDrop) || (this.modeId === 'endless' ? 6 : this.stageDef.shotsPerDrop);
    this.shotsFired = 0;
    this.shotsSinceDrop = 0;

    this.score = 0;
    this.cauldronScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalPopped = 0;
    this.totalDropped = 0;
    this.totalCauldronCatches = 0;
    this.eggsRescued = 0;
    this.tick = 0;
    this.elapsedSeconds = 0;

    this.status = 'playing'; // 'playing' | 'cleared' | 'lost'
    this.podiumStars = 0;
    this.aimAngle = clampAimAngle(opts.aimAngle ?? 0);

    this.cauldrons = CAULDRON_SPECS.map((spec) => ({
      index: spec.index,
      points: spec.points,
      x: spec.x,
      width: spec.width,
      label: spec.label,
      hits: 0,
      visualHits: 0,
      lastHitTick: -999,
    }));

    this.specialGauge = {
      charge: 0,
      maxCharge: 100,
      nextSpecialIndex: 0,
      readySpecial: null,
      hint: '',
      inventory: {
        bomb: 0,
        rainbow: 0,
        lightning: 0,
      },
    };

    const initialRows = opts.customGrid !== undefined ? opts.customGrid : this.stageDef.rows;
    this.grid = populateGridFromInput(initialRows, this.ceilingY, MAX_GRID_ROWS, this.rowParityOffset);
    this.initialEggCount = this._countEggsOnGrid();

    this.forcedQueue = [];
    if (Array.isArray(opts.forcedQueue)) {
      for (const item of opts.forcedQueue) {
        const spec = normalizeBubbleSpec(item, this._pickRemainingOrStageColor());
        if (spec) {
          this.forcedQueue.push({
            color: spec.color,
            special: spec.special,
            fromForcedQueue: true,
          });
        }
      }
    }

    this.projectile = null;
    this.fallingBubbles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.lastShotResult = null;
    this._nextFallingId = 1;

    this.currentBubble = this._drawNextLauncherBubble();
    this.nextBubble = this._drawNextLauncherBubble();
    this._ensureLauncherColorsMatchBoard();

    this.trajectory = computeTrajectoryPreview(this.aimAngle, this.grid, this.ceilingY, this.rowParityOffset);
    this._emitEvent('match_start', { modeId: this.modeId, stageId: this.stageId });
    return this.getState();
  }

  _emitEvent(type, payload = {}) {
    this.eventQueue.push({ type, tick: this.tick, ...payload });
    if (this.eventQueue.length > 64) {
      this.eventQueue.shift();
    }
  }

  consumeEvents() {
    const out = this.eventQueue.slice();
    this.eventQueue.length = 0;
    return out;
  }

  _countEggsOnGrid() {
    let count = 0;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (this.grid[r][c] && this.grid[r][c].isEgg) {
          count += 1;
        }
      }
    }
    return count;
  }

  getRemainingBoardColors() {
    const set = new Set();
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const cell = this.grid[r][c];
        if (cell && !cell.isEgg && BUBBLE_COLORS.includes(cell.color)) {
          set.add(cell.color);
        }
      }
    }
    return Array.from(set);
  }

  _pickRemainingOrStageColor() {
    const remaining = this.getRemainingBoardColors();
    if (remaining.length > 0) {
      const idx = Math.floor(this.rng() * remaining.length);
      return remaining[idx];
    }
    const palette = this.modeId === 'endless' ? BUBBLE_COLORS : this.stageDef.colors;
    const idx = Math.floor(this.rng() * palette.length);
    return palette[idx];
  }

  _drawNextLauncherBubble() {
    if (this.forcedQueue.length > 0) {
      return this.forcedQueue.shift();
    }
    return {
      color: this._pickRemainingOrStageColor(),
      special: null,
      fromForcedQueue: false,
    };
  }

  /**
   * Smart Remaining-Color Shooter Filter:
   * Whenever only a subset of colors remain on the board, non-forced regular bubbles
   * in the launcher/feeder automatically filter to remaining board colors!
   */
  _ensureLauncherColorsMatchBoard() {
    const remaining = this.getRemainingBoardColors();
    if (remaining.length === 0) return;

    for (const slotKey of ['currentBubble', 'nextBubble']) {
      const b = this[slotKey];
      if (!b || b.special || b.fromForcedQueue) continue;
      if (!remaining.includes(b.color)) {
        b.color = remaining[Math.floor(this.rng() * remaining.length)];
      }
    }
  }

  setAimAngle(rad) {
    this.aimAngle = clampAimAngle(rad);
    this.trajectory = computeTrajectoryPreview(this.aimAngle, this.grid, this.ceilingY, this.rowParityOffset);
    return this.getState();
  }

  swapBubbles() {
    if (this.status !== 'playing') return this.getState();
    const tmp = this.currentBubble;
    this.currentBubble = this.nextBubble;
    this.nextBubble = tmp;
    this.trajectory = computeTrajectoryPreview(this.aimAngle, this.grid, this.ceilingY, this.rowParityOffset);
    this._emitEvent('swap', {
      currentBubble: { ...this.currentBubble },
      nextBubble: { ...this.nextBubble },
    });
    return this.getState();
  }

  /**
   * Moves displaced regular currentBubble back to the feeder (nextBubble)
   * while preserving the previous nextBubble at the front of forcedQueue.
   */
  _equipSpecialBubblePreserveFeeder(norm) {
    if (this.currentBubble && !this.currentBubble.special) {
      if (this.nextBubble) {
        this.forcedQueue.unshift(this.nextBubble);
      }
      this.nextBubble = this.currentBubble;
    }
    const displayColor = norm === 'bomb' ? 'red' : norm === 'rainbow' ? 'yellow' : 'blue';
    this.currentBubble = {
      color: displayColor,
      special: norm,
      fromForcedQueue: true,
    };
    this.trajectory = computeTrajectoryPreview(this.aimAngle, this.grid, this.ceilingY, this.rowParityOffset);
  }

  /**
   * UI Path for HUD Special Button & KeyE:
   * Strictly gated on readySpecial or inventory[type] > 0 (decrements inventory).
   * If gauge is not full and inventory is empty, performs a clean no-op with "能量未满" hint!
   */
  activateReadySpecial() {
    if (this.status !== 'playing' || this.projectile !== null) {
      return this.getState();
    }
    if (this.currentBubble && this.currentBubble.special) {
      return this.getState();
    }

    let chosen = null;
    if (this.specialGauge.readySpecial && SPECIAL_TYPES.includes(this.specialGauge.readySpecial)) {
      chosen = this.specialGauge.readySpecial;
      this.specialGauge.readySpecial = null;
      if ((this.specialGauge.inventory[chosen] || 0) > 0) {
        this.specialGauge.inventory[chosen] -= 1;
      }
    } else {
      for (const t of SPECIAL_TYPES) {
        if ((this.specialGauge.inventory[t] || 0) > 0) {
          chosen = t;
          this.specialGauge.inventory[t] -= 1;
          break;
        }
      }
    }

    if (!chosen) {
      this.specialGauge.hint = '能量未满';
      this._emitEvent('special_not_ready', { charge: this.specialGauge.charge });
      return this.getState();
    }

    this.specialGauge.hint = '';
    this._equipSpecialBubblePreserveFeeder(chosen);
    this._emitEvent('grant_special', { special: chosen });
    return this.getState();
  }

  /**
   * Programmatic Test Seam: window.__BUBBLE_DRAGON__.grantSpecial(type)
   */
  grantSpecial(type) {
    let norm = type ? String(type).trim().toLowerCase() : '';
    if (!SPECIAL_TYPES.includes(norm)) {
      if (this.specialGauge.readySpecial && SPECIAL_TYPES.includes(this.specialGauge.readySpecial)) {
        norm = this.specialGauge.readySpecial;
        this.specialGauge.readySpecial = null;
      } else {
        norm = SPECIAL_TYPES[this.specialGauge.nextSpecialIndex % SPECIAL_TYPES.length];
        this.specialGauge.nextSpecialIndex += 1;
      }
    }
    this.specialGauge.hint = '';
    this._equipSpecialBubblePreserveFeeder(norm);
    this._emitEvent('grant_special', { special: norm });
    return this.getState();
  }

  fireBubble() {
    if (this.status !== 'playing' || this.projectile !== null || !this.currentBubble) {
      return this.getState();
    }
    const angle = this.aimAngle;
    const launched = this.currentBubble;
    this.projectile = {
      active: true,
      x: LAUNCHER_X,
      y: LAUNCHER_Y,
      vx: Math.sin(angle) * PROJECTILE_SPEED,
      vy: Math.cos(angle) * PROJECTILE_SPEED,
      color: launched.color,
      special: launched.special || null,
      bounces: 0,
      aimAngle: angle,
    };

    this.currentBubble = this.nextBubble;
    this.nextBubble = this._drawNextLauncherBubble();
    this._ensureLauncherColorsMatchBoard();

    this.shotsFired += 1;
    this.shotsSinceDrop += 1;
    this._emitEvent('shoot', {
      color: this.projectile.color,
      special: this.projectile.special,
      aimAngle: angle,
    });
    return this.getState();
  }

  stepFrames(n = 1) {
    const count = Math.max(0, Math.min(5000, Math.floor(Number(n) || 0)));
    for (let i = 0; i < count; i++) {
      this._stepSingleFrame();
    }
    return this.getState();
  }

  _stepSingleFrame() {
    this.tick += 1;
    this.elapsedSeconds = this.tick * FIXED_DT;

    // 1. Step active projectile at 120Hz (SUBSTEPS = 2 per 60Hz frame)
    if (this.projectile && this.status === 'playing') {
      for (let s = 0; s < SUBSTEPS; s++) {
        const res = stepProjectileSubstep(this.projectile, this.grid, this.ceilingY, this.rowParityOffset);
        if (res.bouncedWall) {
          this._emitEvent('wall_bounce', {
            wall: res.bouncedWall,
            x: this.projectile.x,
            y: this.projectile.y,
            bounces: this.projectile.bounces,
          });
        }
        if (res.collided) {
          const landedProj = this.projectile;
          this.projectile = null;
          this._resolveProjectileLanding(landedProj, res);
          break;
        }
      }
    }

    // 2. Step gravity-falling detached avalanche bubbles into bottom Bonus Cauldrons
    this._stepFallingBubbles();

    // 3. Step visual particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * FIXED_DT;
      p.y += p.vy * FIXED_DT;
      p.z += (p.vz || 0) * FIXED_DT;
      p.vy -= 14.0 * FIXED_DT;
      p.life -= FIXED_DT;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  _awardAndSpawnFallingCells(droppedCells) {
    let cauldronPoints = 0;
    for (let idx = 0; idx < droppedCells.length; idx++) {
      const dc = droppedCells[idx];
      if (dc.isEgg) {
        this.eggsRescued += 1;
      }
      const cauldron = pickCauldronForX(dc.x);
      const pts = cauldron.points;
      cauldronPoints += pts;
      this.cauldrons[cauldron.index].hits += 1;
      this.cauldrons[cauldron.index].lastHitTick = this.tick;

      const targetX = cauldron.x + ((idx % 3) - 1) * 0.18;
      const flightTime = 0.42 + (idx % 4) * 0.05;
      const vx = (targetX - dc.x) / flightTime;
      const vy = 2.2 + (idx % 3) * 0.65;

      this.fallingBubbles.push({
        id: this._nextFallingId++,
        color: dc.color,
        isEgg: dc.isEgg,
        x: dc.x,
        y: dc.y,
        vx,
        vy,
        targetCauldronIndex: cauldron.index,
        points: pts,
        sourceRow: dc.row,
        sourceCol: dc.col,
      });
    }
    if (droppedCells.length > 0) {
      this.totalDropped += droppedCells.length;
      this.totalCauldronCatches += droppedCells.length;
      this.cauldronScore += cauldronPoints;
      this.score += cauldronPoints;
    }
    return cauldronPoints;
  }

  _resolveProjectileLanding(proj, collisionRes) {
    const { snapCell, hitRow, hitCol } = collisionRes;
    const { row: sr, col: sc, x: sx, y: sy } = snapCell;

    // Place snapped bubble in grid
    this.grid[sr][sc] = {
      row: sr,
      col: sc,
      color: proj.color,
      special: proj.special || null,
      isEgg: false,
      x: sx,
      y: sy,
    };

    const poppedMap = new Map();
    const markPopped = (r, c) => {
      if (r < 0 || r >= this.grid.length || c < 0 || c >= colsForRow(r, this.rowParityOffset)) return;
      const cell = this.grid[r][c];
      if (!cell) return;
      poppedMap.set(`${r},${c}`, { ...cell });
    };

    const specialTriggered = proj.special || null;

    if (specialTriggered === 'bomb') {
      // Bomb Bubble (炸弹泡泡): clears 2-hex radius around (sr, sc) (and hitRow/hitCol if impacted)
      const visitedDist = new Map();
      const q = [[sr, sc, 0]];
      visitedDist.set(`${sr},${sc}`, 0);
      if (Number.isInteger(hitRow) && Number.isInteger(hitCol)) {
        const hk = `${hitRow},${hitCol}`;
        if (!visitedDist.has(hk)) {
          visitedDist.set(hk, 0);
          q.push([hitRow, hitCol, 0]);
        }
      }
      while (q.length > 0) {
        const [r, c, dist] = q.shift();
        markPopped(r, c);
        if (dist < 2) {
          for (const [nr, nc] of getHexNeighbors(r, c, this.grid.length, this.rowParityOffset)) {
            const nk = `${nr},${nc}`;
            if (!visitedDist.has(nk)) {
              visitedDist.set(nk, dist + 1);
              q.push([nr, nc, dist + 1]);
            }
          }
        }
      }
      this._emitEvent('special_explode', { special: 'bomb', x: sx, y: sy });
    } else if (specialTriggered === 'lightning') {
      // Star Lightning Bubble (闪电泡泡): clears entire horizontal row!
      let otherInSnapRow = 0;
      for (let c = 0; c < colsForRow(sr, this.rowParityOffset); c++) {
        if (c !== sc && this.grid[sr][c] !== null) {
          otherInSnapRow += 1;
        }
      }
      const rowsToClear = new Set([sr]);
      if (otherInSnapRow === 0 && Number.isInteger(hitRow)) {
        rowsToClear.add(hitRow);
      }
      for (const targetRow of rowsToClear) {
        if (targetRow >= 0 && targetRow < this.grid.length) {
          for (let c = 0; c < colsForRow(targetRow, this.rowParityOffset); c++) {
            markPopped(targetRow, c);
          }
        }
      }
      this._emitEvent('special_explode', { special: 'lightning', x: sx, y: sy, rows: Array.from(rowsToClear) });
    } else if (specialTriggered === 'rainbow') {
      // Rainbow Bubble (彩虹泡泡): matches all adjacent bubble colors on impact!
      markPopped(sr, sc);
      const adjColors = new Set();
      const adjSeeds = [];
      for (const [nr, nc] of getHexNeighbors(sr, sc, this.grid.length, this.rowParityOffset)) {
        const nCell = this.grid[nr][nc];
        if (nCell) {
          if (nCell.isEgg) {
            markPopped(nr, nc);
          } else {
            adjColors.add(nCell.color);
            adjSeeds.push([nr, nc, nCell.color]);
          }
        }
      }
      for (const color of adjColors) {
        const seeds = adjSeeds.filter((s) => s[2] === color).map(([r, c]) => [r, c]);
        const cluster = findConnectedColorCluster(this.grid, seeds, color, this.rowParityOffset);
        for (const item of cluster) {
          markPopped(item.row, item.col);
        }
      }
      this._emitEvent('special_explode', { special: 'rainbow', x: sx, y: sy, colors: Array.from(adjColors) });
    } else {
      // Standard Candy Bubble: 3+ connected same-color BFS pop
      const cluster = findConnectedColorCluster(this.grid, [[sr, sc]], proj.color, this.rowParityOffset);
      if (cluster.length >= 3) {
        for (const item of cluster) {
          markPopped(item.row, item.col);
        }
      }
      if (poppedMap.size >= 3) {
        for (const popped of Array.from(poppedMap.values())) {
          for (const [nr, nc] of getHexNeighbors(popped.row, popped.col, this.grid.length, this.rowParityOffset)) {
            if (this.grid[nr][nc] && this.grid[nr][nc].isEgg) {
              markPopped(nr, nc);
            }
          }
        }
      }
    }

    // Remove popped bubbles from grid
    const poppedCells = Array.from(poppedMap.values());
    for (const cell of poppedCells) {
      if (cell.isEgg) {
        this.eggsRescued += 1;
      }
      this.grid[cell.row][cell.col] = null;
      this._spawnBurstParticles(cell.x, cell.y, cell.color, 6);
    }

    // Run Ceiling-Anchor BFS from row === 0 to detach all floating islands!
    let droppedCells = [];
    if (poppedCells.length > 0) {
      droppedCells = findFloatingDisconnectedCells(this.grid, this.rowParityOffset);
      for (const dCell of droppedCells) {
        this.grid[dCell.row][dCell.col] = null;
      }
    }

    // Scoring & Cauldron Avalanche Calculation
    let popScore = 0;
    let cauldronPoints = 0;
    if (poppedCells.length > 0) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.totalPopped += poppedCells.length;
      const comboMult = 1 + Math.min(4, (this.combo - 1) * 0.25);
      popScore = Math.round(poppedCells.length * 30 * comboMult);
      this.score += popScore;

      cauldronPoints = this._awardAndSpawnFallingCells(droppedCells);

      // Charge special gauge
      const gaugeGain = poppedCells.length * 12 + droppedCells.length * 18;
      this.specialGauge.charge = Math.min(this.specialGauge.maxCharge, this.specialGauge.charge + gaugeGain);
      if (this.specialGauge.charge >= this.specialGauge.maxCharge && !this.specialGauge.readySpecial) {
        const earned = SPECIAL_TYPES[this.specialGauge.nextSpecialIndex % SPECIAL_TYPES.length];
        this.specialGauge.nextSpecialIndex += 1;
        this.specialGauge.readySpecial = earned;
        this.specialGauge.charge = 0;
        this.specialGauge.hint = '';
        this.specialGauge.inventory[earned] = (this.specialGauge.inventory[earned] || 0) + 1;
      }

      this._emitEvent('cluster_pop', {
        poppedCount: poppedCells.length,
        droppedCount: droppedCells.length,
        cauldronPoints,
        combo: this.combo,
      });
    } else {
      this.combo = 0;
      this._emitEvent('bubble_snap', { row: sr, col: sc, color: proj.color });
    }

    // Check ceiling drop / endless row feed if still playing
    const remainingCountBeforeDrop = this.getOccupiedBubbleCount();
    const remainingEggsBeforeDrop = this._countEggsOnGrid();
    const isEggStageCleared =
      this.modeId === 'stage' &&
      this.stageDef.objective === 'egg_rescue' &&
      this.initialEggCount > 0 &&
      remainingEggsBeforeDrop === 0;

    if (this.modeId === 'stage' && (remainingCountBeforeDrop === 0 || isEggStageCleared)) {
      if (remainingCountBeforeDrop > 0) {
        const bonusDrops = [];
        for (let r = 0; r < this.grid.length; r++) {
          for (let c = 0; c < this.grid[r].length; c++) {
            const rem = this.grid[r][c];
            if (rem) {
              this.grid[r][c] = null;
              droppedCells.push(rem);
              bonusDrops.push(rem);
            }
          }
        }
        cauldronPoints += this._awardAndSpawnFallingCells(bonusDrops);
      }
      this.status = 'cleared';
      this.podiumStars = this._computeStageStars();
      this.score += this.podiumStars * 200;
      this._emitEvent('stage_clear', {
        stageId: this.stageId,
        stars: this.podiumStars,
        score: this.score,
      });
    } else {
      // Apply periodic ceiling drop (Stage Mode) or top row feed (Endless Mode)
      if (this.shotsSinceDrop >= this.shotsPerCeilingDrop) {
        this.shotsSinceDrop = 0;
        if (this.modeId === 'endless') {
          this._feedEndlessTopRow();
        } else {
          this.advanceCeilingDrop(1);
        }
      }
      this._checkDangerLineBreach();
    }

    this._ensureLauncherColorsMatchBoard();
    this.trajectory = computeTrajectoryPreview(this.aimAngle, this.grid, this.ceilingY, this.rowParityOffset);

    this.lastShotResult = {
      snappedCell: { row: sr, col: sc, x: sx, y: sy },
      poppedCount: poppedCells.length,
      poppedCells,
      droppedCount: droppedCells.length,
      droppedCells,
      cauldronPoints,
      scoreGained: popScore + cauldronPoints,
      specialTriggered,
      wallBounces: proj.bounces || 0,
      stageCleared: this.status === 'cleared',
      gameOver: this.status === 'lost',
    };
  }

  advanceCeilingDrop(steps = 1) {
    const delta = Math.max(1, Math.floor(Number(steps) || 1));
    this.ceilingDropSteps += delta;
    this.ceilingY = BASE_CEILING_Y - this.ceilingDropSteps * ROW_DY;
    syncGridWorldPositions(this.grid, this.ceilingY, this.rowParityOffset);
    this._checkDangerLineBreach();
    this.trajectory = computeTrajectoryPreview(this.aimAngle, this.grid, this.ceilingY, this.rowParityOffset);
    this._emitEvent('ceiling_drop', {
      ceilingDropSteps: this.ceilingDropSteps,
      ceilingY: this.ceilingY,
    });
    return this.getState();
  }

  /**
   * Endless Top Row Feed:
   * Toggles rowParityOffset so every shifted row (r -> r + 1) keeps its EXACT parity
   * (8 cols stay 8 cols, 7 cols stay 7 cols) and its EXACT world-x positions!
   * Zero cells are ever clamped or lost in the shift, and any detached cells route
   * through the normal falling-bubble / cauldron scoring path.
   */
  _feedEndlessTopRow() {
    const newParityOffset = (this.rowParityOffset + 1) % 2;
    const nextGrid = createEmptyGrid(MAX_GRID_ROWS, newParityOffset);

    // Populate newly fed top row (row 0 under newParityOffset)
    const topCols = colsForRow(0, newParityOffset);
    for (let c = 0; c < topCols; c++) {
      const color = BUBBLE_COLORS[Math.floor(this.rng() * BUBBLE_COLORS.length)];
      const pos = cellToWorld(0, c, this.ceilingY, newParityOffset);
      nextGrid[0][c] = {
        row: 0,
        col: c,
        color,
        special: null,
        isEgg: false,
        x: pos.x,
        y: pos.y,
      };
    }

    const overflowDrops = [];
    for (let r = 0; r < MAX_GRID_ROWS; r++) {
      const targetRow = r + 1;
      for (let c = 0; c < this.grid[r].length; c++) {
        const cell = this.grid[r][c];
        if (!cell) continue;
        if (targetRow < MAX_GRID_ROWS) {
          // Because (r + 1 + newParityOffset) % 2 === (r + oldParityOffset) % 2,
          // colsForRow(targetRow, newParityOffset) === colsForRow(r, oldParityOffset)
          // and colToWorldX(targetRow, c, newParityOffset) === colToWorldX(r, c, oldParityOffset)!
          const pos = cellToWorld(targetRow, c, this.ceilingY, newParityOffset);
          nextGrid[targetRow][c] = {
            ...cell,
            row: targetRow,
            col: c,
            x: pos.x,
            y: pos.y,
          };
        } else {
          overflowDrops.push(cell);
        }
      }
    }

    this.rowParityOffset = newParityOffset;
    this.grid = nextGrid;

    // Route any detached or overflow cells through the normal fall/cauldron path
    const detached = findFloatingDisconnectedCells(this.grid, this.rowParityOffset);
    for (const d of detached) {
      this.grid[d.row][d.col] = null;
      overflowDrops.push(d);
    }
    if (overflowDrops.length > 0) {
      this._awardAndSpawnFallingCells(overflowDrops);
    }

    this._emitEvent('endless_row_feed', {
      tick: this.tick,
      rowParityOffset: this.rowParityOffset,
      topCols,
    });
  }

  _checkDangerLineBreach() {
    if (this.status !== 'playing') return;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const cell = this.grid[r][c];
        if (!cell) continue;
        if (cell.y - BUBBLE_RADIUS <= DANGER_LINE_Y || r >= MAX_GRID_ROWS - 1) {
          this.status = 'lost';
          this.podiumStars = this.modeId === 'endless' ? this._computeEndlessStars() : 0;
          this._emitEvent('danger_breach', { row: r, col: c, y: cell.y });
          return;
        }
      }
    }
  }

  _computeStageStars() {
    if (this.shotsFired <= this.stageDef.parShots) return 3;
    if (this.shotsFired <= this.stageDef.parShots + 5) return 2;
    return 1;
  }

  _computeEndlessStars() {
    if (this.score >= 1200) return 3;
    if (this.score >= 500) return 2;
    if (this.score >= 150) return 1;
    return 0;
  }

  _stepFallingBubbles() {
    for (let i = this.fallingBubbles.length - 1; i >= 0; i--) {
      const fb = this.fallingBubbles[i];
      fb.x += fb.vx * FIXED_DT;
      fb.y += fb.vy * FIXED_DT;
      fb.vy -= 26.0 * FIXED_DT;

      const minX = LEFT_WALL_X + BUBBLE_RADIUS;
      const maxX = RIGHT_WALL_X - BUBBLE_RADIUS;
      if (fb.x < minX) {
        fb.x = minX;
        fb.vx = Math.abs(fb.vx) * 0.7;
      } else if (fb.x > maxX) {
        fb.x = maxX;
        fb.vx = -Math.abs(fb.vx) * 0.7;
      }

      if (fb.y <= CAULDRON_Y) {
        const cIdx = fb.targetCauldronIndex ?? pickCauldronForX(fb.x).index;
        if (this.cauldrons[cIdx]) {
          this.cauldrons[cIdx].visualHits += 1;
        }
        this._spawnBurstParticles(fb.x, CAULDRON_Y + 0.25, fb.color, 5);
        this._emitEvent('cauldron_catch', {
          cauldronIndex: cIdx,
          points: fb.points,
          x: fb.x,
        });
        this.fallingBubbles.splice(i, 1);
      }
    }
  }

  _spawnBurstParticles(x, y, color, count = 6) {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (this.tick % 7) * 0.13;
      const spd = 2.2 + (i % 3) * 1.1;
      this.particles.push({
        x,
        y,
        z: 0.2,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd + 1.5,
        vz: ((i % 2) - 0.5) * 2.0,
        color,
        life: 0.45,
        maxLife: 0.45,
      });
    }
  }

  getOccupiedBubbleCount() {
    let count = 0;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (this.grid[r][c] !== null) count += 1;
      }
    }
    return count;
  }

  getState() {
    const bubbles = [];
    const gridClone = [];
    const colorGrid = [];

    for (let r = 0; r < this.grid.length; r++) {
      const rowClone = [];
      const colorRow = [];
      for (let c = 0; c < this.grid[r].length; c++) {
        const cell = this.grid[r][c];
        if (cell) {
          const item = {
            row: cell.row,
            col: cell.col,
            color: cell.color,
            special: cell.special || null,
            isEgg: Boolean(cell.isEgg),
            x: cell.x,
            y: cell.y,
          };
          rowClone.push(item);
          colorRow.push(cell.color);
          bubbles.push({ ...item });
        } else {
          rowClone.push(null);
          colorRow.push(null);
        }
      }
      gridClone.push(rowClone);
      colorGrid.push(colorRow);
    }

    return {
      modeId: this.modeId,
      stageId: this.stageId,
      stageName: this.stageDef.name,
      stageObjective: this.stageDef.objective,
      status: this.status,
      podiumStars: this.podiumStars,
      tick: this.tick,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(4)),
      score: this.score,
      cauldronScore: this.cauldronScore,
      combo: this.combo,
      maxCombo: this.maxCombo,
      shotsFired: this.shotsFired,
      shotsUntilCeilingDrop: Math.max(0, this.shotsPerCeilingDrop - this.shotsSinceDrop),
      ceilingDropSteps: this.ceilingDropSteps,
      rowParityOffset: this.rowParityOffset,
      ceilingY: this.ceilingY,
      dangerLineY: DANGER_LINE_Y,
      launcherX: LAUNCHER_X,
      launcherY: LAUNCHER_Y,
      leftWallX: LEFT_WALL_X,
      rightWallX: RIGHT_WALL_X,
      bubbleRadius: BUBBLE_RADIUS,
      evenCols: EVEN_COLS,
      oddCols: ODD_COLS,
      aimAngle: this.aimAngle,
      aimAngleDeg: Number(((this.aimAngle * 180) / Math.PI).toFixed(3)),
      currentBubble: this.currentBubble ? { ...this.currentBubble } : null,
      nextBubble: this.nextBubble ? { ...this.nextBubble } : null,
      remainingColors: this.getRemainingBoardColors(),
      bubbleCount: bubbles.length,
      eggsRemaining: this._countEggsOnGrid(),
      eggsRescued: this.eggsRescued,
      totalPopped: this.totalPopped,
      totalDropped: this.totalDropped,
      totalCauldronCatches: this.totalCauldronCatches,
      grid: gridClone,
      colorGrid,
      bubbles,
      projectile: this.projectile ? { ...this.projectile } : null,
      trajectory: {
        aimAngle: this.trajectory.aimAngle,
        bounces: this.trajectory.bounces,
        points: this.trajectory.points.map((p) => ({ ...p })),
        pearls: this.trajectory.pearls.map((p) => ({ ...p })),
        snapCell: this.trajectory.snapCell ? { ...this.trajectory.snapCell } : null,
        hitType: this.trajectory.hitType,
        hitRow: this.trajectory.hitRow,
        hitCol: this.trajectory.hitCol,
      },
      fallingBubbles: this.fallingBubbles.map((fb) => ({ ...fb })),
      cauldrons: this.cauldrons.map((c) => ({ ...c })),
      specialGauge: {
        charge: this.specialGauge.charge,
        maxCharge: this.specialGauge.maxCharge,
        readySpecial: this.specialGauge.readySpecial,
        hint: this.specialGauge.hint || '',
        inventory: { ...this.specialGauge.inventory },
      },
      lastShotResult: this.lastShotResult
        ? JSON.parse(JSON.stringify(this.lastShotResult))
        : null,
    };
  }
}
