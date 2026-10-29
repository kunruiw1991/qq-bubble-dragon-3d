/**
 * QQ Bubble Dragon Shooter 3D (QQ泡泡龙 3D)
 * Main Application Controller, Touch/Pointer 1:1 Drag-to-Aim + Release-to-Shoot,
 * Keyboard Controls, Fixed-Step 60Hz Loop, 20-Stage Unlock & Hall Progress Persistence,
 * Floating Callout FX, HUD Sync & Frozen window.__BUBBLE_DRAGON__ Test Seam.
 */

import {
  BubbleDragonSim,
  STAGE_DEFS,
  FIXED_DT,
  LAUNCHER_X,
  LAUNCHER_Y,
  LEFT_WALL_X,
  RIGHT_WALL_X,
  BASE_CEILING_Y,
  CAULDRON_Y,
  clampAimAngle,
  MAX_AIM_RAD,
} from './sim.js';
import { BubbleDragonAudio } from './audio.js';
import { BubbleDragonRenderer3D } from './renderer3d.js';

const PROGRESS_STORAGE_KEY = 'qq_bubble_progress';
const HALL_STORAGE_KEY = 'qq_hall_progress';

const canvas = document.getElementById('game-canvas');
const hudStageLabel = document.getElementById('hud-stage-label');
const hudScoreLabel = document.getElementById('hud-score-label');
const hudComboLabel = document.getElementById('hud-combo-label');
const hudRemainingLabel = document.getElementById('hud-remaining-label');
const floatingFxLayer = document.getElementById('floating-fx-layer');

const btnMenu = document.getElementById('hud-btn-menu');
const btnAudio = document.getElementById('hud-btn-audio');
const hudAudioIcon = document.getElementById('hud-audio-icon');
const btnSwap = document.getElementById('hud-btn-swap');
const hudSwapLabel = document.getElementById('hud-swap-label');
const btnSpecial = document.getElementById('hud-btn-special');
const hudSpecialIcon = document.getElementById('hud-special-icon');
const hudSpecialLabel = document.getElementById('hud-special-label');
const btnFire = document.getElementById('hud-btn-fire');

const titleOverlay = document.getElementById('title-overlay');
const selectStageName = document.getElementById('select-stage-name');
const selectStageDesc = document.getElementById('select-stage-desc');
const selectStageStars = document.getElementById('select-stage-stars');
const stageGrid20 = document.getElementById('stage-grid-20');
const btnStagePrev = document.getElementById('btn-stage-prev');
const btnStageNext = document.getElementById('btn-stage-next');
const btnStartStage = document.getElementById('btn-start-stage');
const btnStartEndless = document.getElementById('btn-start-endless');

const podiumOverlay = document.getElementById('podium-overlay');
const podiumBadge = document.getElementById('podium-badge');
const perfectStamp = document.getElementById('perfect-stamp');
const podiumTitle = document.getElementById('podium-title');
const podiumStars = document.getElementById('podium-stars');
const podiumSummary = document.getElementById('podium-summary');
const btnRetry = document.getElementById('btn-retry');
const btnNextStage = document.getElementById('btn-next-stage');
const btnHome = document.getElementById('btn-home');

const errorTracker = {
  jsErrors: [],
  unhandledRejections: [],
  resourceErrors: [],
};

window.addEventListener('error', (ev) => {
  if (ev && ev.target && ev.target !== window) {
    errorTracker.resourceErrors.push(String(ev.target.src || ev.target.href || 'resource'));
  } else if (ev) {
    errorTracker.jsErrors.push(String(ev.message || ev));
  }
});

window.addEventListener('unhandledrejection', (ev) => {
  errorTracker.unhandledRejections.push(String(ev?.reason || 'rejection'));
});

// Tolerant localStorage helpers for qq_bubble_progress & qq_hall_progress
let memoryProgressFallback = {
  unlockedStage: 1,
  stageStars: {},
  bestScores: {},
};

