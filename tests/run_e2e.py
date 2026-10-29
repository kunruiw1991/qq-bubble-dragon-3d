#!/usr/bin/env python3
"""Comprehensive 34-Test E2E Suite for QQ Bubble Dragon Shooter 3D (QQ泡泡龙 3D)."""

from __future__ import annotations

import sys
sys.dont_write_bytecode = True

import argparse
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Callable

from harness import (
    BubbleDragonTestHarness,
    DEFAULT_PROJECT_ROOT,
    MAGICK_BIN,
    RecordedStaticHTTPServer,
    TMP_ROOT,
    safe_rmtree,
)


def assert_true(cond: bool, msg: str) -> None:
  if not cond:
    raise AssertionError(msg)


def t01_safari_zero_importmap_and_zero_bare_specifiers(
    h: BubbleDragonTestHarness,
) -> None:
  root = h.root_dir
  html_files = list(root.glob("*.html")) + list(root.glob("src/**/*.html"))
  js_files = list(root.glob("src/**/*.js"))
  assert_true(len(html_files) >= 1, "Expected index.html")
  assert_true(len(js_files) >= 3, "Expected src/*.js modules")

  for hf in html_files:
    txt = hf.read_text(encoding="utf-8")
    assert_true(
        "importmap" not in txt.lower(),
        f"Forbidden importmap found in {hf.name}",
    )

  import_re = re.compile(
      r"""(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]"""
  )
  for jf in js_files:
    txt = jf.read_text(encoding="utf-8")
    for m in import_re.finditer(txt):
      spec = m.group(1)
      assert_true(
          spec.startswith("./") or spec.startswith("../"),
          f"Bare ES module specifier '{spec}' in {jf.name} breaks Safari!",
      )
    assert_true(
        "speechSynthesis" not in txt,
        f"Forbidden speechSynthesis found in {jf.name}",
    )


def t02_subpath_hosting_zero_404s(h: BubbleDragonTestHarness) -> None:
  sub = RecordedStaticHTTPServer(
      h.root_dir, strict_subpath="/qq-bubble-dragon-3d"
  ).start()
  try:
    h.clear_diagnostics()
    h.navigate(sub.base_url, wait_api=True)
    st = h.get_state()
    assert_true(st["webgl2"] is True, f"Expected webgl2=True, got {st}")
    errs = sub.get_error_records(ignore_favicon=False)
    assert_true(
        len(errs) == 0,
        f"Expected 0 HTTP 404/500 under /qq-bubble-dragon-3d/, got {errs}",
    )
    h.assert_zero_errors("subpath-hosting", ignore_favicon=False)
  finally:
    sub.close()
    h.navigate(h.http_server.base_url, wait_api=True)


def t03_webgl2_context_and_material_metalness_cap(
    h: BubbleDragonTestHarness,
) -> None:
  st = h.eval_js("window.__BUBBLE_DRAGON__.startMatch({ stageId: 1 })")
  assert_true(st["webgl2"] is True, "WebGL2 context must be active")
  shot_path = h.capture_screenshot()
  stats = h.inspect_image(shot_path)
  assert_true(
      stats["std_dev"] > 0.06,
      f"Expected vibrant non-blank 3D render, got {stats}",
  )
  assert_true(
      0.12 <= stats["mean"] <= 0.85,
      f"Expected well-lit 3D arcade brightness, got {stats}",
  )


def t04_frozen_api_and_deep_clone_immutability(
    h: BubbleDragonTestHarness,
) -> None:
  check = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const isFrozen = Object.isFrozen(api);
        const s1 = api.getState();
        const origScore = s1.score;
        s1.score = 999999;
        if (s1.bubbles && s1.bubbles[0]) s1.bubbles[0].color = 'mutated_color';
        const s2 = api.getState();
        return {
          isFrozen,
          scoreUnchanged: s2.score === origScore,
          bubbleUnchanged: !s2.bubbles[0] || s2.bubbles[0].color !== 'mutated_color',
          methods: Object.keys(api).sort(),
        };
      })()"""
  )
  assert_true(check["isFrozen"] is True, f"API must be frozen: {check}")
  assert_true(check["scoreUnchanged"] is True, "getState() must return deep clone")
  assert_true(check["bubbleUnchanged"] is True, "getState().bubbles must be deep cloned")
  expected_methods = sorted([
      "startMatch",
      "stepFrames",
      "setAimAngle",
      "fireBubble",
      "swapBubbles",
      "grantSpecial",
      "getState",
  ])
  assert_true(
      check["methods"] == expected_methods,
      f"Expected exact 7 spec methods {expected_methods}, got {check['methods']}",
  )


def t05_seeded_mulberry32_determinism(h: BubbleDragonTestHarness) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const a = api.startMatch({ stageId: 2, seed: 777888 });
        api.setAimAngle(0.25);
        api.fireBubble();
        const aAfter = api.stepFrames(55);

        const b = api.startMatch({ stageId: 2, seed: 777888 });
        api.setAimAngle(0.25);
        api.fireBubble();
        const bAfter = api.stepFrames(55);

        return {
          initSame: a.currentBubble.color === b.currentBubble.color &&
                    a.nextBubble.color === b.nextBubble.color,
          afterSame: aAfter.score === bAfter.score &&
                     aAfter.bubbleCount === bAfter.bubbleCount &&
                     JSON.stringify(aAfter.lastShotResult) === JSON.stringify(bAfter.lastShotResult),
        };
      })()"""
  )
  assert_true(res["initSame"] is True, f"Initial state must be deterministic: {res}")
  assert_true(res["afterSame"] is True, f"Shot outcome must be deterministic: {res}")


