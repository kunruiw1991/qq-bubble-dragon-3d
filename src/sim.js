/**
 * QQ Bubble Dragon Shooter 3D (QQ泡泡龙 3D)
 * Deterministic 120Hz Substepped Offset Hex-Grid Physics, Cluster BFS Pop,
 * Ceiling-Detachment Avalanche Drop, Slow-Mo, Camera Shake, Crew Reactions,
 * Special Bubbles & 20-Stage (8 Handcrafted + 12 Seeded Template) + Endless Simulation Engine.
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

// Chamber world bounds (Fun Overhaul: ~10.3 rows of air):
// Even-parity row (8 cols) centers sit at x = -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5
// Odd-parity row (7 cols) centers sit at x = -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0
export const LEFT_WALL_X = -4.0;
export const RIGHT_WALL_X = 4.0;
export const BASE_CEILING_Y = 6.0;
export const DANGER_LINE_Y = -2.9;
export const LAUNCHER_X = 0.0;
export const LAUNCHER_Y = -3.6;
export const CAULDRON_Y = -4.85;
export const CAULDRON_SCALE = 0.8;
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

export const STAGE_TEMPLATES = Object.freeze([
  'stripes',
  'checker',
  'double-arch',
  'pyramid',
  'egg-nest',
  'zigzag',
]);

export const CAULDRON_SPECS = Object.freeze([
  { index: 0, points: 50, x: -3.1, width: 1.45, label: '50' },
  { index: 1, points: 100, x: -1.55, width: 1.45, label: '100' },
  { index: 2, points: 250, x: 0.0, width: 1.55, label: '250' },
  { index: 3, points: 100, x: 1.55, width: 1.45, label: '100' },
  { index: 4, points: 50, x: 3.1, width: 1.45, label: '50' },
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

export function computeParShotsForRows(rows) {
  let bubbles = 0;
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    for (const cell of r) {
      if (cell !== null && cell !== undefined && cell !== false && cell !== '') {
        bubbles += 1;
      }
    }
  }
  return Math.ceil(bubbles / 3.2) + 2;
}

/**
 * Deterministic Seeded Stage Template Generator for Stages 9-20.
 * Templates: 'stripes' | 'checker' | 'double-arch' | 'pyramid' | 'egg-nest' | 'zigzag'
 * Guarantees:
 * - Every column of row 0 (c = 0..7) is filled.
 * - Horizontal 2-bubble pairs staggered by +2 colors per row so pairs never merge vertically
 *   and no single first-shot cluster pop can detach > 35% of the board.
 * - Egg-rescue stages place eggs at row >= 3 enclosed by >= 5 non-egg neighbors in >= 2 distinct colors.
 */