function loadBubbleProgress() {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const unlockedStage = Math.max(
          1,
          Math.min(STAGE_DEFS.length, Math.floor(Number(parsed.unlockedStage) || 1))
        );
        const stageStars =
          parsed.stageStars && typeof parsed.stageStars === 'object' ? { ...parsed.stageStars } : {};
        const bestScores =
          parsed.bestScores && typeof parsed.bestScores === 'object' ? { ...parsed.bestScores } : {};
        memoryProgressFallback = { unlockedStage, stageStars, bestScores };
        return memoryProgressFallback;
      }
    }
  } catch (_) {}
  return {
    unlockedStage: memoryProgressFallback.unlockedStage || 1,
    stageStars: { ...memoryProgressFallback.stageStars },
    bestScores: { ...memoryProgressFallback.bestScores },
  };
}

function saveBubbleProgress(prog) {
  const clean = {
    unlockedStage: Math.max(1, Math.min(STAGE_DEFS.length, Math.floor(Number(prog.unlockedStage) || 1))),
    stageStars: { ...(prog.stageStars || {}) },
    bestScores: { ...(prog.bestScores || {}) },
  };
  memoryProgressFallback = clean;
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(clean));
  } catch (_) {}
  return clean;
}

function recordMatchEndPersistence(state) {
  // 1. Update qq_bubble_progress when clearing a stage
  const prog = loadBubbleProgress();
  if (state.modeId === 'stage') {
    const stKey = String(state.stageId);
    prog.bestScores[stKey] = Math.max(Number(prog.bestScores[stKey]) || 0, Number(state.score) || 0);
    if (state.status === 'cleared') {
      const prevStars = Number(prog.stageStars[stKey]) || 0;
      prog.stageStars[stKey] = Math.max(prevStars, Math.max(1, Number(state.podiumStars) || 1));
      prog.unlockedStage = Math.max(
        prog.unlockedStage,
        Math.min(STAGE_DEFS.length, Number(state.stageId) + 1)
      );
    }
    saveBubbleProgress(prog);
    updateStageSelectCard();
  }

  // 2. Merge-write localStorage['qq_hall_progress'] under gameId = 'bubbledragon'
  try {
    let hall = {};
    const rawHall = window.localStorage.getItem(HALL_STORAGE_KEY);
    if (rawHall) {
      const parsedHall = JSON.parse(rawHall);
      if (parsedHall && typeof parsedHall === 'object' && !Array.isArray(parsedHall)) {
        hall = { ...parsedHall };
      }
    }
    const prevEntry =
      hall.bubbledragon && typeof hall.bubbledragon === 'object'
        ? hall.bubbledragon
        : { plays: 0, best: 0, stars: 0 };
    hall.bubbledragon = {
      plays: (Number(prevEntry.plays) || 0) + 1,
      best: Math.max(Number(prevEntry.best) || 0, Number(state.score) || 0),
      stars: Math.max(
        0,
        Math.min(3, Math.max(Number(prevEntry.stars) || 0, Number(state.podiumStars) || 0))
      ),
      last: new Date().toISOString(),
    };
    window.localStorage.setItem(HALL_STORAGE_KEY, JSON.stringify(hall));
  } catch (_) {}
}

const sim = new BubbleDragonSim({ stageId: 1, modeId: 'stage', seed: 20261029 });
const audio = new BubbleDragonAudio();
const renderer3d = new BubbleDragonRenderer3D(canvas);

let uiScreen = 'playing'; // 'playing' | 'title' | 'podium'
let selectedStageId = 1;
let lastRecordedMatchStatus = 'playing';
const AIM_SPEED_RAD_PER_SEC = 1.68;

const keysHeld = new Set();
let pointerAiming = false;
let activePointerId = null;

const COLOR_CN = {
  red: '红',
  yellow: '黄',
  blue: '蓝',
  green: '绿',
  purple: '紫',
  orange: '橙',
};

