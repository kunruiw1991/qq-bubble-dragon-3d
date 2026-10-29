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
          let stBefore = api.getState();
          if (stBefore.status !== 'playing') {
            stBefore = api.startMatch({ stageId: 17, seed: 90210 + shotsRun });
          }
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
        for (let id = 1; id <= 20; id++) {
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
  assert_true(len(res) == 20, f"Expected 20 stages, got {len(res)}")
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
      1 <= audit["controlCount"] <= 5,
      f"Expected <= 5 visible HUD controls on {width}x{height}, got {audit['controlCount']}: {audit['controls']}",
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


def t38_playfield_geometry_camera_framing_and_bubble_diameter(
    h: BubbleDragonTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  geom1280 = h.eval_js(
      """(async () => {
        const simMod = await import('./src/sim.js');
        const st = window.__BUBBLE_DRAGON__.startMatch({ stageId: 1 });
        const airRows = (simMod.BASE_CEILING_Y - simMod.DANGER_LINE_Y) / simMod.ROW_DY;
        return {
          baseCeilingY: simMod.BASE_CEILING_Y,
          dangerLineY: simMod.DANGER_LINE_Y,
          launcherY: simMod.LAUNCHER_Y,
          cauldronY: simMod.CAULDRON_Y,
          cauldronScale: simMod.CAULDRON_SCALE,
          airRows,
          metrics: st.chamberScreenMetrics,
        };
      })()"""
  )
  assert_true(
      geom1280["baseCeilingY"] == 6.0
      and geom1280["dangerLineY"] == -2.9
      and geom1280["launcherY"] == -3.6
      and geom1280["cauldronY"] == -4.85
      and geom1280["cauldronScale"] == 0.8,
      f"Playfield geometry mismatch: {geom1280}",
  )
  assert_true(
      10.1 <= geom1280["airRows"] <= 10.5,
      f"Expected ~10.3 rows of air, got {geom1280['airRows']}",
  )
  m1280 = geom1280["metrics"]
  assert_true(
      0.88 <= m1280["chamberHeightRatio"] <= 0.96,
      f"Expected chamber to fill ~92% of 1280x800 height, got {m1280}",
  )
  assert_true(
      m1280["bubbleDiameterPx"] >= 52.0,
      f"Expected bubble diameter >= 52px on 1280x800, got {m1280['bubbleDiameterPx']}",
  )

  h.set_viewport(1024, 768, mobile=True, touch=True)
  m1024 = h.eval_js("window.__BUBBLE_DRAGON__.getState().chamberScreenMetrics")
  assert_true(
      0.88 <= m1024["chamberHeightRatio"] <= 0.96,
      f"Expected chamber to fill ~92% of 1024x768 height, got {m1024}",
  )
  h.set_viewport(1280, 800, mobile=False, touch=False)


def t39_twenty_stages_seeded_template_determinism_and_endless_6rows(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(async () => {
        const simMod = await import('./src/sim.js');
        const defs = simMod.STAGE_DEFS;
        const templatesSeen = new Set();
        let parFormulaMatches = true;
        let dropScheduleMatches = true;
        for (const d of defs) {
          if (d.id >= 9) templatesSeen.add(d.template);
          const expectedPar = simMod.computeParShotsForRows(d.rows);
          if (d.parShots !== expectedPar) parFormulaMatches = false;
          const expectedDrop = d.id >= 12 ? 7 : 9;
          if (d.shotsPerDrop !== expectedDrop) dropScheduleMatches = false;
        }
        const genA = simMod.generateStageFromTemplate({
          id: 14, name: 'A', subtitle: 'A', template: 'zigzag', numRows: 7, numColors: 5, eggCount: 0, shotsPerDrop: 7, seed: 77777
        });
        const genB = simMod.generateStageFromTemplate({
          id: 14, name: 'A', subtitle: 'A', template: 'zigzag', numRows: 7, numColors: 5, eggCount: 0, shotsPerDrop: 7, seed: 77777
        });
        const endlessSt = window.__BUBBLE_DRAGON__.startMatch({ modeId: 'endless', seed: 20261029 });
        const occupiedRows = endlessSt.grid.filter((r) => r.some((c) => c !== null)).length;
        return {
          stageCount: defs.length,
          templatesSeen: Array.from(templatesSeen).sort(),
          parFormulaMatches,
          dropScheduleMatches,
          deterministicMatch: JSON.stringify(genA.rows) === JSON.stringify(genB.rows),
          endlessOccupiedRows: occupiedRows,
          endlessShotsPerDrop: endlessSt.shotsPerDrop,
        };
      })()"""
  )
  assert_true(res["stageCount"] == 20, f"Expected 20 stages, got {res}")
  assert_true(
      res["templatesSeen"] == ["checker", "double-arch", "egg-nest", "pyramid", "stripes", "zigzag"],
      f"Missing stage templates in stages 9-20: {res['templatesSeen']}",
  )
  assert_true(res["parFormulaMatches"], f"parShots formula ceil(bubbles/3.2)+2 mismatch: {res}")
  assert_true(res["dropScheduleMatches"], f"shotsPerDrop 9->7 from stage 12 mismatch: {res}")
  assert_true(res["deterministicMatch"], f"Seeded stage generator not deterministic: {res}")
  assert_true(
      res["endlessOccupiedRows"] == 6 and res["endlessShotsPerDrop"] == 5,
      f"Expected endless mode to start with 6 rows and feed every 5 shots, got {res}",
  )


def t40_stage_select_20_unlock_persistence_and_qq_hall_progress(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        // Seed another game's key in qq_hall_progress to verify read-modify-write merge
        window.localStorage.setItem('qq_hall_progress', JSON.stringify({
          kart: { plays: 3, best: 120, stars: 2, last: '2026-10-01T00:00:00.000Z' }
        }));
        window.localStorage.removeItem('qq_bubble_progress');

        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            [null, null, null, 'red', 'red', null, null, null],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const after = api.stepFrames(55);

        const bubbleProg = JSON.parse(window.localStorage.getItem('qq_bubble_progress') || '{}');
        const hallProg = JSON.parse(window.localStorage.getItem('qq_hall_progress') || '{}');
        const stageBtns = document.querySelectorAll('#stage-grid-20 [data-testid^="stage-btn-"]');
        const btn2 = document.querySelector('[data-testid="stage-btn-2"]');

        return {
          status: after.status,
          stageBtnCount: stageBtns.length,
          btn2Unlocked: btn2 ? !btn2.disabled : false,
          bubbleProg,
          hallProg,
        };
      })()"""
  )
  assert_true(res["status"] == "cleared", f"Expected stage 1 cleared: {res}")
  assert_true(res["stageBtnCount"] == 20, f"Expected 20 stage select buttons, got {res['stageBtnCount']}")
  assert_true(
      res["btn2Unlocked"] and res["bubbleProg"].get("unlockedStage", 0) >= 2,
      f"Expected clearing stage 1 to unlock stage 2 in qq_bubble_progress: {res}",
  )
  hall = res["hallProg"]
  assert_true(
      "kart" in hall and hall["kart"]["plays"] == 3,
      f"qq_hall_progress overwrote other game keys: {hall}",
  )
  bd = hall.get("bubbledragon", {})
  assert_true(
      bd.get("plays", 0) >= 1
      and bd.get("best", 0) > 0
      and 1 <= bd.get("stars", 0) <= 3
      and isinstance(bd.get("last"), str)
      and "T" in bd.get("last", ""),
      f"Invalid qq_hall_progress['bubbledragon'] entry: {bd}",
  )


def t41_pop_juice_14_particles_ring_shake_semitone_audio_and_slowmo_avalanche(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        // 1) 3-bubble pop + 5-bubble avalanche drop (>= 4 dropped -> slow-mo 0.4s at 0.3x + "雪崩 ×5!")
        api.startMatch({
          stageId: 1,
          customGrid: [
            [null, null, null, 'red', 'red', null, null, null],
            [null, 'blue', 'yellow', null, 'green', 'purple', null],
            [null, 'orange', null, null, null, null, null, null],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        // Step just until impact (projected ~14 frames)
        let stImpact = api.getState();
        for (let i = 0; i < 40; i++) {
          stImpact = api.stepFrames(1);
          if (stImpact.lastShotResult) break;
        }
        const fxDomText = document.getElementById('floating-fx-layer')?.textContent || '';

        // 2) >= 6 bubble pop -> camera shake 0.15 * 1.5 = 0.225
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['red', 'red', 'red', 'red', 'red', null, null, null],
            ['red', 'red', null, null, null, null, null],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(-0.25);
        api.fireBubble();
        let stBig = api.getState();
        for (let i = 0; i < 40; i++) {
          stBig = api.stepFrames(1);
          if (stBig.lastShotResult) break;
        }

        return {
          smallPopCount: stImpact.lastShotResult.poppedCount,
          droppedCount: stImpact.lastShotResult.droppedCount,
          burstParticles: stImpact.particles.filter((p) => p.kind === 'burst').length,
          popRingsCount: stImpact.popRings.length,
          smallShakeBase: stImpact.cameraShake.baseIntensity,
          slowMoTriggered: stImpact.lastShotResult.slowMoTriggered,
          slowMoDuration: stImpact.lastShotResult.slowMoDuration,
          timeScaleAtImpact: stImpact.timeScale,
          floatingTexts: stImpact.floatingTexts.map((t) => t.text),
          fxDomText,
          bigPopCount: stBig.lastShotResult.poppedCount,
          bigShakeBase: stBig.cameraShake.baseIntensity,
          lastPopPitches: stBig.audio.lastPopPitches,
          lastPopStepMs: stBig.audio.lastPopStepMs,
        };
      })()"""
  )
  assert_true(
      res["smallPopCount"] == 3 and res["burstParticles"] == 3 * 14,
      f"Expected 14 burst particles per popped bubble (42 total), got {res}",
  )
  assert_true(res["popRingsCount"] >= 1, f"Expected expanding 3D pop ring, got {res}")
  assert_true(
      abs(res["smallShakeBase"] - 0.15) < 1e-6 and abs(res["bigShakeBase"] - 0.225) < 1e-6,
      f"Expected camera shake 0.15 and 0.225 (x1.5 for >=6 popped), got {res}",
  )
  assert_true(
      res["droppedCount"] == 5
      and res["slowMoTriggered"] is True
      and abs(res["slowMoDuration"] - 0.4) < 1e-6
      and abs(res["timeScaleAtImpact"] - 0.3) < 1e-6,
      f"Expected 0.4s slow-mo (timeScale 0.3) on >=4 dropped bubbles, got {res}",
  )
  assert_true(
      any("雪崩 ×5!" in t for t in res["floatingTexts"]) and "雪崩 ×5!" in res["fxDomText"],
      f"Expected '雪崩 ×5!' floating text, got {res}",
  )
  pitches = res["lastPopPitches"]
  assert_true(
      len(pitches) >= 6
      and abs(pitches[0] - 523.25) < 0.5
      and pitches[1] > pitches[0]
      and res["lastPopStepMs"] == 40,
      f"Expected C5 + n semitones 40ms apart pitch steps, got pitches={pitches}, stepMs={res['lastPopStepMs']}",
  )


def t42_lose_flow_no_3d_podium_no_next_stage_sad_dragon_vs_perfect_clear(
    h: BubbleDragonTestHarness,
) -> None:
  lose_res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
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
        const nextBtn = document.querySelector('[data-testid="btn-next-stage"]');
        const retryBtn = document.querySelector('[data-testid="btn-retry"]');
        const homeBtn = document.querySelector('[data-testid="btn-home"]');
        const titleText = document.getElementById('podium-title')?.textContent || '';
        return {
          status: st.status,
          podiumVisible: st.podiumVisible,
          dragonState: st.crew.dragonState,
          titleText,
          nextHidden: nextBtn ? (nextBtn.hidden || window.getComputedStyle(nextBtn).display === 'none') : true,
          retryPrimary: retryBtn ? retryBtn.classList.contains('primary') : false,
          homeVisible: homeBtn ? !homeBtn.hidden : false,
        };
      })()"""
  )
  assert_true(
      lose_res["status"] == "lost"
      and lose_res["podiumVisible"] is False
      and lose_res["dragonState"] == "sad"
      and "泡泡触及警戒线" in lose_res["titleText"]
      and lose_res["nextHidden"] is True
      and lose_res["retryPrimary"] is True
      and lose_res["homeVisible"] is True,
      f"Lose flow verification failed: {lose_res}",
  )

  clear_res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        api.startMatch({
          stageId: 1,
          customGrid: [
            [null, null, null, 'red', 'red', null, null, null],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const st = api.stepFrames(55);
        const nextBtn = document.querySelector('[data-testid="btn-next-stage"]');
        const stamp = document.getElementById('perfect-stamp');
        return {
          status: st.status,
          isPerfectClear: st.isPerfectClear,
          podiumStars: st.podiumStars,
          podiumVisible: st.podiumVisible,
          nextVisibleAndPrimary: nextBtn ? (!nextBtn.hidden && nextBtn.classList.contains('primary')) : false,
          stampVisible: stamp ? !stamp.hidden : false,
        };
      })()"""
  )
  assert_true(
      clear_res["status"] == "cleared"
      and clear_res["isPerfectClear"] is True
      and clear_res["podiumStars"] == 3
      and clear_res["podiumVisible"] is True
      and clear_res["nextVisibleAndPrimary"] is True
      and clear_res["stampVisible"] is True,
      f"Clear flow / PERFECT stamp verification failed: {clear_res}",
  )


def t43_crew_reactions_cauldron_coin_fountain_combo_cheer_egg_sparkle_and_special_pulse(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;
        // Two consecutive pops + drop into cauldron + egg rescue
        api.startMatch({
          stageId: 3,
          customGrid: [
            ['blue', 'blue', null, 'red', 'red', null, 'green', 'green'],
            [null, null, { color: 'yellow', isEgg: true }, null, null, null, null],
          ],
          forcedQueue: ['red', 'blue', 'green'],
        });
        // Shot 1: pop red -> drops egg into cauldron!
        api.setAimAngle(0.0);
        api.fireBubble();
        let st1 = api.getState();
        let sawSparkle = false;
        let sawCoin = false;
        for (let i = 0; i < 110; i++) {
          st1 = api.stepFrames(1);
          if (st1.particles.some((p) => p.kind === 'sparkle')) sawSparkle = true;
          if (st1.particles.some((p) => p.kind === 'coin')) sawCoin = true;
        }

        // Now test combo x2 cheer + special readiness pulse
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['green', 'green', null, 'red', 'red', null, 'blue', 'blue'],
          ],
          forcedQueue: ['red', 'blue', 'green'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        api.stepFrames(35);
        api.setAimAngle(0.42);
        api.fireBubble();
        let stCombo = api.getState();
        for (let i = 0; i < 35; i++) {
          stCombo = api.stepFrames(1);
          if (stCombo.combo >= 2) break;
        }

        // Charge special to verify pulse on #hud-btn-special
        api.startMatch({
          stageId: 1,
          customGrid: [
            ['green', null, null, 'red', 'red', null, null, null],
            [null, 'blue', 'yellow', null, null, null, null],
            [null, 'purple', 'orange', null, null, null, null, null],
            ['blue', 'yellow', null, null, null, null, null],
          ],
          forcedQueue: ['red', 'green'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const stSpec = api.stepFrames(55);
        const specBtn = document.querySelector('[data-testid="hud-btn-special"]');

        return {
          sawSparkle,
          sawCoin,
          dragonJumps: st1.crew.dragonJumps,
          combo: stCombo.combo,
          cheers: stCombo.crew.cheers,
          dragonStateCombo: stCombo.crew.dragonState,
          penguinStateCombo: stCombo.crew.penguinState,
          comboTexts: stCombo.floatingTexts.map((t) => t.text),
          specReadyPulse: specBtn ? (specBtn.classList.contains('is-ready') && specBtn.getAttribute('data-ready') === 'true') : false,
          readySpecial: stSpec.specialGauge.readySpecial,
        };
      })()"""
  )
  assert_true(
      res["sawSparkle"] and res["sawCoin"] and res["dragonJumps"] >= 1,
      f"Expected egg sparkle, cauldron coin fountain, and dragon jump: {res}",
  )
  assert_true(
      res["combo"] >= 2
      and res["cheers"] >= 1
      and res["dragonStateCombo"] == "cheer"
      and res["penguinStateCombo"] == "cheer"
      and any("连击 ×2!" in t for t in res["comboTexts"]),
      f"Expected crew cheer and '连击 ×2!' on combo x2: {res}",
  )
  assert_true(
      res["readySpecial"] is not None and res["specReadyPulse"] is True,
      f"Expected #hud-btn-special to pulse (.is-ready) when special is ready: {res}",
  )


def t44_greedy_bot_and_random_shooter_skill_targets(
    h: BubbleDragonTestHarness,
) -> None:
  res = h.eval_js(
      """(async () => {
        const simMod = await import('./src/sim.js');

        function runGreedyBot(stageId, seed = 20261029 + stageId, maxShots = 50) {
          const sim = new simMod.BubbleDragonSim({ modeId: 'stage', stageId, seed });
          while (sim.status === 'playing' && sim.shotsFired < maxShots) {
            const targetColor = sim.currentBubble.color;
            let bestAngle = 0;
            let bestScore = -1e9;
            for (let deg = -74; deg <= 74; deg += 1) {
              const rad = deg * Math.PI / 180;
              const tr = simMod.computeTrajectoryPreview(rad, sim.grid, sim.ceilingY, sim.rowParityOffset);
              if (!tr.snapCell) continue;
              const { row, col } = tr.snapCell;
              if (row < 0 || row >= sim.grid.length || col < 0 || col >= sim.grid[row].length) continue;
              if (sim.grid[row][col]) continue;
              sim.grid[row][col] = { row, col, color: targetColor, special: null, isEgg: false, x: tr.snapCell.x, y: tr.snapCell.y };
              const cluster = simMod.findConnectedColorCluster(sim.grid, [[row, col]], targetColor, sim.rowParityOffset);
              const clusterSize = cluster.length;
              let sameColorNeighbors = 0;
              let totalNeighbors = 0;
              for (const [nr, nc] of simMod.getHexNeighbors(row, col, sim.grid.length, sim.rowParityOffset)) {
                const nb = sim.grid[nr][nc];
                if (nb) {
                  totalNeighbors++;
                  if (nb.color === targetColor) sameColorNeighbors++;
                }
              }
              sim.grid[row][col] = null;
              let score = 0;
              if (clusterSize >= 3) {
                score += 1000 + clusterSize * 120 + (12 - row) * 25;
              } else {
                score += sameColorNeighbors * 95 + totalNeighbors * 10 - row * 18;
              }
              score -= tr.bounces * 4;
              if (score > bestScore) {
                bestScore = score;
                bestAngle = rad;
              }
            }
            sim.setAimAngle(bestAngle);
            sim.fireBubble();
            let safety = 0;
            while ((sim.projectile || sim.fallingBubbles.length > 0) && safety < 240) {
              sim.stepFrames(1);
              safety++;
            }
          }
          return { stageId, status: sim.status, shotsFired: sim.shotsFired };
        }

        function runRandomShooter(stageId, seed = 5100 + stageId * 17, maxShots = 65) {
          const sim = new simMod.BubbleDragonSim({ modeId: 'stage', stageId, seed });
          let rng = seed ^ 0x9e3779b9;
          const nextRand = () => {
            rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
            return rng / 0x100000000;
          };
          while (sim.status === 'playing' && sim.shotsFired < maxShots) {
            const angle = (nextRand() * 2 - 1) * (simMod.MAX_AIM_RAD * 0.92);
            sim.setAimAngle(angle);
            sim.fireBubble();
            let safety = 0;
            while ((sim.projectile || sim.fallingBubbles.length > 0) && safety < 240) {
              sim.stepFrames(1);
              safety++;
            }
          }
          return { status: sim.status, shotsFired: sim.shotsFired };
        }

        const stages = [];
        for (const def of simMod.STAGE_DEFS) {
          const g = runGreedyBot(def.id);
          const r = runRandomShooter(def.id);
          stages.push({
            id: def.id,
            par: def.parShots,
            greedyStatus: g.status,
            greedyShots: g.shotsFired,
            greedyRatio: Number((g.shotsFired / def.parShots).toFixed(2)),
            randStatus: r.status,
            randShots: r.shotsFired,
          });
        }
        return { stages };
      })()"""
  )
  for st in res["stages"]:
    sid = st["id"]
    par = st["par"]
    assert_true(
        st["greedyStatus"] == "cleared"
        and par * 0.6 <= st["greedyShots"] <= par * 1.3
        and (st["greedyShots"] <= 12 if sid == 1 else True),
        f"Expected greedy bot on Stage {sid} in [0.6*par, 1.3*par] (and <=12 on Stage 1), got {st}",
    )
    min_rand = 14 if sid == 1 else (10 if sid <= 12 else 7)
    assert_true(
        st["randStatus"] == "lost" and min_rand <= st["randShots"] <= 60,
        f"Expected random shooter on Stage {sid} to survive >={min_rand} and lose <=60, got {st}",
    )


def t45_v2_director_polish_verifications(h: BubbleDragonTestHarness) -> None:
  # 1. Verify color ramp (1-3: 3, 4-8: 4, 9-14: 5, 15-20: 6), row 0 full, <=35% single-pop detachment,
  #    and egg placement (row >= 3, >= 5 non-egg neighbors in >= 2 distinct colors).
  stage_audit = h.eval_js(
      """(async () => {
        const simMod = await import('./src/sim.js');
        const results = [];
        for (const def of simMod.STAGE_DEFS) {
          const baseSim = new simMod.BubbleDragonSim({ modeId: 'stage', stageId: def.id, seed: 20261029 + def.id });
          const initialCount = baseSim.getOccupiedBubbleCount();
          let maxDetached = 0;
          for (const color of simMod.BUBBLE_COLORS) {
            for (let deg = -74; deg <= 74; deg += 2) {
              const rad = deg * Math.PI / 180;
              const tr = simMod.computeTrajectoryPreview(rad, baseSim.grid, baseSim.ceilingY, baseSim.rowParityOffset);
              if (!tr.snapCell) continue;
              const { row, col } = tr.snapCell;
              if (row < 0 || row >= baseSim.grid.length || col < 0 || col >= baseSim.grid[row].length) continue;
              if (baseSim.grid[row][col]) continue;
              const g = baseSim.grid.map((r) => r.map((c) => (c ? { ...c } : null)));
              g[row][col] = { row, col, color, special: null, isEgg: false, x: tr.snapCell.x, y: tr.snapCell.y };
              const cluster = simMod.findConnectedColorCluster(g, [[row, col]], color, baseSim.rowParityOffset);
              if (cluster.length >= 3) {
                for (const item of cluster) g[item.row][item.col] = null;
                const dropped = simMod.findFloatingDisconnectedCells(g, baseSim.rowParityOffset);
                if (dropped.length > maxDetached) maxDetached = dropped.length;
              }
            }
          }
          const eggs = [];
          for (let r = 0; r < baseSim.grid.length; r++) {
            for (let c = 0; c < baseSim.grid[r].length; c++) {
              const cell = baseSim.grid[r][c];
              if (cell && cell.isEgg) {
                let nonEggNeighbors = 0;
                const colors = new Set();
                for (const [nr, nc] of simMod.getHexNeighbors(r, c, baseSim.grid.length, 0)) {
                  const nb = baseSim.grid[nr][nc];
                  if (nb && !nb.isEgg) {
                    nonEggNeighbors += 1;
                    colors.add(nb.color);
                  }
                }
                eggs.push({ row: r, col: c, nonEggNeighbors, distinctColors: colors.size });
              }
            }
          }
          results.push({
            id: def.id,
            colorsCount: def.colors.length,
            row0Full: def.rows[0].length === 8 && def.rows[0].every((c) => c !== null),
            maxDetachedPct: Number(((maxDetached / Math.max(1, initialCount)) * 100).toFixed(1)),
            eggs,
          });
        }
        return results;
      })()"""
  )
  for item in stage_audit:
    sid = item["id"]
    expected_colors = 3 if sid <= 3 else (4 if sid <= 8 else (5 if sid <= 14 else 6))
    assert_true(
        item["colorsCount"] == expected_colors,
        f"Stage {sid} expected {expected_colors} colors, got {item}",
    )
    assert_true(item["row0Full"] is True, f"Stage {sid} row 0 must be 100% filled: {item}")
    if sid >= 9:
      assert_true(
          item["maxDetachedPct"] <= 35.0,
          f"Stage {sid} max single-pop detachment must be <=35%, got {item}",
      )
    for egg in item["eggs"]:
      assert_true(
          egg["row"] >= 3 and egg["nonEggNeighbors"] >= 5 and egg["distinctColors"] >= 2,
          f"Stage {sid} egg must be at row>=3 with >=5 non-egg neighbors in >=2 colors, got {egg}",
      )

  # 2. Verify stage-select grid dimensions (>=52x44px, 2x10 at >=1024w, 4x5 narrower, hidden <440h, zero scroll)
  for w, vh, expected_cols, expected_visible in [
      (1280, 800, 10, True),
      (1024, 768, 10, True),
      (390, 844, 4, True),
      (844, 390, 0, False),
  ]:
    h.set_viewport(w, vh, mobile=(w < 900), touch=(w < 900))
    grid_res = h.eval_js(
        """(() => {
          document.getElementById('hud-btn-menu').click();
          const grid = document.getElementById('stage-grid-20');
          const style = window.getComputedStyle(grid);
          const visible = style.display !== 'none' && style.visibility !== 'hidden';
          const cells = Array.from(grid.querySelectorAll('.stage-cell'));
          const rects = cells.map((c) => c.getBoundingClientRect());
          const minW = rects.length ? Math.min(...rects.map((r) => r.width)) : 0;
          const minH = rects.length ? Math.min(...rects.map((r) => r.height)) : 0;
          const xs = new Set(rects.map((r) => Math.round(r.left)));
          const ys = new Set(rects.map((r) => Math.round(r.top)));
          const doc = document.documentElement;
          const zeroScroll = doc.scrollWidth <= window.innerWidth && doc.scrollHeight <= window.innerHeight;
          const prevRect = document.getElementById('btn-stage-prev').getBoundingClientRect();
          const nextRect = document.getElementById('btn-stage-next').getBoundingClientRect();
          return { visible, minW, minH, colCount: xs.size, rowCount: ys.size, zeroScroll, prevW: prevRect.width, nextW: nextRect.width };
        })()"""
    )
    assert_true(grid_res["zeroScroll"] is True, f"Stage select overlay scrolled at {w}x{vh}: {grid_res}")
    assert_true(
        grid_res["visible"] == expected_visible,
        f"Stage grid visibility mismatch at {w}x{vh}: {grid_res}",
    )
    if expected_visible:
      assert_true(
          grid_res["minW"] >= 51.5 and grid_res["minH"] >= 43.5 and grid_res["colCount"] == expected_cols,
          f"Expected stage cells >=52x44px and {expected_cols} columns at {w}x{vh}, got {grid_res}",
      )
    else:
      assert_true(
          grid_res["prevW"] >= 44 and grid_res["nextW"] >= 44,
          f"Expected ◀ ▶ navigation buttons visible when grid hidden at {w}x{vh}: {grid_res}",
      )

  h.set_viewport(1280, 800, mobile=False, touch=False)

  # 3. Verify floating texts replace same kind (no collision), spawn at pop location,
  #    board empty on clear (leftovers drop as bonus), Stage 20 "♾️ 挑战无尽" button, and "下一个:<色>" label.
  polish_res = h.eval_js(
      """(() => {
        const api = window.__BUBBLE_DRAGON__;

        // Check HUD swap label "下一个:<色>"
        const stInit = api.startMatch({
          stageId: 1,
          customGrid: [
            ['red', 'red', 'blue', 'blue', 'yellow', 'yellow', 'red', 'red'],
          ],
          forcedQueue: ['red', 'yellow', 'blue'],
        });
        const swapLabelText = document.getElementById('hud-swap-label')?.textContent || '';

        // Pop left-side cluster and trigger avalanche + combo at pop location (x < -1.0)
        api.startMatch({
          stageId: 1,
          customGrid: [
            [null, 'red', 'red', null, null, null, 'blue', 'blue'],
            ['yellow', 'blue', null, null, null, null, null],
            ['green', 'purple', null, null, null, null, null, null],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(-0.14);
        api.fireBubble();
        let stPop = api.getState();
        let avalancheText = null;
        for (let i = 0; i < 45; i++) {
          stPop = api.stepFrames(1);
          const av = stPop.floatingTexts.find((t) => t.kind === 'avalanche');
          if (av) {
            avalancheText = av;
            break;
          }
        }

        // Verify clearing an egg_rescue stage with leftover top bubbles leaves board 100% empty
        api.startMatch({
          stageId: 20,
          customGrid: [
            ['red', 'red', 'blue', 'blue', 'yellow', 'yellow', 'green', 'green'],
            ['blue', 'blue', 'yellow', { color: 'red', isEgg: true }, 'red', 'green', 'blue'],
          ],
          forcedQueue: ['red', 'blue'],
        });
        api.setAimAngle(0.0);
        api.fireBubble();
        const stClear20 = api.stepFrames(55);
        const nextBtnText20 = document.getElementById('btn-next-stage')?.textContent || '';
        document.getElementById('btn-next-stage')?.click();
        const stAfterClickEndless = api.getState();

        return {
          swapLabelText,
          expectedNextColor: stInit.nextBubble.color,
          avalancheText,
          floatingSameKindCount: stPop.floatingTexts.filter((t) => t.kind === 'avalanche').length,
          clear20Status: stClear20.status,
          clear20BubbleCount: stClear20.bubbleCount,
          clear20BubblesLen: stClear20.bubbles.length,
          clear20FallingLen: stClear20.fallingBubbles.length,
          nextBtnText20,
          modeAfterClick20: stAfterClickEndless.modeId,
        };
      })()"""
  )
  assert_true(
      polish_res["swapLabelText"].startswith("下一个:"),
      f"Expected #hud-swap-label to start with '下一个:', got {polish_res}",
  )
  assert_true(
      polish_res["avalancheText"] is not None
      and polish_res["avalancheText"]["x"] < -1.0
      and polish_res["floatingSameKindCount"] == 1,
      f"Expected avalanche floating text at left pop location (x < -1.0) with no duplicate kind: {polish_res}",
  )
  assert_true(
      polish_res["clear20Status"] == "cleared"
      and polish_res["clear20BubbleCount"] == 0
      and polish_res["clear20BubblesLen"] == 0
      and polish_res["clear20FallingLen"] == 0,
      f"Expected board and fallingBubbles to be 100% empty on stage clear: {polish_res}",
  )
  assert_true(
      polish_res["nextBtnText20"] == "♾️ 挑战无尽" and polish_res["modeAfterClick20"] == "endless",
      f"Expected Stage 20 clear button '♾️ 挑战无尽' to launch endless mode: {polish_res}",
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
    ("T38_playfield_geometry_camera_framing_and_bubble_diameter", t38_playfield_geometry_camera_framing_and_bubble_diameter),
    ("T39_twenty_stages_seeded_template_determinism_and_endless_6rows", t39_twenty_stages_seeded_template_determinism_and_endless_6rows),
    ("T40_stage_select_20_unlock_persistence_and_qq_hall_progress", t40_stage_select_20_unlock_persistence_and_qq_hall_progress),
    ("T41_pop_juice_14_particles_ring_shake_semitone_audio_and_slowmo_avalanche", t41_pop_juice_14_particles_ring_shake_semitone_audio_and_slowmo_avalanche),
    ("T42_lose_flow_no_3d_podium_no_next_stage_sad_dragon_vs_perfect_clear", t42_lose_flow_no_3d_podium_no_next_stage_sad_dragon_vs_perfect_clear),
    ("T43_crew_reactions_cauldron_coin_fountain_combo_cheer_egg_sparkle_and_special_pulse", t43_crew_reactions_cauldron_coin_fountain_combo_cheer_egg_sparkle_and_special_pulse),
    ("T44_greedy_bot_and_random_shooter_skill_targets", t44_greedy_bot_and_random_shooter_skill_targets),
    ("T45_v2_director_polish_verifications", t45_v2_director_polish_verifications),
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