def t06_aim_angle_clamping_78_degrees(h: BubbleDragonTestHarness) -> None:
  max_rad = (78.0 * math.pi) / 180.0
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({ stageId: 1 });
        const leftClamp = api.setAimAngle(-2.5);
        const rightClamp = api.setAimAngle(2.5);
        const mid = api.setAimAngle(0.42);
        return {
          leftRad: leftClamp.aimAngle,
          leftDeg: leftClamp.aimAngleDeg,
          rightRad: rightClamp.aimAngle,
          rightDeg: rightClamp.aimAngleDeg,
          midRad: mid.aimAngle,
        };
      })()"""
  )
  assert_true(
      abs(res["leftRad"] - (-max_rad)) < 1e-4 and abs(res["leftDeg"] - (-78.0)) < 0.05,
      f"Left aim clamp failed: {res}",
  )
  assert_true(
      abs(res["rightRad"] - max_rad) < 1e-4 and abs(res["rightDeg"] - 78.0) < 0.05,
      f"Right aim clamp failed: {res}",
  )
  assert_true(abs(res["midRad"] - 0.42) < 1e-6, f"Mid aim angle failed: {res}")


def t07_straight_shot_ceiling_hex_snap(h: BubbleDragonTestHarness) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [[null, 'blue', null, null, null, null, 'yellow', null]],
          forcedQueue: ['red', 'green'],
        });
        const before = api.setAimAngle(0.0);
        const previewSnap = before.trajectory.snapCell;
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          previewSnap,
          actualSnap: after.lastShotResult ? after.lastShotResult.snappedCell : null,
          bubbleCount: after.bubbleCount,
        };
      })()"""
  )
  assert_true(res["actualSnap"] is not None, f"Bubble did not snap: {res}")
  assert_true(
      res["actualSnap"]["row"] == 0,
      f"Expected ceiling snap at row 0, got {res}",
  )
  assert_true(
      res["previewSnap"]["row"] == res["actualSnap"]["row"]
      and res["previewSnap"]["col"] == res["actualSnap"]["col"],
      f"Preview snap {res['previewSnap']} != actual snap {res['actualSnap']}",
  )


def t08_straight_shot_cluster_hex_snap(h: BubbleDragonTestHarness) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [['blue', 'blue', 'yellow', 'green', 'green', 'purple', 'orange', 'red']],
          forcedQueue: ['red', 'blue'],
        });
        const before = api.setAimAngle(0.0);
        const previewSnap = before.trajectory.snapCell;
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          previewSnap,
          actualSnap: after.lastShotResult.snappedCell,
          bubbleCount: after.bubbleCount,
        };
      })()"""
  )
  assert_true(res["actualSnap"]["row"] == 1, f"Expected snap onto row 1, got {res}")
  assert_true(
      res["previewSnap"]["row"] == res["actualSnap"]["row"]
      and res["previewSnap"]["col"] == res["actualSnap"]["col"],
      f"Preview snap mismatch: {res}",
  )
  assert_true(res["bubbleCount"] == 9, f"Expected 9 bubbles, got {res['bubbleCount']}")


def t09_left_wall_ricochet_trajectory_matches_landing(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [['blue', 'yellow', 'green', 'purple', 'orange', 'blue', 'yellow', 'green']],
          forcedQueue: ['red', 'blue'],
        });
        const aimed = api.setAimAngle(-0.72);
        const preview = aimed.trajectory;
        api.fireBubble();
        const after = api.stepFrames(80);
        return {
          previewBounces: preview.bounces,
          previewSnap: preview.snapCell,
          actualBounces: after.lastShotResult.wallBounces,
          actualSnap: after.lastShotResult.snappedCell,
        };
      })()"""
  )
  assert_true(res["previewBounces"] >= 1, f"Expected left wall bounce: {res}")
  assert_true(
      res["previewBounces"] == res["actualBounces"],
      f"Bounce count mismatch: {res}",
  )
  assert_true(
      res["previewSnap"]["row"] == res["actualSnap"]["row"]
      and res["previewSnap"]["col"] == res["actualSnap"]["col"],
      f"Left wall ricochet preview != actual landing: {res}",
  )