const SPECIAL_META = {
  bomb: { icon: '💣', label: '炸弹' },
  rainbow: { icon: '🌈', label: '彩虹' },
  lightning: { icon: '⚡', label: '闪电' },
};

function processSimAudioEvents() {
  const events = sim.consumeEvents();
  for (const ev of events) {
    switch (ev.type) {
      case 'shoot':
        audio.playShoot();
        break;
      case 'wall_bounce':
        audio.playWallBounce();
        break;
      case 'bubble_snap':
        audio.playSnap();
        break;
      case 'swap':
        audio.playSwap();
        break;
      case 'special_explode':
        audio.playSpecial(ev.special);
        break;
      case 'special_not_ready':
        audio.playSpecialNotReady();
        break;
      case 'cluster_pop':
        audio.playClusterPop(ev.poppedCount, ev.droppedCount, ev.combo);
        break;
      case 'avalanche':
        audio.playAvalanche(ev.droppedCount);
        break;
      case 'combo_cheer':
        audio.playComboCheer(ev.combo);
        break;
      case 'egg_rescue':
        audio.playEggRescue();
        break;
      case 'cauldron_catch':
        audio.playCauldronCatch(ev.points);
        break;
      case 'stage_clear':
        audio.playStageClear(Boolean(ev.perfect));
        break;
      case 'danger_breach':
        audio.playGameOver();
        break;
      default:
        break;
    }
  }
}

function updateStageSelectCard() {
  const prog = loadBubbleProgress();
  const def = STAGE_DEFS[Math.max(0, Math.min(STAGE_DEFS.length - 1, selectedStageId - 1))];
  const isUnlocked = selectedStageId <= prog.unlockedStage;
  const stStars = Math.max(0, Math.min(3, Number(prog.stageStars[String(selectedStageId)]) || 0));
  const starStr = '★'.repeat(stStars) + '☆'.repeat(3 - stStars);

  selectStageName.textContent = def.name;
  selectStageDesc.textContent = def.subtitle;
  selectStageStars.textContent = isUnlocked
    ? `${starStr} · 已解锁 (${selectedStageId}/${STAGE_DEFS.length})`
    : `🔒 未解锁 · 通关第${selectedStageId - 1}关解锁 (${selectedStageId}/${STAGE_DEFS.length})`;

  if (btnStartStage) {
    btnStartStage.disabled = !isUnlocked;
    btnStartStage.textContent = isUnlocked ? '🎯 开始闯关' : '🔒 待解锁';
  }

  if (stageGrid20) {
    stageGrid20.innerHTML = '';
    for (let i = 1; i <= STAGE_DEFS.length; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      const unlocked = i <= prog.unlockedStage;
      const sCount = Math.max(0, Math.min(3, Number(prog.stageStars[String(i)]) || 0));
      cell.className =
        'stage-cell' +
        (i === selectedStageId ? ' is-selected' : '') +
        (!unlocked ? ' is-locked' : '');
      cell.disabled = !unlocked;
      cell.setAttribute('data-stage-cell', String(i));
      cell.setAttribute('data-testid', `stage-btn-${i}`);
      const numSpan = document.createElement('span');
      numSpan.textContent = `${i}`;
      const starSpan = document.createElement('span');
      starSpan.className = 'sc-stars';
      starSpan.textContent = unlocked ? '★'.repeat(sCount) + '☆'.repeat(3 - sCount) : '🔒';
      cell.appendChild(numSpan);
      cell.appendChild(starSpan);
      cell.addEventListener('click', (ev) => {
        ev.stopPropagation();
        audio.unlock();
        selectedStageId = i;
        updateStageSelectCard();
        audio.playSwap();
      });
      stageGrid20.appendChild(cell);
    }
  }
}