export function generateStageFromTemplate(spec) {
  const {
    id,
    name,
    subtitle,
    template,
    numRows = 5,
    numColors = 5,
    eggCount = 0,
    shotsPerDrop = 9,
    seed = 20261000 + id * 137,
  } = spec;

  const rng = createMulberry32(seed);
  const palette = BUBBLE_COLORS.slice(0, Math.max(3, Math.min(BUBBLE_COLORS.length, numColors)));

  // Deterministically rotate palette order using seed
  const offset = Math.floor(rng() * palette.length);
  const colors = palette.map((_, idx) => palette[(idx + offset) % palette.length]);
  const pickColor = (idx) => colors[((idx % colors.length) + colors.length) % colors.length];

  const effectiveRows = Math.max(5, Math.min(6, numRows));
  const rows = [];
  for (let r = 0; r < effectiveRows; r++) {
    const maxCols = colsForRow(r, 0);
    rows.push(Array(maxCols).fill(null));
  }

  for (let r = 0; r < effectiveRows; r++) {
    const maxCols = colsForRow(r, 0);
    for (let c = 0; c < maxCols; c++) {
      // Row 0 is ALWAYS 100% filled across all 8 columns (c = 0..7), and rows 0..3 are solid
      let include = true;
      if (r >= 4) {
        if (template === 'stripes') {
          include =
            effectiveRows === 5
              ? c === 3 || c === 4
              : r === 4
                ? c === 2 || c === 5
                : c === 2 || c === 4;
        } else if (template === 'checker') {
          include = r === 4 ? (c === 1 || c === 2 || c === 5) : (c === 2 || c === 3);
        } else if (template === 'double-arch') {
          include = r === 4 ? (c <= 1 || c >= maxCols - 2) : (c === 0 || c === maxCols - 1);
        } else if (template === 'pyramid') {
          const trim = r === 4 ? 2 : 3;
          include = c >= trim && c < maxCols - trim;
        } else if (template === 'egg-nest') {
          include =
            eggCount === 1
              ? c >= 1 && c <= maxCols - 2
              : r === 4
                ? true
                : c >= 1 && c <= maxCols - 2;
        } else if (template === 'zigzag') {
          include = r === 4 ? (c >= 1 && c <= 3) : (c >= 3 && c <= 4);
        }
      }
      if (!include) continue;

      const pairIdx = Math.min(3, Math.floor(c / 2));
      let colorStep;
      if (eggCount >= 2) {
        colorStep = pairIdx + r * 2;
      } else if (eggCount === 1) {
        const band = r === 0 ? 0 : r === 1 ? 1 : r <= 3 ? 2 : 3;
        colorStep = pairIdx + band * 2;
      } else if (template === 'stripes' && effectiveRows === 5) {
        const band = r === 0 ? 0 : r === 1 ? (pairIdx === 1 ? 0 : 1) : r <= 3 ? 2 : 3;
        colorStep = pairIdx + band * 2;
      } else {
        // Inner ceiling pairs (pairIdx 1, 2) merge across r=0..1 while outer pillars (0, 3) split,
        // and rows 2..3 and rows 4..5 form cohesive 2-row clusters!
        const band =
          r === 0
            ? 0
            : r === 1
              ? pairIdx === 1 || pairIdx === 2
                ? 0
                : 1
              : r <= 3
                ? 2
                : 3;
        colorStep = pairIdx + band * 2;
        if (template === 'double-arch' || template === 'zigzag') {
          colorStep = (3 - pairIdx) + band * 2;
        }
      }
      rows[r][c] = pickColor(colorStep);
    }
  }

  // Place 1-3 eggs on rescue stages at row >= 3 enclosed by >= 5 non-egg neighbors in >= 2 distinct colors
  if (eggCount > 0) {
    const eggRow = 3; // Strictly row >= 3 (odd row with 7 cols: 0..6)
    const eggCols = eggCount === 1 ? [3] : eggCount === 2 ? [1, 5] : [1, 3, 5];
    eggCols.slice(0, eggCount).forEach((ec, idx) => {
      // Ensure all 6 hex neighbors around (eggRow, ec) in rows 2, 3, 4 exist and are non-egg in >= 2 colors
      for (const [nr, nc] of getHexNeighbors(eggRow, ec, effectiveRows, 0)) {
        if (!rows[nr][nc]) {
          rows[nr][nc] = pickColor(Math.min(3, Math.floor(nc / 2)) + nr * 2 + idx);
        }
      }
      rows[eggRow][ec] = { color: pickColor(idx + 1), isEgg: true };
    });
  }

  const parShots = computeParShotsForRows(rows);
  return Object.freeze({
    id,
    name,
    subtitle,
    template,
    objective: eggCount > 0 ? 'egg_rescue' : 'clear_all',
    colors: Object.freeze(colors.slice()),
    shotsPerDrop,
    parShots,
    rows: Object.freeze(rows.map((r) => Object.freeze(r.slice()))),
  });
}

/**
 * 20 Progressive Stages:
 * - Color ramp:
 *   Stages 1–3: 3 colors (red, yellow, blue)
 *   Stages 4–8: 4 colors (red, yellow, blue, green)
 *   Stages 9–14: 5 colors (red, yellow, blue, green, purple)
 *   Stages 15–20: 6 colors (red, yellow, blue, green, purple, orange)
 * - Egg-rescue stages place eggs at row >= 3 enclosed by >= 5 non-egg neighbors in >= 2 colors.
 */
