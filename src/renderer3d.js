/**
 * QQ Bubble Dragon Shooter 3D (QQ泡泡龙 3D)
 * Three.js r170 WebGL2 3D Crystal-Arcade Stage, Geared Brass Cannon,
 * Chibi Bubble Dragon & QQ Penguin Crew, Inner-Emblem Candy Bubbles,
 * 5 Glowing Bonus Cauldrons, Pearl Trajectory Ray & 3D Star Podium Renderer.
 */

import * as THREE from '../vendor/three.module.min.js';
import {
  BUBBLE_RADIUS,
  LEFT_WALL_X,
  RIGHT_WALL_X,
  BASE_CEILING_Y,
  DANGER_LINE_Y,
  LAUNCHER_X,
  LAUNCHER_Y,
  CAULDRON_Y,
  CAULDRON_SPECS,
} from './sim.js';

export const COLOR_PALETTE = Object.freeze({
  red: { hex: 0xff3358, emissive: 0x550818, inner: 0xffb3c1, label: 'Ruby Red' },
  yellow: { hex: 0xffcc00, emissive: 0x553a00, inner: 0xfff3b0, label: 'Sunny Yellow' },
  blue: { hex: 0x1e96ff, emissive: 0x062b55, inner: 0xb8e2ff, label: 'Ocean Blue' },
  green: { hex: 0x1fd660, emissive: 0x06441c, inner: 0xb9fbc0, label: 'Emerald Green' },
  purple: { hex: 0xb142ff, emissive: 0x320a55, inner: 0xe5b8ff, label: 'Grape Purple' },
  orange: { hex: 0xff7b19, emissive: 0x552000, inner: 0xffd6a5, label: 'Tangerine Orange' },
});