function syncFloatingTextsDOM(state) {
  if (!floatingFxLayer) return;
  if (uiScreen === 'title') {
    floatingFxLayer.hidden = true;
    if (floatingFxLayer.childElementCount > 0) {
      floatingFxLayer.innerHTML = '';
    }
    return;
  }
  floatingFxLayer.hidden = false;
  const texts = state.floatingTexts || [];
  if (texts.length === 0) {
    if (floatingFxLayer.childElementCount > 0) {
      floatingFxLayer.innerHTML = '';
    }
    return;
  }
  floatingFxLayer.innerHTML = '';
  const usedYPositions = [];
  for (const ft of texts) {
    const el = document.createElement('div');
    el.className = `floating-callout kind-${ft.kind || 'info'}`;
    el.setAttribute('data-testid', `floating-text-${ft.kind || 'info'}`);
    el.textContent = ft.text;
    const xPct = Math.max(18, Math.min(82, ((ft.x - LEFT_WALL_X) / (RIGHT_WALL_X - LEFT_WALL_X)) * 60 + 20));
    let yPct = Math.max(15, Math.min(76, ((BASE_CEILING_Y - ft.y) / (BASE_CEILING_Y - CAULDRON_Y)) * 68 + 14));
    for (const prevY of usedYPositions) {
      if (Math.abs(yPct - prevY) < 11.5) {
        yPct = prevY < 32 ? Math.min(78, prevY + 12.0) : Math.max(14, prevY - 12.0);
      }
    }
    usedYPositions.push(yPct);
    el.style.left = `${xPct.toFixed(1)}%`;
    el.style.top = `${yPct.toFixed(1)}%`;
    floatingFxLayer.appendChild(el);
  }
}

function syncUI(state) {
  if (state.status !== lastRecordedMatchStatus) {
    if (state.status === 'cleared' || state.status === 'lost') {
      recordMatchEndPersistence(state);
    }
    lastRecordedMatchStatus = state.status;
  }

  if (uiScreen === 'playing' && (state.status === 'cleared' || state.status === 'lost')) {
    uiScreen = 'podium';
  }

  const isPlaying = uiScreen === 'playing';
  titleOverlay.hidden = uiScreen !== 'title';
  podiumOverlay.hidden = uiScreen !== 'podium';

  btnMenu.hidden = !isPlaying;
  btnSwap.hidden = !isPlaying;
  btnSpecial.hidden = !isPlaying;
  btnFire.hidden = !isPlaying;

  hudStageLabel.textContent =
    state.modeId === 'endless' ? '无尽挑战' : `第${state.stageId}关`;
  hudScoreLabel.textContent = String(state.score);
  hudComboLabel.textContent = `x${state.combo}`;
  hudRemainingLabel.textContent = String(state.bubbleCount);

  const nextCol = state.nextBubble ? COLOR_CN[state.nextBubble.color] || '球' : '球';
  hudSwapLabel.textContent = `下一个:${nextCol}`;

  const curSpecial = state.currentBubble?.special;
  const readySpecial = state.specialGauge?.readySpecial;
  const inv = state.specialGauge?.inventory || {};
  const invSpec = ['bomb', 'rainbow', 'lightning'].find((k) => (inv[k] || 0) > 0);
  const activeSpec = curSpecial || readySpecial || invSpec;
  const isSpecialReady = Boolean(activeSpec && SPECIAL_META[activeSpec]);

  btnSpecial.classList.toggle('is-ready', isSpecialReady);
  btnSpecial.setAttribute('data-ready', isSpecialReady ? 'true' : 'false');

  if (isSpecialReady) {
    hudSpecialIcon.textContent = SPECIAL_META[activeSpec].icon;
    hudSpecialLabel.textContent = SPECIAL_META[activeSpec].label;
  } else if (state.specialGauge?.hint) {
    hudSpecialIcon.textContent = '⚡';
    hudSpecialLabel.textContent = state.specialGauge.hint;
  } else {
    hudSpecialIcon.textContent = '⚡';
    hudSpecialLabel.textContent = `${Math.floor(state.specialGauge?.charge || 0)}%`;
  }

  hudAudioIcon.textContent = audio.muted ? '🔇' : '🔊';

  syncFloatingTextsDOM(state);

  if (uiScreen === 'podium') {
    const won = state.status === 'cleared';
    podiumBadge.textContent = won ? 'STAGE CLEAR · 闯关成功' : 'DANGER BREACH · 闯关失败';
    podiumTitle.textContent = won
      ? `🎉 ${state.stageName} 过关！`
      : '😢 泡泡触及警戒线！';

    if (perfectStamp) {
      perfectStamp.hidden = !(won && state.isPerfectClear);
    }

    const stars = Math.max(0, Math.min(3, state.podiumStars || 0));
    podiumStars.hidden = !won && state.modeId !== 'endless';
    podiumStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    podiumSummary.textContent = `总分 ${state.score} · 消除 ${state.totalPopped} · 聚宝盆掉落 +${state.cauldronScore}`;

    // Requirement D & v2 Item 5: On LOSE, NO 下一关 button; on Stage 20 CLEAR, replace 下一关 with "♾️ 挑战无尽"
    btnNextStage.hidden = !won;
    if (won) {
      if (state.modeId === 'stage' && state.stageId >= STAGE_DEFS.length) {
        btnNextStage.textContent = '♾️ 挑战无尽';
      } else {
        btnNextStage.textContent = '⏭️ 下一关';
      }
    }
    btnRetry.className = won ? 'big-action-btn secondary' : 'big-action-btn primary';
    btnNextStage.className = 'big-action-btn primary';
  }
}