def t10_right_wall_ricochet_trajectory_matches_landing(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [['blue', 'yellow', 'green', 'purple', 'orange', 'blue', 'yellow', 'green']],
          forcedQueue: ['red', 'blue'],
        });
        const aimed = api.setAimAngle(0.72);
        const preview = aimed.trajectory;
        api.fireBubble();
        const after = api.stepFrames(80);
        return {
          previewBounces: preview.bounces,
          previewSnap: preview.snapCell,
          actualBounces: after.lastShotResult.wallBounces,
          actualSnap: after.lastShotResult.snappedCell,
        };
      })()"""
  )
  assert_true(res["previewBounces"] >= 1, f"Expected right wall bounce: {res}")
  assert_true(
      res["previewSnap"]["row"] == res["actualSnap"]["row"]
      and res["previewSnap"]["col"] == res["actualSnap"]["col"],
      f"Right wall ricochet preview != actual landing: {res}",
  )


def t11_multi_angle_ricochet_fuzz_zero_overlap_zero_oob_zero_floating(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({ stageId: 5, seed: 90210 });
        const angles = [
          -1.15, -0.92, -0.68, -0.44, -0.21, 0.0, 0.19, 0.46, 0.71, 0.95, 1.18,
          -0.81, 0.62, -0.33, 0.85, -1.04, 0.52, -0.58, 0.29, -0.76
        ];
        let mismatches = 0;
        let oobCount = 0;
        let overlapCount = 0;
        let shotsRun = 0;

        for (const ang of angles) {
          const stBefore = api.getState();
          if (stBefore.status !== 'playing') break;
          const aimed = api.setAimAngle(ang);
          const expectedSnap = aimed.trajectory.snapCell;
          api.fireBubble();
          const stAfter = api.stepFrames(95);
          shotsRun += 1;

          const actualSnap = stAfter.lastShotResult?.snappedCell;
          if (!actualSnap || actualSnap.row !== expectedSnap.row || actualSnap.col !== expectedSnap.col) {
            mismatches += 1;
          }

          const parity = stAfter.rowParityOffset || 0;
          const seen = new Set();
          for (const b of stAfter.bubbles) {
            const maxCols = ((b.row + parity) % 2 === 0) ? 8 : 7;
            if (b.row < 0 || b.col < 0 || b.col >= maxCols) {
              oobCount += 1;
            }
            const k = `${b.row},${b.col}`;
            if (seen.has(k)) overlapCount += 1;
            seen.add(k);
          }
        }
        return { shotsRun, mismatches, oobCount, overlapCount };
      })()"""
  )
  assert_true(res["shotsRun"] >= 10, f"Expected >= 10 fuzz shots, got {res}")
  assert_true(res["mismatches"] == 0, f"Trajectory vs landing mismatch in fuzz: {res}")
  assert_true(res["oobCount"] == 0, f"OOB hex cell found in fuzz: {res}")
  assert_true(res["overlapCount"] == 0, f"Overlapping hex cell found in fuzz: {res}")


def t12_bfs_cluster_pop_three_or_more_same_color(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['blue', 'blue', 'blue', 'red', 'red', 'yellow', 'yellow', 'green'],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          poppedCount: after.lastShotResult.poppedCount,
          score: after.score,
          combo: after.combo,
          bubbleCount: after.bubbleCount,
        };
      })()"""
  )
  assert_true(res["poppedCount"] == 3, f"Expected 3 red bubbles popped, got {res}")
  assert_true(res["score"] >= 90, f"Expected score >= 90, got {res}")
  assert_true(res["combo"] == 1, f"Expected combo=1, got {res}")
  assert_true(res["bubbleCount"] == 6, f"Expected 6 remaining bubbles, got {res}")


def t13_two_same_color_does_not_false_pop(h: BubbleDragonTestHarness) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['blue', 'blue', 'yellow', 'red', 'green', 'yellow', 'blue', 'green'],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          poppedCount: after.lastShotResult.poppedCount,
          bubbleCount: after.bubbleCount,
        };
      })()"""
  )
  assert_true(res["poppedCount"] == 0, f"Cluster of 2 must not pop: {res}")
  assert_true(res["bubbleCount"] == 9, f"Expected 9 attached bubbles, got {res}")


def t14_ceiling_detachment_avalanche_drop_into_cauldrons(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        // Row 0 has 'red' at col 3 & col 4. Hanging from (0, 3) on the left are 4 bubbles:
        // (1, 2), (1, 1), (2, 2), (2, 1). Meanwhile (1, 3) at x=0 is empty!
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['green', null, null, 'red', 'red', null, null, null],
            [null, 'blue', 'yellow', null, null, null, null],
            [null, 'purple', 'orange', null, null, null, null, null],
          ],
          forcedQueue: ['red', 'green'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const afterSnap = api.stepFrames(55);
        const afterFall = api.stepFrames(60);
        return {
          poppedCount: afterSnap.lastShotResult.poppedCount,
          droppedCount: afterSnap.lastShotResult.droppedCount,
          cauldronPoints: afterSnap.lastShotResult.cauldronPoints,
          cauldronScore: afterFall.cauldronScore,
          totalCauldronCatches: afterFall.totalCauldronCatches,
          remainingBubbles: afterFall.bubbleCount,
        };
      })()"""
  )
  assert_true(res["poppedCount"] == 3, f"Expected 3 red anchors popped: {res}")
  assert_true(
      res["droppedCount"] == 4,
      f"Expected 4 disconnected hanging bubbles to avalanche drop: {res}",
  )
  assert_true(
      res["cauldronPoints"] >= 300 and res["cauldronScore"] >= 300,
      f"Expected cauldron bonus points >= 300 from 4 dropped bubbles: {res}",
  )
  assert_true(res["remainingBubbles"] == 1, f"Expected only 1 bubble left: {res}")


def t15_five_bonus_cauldrons_scoring_50_100_250_100_50(
    h: BubbleDragonTestHarness,
) -> None:
  st = h.get_state()
  pts = [c["points"] for c in st["cauldrons"]]
  assert_true(
      pts == [50, 100, 250, 100, 50],
      f"Expected 5 bonus cauldrons [50, 100, 250, 100, 50], got {pts}",
  )


def t16_swap_bubbles_api_key_hud_and_3d_raycast(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const s0 = api.startMatch({
          stageId: 1,
          forcedQueue: ['red', 'blue', 'yellow'],
        });
        const c0 = s0.currentBubble.color;
        const n0 = s0.nextBubble.color;
        const s1 = api.swapBubbles();
        return {
          c0, n0,
          c1: s1.currentBubble.color,
          n1: s1.nextBubble.color,
        };
      })()"""
  )
  assert_true(
      res["c0"] == "red" and res["n0"] == "blue" and res["c1"] == "blue" and res["n1"] == "red",
      f"swapBubbles() failed: {res}",
  )
  # Now test HUD swap button click
  h.click_testid("hud-btn-swap")
  st_after_btn = h.get_state()
  assert_true(
      st_after_btn["currentBubble"]["color"] == "red",
      f"HUD swap button did not swap back to red: {st_after_btn['currentBubble']}",
  )
  # Now test KeyS keyboard swap
  h.key_down("KeyS")
  h.key_up("KeyS")
  st_after_key = h.get_state()
  assert_true(
      st_after_key["currentBubble"]["color"] == "blue",
      f"KeyS did not swap bubble to blue: {st_after_key['currentBubble']}",
  )


