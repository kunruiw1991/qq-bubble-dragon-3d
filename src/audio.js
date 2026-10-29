/**
 * QQ Bubble Dragon Shooter 3D (QQ泡泡龙 3D)
 * Pure WebAudio Synthesized Arcade BGM & SFX Engine.
 * - Zero external audio files required (0 HTTP 404s)
 * - Pure WebAudio oscillator/gain synthesis only
 * - Per-bubble C5 + n semitones pitch steps (40ms apart), Avalanche, Combo Cheer,
 *   Cauldron Coin Fountain, Egg Rescue Sparkle+Chirp, and 3-Star Perfect Fanfare
 * - Idempotent user-gesture unlock & immune to KeyboardEvent.repeat (autoRepeat)
 */

export class BubbleDragonAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;

    this.unlocked = false;
    this.muted = false;
    this.bgmPlaying = false;
    this.unlockCalls = 0;
    this.sfxCount = 0;
    this.lastSfx = 'none';
    this.lastPopPitches = [];
    this.lastPopStepMs = 40;
    this.activeNodes = 0;
    this.repeatEventsIgnored = 0;

    this._bgmTimer = null;
    this._bgmStep = 0;
  }

  recordRepeatIgnored() {
    this.repeatEventsIgnored += 1;
  }

  unlock() {
    this.unlockCalls += 1;
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.masterGain.gain.value = this.muted ? 0.0 : 0.7;
        this.bgmGain.gain.value = 0.16;
        this.sfxGain.gain.value = 0.55;

        this.bgmGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.unlocked = true;
      if (!this.muted && !this.bgmPlaying) {
        this.startBgm();
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0.0 : 0.7, this.ctx.currentTime);
    }
    if (this.muted) {
      this.stopBgm();
    } else if (this.unlocked) {
      this.startBgm();
    }
    return this.muted;
  }

  toggleMute() {
    this.unlock();
    return this.setMuted(!this.muted);
  }

  startBgm() {
    if (this.bgmPlaying || this.muted) return;
    this.bgmPlaying = true;
    if (this._bgmTimer) clearInterval(this._bgmTimer);

    // Cheerful Puzzle Bobble / QQ泡泡龙 inspired marimba melody loop
    const melody = [
      523.25, 659.25, 783.99, 659.25,
      880.0, 783.99, 659.25, 587.33,
      523.25, 587.33, 659.25, 783.99,
      659.25, 587.33, 523.25, 392.0,
    ];
    this._bgmTimer = setInterval(() => {
      if (this.muted || !this.unlocked || !this.ctx || document.hidden) return;
      const freq = melody[this._bgmStep % melody.length];
      this._bgmStep += 1;
      this._playTone({
        freq,
        endFreq: freq * 1.005,
        duration: 0.14,
        type: 'triangle',
        gain: 0.14,
        bus: 'bgm',
      });
    }, 240);
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this._bgmTimer) {
      clearInterval(this._bgmTimer);
      this._bgmTimer = null;
    }
  }

  _playTone({
    freq = 440,
    endFreq = null,
    duration = 0.12,
    delay = 0,
    type = 'sine',
    gain = 0.25,
    bus = 'sfx',
  }) {
    if (this.muted || !this.ctx || !this.unlocked) return;
    if (this.activeNodes >= 24) return;
    try {
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(40, freq), now);
      if (endFreq && Number.isFinite(endFreq)) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
      }
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(gain, now + Math.min(0.02, duration * 0.25));
      env.gain.exponentialRampToValueAtTime(0.0008, now + duration);

      osc.connect(env);
      env.connect(bus === 'bgm' ? this.bgmGain : this.sfxGain);

      this.activeNodes += 1;
      osc.onended = () => {
        this.activeNodes = Math.max(0, this.activeNodes - 1);
      };
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch (_) {}
  }

  playShoot() {
    this.sfxCount += 1;
    this.lastSfx = 'shoot';
    this._playTone({ freq: 210, endFreq: 560, duration: 0.11, type: 'sine', gain: 0.32 });
  }

  playWallBounce() {
    this.sfxCount += 1;
    this.lastSfx = 'wall_bounce';
    this._playTone({ freq: 760, endFreq: 980, duration: 0.07, type: 'triangle', gain: 0.22 });
  }

  playSnap() {
    this.sfxCount += 1;
    this.lastSfx = 'snap';
    this._playTone({ freq: 260, endFreq: 170, duration: 0.08, type: 'sine', gain: 0.2 });
  }

  playSwap() {
    this.sfxCount += 1;
    this.lastSfx = 'swap';
    this._playTone({ freq: 380, endFreq: 570, duration: 0.08, type: 'triangle', gain: 0.24 });
    this._playTone({ freq: 570, endFreq: 430, duration: 0.08, delay: 0.06, type: 'triangle', gain: 0.22 });
  }

  /**
   * Per-bubble pitch step: C5 (523.25 Hz) + n semitones, 40 ms apart!
   */
  playClusterPop(poppedCount = 3, droppedCount = 0, combo = 1) {
    this.sfxCount += 1;
    this.lastSfx = droppedCount > 0 ? 'avalanche_pop' : 'cluster_pop';
    const baseC5 = 523.25;
    const count = Math.max(1, Math.min(12, Math.floor(poppedCount) || 3));
    const pitches = [];
    for (let n = 0; n < count; n++) {
      const freq = Number((baseC5 * Math.pow(2, n / 12)).toFixed(2));
      pitches.push(freq);
      this._playTone({
        freq,
        endFreq: freq * 1.09,
        duration: 0.12,
        delay: n * 0.04, // 40 ms apart
        type: 'triangle',
        gain: 0.28,
      });
    }
    this.lastPopPitches = pitches;
    this.lastPopStepMs = 40;
  }

  playAvalanche(droppedCount = 4) {
    this.sfxCount += 1;
    this.lastSfx = 'avalanche';
    const notes = [659.25, 783.99, 987.77, 1174.66, 1318.51, 1567.98];
    const steps = Math.min(notes.length, Math.max(3, droppedCount));
    for (let i = 0; i < steps; i++) {
      this._playTone({
        freq: notes[i],
        endFreq: notes[i] * 1.06,
        duration: 0.13,
        delay: i * 0.05,
        type: 'sine',
        gain: 0.27,
      });
    }
  }

  playComboCheer(combo = 2) {
    this.sfxCount += 1;
    this.lastSfx = 'combo_cheer';
    const shift = Math.min(5, Math.max(0, combo - 2)) * 60;
    const chord = [587.33 + shift, 739.99 + shift, 880.0 + shift, 1174.66 + shift];
    chord.forEach((f, idx) => {
      this._playTone({
        freq: f,
        endFreq: f * 1.12,
        duration: 0.11,
        delay: idx * 0.04,
        type: 'triangle',
        gain: 0.26,
      });
    });
  }

  playEggRescue() {
    this.sfxCount += 1;
    this.lastSfx = 'egg_rescue';
    // Sparkle chime + cute dragon hatchling chirp
    const sparkle = [1046.5, 1318.51, 1567.98, 2093.0];
    sparkle.forEach((f, i) => {
      this._playTone({
        freq: f,
        endFreq: f * 1.05,
        duration: 0.1,
        delay: i * 0.035,
        type: 'sine',
        gain: 0.26,
      });
    });
    // Cute upward chirp
    this._playTone({
      freq: 880,
      endFreq: 1760,
      duration: 0.14,
      delay: 0.14,
      type: 'triangle',
      gain: 0.3,
    });
  }

  playCauldronCatch(points = 100) {
    this.sfxCount += 1;
    this.lastSfx = 'cauldron_catch';
    const freq = points >= 250 ? 1567.98 : points >= 100 ? 1318.51 : 1046.5;
    this._playTone({ freq, endFreq: freq * 1.18, duration: 0.13, type: 'sine', gain: 0.26 });
    this._playTone({ freq: freq * 1.25, endFreq: freq * 1.5, duration: 0.1, delay: 0.045, type: 'triangle', gain: 0.2 });
  }

  playSpecial(special = 'bomb') {
    this.sfxCount += 1;
    this.lastSfx = `special_${special}`;
    if (special === 'bomb') {
      this._playTone({ freq: 180, endFreq: 55, duration: 0.28, type: 'sawtooth', gain: 0.35 });
    } else if (special === 'lightning') {
      this._playTone({ freq: 1320, endFreq: 280, duration: 0.22, type: 'sawtooth', gain: 0.3 });
      this._playTone({ freq: 980, endFreq: 1640, duration: 0.15, delay: 0.05, type: 'triangle', gain: 0.26 });
    } else {
      const gliss = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      gliss.forEach((f, idx) => {
        this._playTone({ freq: f, endFreq: f * 1.08, duration: 0.12, delay: idx * 0.04, type: 'sine', gain: 0.25 });
      });
    }
  }

  playSpecialNotReady() {
    this.sfxCount += 1;
    this.lastSfx = 'special_not_ready';
    this._playTone({ freq: 240, endFreq: 180, duration: 0.09, type: 'triangle', gain: 0.18 });
  }

  playStageClear(perfect = false) {
    this.sfxCount += 1;
    this.lastSfx = perfect ? 'perfect_fanfare' : 'stage_clear';
    const fanfare = perfect
      ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0]
      : [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const durs = perfect
      ? [0.1, 0.1, 0.1, 0.14, 0.12, 0.14, 0.42]
      : [0.12, 0.12, 0.12, 0.24, 0.12, 0.38];
    let t = 0;
    for (let i = 0; i < fanfare.length; i++) {
      this._playTone({ freq: fanfare[i], duration: durs[i], delay: t, type: 'triangle', gain: 0.32 });
      t += durs[i] * 0.85;
    }
  }

  playGameOver() {
    this.sfxCount += 1;
    this.lastSfx = 'game_over';
    const sad = [440, 415.3, 392.0, 349.23];
    sad.forEach((f, idx) => {
      this._playTone({ freq: f, endFreq: f * 0.96, duration: 0.18, delay: idx * 0.15, type: 'triangle', gain: 0.26 });
    });
  }

  getState() {
    return {
      unlocked: this.unlocked,
      muted: this.muted,
      bgmPlaying: this.bgmPlaying,
      unlockCalls: this.unlockCalls,
      sfxCount: this.sfxCount,
      lastSfx: this.lastSfx,
      lastPopPitches: this.lastPopPitches.slice(),
      lastPopStepMs: this.lastPopStepMs,
      activeNodes: this.activeNodes,
      repeatEventsIgnored: this.repeatEventsIgnored,
    };
  }
}