function renderAll() {
  processSimAudioEvents();
  const st = sim.getState();
  syncUI(st);
  renderer3d.render(st, uiScreen);
  return st;
}

function updateAimFromClientXY(clientX, clientY) {
  const world = renderer3d.screenToWorld(clientX, clientY);
  const dx = world.x - LAUNCHER_X;
  const dy = Math.max(0.25, world.y - LAUNCHER_Y);
  const angle = clampAimAngle(Math.atan2(dx, dy));
  sim.setAimAngle(angle);
}

// Pointer / Touch 1:1 Drag-to-Aim + Release-to-Shoot on 3D Canvas
canvas.addEventListener('pointerdown', (ev) => {
  if (uiScreen !== 'playing') return;
  audio.unlock();

  const hitRole = renderer3d.hitTestInteractive(ev.clientX, ev.clientY);
  if (hitRole === 'swap_feeder') {
    sim.swapBubbles();
    renderAll();
    return;
  }

  pointerAiming = true;
  activePointerId = ev.pointerId;
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch (_) {}
  updateAimFromClientXY(ev.clientX, ev.clientY);
  renderAll();
});

canvas.addEventListener('pointermove', (ev) => {
  if (uiScreen !== 'playing') return;
  if (pointerAiming && (activePointerId === null || ev.pointerId === activePointerId)) {
    updateAimFromClientXY(ev.clientX, ev.clientY);
    renderAll();
  }
});

function finishPointerAimAndFire(ev) {
  if (!pointerAiming) return;
  if (activePointerId !== null && ev.pointerId !== activePointerId) return;
  pointerAiming = false;
  activePointerId = null;
  if (uiScreen === 'playing') {
    updateAimFromClientXY(ev.clientX, ev.clientY);
    sim.fireBubble();
    renderAll();
  }
}

canvas.addEventListener('pointerup', finishPointerAimAndFire);
canvas.addEventListener('pointercancel', () => {
  pointerAiming = false;
  activePointerId = null;
});

// HUD Button Handlers
btnMenu.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  selectedStageId = sim.stageId;
  updateStageSelectCard();
  uiScreen = 'title';
  renderAll();
});

btnAudio.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.toggleMute();
  renderAll();
});

btnSwap.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  sim.swapBubbles();
  renderAll();
});

btnSpecial.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  sim.activateReadySpecial();
  renderAll();
});

btnFire.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  sim.fireBubble();
  renderAll();
});