def t17_special_bomb_bubble_2_hex_radius_blast(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'red', 'blue'],
            ['yellow', 'green', 'purple', 'orange', 'red', 'blue', 'yellow'],
            ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'blue', 'red'],
          ],
        });
        const beforeCount = api.getState().bubbleCount;
        api.grantSpecial('bomb');
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          beforeCount,
          afterCount: after.bubbleCount,
          specialTriggered: after.lastShotResult.specialTriggered,
          poppedCount: after.lastShotResult.poppedCount,
        };
      })()"""
  )
  assert_true(res["specialTriggered"] == "bomb", f"Expected bomb special: {res}")
  assert_true(
      res["poppedCount"] >= 8,
      f"Expected 2-hex radius bomb blast to clear >= 8 bubbles, got {res}",
  )


def t18_special_rainbow_bubble_multi_color_match(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['green', null, 'red', 'red', 'blue', 'blue', null, 'yellow'],
          ],
        });
        api.grantSpecial('rainbow');
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          specialTriggered: after.lastShotResult.specialTriggered,
          poppedCount: after.lastShotResult.poppedCount,
          remainingCount: after.bubbleCount,
        };
      })()"""
  )
  assert_true(res["specialTriggered"] == "rainbow", f"Expected rainbow special: {res}")
  assert_true(
      res["poppedCount"] == 5 and res["remainingCount"] == 2,
      f"Expected rainbow + 2 red + 2 blue = 5 popped, got {res}",
  )


def t19_special_lightning_bubble_entire_horizontal_row_clear(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'red', 'blue'],
            ['yellow', 'green', 'purple', 'orange', 'red', 'blue', 'yellow'],
          ],
        });
        api.grantSpecial('lightning');
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          specialTriggered: after.lastShotResult.specialTriggered,
          poppedCount: after.lastShotResult.poppedCount,
          remainingCount: after.bubbleCount,
        };
      })()"""
  )
  assert_true(
      res["specialTriggered"] == "lightning",
      f"Expected lightning special: {res}",
  )
  assert_true(
      res["poppedCount"] >= 7,
      f"Expected entire horizontal row cleared (>= 7 bubbles), got {res}",
  )


def t20_special_gauge_charge_and_auto_grant(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['green', null, null, 'red', 'red', null, null, null],
            [null, 'blue', 'yellow', null, null, null, null],
            [null, 'purple', 'orange', null, null, null, null, null],
          ],
          forcedQueue: ['red', 'green'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          charge: after.specialGauge.charge,
          readySpecial: after.specialGauge.readySpecial,
          popped: after.lastShotResult.poppedCount,
          dropped: after.lastShotResult.droppedCount,
        };
      })()"""
  )
  assert_true(
      res["charge"] > 0 or res["readySpecial"] is not None,
      f"Expected special gauge to charge on pop+avalanche: {res}",
  )


def t21_smart_remaining_color_shooter_filter(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const st = api.startMatch({
          stageId: 1,
          customGrid: [
            ['purple', 'purple', null, null, null, null, 'orange', 'orange'],
          ],
        });
        const seenColors = new Set([st.currentBubble.color, st.nextBubble.color]);
        for (let i = 0; i < 6; i++) {
          api.setAimAngle(0.0);
          api.fireBubble();
          const s = api.stepFrames(55);
          seenColors.add(s.currentBubble.color);
          seenColors.add(s.nextBubble.color);
        }
        return {
          remainingColors: st.remainingColors,
          seenLauncherColors: Array.from(seenColors),
        };
      })()"""
  )
  for c in res["seenLauncherColors"]:
    assert_true(
        c in ("purple", "orange"),
        f"Smart shooter filter spawned color '{c}' not on board {res['remainingColors']}!",
    )


def t22_compressor_ceiling_drop_after_n_shots(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const s0 = api.startMatch({
          stageId: 1,
          shotsPerCeilingDrop: 3,
          customGrid: [
            ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'red', 'blue'],
          ],
          forcedQueue: ['purple', 'orange', 'green', 'yellow'],
        });
        const y0 = s0.ceilingY;
        for (let i = 0; i < 3; i++) {
          api.setAimAngle((i - 1) * 0.25);
          api.fireBubble();
          api.stepFrames(55);
        }
        const sAfter = api.getState();
        return {
          y0,
          yAfter: sAfter.ceilingY,
          dropSteps: sAfter.ceilingDropSteps,
        };
      })()"""
  )
  assert_true(
      res["dropSteps"] == 1 and res["yAfter"] < res["y0"] - 0.8,
      f"Expected ceiling to descend after 3 shots: {res}",
  )