const HANDMADE_STAGES_1_TO_8 = [
  {
    id: 1,
    name: '第一关：彩虹初遇',
    subtitle: '消除顶层同色泡泡，触发大片掉落加分！',
    template: 'handmade',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue'],
    shotsPerDrop: 9,
    rows: [
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'red', 'red'],
      ['blue', 'blue', 'red', 'red', 'yellow', 'yellow', 'blue'],
      ['yellow', 'yellow', 'blue', 'blue', 'red', 'red', 'yellow', 'yellow'],
      ['red', 'red', null, 'yellow', 'yellow', 'blue', 'blue'],
    ],
  },
  {
    id: 2,
    name: '第二关：双翼回旋',
    subtitle: '利用左右水晶墙壁反弹，击穿顶层支点！',
    template: 'handmade',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue'],
    shotsPerDrop: 9,
    rows: [
      ['blue', 'blue', 'red', 'red', 'yellow', 'yellow', 'blue', 'blue'],
      ['yellow', 'yellow', 'blue', 'blue', 'red', 'red', 'yellow'],
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'red', 'red'],
      ['blue', 'blue', null, 'red', 'red', 'yellow', 'yellow'],
    ],
  },
  {
    id: 3,
    name: '第三关：萌宠龙蛋营救 I',
    subtitle: '消除周围守护泡泡，解救深处星星龙蛋！',
    template: 'handmade',
    objective: 'egg_rescue',
    colors: ['red', 'yellow', 'blue'],
    shotsPerDrop: 9,
    rows: [
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'red', 'red'],
      ['blue', 'blue', 'red', 'red', 'yellow', 'yellow', 'blue'],
      ['yellow', 'red', 'blue', 'yellow', 'red', 'blue', 'yellow', 'red'],
      ['blue', { color: 'green', isEgg: true }, 'yellow', { color: 'green', isEgg: true }, 'red', { color: 'green', isEgg: true }, 'blue'],
      ['red', 'yellow', 'blue', 'red', 'yellow', 'blue', 'red', 'yellow'],
    ],
  },
  {
    id: 4,
    name: '第四关：水晶双拱门',
    subtitle: '四色彩泡开启！击碎双拱同色支点引发雪崩！',
    template: 'handmade',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue', 'green'],
    shotsPerDrop: 9,
    rows: [
      ['green', 'green', 'red', 'red', 'blue', 'blue', 'yellow', 'yellow'],
      ['blue', 'blue', 'green', 'green', 'yellow', 'yellow', 'red'],
      ['yellow', 'yellow', 'red', 'red', 'green', 'green', 'blue', 'blue'],
      ['red', 'red', 'blue', null, 'blue', 'yellow', 'yellow'],
      ['green', 'green', null, null, null, null, 'red', 'red'],
    ],
  },
  {
    id: 5,
    name: '第五关：齿轮蜂巢阵',
    subtitle: '巧用换球与连击必杀球，横扫四彩蜂巢！',
    template: 'handmade',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue', 'green'],
    shotsPerDrop: 9,
    rows: [
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'green', 'green'],
      ['blue', 'blue', 'green', 'green', 'red', 'red', 'yellow'],
      ['yellow', 'yellow', 'red', 'red', 'green', 'green', 'blue', 'blue'],
      [null, 'green', 'green', 'blue', 'blue', 'red', null],
      [null, null, 'yellow', 'yellow', 'green', 'green', null, null],
    ],
  },
  {
    id: 6,
    name: '第六关：双星龙蛋大营救',
    subtitle: '双巢深锁两颗星星龙蛋，击破外围一举营救！',
    template: 'handmade',
    objective: 'egg_rescue',
    colors: ['red', 'yellow', 'blue', 'green'],
    shotsPerDrop: 9,
    rows: [
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'green', 'green'],
      ['blue', 'blue', 'green', 'green', 'red', 'red', 'yellow'],
      ['yellow', 'yellow', 'red', 'red', 'green', 'green', 'blue', 'blue'],
      ['green', { color: 'red', isEgg: true }, 'blue', 'blue', 'yellow', { color: 'yellow', isEgg: true }, 'red'],
      [null, 'red', 'red', 'green', 'green', 'blue', 'blue', null],
    ],
  },
  {
    id: 7,
    name: '第七关：深海珊瑚旋塔',
    subtitle: '珊瑚彩泡层层环绕，精准反弹直击核心！',
    template: 'handmade',
    objective: 'clear_all',
    colors: ['red', 'yellow', 'blue', 'green'],
    shotsPerDrop: 9,
    rows: [
      ['blue', 'blue', 'green', 'green', 'red', 'red', 'yellow', 'yellow'],
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'green'],
      ['green', 'green', 'blue', 'blue', 'yellow', 'yellow', 'red', 'red'],
      [null, 'yellow', 'yellow', 'red', 'red', 'green', null],
      [null, null, 'green', 'green', 'yellow', 'yellow', null, null],
    ],
  },
  {
    id: 8,
    name: '第八关：泡泡龙王座前哨',
    subtitle: '三龙蛋前哨战！破开蜂巢护盾创造满星奇迹！',
    template: 'handmade',
    objective: 'egg_rescue',
    colors: ['red', 'yellow', 'blue', 'green'],
    shotsPerDrop: 9,
    rows: [
      ['red', 'red', 'yellow', 'yellow', 'blue', 'blue', 'green', 'green'],
      ['blue', 'blue', 'green', 'green', 'red', 'red', 'yellow'],
      ['yellow', 'yellow', 'red', 'red', 'green', 'green', 'blue', 'blue'],
      ['green', { color: 'green', isEgg: true }, 'blue', { color: 'blue', isEgg: true }, 'yellow', { color: 'yellow', isEgg: true }, 'red'],
      [null, 'red', 'red', 'green', 'green', 'blue', 'blue', null],
    ],
  },
].map((st) =>
  Object.freeze({
    ...st,
    parShots: computeParShotsForRows(st.rows),
  })
);