// Title / Stage Select Overlay Handlers
btnStagePrev.addEventListener('click', () => {
  audio.unlock();
  selectedStageId = selectedStageId <= 1 ? STAGE_DEFS.length : selectedStageId - 1;
  updateStageSelectCard();
  audio.playSwap();
});

btnStageNext.addEventListener('click', () => {
  audio.unlock();
  selectedStageId = selectedStageId >= STAGE_DEFS.length ? 1 : selectedStageId + 1;
  updateStageSelectCard();
  audio.playSwap();
});

btnStartStage.addEventListener('click', () => {
  const prog = loadBubbleProgress();
  if (selectedStageId > prog.unlockedStage) {
    audio.playSpecialNotReady();
    return;
  }
  audio.unlock();
  uiScreen = 'playing';
  lastRecordedMatchStatus = 'playing';
  sim.startMatch({ modeId: 'stage', stageId: selectedStageId, seed: 20261029 + selectedStageId });
  renderAll();
});

btnStartEndless.addEventListener('click', () => {
  audio.unlock();
  uiScreen = 'playing';
  lastRecordedMatchStatus = 'playing';
  sim.startMatch({ modeId: 'endless', stageId: 1, seed: 20261029 });
  renderAll();
});

// Podium Result Overlay Handlers
btnRetry.addEventListener('click', () => {
  audio.unlock();
  uiScreen = 'playing';
  lastRecordedMatchStatus = 'playing';
  sim.startMatch({ modeId: sim.modeId, stageId: sim.stageId, seed: sim.seed + 1 });
  renderAll();
});

btnNextStage.addEventListener('click', () => {
  if (sim.status !== 'cleared') return;
  audio.unlock();
  uiScreen = 'playing';
  lastRecordedMatchStatus = 'playing';
  if (sim.modeId === 'stage' && sim.stageId >= STAGE_DEFS.length) {
    sim.startMatch({ modeId: 'endless', stageId: 1, seed: 20261029 });
  } else {
    const nextId = sim.modeId === 'stage' ? (sim.stageId % STAGE_DEFS.length) + 1 : 1;
    selectedStageId = nextId;
    sim.startMatch({ modeId: sim.modeId, stageId: nextId, seed: 20261029 + nextId });
  }
  renderAll();
});

btnHome.addEventListener('click', () => {
  audio.unlock();
  selectedStageId = sim.stageId;
  updateStageSelectCard();
  uiScreen = 'title';
  renderAll();
});

// Desktop Keyboard Controls (strictly immune to ev.repeat autoRepeat!)
window.addEventListener('keydown', (ev) => {
  if (ev.repeat) {
    audio.recordRepeatIgnored();
    return;
  }
  audio.unlock();
  keysHeld.add(ev.code);

  if (uiScreen === 'playing') {
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') {
      ev.preventDefault();
      sim.setAimAngle(sim.aimAngle - 0.08);
      renderAll();
    } else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') {
      ev.preventDefault();
      sim.setAimAngle(sim.aimAngle + 0.08);
      renderAll();
    } else if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'Enter') {
      ev.preventDefault();
      sim.fireBubble();
      renderAll();
    } else if (ev.code === 'KeyS' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') {
      ev.preventDefault();
      sim.swapBubbles();
      renderAll();
    } else if (ev.code === 'KeyE') {
      ev.preventDefault();
      sim.activateReadySpecial();
      renderAll();
    }
  } else if (uiScreen === 'title') {
    if (ev.code === 'Enter' || ev.code === 'Space') {
      ev.preventDefault();
      btnStartStage.click();
    }
  } else if (uiScreen === 'podium') {
    if (ev.code === 'Enter' || ev.code === 'Space') {
      ev.preventDefault();
      if (!btnNextStage.hidden) {
        btnNextStage.click();
      } else {
        btnRetry.click();
      }
    }
  }

  if (ev.code === 'KeyM') {
    audio.toggleMute();
    renderAll();
  }
});

window.addEventListener('keyup', (ev) => {
  keysHeld.delete(ev.code);
});