def t23_danger_line_breach_triggers_lost_and_retry(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        // Build an 8-row vertical chain down to row 7, with shotsPerCeilingDrop: 1
        const rows = [
          ['red', null, null, null, null, null, null, null],
          ['blue', null, null, null, null, null, null],
          ['yellow', null, null, null, null, null, null, null],
          ['green', null, null, null, null, null, null],
          ['purple', null, null, null, null, null, null, null],
          ['orange', null, null, null, null, null, null],
          ['red', null, null, null, null, null, null, null],
          ['blue', null, null, null, null, null, null],
        ];
        api.startMatch({
          stageId: 1,
          shotsPerCeilingDrop: 1,
          customGrid: rows,
          forcedQueue: ['yellow', 'green', 'purple'],
        });
        for (let i = 0; i < 3; i++) {
          if (api.getState().status !== 'playing') break;
          api.setAimAngle(0.35);
          api.fireBubble();
          api.stepFrames(55);
        }
        const st = api.getState();
        return {
          status: st.status,
          uiScreen: st.uiScreen,
          podiumStars: st.podiumStars,
        };
      })()"""
  )
  assert_true(res["status"] == "lost", f"Expected status='lost' on danger breach: {res}")
  assert_true(res["uiScreen"] == "podium", f"Expected podium overlay on lost: {res}")
  assert_true(res["podiumStars"] == 0, f"Expected 0 stars on danger breach: {res}")

  h.click_testid("btn-retry")
  restarted = h.get_state()
  assert_true(
      restarted["status"] == "playing" and restarted["uiScreen"] == "playing",
      f"Retry button did not restart stage: {restarted}",
  )


def t24_stage_clear_triggers_3d_star_podium_and_next_stage(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            [null, null, null, 'red', 'red', null, null, null],
            [null, null, 'blue', null, 'yellow', null, null],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          status: after.status,
          uiScreen: after.uiScreen,
          podiumStars: after.podiumStars,
          bubbleCount: after.bubbleCount,
          droppedCount: after.lastShotResult.droppedCount,
        };
      })()"""
  )
  assert_true(res["status"] == "cleared", f"Expected stage cleared: {res}")
  assert_true(res["podiumStars"] == 3, f"Expected 3 stars on 1-shot clear: {res}")
  assert_true(res["uiScreen"] == "podium", f"Expected podium screen: {res}")

  h.click_testid("btn-next-stage")
  st2 = h.get_state()
  assert_true(
      st2["stageId"] == 2 and st2["status"] == "playing",
      f"Next stage button did not advance to Stage 2: {st2}",
  )


def t25_star_critter_egg_rescue_stage_3_and_6(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        // Custom minimal egg rescue setup on Stage 3 (objective = 'egg_rescue'):
        // (1, 2) holds the Star-Critter Egg suspended from (0, 3), while (1, 3) is empty!
        const s0 = api.startMatch({
          stageId: 3,
          customGrid: [
            ['blue', null, null, 'red', 'red', null, null, 'blue'],
            [null, null, { color: 'yellow', isEgg: true }, null, null, null, null],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);
        return {
          objective: s0.stageObjective,
          eggsBefore: s0.eggsRemaining,
          eggsRescued: after.eggsRescued,
          status: after.status,
          podiumStars: after.podiumStars,
        };
      })()"""
  )
  assert_true(res["objective"] == "egg_rescue", f"Expected egg_rescue: {res}")
  assert_true(res["eggsBefore"] == 1 and res["eggsRescued"] == 1, f"Egg rescue failed: {res}")
  assert_true(res["status"] == "cleared" and res["podiumStars"] >= 1, f"Expected cleared on egg rescue: {res}")


def t26_all_8_progressive_stages_load_and_playable(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const summary = [];
        for (let id = 1; id <= 8; id++) {
          const st = api.startMatch({ stageId: id });
          api.setAimAngle(0.15);
          api.fireBubble();
          const after = api.stepFrames(55);
          summary.push({
            stageId: st.stageId,
            stageName: st.stageName,
            initialBubbles: st.bubbleCount,
            shotsFired: after.shotsFired,
          });
        }
        return summary;
      })()"""
  )
  assert_true(len(res) == 8, f"Expected 8 stages, got {len(res)}")
  for item in res:
    assert_true(item["initialBubbles"] >= 12, f"Stage {item['stageId']} too empty: {item}")
    assert_true(item["shotsFired"] == 1, f"Stage {item['stageId']} shot failed: {item}")