const TEMPLATED_STAGE_SPECS_9_TO_20 = [
  {
    id: 9,
    name: '第九关：极光条纹阵',
    subtitle: '五色彩泡登场！击穿条纹泡泡触发极光连消！',
    template: 'stripes',
    numRows: 5,
    numColors: 5,
    eggCount: 0,
    shotsPerDrop: 9,
  },
  {
    id: 10,
    name: '第十关：幻彩棋盘格',
    subtitle: '瞄准双格棋盘交界，连环爆破打开通道！',
    template: 'checker',
    numRows: 5,
    numColors: 5,
    eggCount: 0,
    shotsPerDrop: 9,
  },
  {
    id: 11,
    name: '第十一关：翡翠龙巢营救',
    subtitle: '五彩龙巢层层守护，破开护盾解救星星龙蛋！',
    template: 'egg-nest',
    numRows: 5,
    numColors: 5,
    eggCount: 1,
    shotsPerDrop: 9,
  },
  {
    id: 12,
    name: '第十二关：天穹双拱桥',
    subtitle: '压顶节奏加快！反弹直击双拱引发连环消除！',
    template: 'double-arch',
    numRows: 5,
    numColors: 5,
    eggCount: 0,
    shotsPerDrop: 7,
  },
  {
    id: 13,
    name: '第十三关：黄金金字塔',
    subtitle: '层层倒金字塔悬垂，从两侧切入一举击溃！',
    template: 'pyramid',
    numRows: 6,
    numColors: 5,
    eggCount: 0,
    shotsPerDrop: 7,
  },
  {
    id: 14,
    name: '第十四关：闪电之字峡谷',
    subtitle: '沿着之字形水晶水道反弹，横扫五彩泡泡！',
    template: 'zigzag',
    numRows: 6,
    numColors: 5,
    eggCount: 0,
    shotsPerDrop: 7,
  },
  {
    id: 15,
    name: '第十五关：双子龙巢大营救',
    subtitle: '六色彩泡齐聚！破开双子龙巢解救两颗星龙蛋！',
    template: 'egg-nest',
    numRows: 6,
    numColors: 6,
    eggCount: 2,
    shotsPerDrop: 7,
  },
  {
    id: 16,
    name: '第十六关：六彩霓虹竖琴',
    subtitle: '六色霓虹斜纹垂落，精准配对满盆加分！',
    template: 'stripes',
    numRows: 6,
    numColors: 6,
    eggCount: 0,
    shotsPerDrop: 7,
  },
  {
    id: 17,
    name: '第十七关：星耀魔方阵',
    subtitle: '六色棋盘魔方迷宫，连击蓄满必杀破局！',
    template: 'checker',
    numRows: 6,
    numColors: 6,
    eggCount: 0,
    shotsPerDrop: 7,
  },
  {
    id: 18,
    name: '第十八关：深海双龙门',
    subtitle: '六色双拱门高悬，精准壁球直取拱门核心！',
    template: 'double-arch',
    numRows: 6,
    numColors: 6,
    eggCount: 0,
    shotsPerDrop: 7,
  },
  {
    id: 19,
    name: '第十九关：九重雷霆云梯',
    subtitle: '金字塔云梯层层逼近，高速连消争夺PERFECT三星！',
    template: 'pyramid',
    numRows: 6,
    numColors: 6,
    eggCount: 0,
    shotsPerDrop: 7,
  },
  {
    id: 20,
    name: '第二十关：泡泡龙皇冠终局',
    subtitle: '终极六色三龙蛋圣殿！解救全部龙蛋加冕泡泡龙王！',
    template: 'egg-nest',
    numRows: 6,
    numColors: 6,
    eggCount: 3,
    shotsPerDrop: 7,
  },
];