window.addEventListener('resize', () => {
  renderer3d.resize(window.innerWidth, window.innerHeight);
  renderer3d.render(sim.getState(), uiScreen);
});

function buildFullSnapshot() {
  const simState = sim.getState();
  const progress = loadBubbleProgress();
  const chamberMetrics = renderer3d.getChamberScreenMetrics();
  const payload = {
    ...simState,
    uiScreen,
    selectedStageId,
    progress,
    chamberMetrics,
    chamberScreenMetrics: chamberMetrics,
    podiumVisible: Boolean(renderer3d.podiumGroup?.visible),
    maxAimRad: MAX_AIM_RAD,
    webgl2: Boolean(canvas.getContext('webgl2')),
    audio: audio.getState(),
    errors: {
      jsErrors: errorTracker.jsErrors.slice(),
      unhandledRejections: errorTracker.unhandledRejections.slice(),
      resourceErrors: errorTracker.resourceErrors.slice(),
    },
  };
  return JSON.parse(JSON.stringify(payload));
}

// Deterministic Frozen Test Seam: window.__BUBBLE_DRAGON__
// Strictly exposes ONLY the 7 specification methods.
const bubbleDragonApi = Object.freeze({
  startMatch(opts = {}) {
    uiScreen = opts.uiScreen || 'playing';
    lastRecordedMatchStatus = 'playing';
    if (opts.stageId) {
      selectedStageId = Math.max(1, Math.min(STAGE_DEFS.length, Number(opts.stageId) || 1));
    }
    sim.startMatch(opts);
    lastFrameTime = performance.now();
    simAccumulator = 0;
    renderAll();
    return buildFullSnapshot();
  },

  stepFrames(n = 1) {
    sim.stepFrames(n);
    lastFrameTime = performance.now();
    renderAll();
    return buildFullSnapshot();
  },

  setAimAngle(rad) {
    sim.setAimAngle(rad);
    renderAll();
    return buildFullSnapshot();
  },

  fireBubble() {
    sim.fireBubble();
    renderAll();
    return buildFullSnapshot();
  },

  swapBubbles() {
    sim.swapBubbles();
    renderAll();
    return buildFullSnapshot();
  },

  grantSpecial(type) {
    sim.grantSpecial(type);
    renderAll();
    return buildFullSnapshot();
  },

  getState() {
    return buildFullSnapshot();
  },
});

Object.defineProperty(window, '__BUBBLE_DRAGON__', {
  value: bubbleDragonApi,
  writable: false,
  configurable: false,
  enumerable: true,
});

// Fixed-Timestep 60Hz Real-Time Accumulator Loop
let lastFrameTime = performance.now();
let simAccumulator = 0;

function animateFrame(now) {
  const rawDt = Math.max(0, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (uiScreen === 'playing' || uiScreen === 'podium') {
    simAccumulator += Math.min(0.25, rawDt);
    let stepped = false;
    while (simAccumulator >= FIXED_DT) {
      if (uiScreen === 'playing') {
        if (keysHeld.has('ArrowLeft') || keysHeld.has('KeyA')) {
          sim.setAimAngle(sim.aimAngle - AIM_SPEED_RAD_PER_SEC * FIXED_DT);
        }
        if (keysHeld.has('ArrowRight') || keysHeld.has('KeyD')) {
          sim.setAimAngle(sim.aimAngle + AIM_SPEED_RAD_PER_SEC * FIXED_DT);
        }
      }
      sim._stepSingleFrame();
      simAccumulator -= FIXED_DT;
      stepped = true;
    }
    if (stepped) {
      renderAll();
    } else {
      renderer3d.render(sim.getState(), uiScreen);
    }
  } else {
    simAccumulator = 0;
    renderer3d.render(sim.getState(), uiScreen);
  }
  requestAnimationFrame(animateFrame);
}

updateStageSelectCard();
renderAll();
requestAnimationFrame(animateFrame);