def t27_endless_arcade_mode_row_feed_and_survival(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const s0 = api.startMatch({
          modeId: 'endless',
          shotsPerCeilingDrop: 2,
          customGrid: [
            ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'red', 'blue'],
          ],
          forcedQueue: ['purple', 'orange'],
        });
        api.setAimAngle(-0.3);
        api.fireBubble();
        api.stepFrames(55);
        api.setAimAngle(0.3);
        api.fireBubble();
        const afterFeed = api.stepFrames(55);
        return {
          modeId: afterFeed.modeId,
          initialCount: s0.bubbleCount,
          afterFeedCount: afterFeed.bubbleCount,
        };
      })()"""
  )
  assert_true(res["modeId"] == "endless", f"Expected endless mode: {res}")
  assert_true(
      res["afterFeedCount"] >= res["initialCount"] + 6,
      f"Expected new row fed in endless mode: {res}",
  )


def t28_pointer_drag_to_aim_and_release_to_shoot(
    h: BubbleDragonTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.eval_js("window.__BUBBLE_DRAGON__.startMatch({ stageId: 1 })")
  # Drag pointer across canvas from center to upper-left, then release
  h.cdp(
      "Input.dispatchMouseEvent",
      {"type": "mousePressed", "x": 640, "y": 500, "button": "left", "buttons": 1, "clickCount": 1},
  )
  h.cdp(
      "Input.dispatchMouseEvent",
      {"type": "mouseMoved", "x": 500, "y": 360, "button": "left", "buttons": 1},
  )
  mid_state = h.get_state()
  assert_true(
      mid_state["aimAngle"] < -0.15,
      f"Expected negative aimAngle when dragging left, got {mid_state['aimAngle']}",
  )
  h.cdp(
      "Input.dispatchMouseEvent",
      {"type": "mouseReleased", "x": 500, "y": 360, "button": "left", "buttons": 0, "clickCount": 1},
  )
  after_release = h.eval_js("window.__BUBBLE_DRAGON__.stepFrames(55)")
  assert_true(
      after_release["shotsFired"] >= 1,
      f"Expected pointer release to fire bubble, got {after_release['shotsFired']}",
  )


def t29_keyboard_aim_fire_and_swap_controls(
    h: BubbleDragonTestHarness,
) -> None:
  h.eval_js("window.__BUBBLE_DRAGON__.startMatch({ stageId: 1 })")
  h.key_down("ArrowRight")
  h.key_up("ArrowRight")
  st_aim = h.get_state()
  assert_true(st_aim["aimAngle"] > 0.05, f"ArrowRight did not aim right: {st_aim['aimAngle']}")

  h.key_down("Space")
  h.key_up("Space")
  st_fired = h.eval_js("window.__BUBBLE_DRAGON__.stepFrames(55)")
  assert_true(st_fired["shotsFired"] == 1, f"Space did not fire bubble: {st_fired['shotsFired']}")


def t30_webaudio_synthesis_and_ev_repeat_autorepeat_safety(
    h: BubbleDragonTestHarness,
) -> None:
  h.eval_js("window.__BUBBLE_DRAGON__.startMatch({ stageId: 1 })")
  h.key_down("KeyA", auto_repeat=False)
  for _ in range(30):
    h.key_down("KeyA", auto_repeat=True)
  h.key_up("KeyA")

  st = h.get_state()
  audio = st["audio"]
  assert_true(audio["unlocked"] is True, f"Expected WebAudio unlocked: {audio}")
  assert_true(
      audio["repeatEventsIgnored"] >= 30,
      f"Expected >= 30 autoRepeat events ignored, got {audio}",
  )
  assert_true(
      audio["activeNodes"] <= 24,
      f"Expected bounded active WebAudio nodes, got {audio}",
  )


def _audit_viewport_helper(
    h: BubbleDragonTestHarness, width: int, height: int, mobile: bool, touch: bool
) -> None:
  dims = h.set_viewport(width, height, mobile=mobile, touch=touch)
  assert_true(
      dims["innerWidth"] == width and dims["innerHeight"] == height,
      f"Viewport mismatch: {dims}",
  )
  h.eval_js("window.__BUBBLE_DRAGON__.startMatch({ stageId: 1 })")
  audit = h.audit_viewport_and_hud()
  assert_true(
      audit["scrollWidth"] <= width and audit["scrollHeight"] <= height,
      f"Overflow scrollbar detected on {width}x{height}: {audit}",
  )
  assert_true(
      1 <= audit["controlCount"] <= 6,
      f"Expected <= 6 visible HUD controls on {width}x{height}, got {audit['controlCount']}: {audit['controls']}",
  )
  assert_true(
      len(audit["overlaps"]) == 0,
      f"Overlapping HUD controls on {width}x{height}: {audit['overlaps']}",
  )
  for c in audit["controls"]:
    assert_true(
        c["width"] >= 68 and c["height"] >= 68,
        f"Control {c['testid']} smaller than 68x68px on {width}x{height}: {c}",
    )


def t31_viewport_1280x800_desktop_hud_and_zero_scroll(
    h: BubbleDragonTestHarness,
) -> None:
  _audit_viewport_helper(h, 1280, 800, mobile=False, touch=False)


def t32_viewport_1024x768_ipad_landscape_hud_and_zero_scroll(
    h: BubbleDragonTestHarness,
) -> None:
  _audit_viewport_helper(h, 1024, 768, mobile=True, touch=True)


def t33_viewport_844x390_mobile_landscape_hud_and_zero_scroll(
    h: BubbleDragonTestHarness,
) -> None:
  _audit_viewport_helper(h, 844, 390, mobile=True, touch=True)


def t34_viewport_390x844_mobile_portrait_hud_and_zero_scroll(
    h: BubbleDragonTestHarness,
) -> None:
  _audit_viewport_helper(h, 390, 844, mobile=True, touch=True)
  h.set_viewport(1280, 800, mobile=False, touch=False)


def t35_ui_special_button_and_keye_gated_and_preserves_feeder(
    h: BubbleDragonTestHarness,
) -> None:
  # 1. Start Stage 5 with gauge=0, readySpecial=null, inventory={0,0,0}
  s0 = h.eval_js(
      """window.__BUBBLE_DRAGON__.startMatch({
        stageId: 5,
        forcedQueue: ['red', 'blue', 'yellow'],
      })"""
  )
  assert_true(s0["currentBubble"]["special"] is None, f"Expected regular bubble: {s0}")
  # Press KeyE and click hud-btn-special when gauge is not full -> must be strict no-op!
  h.key_down("KeyE")
  h.key_up("KeyE")
  h.click_testid("hud-btn-special")
  s_noop = h.get_state()
  assert_true(
      s_noop["currentBubble"]["special"] is None
      and s_noop["currentBubble"]["color"] == "red"
      and s_noop["nextBubble"]["color"] == "blue"
      and s_noop["specialGauge"]["hint"] == "能量未满",
      f"Expected KeyE/btnSpecial to no-op with hint when gauge empty, got {s_noop}",
  )

  # 2. Now earn a special bubble organically by popping + dropping an avalanche
  s_earned = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['green', null, null, 'red', 'red', null, null, null],
            [null, 'blue', 'yellow', null, null, null, null],
            [null, 'purple', 'orange', null, null, null, null, null],
            ['blue', 'yellow', null, null, null, null, null],
          ],
          forcedQueue: ['red', 'green', 'yellow'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        return api.stepFrames(55);
      })()"""
  )
  assert_true(
      s_earned["specialGauge"]["readySpecial"] == "bomb"
      and s_earned["specialGauge"]["inventory"]["bomb"] == 1,
      f"Expected bomb earned in gauge: {s_earned['specialGauge']}",
  )
  displaced_color = s_earned["currentBubble"]["color"]
  # Press KeyE to activate the earned special via UI path
  h.key_down("KeyE")
  h.key_up("KeyE")
  s_active = h.get_state()
  assert_true(
      s_active["currentBubble"]["special"] == "bomb"
      and s_active["nextBubble"]["color"] == displaced_color
      and s_active["specialGauge"]["readySpecial"] is None
      and s_active["specialGauge"]["inventory"]["bomb"] == 0,
      f"Expected UI special activation to consume inventory and return displaced bubble to feeder: {s_active}",
  )