function createTextBadgeTexture(text, bgHex = '#ff9f1c', borderHex = '#fff3b0', textColor = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Rounded pill background
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = bgHex;
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(14, 18, 228, 92, 42);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = '900 58px "Fredoka", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.fillText(String(text), 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class BubbleDragonRenderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f284e);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 10, 0.1, 120);
    this.camera.position.set(0, 0.35, 16.5);
    this.camera.lookAt(0, 0.35, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this.playfieldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    this.sharedGeos = this._createSharedGeometries();
    this.sharedMats = this._createSharedMaterials();

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.bubbleMeshPool = [];
    this.activeBubbleCount = 0;

    this.fallingMeshPool = [];
    this.activeFallingCount = 0;

    this.pearlMeshes = [];
    this.particleMeshes = [];
    this.cauldronGroups = [];
    this.ceilingGearMeshes = [];
    this.interactiveTargets = [];

    this._setupLights();
    this._buildArcadeStage();
    this._buildCompressorCeiling();
    this._buildCauldrons();
    this._buildCannonAndCrew();
    this._buildTrajectoryPreview();
    this._buildPodiumGroup();

    this.resize(window.innerWidth || 1280, window.innerHeight || 800);
  }

  _createSharedGeometries() {
    return {
      outerSphere: new THREE.SphereGeometry(BUBBLE_RADIUS * 0.96, 22, 18),
      highlightCap: new THREE.SphereGeometry(BUBBLE_RADIUS * 0.25, 12, 10),
      emblemRed: new THREE.OctahedronGeometry(BUBBLE_RADIUS * 0.44, 0),
      emblemYellow: new THREE.DodecahedronGeometry(BUBBLE_RADIUS * 0.42, 0),
      emblemBlue: new THREE.ConeGeometry(BUBBLE_RADIUS * 0.36, BUBBLE_RADIUS * 0.68, 12),
      emblemGreen: new THREE.TorusGeometry(BUBBLE_RADIUS * 0.26, BUBBLE_RADIUS * 0.12, 10, 18),
      emblemPurple: new THREE.TorusKnotGeometry(BUBBLE_RADIUS * 0.23, BUBBLE_RADIUS * 0.08, 28, 8),
      emblemOrange: new THREE.CylinderGeometry(BUBBLE_RADIUS * 0.36, BUBBLE_RADIUS * 0.36, BUBBLE_RADIUS * 0.22, 8),
      bombSpike: new THREE.ConeGeometry(0.11, 0.28, 8),
      lightningBolt: new THREE.OctahedronGeometry(BUBBLE_RADIUS * 0.52, 0),
      pearlSphere: new THREE.SphereGeometry(0.11, 10, 10),
      particleSphere: new THREE.SphereGeometry(0.12, 8, 8),
    };
  }

  _createSharedMaterials() {
    // Note: ALL materials strictly obey metalness <= 0.22 for bright, warm arcade vibrancy!
    const bubbleShells = {};
    const bubbleInners = {};
    for (const [colorName, spec] of Object.entries(COLOR_PALETTE)) {
      bubbleShells[colorName] = new THREE.MeshStandardMaterial({
        color: spec.hex,
        emissive: spec.emissive,
        emissiveIntensity: 0.45,
        metalness: 0.12,
        roughness: 0.16,
        transparent: true,
        opacity: 0.86,
      });
      bubbleInners[colorName] = new THREE.MeshStandardMaterial({
        color: spec.inner,
        emissive: spec.hex,
        emissiveIntensity: 0.55,
        metalness: 0.1,
        roughness: 0.22,
      });
    }

    return {
      bubbleShells,
      bubbleInners,
      highlightMat: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.72,
      }),
      bombShell: new THREE.MeshStandardMaterial({
        color: 0x2b2d42,
        emissive: 0x6b1120,
        emissiveIntensity: 0.65,
        metalness: 0.18,
        roughness: 0.25,
      }),
      bombSpark: new THREE.MeshBasicMaterial({ color: 0xffbe0b }),
      rainbowShell: new THREE.MeshStandardMaterial({
        color: 0xff66c4,
        emissive: 0x4cc9f0,
        emissiveIntensity: 0.65,
        metalness: 0.15,
        roughness: 0.14,
        transparent: true,
        opacity: 0.9,
      }),
      lightningShell: new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        emissive: 0xfee440,
        emissiveIntensity: 0.75,
        metalness: 0.16,
        roughness: 0.15,
      }),
      eggShell: new THREE.MeshStandardMaterial({
        color: 0xfff1a8,
        emissive: 0xff9f1c,
        emissiveIntensity: 0.5,
        metalness: 0.14,
        roughness: 0.2,
      }),
      goldMat: new THREE.MeshStandardMaterial({
        color: 0xffbe0b,
        emissive: 0x5c3c00,
        emissiveIntensity: 0.35,
        metalness: 0.2,
        roughness: 0.26,
      }),
      crystalRailMat: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.45,
        metalness: 0.15,
        roughness: 0.2,
      }),
      coralMat: new THREE.MeshStandardMaterial({
        color: 0xff4d6d,
        emissive: 0x590d22,
        emissiveIntensity: 0.35,
        metalness: 0.14,
        roughness: 0.28,
      }),
    };
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e3a8a, 1.35);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.65);
    keyLight.position.set(5, 9, 12);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.95);
    fillLight.position.set(-6, -3, 10);
    this.scene.add(fillLight);

    const cannonLight = new THREE.PointLight(0xfde047, 1.4, 14);
    cannonLight.position.set(0, -3.2, 3.2);
    this.scene.add(cannonLight);
  }

  _buildArcadeStage() {
    this.stageGroup = new THREE.Group();
    this.rootGroup.add(this.stageGroup);

    // Recessed glossy arcade chamber backboard
    const boardGeo = new THREE.BoxGeometry(8.3, 11.2, 0.35);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x153462,
      emissive: 0x0b1f3f,
      emissiveIntensity: 0.45,
      metalness: 0.1,
      roughness: 0.4,
    });
    const backBoard = new THREE.Mesh(boardGeo, boardMat);
    backBoard.position.set(0, 0.45, -0.75);
    this.stageGroup.add(backBoard);

    // Decorative honeycomb hex rings on backplate
    const hexRingGeo = new THREE.RingGeometry(0.42, 0.47, 6);
    const hexRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
    });
    for (let r = 0; r < 8; r++) {
      const cols = r % 2 === 0 ? 8 : 7;
      for (let c = 0; c < cols; c++) {
        const ring = new THREE.Mesh(hexRingGeo, hexRingMat);
        const x = LEFT_WALL_X + 0.5 + (r % 2 === 1 ? 0.5 : 0) + c * 1.0;
        const y = BASE_CEILING_Y - 0.5 - r * (0.5 * Math.sqrt(3));
        ring.position.set(x, y, -0.54);
        ring.rotation.z = Math.PI / 6;
        this.stageGroup.add(ring);
      }
    }

    // Bevelled 3D Crystal Left & Right Side Rails
    const railGeo = new THREE.CylinderGeometry(0.24, 0.24, 11.4, 16);
    const leftRail = new THREE.Mesh(railGeo, this.sharedMats.crystalRailMat);
    leftRail.position.set(LEFT_WALL_X - 0.22, 0.45, 0);
    this.stageGroup.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, this.sharedMats.crystalRailMat);
    rightRail.position.set(RIGHT_WALL_X + 0.22, 0.45, 0);
    this.stageGroup.add(rightRail);

    // Golden bands along side rails
    const bandGeo = new THREE.TorusGeometry(0.27, 0.06, 10, 20);
    for (const yPos of [-4.2, -2.55, -0.5, 1.5, 3.5, 5.5]) {
      for (const xSide of [LEFT_WALL_X - 0.22, RIGHT_WALL_X + 0.22]) {
        const band = new THREE.Mesh(bandGeo, this.sharedMats.goldMat);
        band.position.set(xSide, yPos, 0);
        band.rotation.x = Math.PI / 2;
        this.stageGroup.add(band);
      }
    }

    // Glowing Danger Line bar at DANGER_LINE_Y
    const dangerBarGeo = new THREE.CylinderGeometry(0.045, 0.045, 8.0, 12);
    this.dangerBarMat = new THREE.MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.78,
    });
    const dangerBar = new THREE.Mesh(dangerBarGeo, this.dangerBarMat);
    dangerBar.rotation.z = Math.PI / 2;
    dangerBar.position.set(0, DANGER_LINE_Y, 0.05);
    this.stageGroup.add(dangerBar);

    // Floating background candy clouds & stars outside the chamber
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.2,
      metalness: 0.05,
      roughness: 0.5,
    });
    for (const [cx, cy, cz, sc] of [
      [-6.2, 3.6, -2.5, 0.9],
      [6.4, 2.8, -2.5, 1.0],
      [-6.5, -2.2, -2.5, 0.85],
      [6.2, -2.6, -2.5, 0.9],
    ]) {
      const cloud = new THREE.Group();
      for (const [ox, oy, r] of [[0, 0, 0.7], [-0.55, -0.15, 0.5], [0.55, -0.12, 0.52]]) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), cloudMat);
        puff.position.set(ox, oy, 0);
        cloud.add(puff);
      }
      cloud.position.set(cx, cy, cz);
      cloud.scale.setScalar(sc);
      this.stageGroup.add(cloud);
    }
  }

  _buildCompressorCeiling() {
    this.ceilingGroup = new THREE.Group();
    this.rootGroup.add(this.ceilingGroup);

    // Main horizontal geared compressor beam
    const beamGeo = new THREE.BoxGeometry(8.35, 0.52, 0.75);
    const beamMesh = new THREE.Mesh(beamGeo, this.sharedMats.goldMat);
    beamMesh.position.set(0, 0.26, 0);
    this.ceilingGroup.add(beamMesh);

    // Coral accent trim strip
    const stripeGeo = new THREE.BoxGeometry(8.1, 0.16, 0.82);
    const stripeMesh = new THREE.Mesh(stripeGeo, this.sharedMats.coralMat);
    stripeMesh.position.set(0, 0.26, 0);
    this.ceilingGroup.add(stripeMesh);

    // Twin vertical piston shafts extending upward
    const pistonGeo = new THREE.CylinderGeometry(0.18, 0.18, 5.5, 14);
    const pistonMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.2,
      roughness: 0.25,
    });
    for (const px of [-2.6, 2.6]) {
      const piston = new THREE.Mesh(pistonGeo, pistonMat);
      piston.position.set(px, 2.9, -0.15);
      this.ceilingGroup.add(piston);
    }

    // 4 Rotating 3D Brass Gears on the compressor bar
    this.ceilingGearMeshes = [];
    for (const gx of [-3.2, -1.1, 1.1, 3.2]) {
      const gear = this._createGearMesh(0.32, 8);
      gear.position.set(gx, 0.28, 0.42);
      this.ceilingGroup.add(gear);
      this.ceilingGearMeshes.push(gear);
    }

    this.ceilingGroup.position.set(0, BASE_CEILING_Y, 0);
  }

  _createGearMesh(radius = 0.35, teeth = 8) {
    const group = new THREE.Group();
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, 0.16, 16),
      this.sharedMats.goldMat
    );
    hub.rotation.x = Math.PI / 2;
    group.add(hub);

    const toothGeo = new THREE.BoxGeometry(radius * 0.32, radius * 0.34, 0.14);
    for (let i = 0; i < teeth; i++) {
      const ang = (i / teeth) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, this.sharedMats.goldMat);
      tooth.position.set(Math.cos(ang) * radius * 0.85, Math.sin(ang) * radius * 0.85, 0);
      tooth.rotation.z = ang;
      group.add(tooth);
    }
    return group;
  }

  _buildCauldrons() {
    this.cauldronsRoot = new THREE.Group();
    this.rootGroup.add(this.cauldronsRoot);
    this.cauldronGroups = [];

    const cauldronColors = [
      { body: 0x3b82f6, bg: '#2563eb' },
      { body: 0x8b5cf6, bg: '#7c3aed' },
      { body: 0xf59e0b, bg: '#d97706' },
      { body: 0x8b5cf6, bg: '#7c3aed' },
      { body: 0x3b82f6, bg: '#2563eb' },
    ];

    CAULDRON_SPECS.forEach((spec, idx) => {
      const g = new THREE.Group();
      g.position.set(spec.x, CAULDRON_Y, 0.1);

      const cStyle = cauldronColors[idx];
      const potMat = new THREE.MeshStandardMaterial({
        color: cStyle.body,
        emissive: cStyle.body,
        emissiveIntensity: 0.28,
        metalness: 0.16,
        roughness: 0.24,
      });

      const potBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.46, 0.76, 18),
        potMat
      );
      g.add(potBody);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.08, 10, 22),
        this.sharedMats.goldMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.36;
      g.add(rim);

      const pool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.54, 0.54, 0.08, 16),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      pool.position.y = 0.33;
      g.add(pool);

      // Score badge on front of cauldron
      const badgeTex = createTextBadgeTexture(spec.label, cStyle.bg, '#fde047');
      const badge = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 0.52),
        new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true })
      );
      badge.position.set(0, -0.02, 0.62);
      g.add(badge);

      this.cauldronsRoot.add(g);
      this.cauldronGroups.push(g);
    });
  }

  _buildCannonAndCrew() {
    this.launcherRoot = new THREE.Group();
    this.launcherRoot.position.set(LAUNCHER_X, LAUNCHER_Y, 0.15);
    this.rootGroup.add(this.launcherRoot);

    // Pedestal base
    const basePedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.92, 0.38, 22),
      this.sharedMats.goldMat
    );
    basePedestal.position.set(0, -0.26, 0);
    this.launcherRoot.add(basePedestal);

    // Rotating Cannon Turret Group
    this.cannonTurret = new THREE.Group();
    this.launcherRoot.add(this.cannonTurret);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.64, 1.25, 20),
      this.sharedMats.coralMat
    );
    barrel.position.set(0, 0.45, 0);
    this.cannonTurret.add(barrel);

    const muzzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.09, 12, 22),
      this.sharedMats.goldMat
    );
    muzzleRing.rotation.x = Math.PI / 2;
    muzzleRing.position.set(0, 1.05, 0);
    this.cannonTurret.add(muzzleRing);

    const pointerCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.48, 12),
      this.sharedMats.goldMat
    );
    pointerCone.position.set(0, 1.38, 0.32);
    this.cannonTurret.add(pointerCone);

    this.cannonWheel = this._createGearMesh(0.45, 10);
    this.cannonWheel.position.set(0, 0.15, 0.55);
    this.cannonTurret.add(this.cannonWheel);

    // Current Bubble visual holder inside cannon breach
    this.currentBubbleHolder = this._createBubbleVisualGroup();
    this.currentBubbleHolder.group.position.set(0, 0.55, 0.25);
    this.cannonTurret.add(this.currentBubbleHolder.group);

    // Bespoke 3D Chibi Bubble Dragon (泡泡小恐龙) on right of cannon
    this.dragonCrew = this._createChibiBubbleDragon();
    this.dragonCrew.position.set(1.38, -0.1, 0.25);
    this.launcherRoot.add(this.dragonCrew);

    // Bespoke 3D QQ Penguin Co-Pilot & Feeder Pad (换球台) on left of cannon
    this.penguinCrew = this._createChibiQQPenguin();
    this.penguinCrew.position.set(-1.45, -0.12, 0.25);
    this.launcherRoot.add(this.penguinCrew);

    // Next Bubble visual holder above Penguin feeder pad
    this.nextBubbleHolder = this._createBubbleVisualGroup();
    this.nextBubbleHolder.group.position.set(-1.45, 0.68, 0.45);
    this.nextBubbleHolder.group.scale.setScalar(0.86);
    this.launcherRoot.add(this.nextBubbleHolder.group);

    // Make Penguin & Next Bubble clickable via 3D raycast to swap bubbles
    this.penguinCrew.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.interactiveRole = 'swap_feeder';
        this.interactiveTargets.push(obj);
      }
    });
    this.nextBubbleHolder.group.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.interactiveRole = 'swap_feeder';
        this.interactiveTargets.push(obj);
      }
    });

    // Flying Projectile Visual Holder
    this.projectileHolder = this._createBubbleVisualGroup();
    this.projectileHolder.group.visible = false;
    this.rootGroup.add(this.projectileHolder.group);
  }

  _createChibiBubbleDragon() {
    const dragon = new THREE.Group();
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x064e3b,
      emissiveIntensity: 0.25,
      metalness: 0.1,
      roughness: 0.28,
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      metalness: 0.06,
      roughness: 0.35,
    });
    const crestMat = new THREE.MeshStandardMaterial({
      color: 0xff7b19,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.3,
      metalness: 0.12,
      roughness: 0.25,
    });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    // Chubby body & cream tummy
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), greenMat);
    body.scale.set(1, 1.08, 0.92);
    dragon.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), bellyMat);
    belly.position.set(0, -0.03, 0.18);
    dragon.add(belly);

    // Oversized cute head & snout
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 14), greenMat);
    head.position.set(0, 0.52, 0.05);
    dragon.add(head);

    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), greenMat);
    snout.scale.set(1.15, 0.8, 1.0);
    snout.position.set(-0.08, 0.46, 0.34);
    dragon.add(snout);

    // Expressive eyes
    for (const ex of [-0.14, 0.14]) {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), eyeWhiteMat);
      eyeW.position.set(ex, 0.6, 0.35);
      dragon.add(eyeW);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pupilMat);
      pupil.position.set(ex, 0.6, 0.43);
      dragon.add(pupil);
    }

    // Orange dorsal spikes along head and back
    for (const [sx, sy, sz, rotX] of [
      [0, 0.94, 0.02, -0.15],
      [0, 0.82, -0.26, -0.6],
      [0, 0.56, -0.38, -1.1],
      [0, 0.2, -0.42, -1.4],
    ]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 8), crestMat);
      spike.position.set(sx, sy, sz);
      spike.rotation.x = rotX;
      dragon.add(spike);
    }

    // Stubby arms reaching toward cannon wheel
    for (const ax of [-0.36, 0.32]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.34, 10), greenMat);
      arm.position.set(ax, 0.14, 0.22);
      arm.rotation.z = ax < 0 ? 0.6 : -0.5;
      dragon.add(arm);
    }

    return dragon;
  }

  _createChibiQQPenguin() {
    const penguin = new THREE.Group();
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.12,
      roughness: 0.26,
    });
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.06,
      roughness: 0.3,
    });
    const scarfMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.3,
      metalness: 0.1,
      roughness: 0.32,
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.14,
      roughness: 0.25,
    });

    // Chubby body & white tummy
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 14), blackMat);
    body.scale.set(1.0, 1.12, 0.92);
    penguin.add(body);

    const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 12), whiteMat);
    tummy.position.set(0, -0.02, 0.16);
    penguin.add(tummy);

    // Red QQ Scarf
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.085, 10, 20), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 0.3, 0.04);
    penguin.add(scarf);

    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.06), scarfMat);
    scarfTail.position.set(0.16, 0.14, 0.38);
    scarfTail.rotation.z = -0.2;
    penguin.add(scarfTail);

    // Eyes & golden beak
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    for (const ex of [-0.13, 0.13]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), eyeWhiteMat);
      ew.position.set(ex, 0.5, 0.33);
      penguin.add(ew);
      const ep = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), pupilMat);
      ep.position.set(ex, 0.5, 0.4);
      penguin.add(ep);
    }

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 10), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.4, 0.44);
    penguin.add(beak);

    // Glowing Feeder Pad above flippers
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.38, 0.12, 18),
      this.sharedMats.crystalRailMat
    );
    pad.position.set(0, 0.54, 0.2);
    penguin.add(pad);

    return penguin;
  }

  /**
   * Creates a multi-part 3D Candy Bubble visual group with:
   * - Glossy outer candy sphere
   * - Cartoon specular highlight dome
   * - Bespoke 3D inner emblem per color/special/egg so every bubble is 100% distinct!
   */
  _createBubbleVisualGroup() {
    const group = new THREE.Group();

    const outerMesh = new THREE.Mesh(
      this.sharedGeos.outerSphere,
      this.sharedMats.bubbleShells.red
    );
    group.add(outerMesh);

    const highlightMesh = new THREE.Mesh(
      this.sharedGeos.highlightCap,
      this.sharedMats.highlightMat
    );
    highlightMesh.position.set(-0.16, 0.2, 0.34);
    highlightMesh.scale.set(1.1, 0.75, 0.5);
    group.add(highlightMesh);

    // Inner emblem meshes (only the active one is set visible)
    const emblems = {
      red: new THREE.Mesh(this.sharedGeos.emblemRed, this.sharedMats.bubbleInners.red),
      yellow: new THREE.Mesh(this.sharedGeos.emblemYellow, this.sharedMats.bubbleInners.yellow),
      blue: new THREE.Mesh(this.sharedGeos.emblemBlue, this.sharedMats.bubbleInners.blue),
      green: new THREE.Mesh(this.sharedGeos.emblemGreen, this.sharedMats.bubbleInners.green),
      purple: new THREE.Mesh(this.sharedGeos.emblemPurple, this.sharedMats.bubbleInners.purple),
      orange: new THREE.Mesh(this.sharedGeos.emblemOrange, this.sharedMats.bubbleInners.orange),
      bomb: new THREE.Mesh(this.sharedGeos.bombSpike, this.sharedMats.bombSpark),
      rainbow: new THREE.Mesh(this.sharedGeos.emblemGreen, this.sharedMats.goldMat),
      lightning: new THREE.Mesh(this.sharedGeos.lightningBolt, this.sharedMats.goldMat),
      egg: new THREE.Mesh(this.sharedGeos.emblemYellow, this.sharedMats.goldMat),
    };
    emblems.orange.rotation.x = Math.PI / 2;
    emblems.bomb.position.set(0, 0.52, 0);

    for (const m of Object.values(emblems)) {
      m.visible = false;
      group.add(m);
    }

    // Halo ring for special / egg bubbles
    const haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(BUBBLE_RADIUS * 1.06, 0.055, 8, 20),
      this.sharedMats.goldMat
    );
    haloRing.visible = false;
    group.add(haloRing);

    return {
      group,
      outerMesh,
      highlightMesh,
      emblems,
      haloRing,
    };
  }

  _configureBubbleVisual(holder, bubbleSpec, tick = 0) {
    if (!bubbleSpec) {
      holder.group.visible = false;
      return;
    }
    holder.group.visible = true;
    const color = bubbleSpec.color || 'red';
    const special = bubbleSpec.special || null;
    const isEgg = Boolean(bubbleSpec.isEgg);

    for (const m of Object.values(holder.emblems)) {
      m.visible = false;
    }
    holder.haloRing.visible = false;

    if (isEgg) {
      holder.outerMesh.material = this.sharedMats.eggShell;
      holder.emblems.egg.visible = true;
      holder.emblems.egg.rotation.y = tick * 0.05;
      holder.haloRing.visible = true;
      holder.haloRing.rotation.z = tick * 0.04;
    } else if (special === 'bomb') {
      holder.outerMesh.material = this.sharedMats.bombShell;
      holder.emblems.bomb.visible = true;
      holder.haloRing.visible = true;
    } else if (special === 'rainbow') {
      holder.outerMesh.material = this.sharedMats.rainbowShell;
      holder.emblems.rainbow.visible = true;
      holder.emblems.rainbow.rotation.x = tick * 0.06;
      holder.emblems.rainbow.rotation.y = tick * 0.05;
      holder.haloRing.visible = true;
    } else if (special === 'lightning') {
      holder.outerMesh.material = this.sharedMats.lightningShell;
      holder.emblems.lightning.visible = true;
      holder.emblems.lightning.rotation.z = tick * 0.08;
      holder.haloRing.visible = true;
    } else {
      holder.outerMesh.material =
        this.sharedMats.bubbleShells[color] || this.sharedMats.bubbleShells.red;
      const emb = holder.emblems[color] || holder.emblems.red;
      emb.visible = true;
      emb.rotation.y = tick * 0.025;
    }
  }

  _buildTrajectoryPreview() {
    this.trajectoryGroup = new THREE.Group();
    this.rootGroup.add(this.trajectoryGroup);

    this.pearlMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.9,
    });

    this.pearlMeshes = [];
    for (let i = 0; i < 42; i++) {
      const m = new THREE.Mesh(this.sharedGeos.pearlSphere, this.pearlMat);
      m.visible = false;
      this.trajectoryGroup.add(m);
      this.pearlMeshes.push(m);
    }

    // 3D Ghost Hex Snap Ring at landing cell
    this.ghostSnapRing = new THREE.Group();
    const outerTorus = new THREE.Mesh(
      new THREE.TorusGeometry(BUBBLE_RADIUS * 0.94, 0.065, 10, 24),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.92 })
    );
    this.ghostSnapRing.add(outerTorus);

    const innerDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.ghostSnapRing.add(innerDot);
    this.trajectoryGroup.add(this.ghostSnapRing);
  }

  _buildPodiumGroup() {
    this.podiumGroup = new THREE.Group();
    this.podiumGroup.position.set(0, 1.35, 2.5);
    this.podiumGroup.visible = false;
    this.rootGroup.add(this.podiumGroup);

    // 1st / 2nd / 3rd tiered pedestals
    const tiers = [
      { rank: 2, x: -1.65, h: 1.35, color: 0x60a5fa, label: '2ND' },
      { rank: 1, x: 0.0, h: 1.85, color: 0xfbbf24, label: '1ST' },
      { rank: 3, x: 1.65, h: 1.05, color: 0xf97316, label: '3RD' },
    ];
    for (const t of tiers) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, t.h, 1.2),
        new THREE.MeshStandardMaterial({
          color: t.color,
          metalness: 0.16,
          roughness: 0.24,
        })
      );
      block.position.set(t.x, -1.6 + t.h * 0.5, 0);
      this.podiumGroup.add(block);
    }

    // 3 Golden 3D Stars above podium
    this.podiumStarsMeshes = [];
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        this.sharedMats.goldMat
      );
      star.position.set((i - 1) * 1.25, 1.15 + (i === 1 ? 0.3 : 0), 0.35);
      this.podiumGroup.add(star);
      this.podiumStarsMeshes.push(star);
    }
  }

  resize(width, height) {
    const w = Math.max(1, Number(width) || 1280);
    const h = Math.max(1, Number(height) || 800);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;

    // Frame the chamber so it always fills >= 60% of the viewport cleanly
    // Chamber spans width ~9.2 (-4.6..4.6) and height ~11.6 (-5.2..6.4)
    const targetWidth = 9.8;
    const targetHeight = 12.2;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const distForHeight = (targetHeight * 0.5) / Math.tan(fovRad * 0.5);
    const distForWidth = (targetWidth * 0.5) / (Math.tan(fovRad * 0.5) * this.camera.aspect);
    const camZ = Math.max(distForHeight, distForWidth);

    this.camera.position.set(0, 0.32, camZ);
    this.camera.lookAt(0, 0.32, 0);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Projects screen clientX/clientY onto the z=0 playfield plane
   */
  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 1 };
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.playfieldPlane, hit);
    return { x: hit.x, y: hit.y };
  }

  /**
   * Checks if clientX/clientY hits the 3D Penguin/Feeder Swap station
   */
  hitTestInteractive(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveTargets, true);
    if (hits.length > 0) {
      return hits[0].object.userData.interactiveRole || null;
    }
    return null;
  }

  render(simState, uiScreen = 'playing') {
    const tick = simState.tick || 0;

    // 1. Update compressor ceiling bar & rotating gears
    this.ceilingGroup.position.y = simState.ceilingY;
    for (let i = 0; i < this.ceilingGearMeshes.length; i++) {
      this.ceilingGearMeshes[i].rotation.z = (i % 2 === 0 ? 1 : -1) * tick * 0.03;
    }

    // 2. Update Cannon aim rotation & crew animation
    this.cannonTurret.rotation.z = -simState.aimAngle;
    this.cannonWheel.rotation.z = simState.aimAngle * 2.5;
    this.dragonCrew.rotation.z = -simState.aimAngle * 0.22;
    this.dragonCrew.position.y = -0.1 + Math.sin(tick * 0.1) * 0.04;
    this.penguinCrew.position.y = -0.12 + Math.cos(tick * 0.1) * 0.04;

    // 3. Update Current & Next bubbles in Cannon & Penguin Feeder
    this._configureBubbleVisual(
      this.currentBubbleHolder,
      simState.projectile ? null : simState.currentBubble,
      tick
    );
    this._configureBubbleVisual(this.nextBubbleHolder, simState.nextBubble, tick);

    // 4. Update Flying Projectile
    if (simState.projectile) {
      this._configureBubbleVisual(this.projectileHolder, simState.projectile, tick);
      this.projectileHolder.group.position.set(simState.projectile.x, simState.projectile.y, 0.25);
    } else {
      this.projectileHolder.group.visible = false;
    }

    // 5. Update Hex Grid Attached Bubbles using object pool
    const bubbles = simState.bubbles || [];
    while (this.bubbleMeshPool.length < bubbles.length) {
      const holder = this._createBubbleVisualGroup();
      this.rootGroup.add(holder.group);
      this.bubbleMeshPool.push(holder);
    }
    for (let i = 0; i < this.bubbleMeshPool.length; i++) {
      const holder = this.bubbleMeshPool[i];
      if (i < bubbles.length) {
        const b = bubbles[i];
        this._configureBubbleVisual(holder, b, tick);
        holder.group.position.set(b.x, b.y, 0.12);
      } else {
        holder.group.visible = false;
      }
    }

    // 6. Update Gravity-Falling Avalanche Bubbles
    const falling = simState.fallingBubbles || [];
    while (this.fallingMeshPool.length < falling.length) {
      const holder = this._createBubbleVisualGroup();
      this.rootGroup.add(holder.group);
      this.fallingMeshPool.push(holder);
    }
    for (let i = 0; i < this.fallingMeshPool.length; i++) {
      const holder = this.fallingMeshPool[i];
      if (i < falling.length) {
        const fb = falling[i];
        this._configureBubbleVisual(holder, fb, tick);
        holder.group.position.set(fb.x, fb.y, 0.32);
      } else {
        holder.group.visible = false;
      }
    }

    // 7. Update 5 Bottom Bonus Cauldrons bounce pulse on catch
    for (let i = 0; i < this.cauldronGroups.length; i++) {
      const cg = this.cauldronGroups[i];
      const cState = simState.cauldrons && simState.cauldrons[i];
      const age = cState ? tick - (cState.lastHitTick ?? -999) : 999;
      const bounce = age >= 0 && age < 25 ? 1 + Math.sin((1 - age / 25) * Math.PI) * 0.22 : 1;
      cg.scale.set(bounce, bounce, bounce);
    }

    // 8. Update Live 3D Pearl Trajectory Preview Ray & Ghost Hex Snap Ring
    const showPreview = simState.status === 'playing' && !simState.projectile && simState.trajectory;
    if (showPreview) {
      this.trajectoryGroup.visible = true;
      const curColor = simState.currentBubble?.color || 'yellow';
      const hexColor = COLOR_PALETTE[curColor]?.hex || 0xfef08a;
      this.pearlMat.color.setHex(hexColor);

      const pearls = simState.trajectory.pearls || [];
      for (let i = 0; i < this.pearlMeshes.length; i++) {
        const pm = this.pearlMeshes[i];
        if (i < pearls.length) {
          pm.visible = true;
          pm.position.set(pearls[i].x, pearls[i].y, 0.18);
          const pulse = 0.85 + Math.sin(tick * 0.2 - i * 0.35) * 0.2;
          pm.scale.setScalar(pulse);
        } else {
          pm.visible = false;
        }
      }

      if (simState.trajectory.snapCell) {
        this.ghostSnapRing.visible = true;
        this.ghostSnapRing.position.set(
          simState.trajectory.snapCell.x,
          simState.trajectory.snapCell.y,
          0.22
        );
        const ringPulse = 0.92 + Math.sin(tick * 0.18) * 0.1;
        this.ghostSnapRing.scale.setScalar(ringPulse);
      } else {
        this.ghostSnapRing.visible = false;
      }
    } else {
      this.trajectoryGroup.visible = false;
    }

    // 9. Update 3D Star Podium visibility & spinning stars
    const showPodium = uiScreen === 'podium' || simState.status !== 'playing';
    this.podiumGroup.visible = showPodium;
    if (showPodium) {
      const starsEarned = simState.podiumStars || 0;
      for (let i = 0; i < this.podiumStarsMeshes.length; i++) {
        const sMesh = this.podiumStarsMeshes[i];
        sMesh.visible = i < starsEarned;
        sMesh.rotation.y = tick * 0.05 + i;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