export const STAGE_DEFS = Object.freeze([
  ...HANDMADE_STAGES_1_TO_8,
  ...TEMPLATED_STAGE_SPECS_9_TO_20.map((spec) => generateStageFromTemplate(spec)),
]);

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
    // Endless mode feeds a row every 5 shots by default; stage mode uses stageDef.shotsPerDrop
    this.shotsPerCeilingDrop =
      Number(opts.shotsPerCeilingDrop) || (this.modeId === 'endless' ? 5 : this.stageDef.shotsPerDrop);
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

    this.timeScale = 1.0;
    this.slowMoTimer = 0.0;
    this.slowMoCount = 0;
    this.isPerfectClear = false;

    this.cameraShake = {
      intensity: 0.0,
      baseIntensity: 0.0,
      timer: 0.0,
      maxTimer: 0.0,
    };

    this.crew = {
      dragonState: 'idle', // 'idle' | 'jump' | 'cheer' | 'sad'
      dragonTimer: 0.0,
      dragonJumps: 0,
      penguinState: 'idle', // 'idle' | 'cheer' | 'sad'
      penguinTimer: 0.0,
      cheers: 0,
    };

    this.status = 'playing'; // 'playing' | 'cleared' | 'lost'
    this.podiumStars = 0;
    this.aimAngle = clampAimAngle(opts.aimAngle ?? 0);

    this.cauldrons = CAULDRON_SPECS.map((spec) => ({
      index: spec.index,
      points: spec.points,
      x: spec.x,
      width: spec.width,
      scale: CAULDRON_SCALE,
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

    let initialRows;
    if (opts.customGrid !== undefined) {
      initialRows = opts.customGrid;
    } else if (this.modeId === 'endless') {
      initialRows = this._generateEndlessInitialRows(6);
    } else {
      initialRows = this.stageDef.rows;
    }
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
    this.popRings = [];
    this.floatingTexts = [];
    this.lastShotResult = null;
    this._nextFallingId = 1;
    this._nextFloatingTextId = 1;

    this.currentBubble = this._drawNextLauncherBubble();
    this.nextBubble = this._drawNextLauncherBubble();
    this._ensureLauncherColorsMatchBoard();

    this.trajectory = computeTrajectoryPreview(this.aimAngle, this.grid, this.ceilingY, this.rowParityOffset);
    this._emitEvent('match_start', { modeId: this.modeId, stageId: this.stageId });
    return this.getState();
  }

  _generateEndlessInitialRows(numRows = 6) {
    const rows = [];
    const palette = BUBBLE_COLORS.slice(0, 5);
    for (let r = 0; r < numRows; r++) {
      const cols = colsForRow(r, 0);
      const rowArr = [];
      let c = 0;
      while (c < cols) {
        const color = palette[Math.floor(this.rng() * palette.length)];
        rowArr.push(color);
        c += 1;
        if (c < cols && this.rng() < 0.65) {
          rowArr.push(color);
          c += 1;
        }
      }
      rows.push(rowArr);
    }
    return rows;
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

  /**
   * Finds colors on the exposed lower/reachable surface of the board (subset of getRemainingBoardColors).
   * Prioritizes colors that have exposed clusters so shots are rewarding and never soft-locked.
   */
  _getExposedFrontierColors() {
    const pairColors = new Set();
    const exposedColors = new Set();
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const cell = this.grid[r][c];
        if (!cell || cell.isEgg || !BUBBLE_COLORS.includes(cell.color)) continue;
        const neighbors = getHexNeighbors(r, c, this.grid.length, this.rowParityOffset);
        let hasLowerOpen = false;
        let hasSameColorNeighbor = false;
        for (const [nr, nc] of neighbors) {
          const nCell = this.grid[nr][nc];
          if (nCell === null && nr >= r) {
            hasLowerOpen = true;
          } else if (nCell && nCell.color === cell.color) {
            hasSameColorNeighbor = true;
          }
        }
        if (hasLowerOpen) {
          exposedColors.add(cell.color);
          if (hasSameColorNeighbor) {
            pairColors.add(cell.color);
          }
        }
      }
    }
    if (pairColors.size > 0) return Array.from(pairColors);
    if (exposedColors.size > 0) return Array.from(exposedColors);
    return this.getRemainingBoardColors();
  }

  _pickRemainingOrStageColor() {
    const frontier = this._getExposedFrontierColors();
    if (frontier.length > 0) {
      const idx = Math.floor(this.rng() * frontier.length);
      return frontier[idx];
    }
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
    const frontier = this._getExposedFrontierColors();
    const pool = frontier.length > 0 ? frontier : remaining;

    for (const slotKey of ['currentBubble', 'nextBubble']) {
      const b = this[slotKey];
      if (!b || b.special || b.fromForcedQueue) continue;
      if (!remaining.includes(b.color)) {
        b.color = pool[Math.floor(this.rng() * pool.length)];
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

    // Update slow-mo timer (0.4s slow-mo at 0.3x timeScale on >=4 dropped bubbles)
    if (this.slowMoTimer > 0) {
      this.timeScale = 0.3;
      this.slowMoTimer = Math.max(0, Number((this.slowMoTimer - FIXED_DT * 0.5).toFixed(6)));
      if (this.slowMoTimer <= 0) {
        this.timeScale = 1.0;
      }
    } else {
      this.timeScale = 1.0;
    }

    const effDt = FIXED_DT * this.timeScale;

    // Update camera shake decay
    if (this.cameraShake.timer > 0) {
      this.cameraShake.timer = Math.max(0, Number((this.cameraShake.timer - FIXED_DT * 0.6).toFixed(6)));
      const ratio = this.cameraShake.maxTimer > 0 ? this.cameraShake.timer / this.cameraShake.maxTimer : 0;
      this.cameraShake.intensity = Number((this.cameraShake.baseIntensity * ratio).toFixed(4));
    } else {
      this.cameraShake.intensity = 0;
    }

    // Update crew reaction timers
    if (this.status === 'lost') {
      this.crew.dragonState = 'sad';
      this.crew.penguinState = 'sad';
    } else {
      if (this.crew.dragonTimer > 0) {
        this.crew.dragonTimer = Math.max(0, Number((this.crew.dragonTimer - FIXED_DT).toFixed(4)));
        if (this.crew.dragonTimer <= 0 && this.crew.dragonState !== 'sad') {
          this.crew.dragonState = 'idle';
        }
      }
      if (this.crew.penguinTimer > 0) {
        this.crew.penguinTimer = Math.max(0, Number((this.crew.penguinTimer - FIXED_DT).toFixed(4)));
        if (this.crew.penguinTimer <= 0 && this.crew.penguinState !== 'sad') {
          this.crew.penguinState = 'idle';
        }
      }
    }

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
    this._stepFallingBubbles(FIXED_DT * Math.max(0.68, this.timeScale));

    // 3. Step visual particles (burst, coin fountain, sparkles)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * effDt;
      p.y += p.vy * effDt;
      p.z += (p.vz || 0) * effDt;
      p.vy -= (p.gravity ?? 14.0) * effDt;
      p.life -= effDt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 4. Step expanding pop rings
    for (let i = this.popRings.length - 1; i >= 0; i--) {
      const ring = this.popRings[i];
      ring.life -= effDt;
      const progress = 1 - Math.max(0, ring.life / ring.maxLife);
      ring.radius = 0.25 + (ring.maxRadius - 0.25) * progress;
      if (ring.life <= 0) {
        this.popRings.splice(i, 1);
      }
    }

    // 5. Step floating texts ("雪崩 ×N!", "连击 ×N!", "PERFECT!", "龙蛋获救!")
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * effDt;
      ft.life -= effDt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  _spawnFloatingText(x, y, text, color = '#fde047', kind = 'info') {
    // Replace any existing floating text of the same kind so same-kind callouts never collide
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      if (this.floatingTexts[i].kind === kind) {
        this.floatingTexts.splice(i, 1);
      }
    }
    // Stack any remaining floating texts cleanly above the new one if nearby
    for (const ft of this.floatingTexts) {
      if (Math.abs(ft.x - x) < 1.8 && Math.abs(ft.y - y) < 0.85) {
        ft.y = Math.min(BASE_CEILING_Y - 0.25, Math.max(ft.y, y + 0.85));
      }
    }
    this.floatingTexts.push({
      id: this._nextFloatingTextId++,
      x,
      y,
      text: String(text),
      color,
      kind,
      vy: 0.85,
      life: 1.35,
      maxLife: 1.35,
    });
    if (this.floatingTexts.length > 16) {
      this.floatingTexts.shift();
    }
  }

  _spawnPopRing(x, y, color, maxRadius = 1.45) {
    this.popRings.push({
      x,
      y,
      color: color || 'yellow',
      radius: 0.25,
      maxRadius,
      life: 0.48,
      maxLife: 0.48,
    });
  }

  _spawnCoinFountain(x, y, count = 10) {
    for (let i = 0; i < count; i++) {
      const spread = ((i / Math.max(1, count - 1)) - 0.5) * 3.4;
      const vy = 5.4 + (i % 4) * 1.15;
      this.particles.push({
        kind: 'coin',
        x: x + spread * 0.08,
        y,
        z: 0.38,
        vx: spread,
        vy,
        vz: ((i % 3) - 1) * 1.2,
        gravity: 16.0,
        color: i % 2 === 0 ? 'yellow' : 'orange',
        life: 0.62,
        maxLife: 0.62,
      });
    }
  }

  _spawnSparkleParticles(x, y, count = 14) {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const spd = 2.6 + (i % 3) * 1.3;
      this.particles.push({
        kind: 'sparkle',
        x,
        y,
        z: 0.35,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd + 1.8,
        vz: ((i % 2) - 0.5) * 2.2,
        gravity: 9.0,
        color: i % 2 === 0 ? 'yellow' : 'green',
        life: 0.65,
        maxLife: 0.65,
      });
    }
  }

  _awardAndSpawnFallingCells(droppedCells) {
    let cauldronPoints = 0;
    let eggsInDrop = 0;
    for (let idx = 0; idx < droppedCells.length; idx++) {
      const dc = droppedCells[idx];
      if (dc.isEgg) {
        this.eggsRescued += 1;
        eggsInDrop += 1;
        this._spawnSparkleParticles(dc.x, dc.y, 14);
        this._spawnFloatingText(dc.x, dc.y + 0.35, '龙蛋获救!', '#fff1a8', 'egg');
      }
      const cauldron = pickCauldronForX(dc.x);
      const pts = cauldron.points;
      cauldronPoints += pts;
      this.cauldrons[cauldron.index].hits += 1;
      this.cauldrons[cauldron.index].lastHitTick = this.tick;

      const targetX = cauldron.x + ((idx % 3) - 1) * 0.18;
      const flightTime = 0.36 + (idx % 4) * 0.04;
      const vx = (targetX - dc.x) / flightTime;
      const vy = 0.6 + (idx % 3) * 0.35;

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
    if (eggsInDrop > 0) {
      this._emitEvent('egg_rescue', { count: eggsInDrop, totalRescued: this.eggsRescued });
    }
    if (droppedCells.length > 0) {
      this.totalDropped += droppedCells.length;
      this.totalCauldronCatches += droppedCells.length;
      this.cauldronScore += cauldronPoints;
      this.score += cauldronPoints;
      const midDrop = droppedCells[Math.floor(droppedCells.length / 2)];
      const firstCauldron = pickCauldronForX(midDrop ? midDrop.x : 0);
      this._spawnCoinFountain(firstCauldron.x, CAULDRON_Y + 0.32, 8);
      if (this.status !== 'lost') {
        this.crew.dragonState = 'jump';
        this.crew.dragonTimer = Math.max(this.crew.dragonTimer, 0.7);
        this.crew.dragonJumps += 1;
      }
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
              let remNeighbors = 0;
              for (const [enr, enc] of getHexNeighbors(nr, nc, this.grid.length, this.rowParityOffset)) {
                if (this.grid[enr][enc] && !poppedMap.has(`${enr},${enc}`)) {
                  remNeighbors += 1;
                }
              }
              const maxRem = this.stageId <= 8 ? 1 : 2;
              if (remNeighbors <= maxRem) {
                markPopped(nr, nc);
              }
            }
          }
        }
      }
    }

    // Remove popped bubbles from grid & spawn 14 burst particles + expanding ring per popped bubble
    const poppedCells = Array.from(poppedMap.values());
    const popX =
      poppedCells.length > 0
        ? poppedCells.reduce((acc, c) => acc + c.x, 0) / poppedCells.length
        : sx;
    const popY =
      poppedCells.length > 0
        ? poppedCells.reduce((acc, c) => acc + c.y, 0) / poppedCells.length
        : sy;
    let eggsPoppedDirectly = 0;
    for (const cell of poppedCells) {
      if (cell.isEgg) {
        this.eggsRescued += 1;
        eggsPoppedDirectly += 1;
        this._spawnSparkleParticles(cell.x, cell.y, 14);
        this._spawnFloatingText(cell.x, cell.y + 0.35, '龙蛋获救!', '#fff1a8', 'egg');
      }
      this.grid[cell.row][cell.col] = null;
      this._spawnBurstParticles(cell.x, cell.y, cell.color, 14);
      this._spawnPopRing(cell.x, cell.y, cell.color, poppedCells.length >= 6 ? 1.85 : 1.35);
    }
    if (eggsPoppedDirectly > 0) {
      this._emitEvent('egg_rescue', { count: eggsPoppedDirectly, totalRescued: this.eggsRescued });
    }

    // Run Ceiling-Anchor BFS from row === 0 to detach all floating islands!
    let droppedCells = [];
    if (poppedCells.length > 0) {
      droppedCells = findFloatingDisconnectedCells(this.grid, this.rowParityOffset);
      for (const dCell of droppedCells) {
        this.grid[dCell.row][dCell.col] = null;
      }
    }

    // Scoring, Camera Shake, Slow-Mo, Combo Cheer & Cauldron Avalanche Calculation
    let popScore = 0;
    let cauldronPoints = 0;
    let shakeTriggered = 0;
    let slowMoTriggered = false;

    if (poppedCells.length > 0) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.totalPopped += poppedCells.length;
      const comboMult = 1 + Math.min(4, (this.combo - 1) * 0.25);
      popScore = Math.round(poppedCells.length * 30 * comboMult);
      this.score += popScore;

      // Camera shake: 0.15 base, x1.5 (0.225) for >= 6 popped
      shakeTriggered = poppedCells.length >= 6 ? Number((0.15 * 1.5).toFixed(4)) : 0.15;
      this.cameraShake = {
        intensity: shakeTriggered,
        baseIntensity: shakeTriggered,
        timer: 0.45,
        maxTimer: 0.45,
      };

      // Combo >= 2 -> crew cheers (penguin + dragon bounce/arm wave) + "连击 ×N!" floating text at pop location
      if (this.combo >= 2) {
        this.crew.dragonState = 'cheer';
        this.crew.dragonTimer = 0.95;
        this.crew.penguinState = 'cheer';
        this.crew.penguinTimer = 0.95;
        this.crew.cheers += 1;
        this._spawnFloatingText(popX, popY, `连击 ×${this.combo}!`, '#38bdf8', 'combo');
        this._emitEvent('combo_cheer', { combo: this.combo, x: popX, y: popY });
      }

      cauldronPoints = this._awardAndSpawnFallingCells(droppedCells);

      // >= 4 dropped bubbles -> 0.4s slow-mo (sim timeScale 0.3) + "雪崩 ×N!" floating text at pop location
      if (droppedCells.length >= 4) {
        this.slowMoTimer = 0.4;
        this.timeScale = 0.3;
        this.slowMoCount += 1;
        slowMoTriggered = true;
        this._spawnFloatingText(popX, popY, `雪崩 ×${droppedCells.length}!`, '#fde047', 'avalanche');
        this._emitEvent('avalanche', {
          droppedCount: droppedCells.length,
          cauldronPoints,
          timeScale: 0.3,
          duration: 0.4,
        });
      }

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
        cameraShake: shakeTriggered,
        slowMoTriggered,
      });
    } else {
      this.combo = 0;
      this._emitEvent('bubble_snap', { row: sr, col: sc, color: proj.color });
    }

    // Check stage clear / ceiling drop / endless row feed if still playing
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
        if (droppedCells.length >= 4 && !slowMoTriggered) {
          this.slowMoTimer = 0.4;
          this.timeScale = 0.3;
          this.slowMoCount += 1;
          slowMoTriggered = true;
          this._spawnFloatingText(popX, popY, `雪崩 ×${droppedCells.length}!`, '#fde047', 'avalanche');
          this._emitEvent('avalanche', {
            droppedCount: droppedCells.length,
            cauldronPoints,
            timeScale: 0.3,
            duration: 0.4,
          });
        }
      }
      // Ensure board & falling queue are completely empty on stage clear so no leftover rows render under the clear card
      this.fallingBubbles = [];
      this.status = 'cleared';
      this.podiumStars = this._computeStageStars();
      this.isPerfectClear = this.shotsFired <= this.stageDef.parShots;
      this.score += this.podiumStars * 200;
      this.crew.dragonState = 'cheer';
      this.crew.dragonTimer = 2.0;
      this.crew.penguinState = 'cheer';
      this.crew.penguinTimer = 2.0;
      if (this.isPerfectClear) {
        this._spawnFloatingText(0, 2.1, 'PERFECT!', '#fde047', 'perfect');
      }
      this._emitEvent('stage_clear', {
        stageId: this.stageId,
        stars: this.podiumStars,
        score: this.score,
        perfect: this.isPerfectClear,
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
      particlesPerPop: poppedCells.length > 0 ? 14 : 0,
      particlesSpawned: poppedCells.length * 14,
      popRingsSpawned: poppedCells.length,
      cameraShake: shakeTriggered,
      droppedCount: droppedCells.length,
      droppedCells,
      slowMoTriggered,
      slowMoDuration: slowMoTriggered ? 0.4 : 0,
      timeScale: this.timeScale,
      cauldronPoints,
      scoreGained: popScore + cauldronPoints,
      specialTriggered,
      wallBounces: proj.bounces || 0,
      stageCleared: this.status === 'cleared',
      perfectClear: this.isPerfectClear,
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
          this.crew.dragonState = 'sad';
          this.crew.penguinState = 'sad';
          this.crew.dragonTimer = 999;
          this.crew.penguinTimer = 999;
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

  _stepFallingBubbles(dt = FIXED_DT) {
    for (let i = this.fallingBubbles.length - 1; i >= 0; i--) {
      const fb = this.fallingBubbles[i];
      fb.x += fb.vx * dt;
      fb.y += fb.vy * dt;
      fb.vy -= 42.0 * dt;

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
        // Cauldron catch -> coin fountain particles + dragon jumps!
        this._spawnCoinFountain(fb.x, CAULDRON_Y + 0.28, 8);
        if (this.status !== 'lost') {
          this.crew.dragonState = 'jump';
          this.crew.dragonTimer = Math.max(this.crew.dragonTimer, 0.65);
          this.crew.dragonJumps += 1;
        }
        this._emitEvent('cauldron_catch', {
          cauldronIndex: cIdx,
          points: fb.points,
          x: fb.x,
        });
        this.fallingBubbles.splice(i, 1);
      }
    }
  }

  _spawnBurstParticles(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (this.tick % 7) * 0.13;
      const spd = 2.4 + (i % 4) * 1.15;
      this.particles.push({
        kind: 'burst',
        x,
        y,
        z: 0.22,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd + 1.6,
        vz: ((i % 3) - 1) * 1.8,
        gravity: 14.0,
        color,
        life: 0.52,
        maxLife: 0.52,
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
      stageCount: STAGE_DEFS.length,
      stageName: this.stageDef.name,
      stageTemplate: this.stageDef.template || 'handmade',
      stageObjective: this.stageDef.objective,
      parShots: this.stageDef.parShots,
      shotsPerDrop: this.shotsPerCeilingDrop,
      status: this.status,
      podiumStars: this.podiumStars,
      isPerfectClear: this.isPerfectClear,
      tick: this.tick,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(4)),
      timeScale: this.timeScale,
      slowMoTimer: this.slowMoTimer,
      slowMoCount: this.slowMoCount,
      cameraShake: { ...this.cameraShake },
      crew: { ...this.crew },
      score: this.score,
      cauldronScore: this.cauldronScore,
      combo: this.combo,
      maxCombo: this.maxCombo,
      shotsFired: this.shotsFired,
      shotsUntilCeilingDrop: Math.max(0, this.shotsPerCeilingDrop - this.shotsSinceDrop),
      ceilingDropSteps: this.ceilingDropSteps,
      rowParityOffset: this.rowParityOffset,
      ceilingY: this.ceilingY,
      baseCeilingY: BASE_CEILING_Y,
      dangerLineY: DANGER_LINE_Y,
      launcherX: LAUNCHER_X,
      launcherY: LAUNCHER_Y,
      cauldronY: CAULDRON_Y,
      cauldronScale: CAULDRON_SCALE,
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
      particles: this.particles.map((p) => ({ ...p })),
      popRings: this.popRings.map((r) => ({ ...r })),
      floatingTexts: this.floatingTexts.map((ft) => ({ ...ft })),
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