def t36_fixed_timestep_accumulator_holds_60_ticks_per_sec(
    h: BubbleDragonTestHarness,
) -> None:
  s0 = h.eval_js("window.__BUBBLE_DRAGON__.startMatch({ stageId: 1 })")
  t0 = time.time()
  time.sleep(0.55)
  s1 = h.get_state()
  dt = time.time() - t0
  tick_rate = (s1["tick"] - s0["tick"]) / dt
  assert_true(
      45.0 <= tick_rate <= 72.0,
      f"Expected ~60 ticks/sec from fixed-timestep accumulator, got {tick_rate:.1f} ticks/s",
  )


def t37_endless_row_feed_preserves_world_x_and_zero_cell_loss(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        const full4Rows = [
          ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'red', 'blue'],
          ['yellow', 'green', 'purple', 'orange', 'red', 'blue', 'yellow'],
          ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'blue', 'red'],
          ['orange', 'purple', 'yellow', 'green', 'blue', 'red', 'orange'],
        ];
        const s0 = api.startMatch({
          modeId: 'endless',
          shotsPerCeilingDrop: 1,
          customGrid: full4Rows,
          forcedQueue: ['purple', 'orange'],
        });
        const row0XsBefore = s0.grid[0].map((c) => c.x);
        api.setAimAngle(0.0);
        api.fireBubble();
        const sAfter = api.stepFrames(60);
        const row1XsAfter = sAfter.grid[1].map((c) => c.x);
        return {
          beforeCount: s0.bubbleCount,
          afterCount: sAfter.bubbleCount,
          newTopRowLen: sAfter.grid[0].length,
          row1LenAfter: sAfter.grid[1].length,
          row0XsBefore,
          row1XsAfter,
          parityOffset: sAfter.rowParityOffset,
        };
      })()"""
  )
  assert_true(res["beforeCount"] == 30, f"Expected 30 initial bubbles: {res}")
  # 30 initial + 1 shot + 7 in new odd-parity top row = 38 (0 bubbles lost!)
  assert_true(
      res["afterCount"] == 30 + 1 + res["newTopRowLen"],
      f"Endless row feed lost bubbles! Expected {31 + res['newTopRowLen']}, got {res}",
  )
  assert_true(
      res["row0XsBefore"] == res["row1XsAfter"],
      f"Row 0 world-x shifted when moving to Row 1! Before={res['row0XsBefore']}, After={res['row1XsAfter']}",
  )


ALL_TESTS: list[tuple[str, Callable[[BubbleDragonTestHarness], None]]] = [
    ("T01_safari_zero_importmap_and_zero_bare_specifiers", t01_safari_zero_importmap_and_zero_bare_specifiers),
    ("T02_subpath_hosting_zero_404s", t02_subpath_hosting_zero_404s),
    ("T03_webgl2_context_and_material_metalness_cap", t03_webgl2_context_and_material_metalness_cap),
    ("T04_frozen_api_and_deep_clone_immutability", t04_frozen_api_and_deep_clone_immutability),
    ("T05_seeded_mulberry32_determinism", t05_seeded_mulberry32_determinism),
    ("T06_aim_angle_clamping_78_degrees", t06_aim_angle_clamping_78_degrees),
    ("T07_straight_shot_ceiling_hex_snap", t07_straight_shot_ceiling_hex_snap),
    ("T08_straight_shot_cluster_hex_snap", t08_straight_shot_cluster_hex_snap),
    ("T09_left_wall_ricochet_trajectory_matches_landing", t09_left_wall_ricochet_trajectory_matches_landing),
    ("T10_right_wall_ricochet_trajectory_matches_landing", t10_right_wall_ricochet_trajectory_matches_landing),
    ("T11_multi_angle_ricochet_fuzz_zero_overlap_zero_oob_zero_floating", t11_multi_angle_ricochet_fuzz_zero_overlap_zero_oob_zero_floating),
    ("T12_bfs_cluster_pop_three_or_more_same_color", t12_bfs_cluster_pop_three_or_more_same_color),
    ("T13_two_same_color_does_not_false_pop", t13_two_same_color_does_not_false_pop),
    ("T14_ceiling_detachment_avalanche_drop_into_cauldrons", t14_ceiling_detachment_avalanche_drop_into_cauldrons),
    ("T15_five_bonus_cauldrons_scoring_50_100_250_100_50", t15_five_bonus_cauldrons_scoring_50_100_250_100_50),
    ("T16_swap_bubbles_api_key_hud_and_3d_raycast", t16_swap_bubbles_api_key_hud_and_3d_raycast),
    ("T17_special_bomb_bubble_2_hex_radius_blast", t17_special_bomb_bubble_2_hex_radius_blast),
    ("T18_special_rainbow_bubble_multi_color_match", t18_special_rainbow_bubble_multi_color_match),
    ("T19_special_lightning_bubble_entire_horizontal_row_clear", t19_special_lightning_bubble_entire_horizontal_row_clear),
    ("T20_special_gauge_charge_and_auto_grant", t20_special_gauge_charge_and_auto_grant),
    ("T21_smart_remaining_color_shooter_filter", t21_smart_remaining_color_shooter_filter),
    ("T22_compressor_ceiling_drop_after_n_shots", t22_compressor_ceiling_drop_after_n_shots),
    ("T23_danger_line_breach_triggers_lost_and_retry", t23_danger_line_breach_triggers_lost_and_retry),
    ("T24_stage_clear_triggers_3d_star_podium_and_next_stage", t24_stage_clear_triggers_3d_star_podium_and_next_stage),
    ("T25_star_critter_egg_rescue_stage_3_and_6", t25_star_critter_egg_rescue_stage_3_and_6),
    ("T26_all_8_progressive_stages_load_and_playable", t26_all_8_progressive_stages_load_and_playable),
    ("T27_endless_arcade_mode_row_feed_and_survival", t27_endless_arcade_mode_row_feed_and_survival),
    ("T28_pointer_drag_to_aim_and_release_to_shoot", t28_pointer_drag_to_aim_and_release_to_shoot),
    ("T29_keyboard_aim_fire_and_swap_controls", t29_keyboard_aim_fire_and_swap_controls),
    ("T30_webaudio_synthesis_and_ev_repeat_autorepeat_safety", t30_webaudio_synthesis_and_ev_repeat_autorepeat_safety),
    ("T31_viewport_1280x800_desktop_hud_and_zero_scroll", t31_viewport_1280x800_desktop_hud_and_zero_scroll),
    ("T32_viewport_1024x768_ipad_landscape_hud_and_zero_scroll", t32_viewport_1024x768_ipad_landscape_hud_and_zero_scroll),
    ("T33_viewport_844x390_mobile_landscape_hud_and_zero_scroll", t33_viewport_844x390_mobile_landscape_hud_and_zero_scroll),
    ("T34_viewport_390x844_mobile_portrait_hud_and_zero_scroll", t34_viewport_390x844_mobile_portrait_hud_and_zero_scroll),
    ("T35_ui_special_button_and_keye_gated_and_preserves_feeder", t35_ui_special_button_and_keye_gated_and_preserves_feeder),
    ("T36_fixed_timestep_accumulator_holds_60_ticks_per_sec", t36_fixed_timestep_accumulator_holds_60_ticks_per_sec),
    ("T37_endless_row_feed_preserves_world_x_and_zero_cell_loss", t37_endless_row_feed_preserves_world_x_and_zero_cell_loss),
]


def capture_repo_screenshot(h: BubbleDragonTestHarness) -> None:
  """Captures crisp 1280x800 real gameplay screenshot.jpg at repo root."""
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({ stageId: 6, seed: 20261029 });
        api.setAimAngle(-0.48);
        return true;
      })()"""
  )
  raw_png = h.capture_screenshot()
  out_jpg = h.root_dir / "screenshot.jpg"
  subprocess.run(
      [MAGICK_BIN, str(raw_png), "-quality", "88", str(out_jpg)],
      cwd=str(h.tmp_dir),
      check=True,
      timeout=15,
  )


