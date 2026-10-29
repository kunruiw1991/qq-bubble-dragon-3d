# 🐉 QQ泡泡龙 3D — QQ Bubble Dragon Shooter 3D

**Live Playable Demo:** [https://kunruiw1991.github.io/qq-bubble-dragon-3d/](https://kunruiw1991.github.io/qq-bubble-dragon-3d/)

![QQ Bubble Dragon Shooter 3D Gameplay Screenshot](./screenshot.jpg)

A vibrant, glossy **Three.js r170 WebGL2 3D** remake of Tencent QQ Game Hall's classic **QQ泡泡龙 (*Puzzle Bobble*)**, crafted for both young kids on iPad touchscreens and nostalgic desktop arcade players.

---

## ✨ Authentic Gameplay & 3D Arcade Features

1. **3D Crystal-Arcade Stage, Geared Brass Cannon & Chibi Crew**:
   - **Bevelled 3D Crystal Side Rails** with golden bands and elastic wall-ricochet physics.
   - **Descending Geared Compressor Ceiling Bar** with 4 animated 3D brass cogwheels and twin piston shafts.
   - **5 Glowing 3D Bonus Cauldrons (`50 / 100 / 250 / 100 / 50`)** arrayed along the arcade floor.
   - **Geared Brass-and-Candy 3D Bubble Launcher Cannon** operated by a bespoke **3D Chibi Bubble Dragon (`泡泡小恐龙`)** and **3D QQ Penguin Co-Pilot (`QQ小企鹅`)** manning the crystal **Next-Bubble Feeder Pad (`换球台`)**.
   - **Glossy Translucent Inner-Emblem Candy Bubbles**: Every bubble features a translucent candy shell, cartoon highlight dome, and a distinct 3D inner emblem (`Ruby Octahedron`, `Golden Star`, `Ocean Teardrop`, `Emerald Clover`, `Amethyst Knot`, `Tangerine Sun-Wheel`) so colors are 100% distinguishable by both hue and 3D shape.

2. **Exact Offset Hex-Grid Physics, 3+ BFS Pop & Ceiling-Detachment Avalanche (`掉落加分`)**:
   - **120Hz Substepped Flight & Elastic Wall Ricochet**: Aim clamped cleanly (`-78°` to `+78°`) with a live **3D Pearl Trajectory Preview Ray** (including wall-bounce reflection) and **3D Ghost Hex Snap Ring** guaranteed to match the actual landing hex cell.
   - **Deterministic Hex Snap**: Even rows (`8` columns) and odd half-offset rows (`7` columns) with zero overlapping cells, zero out-of-bounds snaps, and zero floating unanchored snaps.
   - **3+ Connected Color BFS & Ceiling-Anchor Avalanche**: Matching `>= 3` connected same-color bubbles pops them with 3D burst particles, then immediately runs a ceiling-anchor BFS from `row === 0` so all unanchored floating islands detach simultaneously and rain into the **5 Bonus Cauldrons (`50 / 100 / 250 / 100 / 50`)** with cascading marimba chimes.
   - **Smart Remaining-Color Shooter Filter**: Only colors still present on the board spawn in the launcher during stage clearing.

3. **Bubble Swap (`换球`) & 3 Special Bubbles (`必杀泡泡`)**:
   - **Swap Current / Next Bubble (`换球`)**: Tap the 3D QQ Penguin feeder pad, tap the `🔄 换球` HUD button, or press `S` / `Shift`.
   - **Bomb Bubble (`炸弹泡泡`)**: Blasts a 2-hex radius crater on impact.
   - **Rainbow Bubble (`彩虹泡泡`)**: Universal wildcard that matches and pops all adjacent bubble color clusters simultaneously.
   - **Star Lightning Bubble (`闪电泡泡`)**: Zaps and clears the entire horizontal row on impact.

4. **2 Game Modes & 8 Progressive Stages**:
   - **8 Progressive Stages (`闯关模式`)**: Combines classic **Clear All** stages and **Star-Critter Dragon Egg Rescue (`星星龙蛋营救`)** stages, culminating in a **3D Top-3 Star Podium (`★★★`)**.
   - **Endless Arcade (`无尽挑战`)**: Continuous survival mode where new bubble rows feed from the top ceiling while you chain massive cauldron avalanches.

---

## 🎮 Controls (iPad Touch & Desktop Keyboard)

| Input | Action |
| :--- | :--- |
| **Touch / Mouse Drag on 3D Stage** | 1:1 continuous aim with live 3D pearl trajectory & ghost snap ring; **release to fire** |
| **Tap 3D QQ Penguin / `🔄 换球` Button / `S` / `Shift`** | Swap Current & Next Bubble |
| **`🚀 发射` Button / `Space` / `ArrowUp` / `Enter`** | Fire Bubble |
| **`ArrowLeft` / `ArrowRight` / `A` / `D`** | Fine-adjust Cannon Aim Angle |
| **`⚡ 必杀` Button / `E`** | Activate / Equip Special Bubble (`Bomb` / `Rainbow` / `Lightning`) |
| **`🔊 音乐` Button / `M`** | Toggle WebAudio Synthesized Arcade BGM & SFX |
| **`🏠 选关` Button** | Open Stage & Mode Selection Menu |

---

## 🧪 Local Development & Headless WebGL2 E2E Verification

Zero build step or bundler is required; all ES modules use Safari-safe relative paths (`./src/*.js`, `../vendor/three.module.min.js`) with zero `<script type="importmap">`.

```bash
# Serve locally
python3 -m http.server 8080

# Run the full 34-test headless Chrome WebGL2 E2E test suite
python3 tests/run_e2e.py --capture-screenshot
```