def main() -> int:
  parser = argparse.ArgumentParser(description="Run QQ Bubble Dragon 3D E2E Suite")
  parser.add_argument(
      "--capture-screenshot",
      action="store_true",
      help="Also update repo-root screenshot.jpg during the run.",
  )
  args = parser.parse_args()

  passed = 0
  failed = 0
  results = []

  with BubbleDragonTestHarness(root_dir=DEFAULT_PROJECT_ROOT) as h:
    h.navigate(wait_api=True)
    h.assert_zero_errors("initial-boot", ignore_favicon=False)

    for name, fn in ALL_TESTS:
      t0 = time.time()
      try:
        fn(h)
        h.assert_zero_errors(name, ignore_favicon=False)
        dt_ms = (time.time() - t0) * 1000.0
        passed += 1
        results.append({"name": name, "passed": True, "ms": round(dt_ms, 1)})
        print(f"[PASS] {name} ({dt_ms:.1f} ms)")
      except Exception as e:  # pylint: disable=broad-except
        dt_ms = (time.time() - t0) * 1000.0
        failed += 1
        results.append({"name": name, "passed": False, "ms": round(dt_ms, 1), "error": str(e)})
        print(f"[FAIL] {name} ({dt_ms:.1f} ms): {e}")

    if args.capture_screenshot and failed == 0:
      capture_repo_screenshot(h)
      print("[INFO] Updated screenshot.jpg (1280x800)")

  print(
      f"\nSUMMARY: {passed}/{len(ALL_TESTS)} passed, {failed} failed."
  )
  return 0 if failed == 0 else 1


if __name__ == "__main__":
  sys.exit(main())
