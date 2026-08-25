/**
 * ★**編集台本 starhorse-v1 が通常 `/race` の既定であることの検査**
 *
 * ⚠️ ★**製品コードだけで再現できる検査に限ります。**
 *    比較動画・コンタクトシート（`out/`）や未追跡の測定ツールには依存しません。
 *    それらは監査用で `.gitignore` の対象なので、本線のテストからは外してあります。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SCRIPT_V4, SCRIPT_STARHORSE_V1, broadcastV2ShotAt, broadcastV2ScriptFromSearch,
  DEFAULT_RACE_SCRIPT, LEGACY_RACE_SCRIPT, ovalCourse, type BroadcastV2Script,
} from '../src/index.js';
import { resolveBroadcastV2Scene, type BroadcastV2Horse } from '../src/broadcast-v2-scene.js';

const PAGE = path.resolve('apps/web/src/app/race/page.tsx');
const OBLIQUE = path.resolve('packages/render/src/oblique-ui.ts');
const HUD_KIT = path.resolve('packages/render/src/hud-kit.ts');
const DIST = 1600;
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

/** ★その進行率で選ばれるショット */
const shotAt = (ratio: number, script: BroadcastV2Script): string =>
  broadcastV2ShotAt(course, ratio * DIST, false, 40, { fourthCornerFront: true, script }).id;

/** ★URL から決まる台本（画面と同じ関数を通す・R-30） */
const scriptOf = (search: string): BroadcastV2Script => broadcastV2ScriptFromSearch(search);

describe('既定台本 starhorse-v1', () => {
  /* ① 既定が starhorse-v1 */
  it('① パラメータなしの /race は starhorse-v1', () => {
    expect(scriptOf('')).toBe('starhorse-v1');
    expect(scriptOf('?')).toBe('starhorse-v1');
    expect(scriptOf('?seed=42')).toBe('starhorse-v1');
    expect(DEFAULT_RACE_SCRIPT).toBe('starhorse-v1');
  });

  /* ② 明示指定も同じ */
  it('② cinematography=starhorse-v1 も既定と同じ', () => {
    expect(scriptOf('?cinematography=starhorse-v1')).toBe(scriptOf(''));
  });

  /* ③ 不正値は既定へ戻る */
  it('③ 不正なフラグ値は starhorse-v1 へ戻る', () => {
    for (const q of ['?cinematography=invalid', '?cinematography=', '?cinematography=V4',
      '?cinematography=v5', '?cinematography=starhorse-v2', '?cinematography=starhorse-V1']) {
      expect(scriptOf(q), q).toBe('starhorse-v1');
    }
  });

  /* ④ v4 で旧台本を選べる */
  it('④ cinematography=v4 で旧台本へ戻せる', () => {
    expect(scriptOf('?cinematography=v4')).toBe('v4');
    expect(scriptOf('?seed=42&cinematography=v4')).toBe('v4');
    expect(LEGACY_RACE_SCRIPT).toBe('v4');
    // ★旧 v4 の表そのものが残っている（切り戻し先を消していない）
    expect(SCRIPT_V4.map((x) => x.id)).toEqual([
      'start-front', 'first-corner-front', 'side-drive',
      'fourth-corner-front', 'homestretch-front', 'finish-line',
    ]);
  });

  /* ⑤ 台本差は 2 ショットだけ */
  it('⑤ 旧 v4 との違いはショット 2 個だけ（境界も長さも同じ）', () => {
    expect(SCRIPT_STARHORSE_V1.length).toBe(SCRIPT_V4.length);
    const diffs: { index: number; from: string; to: string }[] = [];
    for (let i = 0; i < SCRIPT_V4.length; i += 1) {
      const a = SCRIPT_V4[i]!;
      const b = SCRIPT_STARHORSE_V1[i]!;
      // ★カット境界（until）は動かしていない
      expect(b.until, `#${i} の境界`).toBe(a.until);
      if (a.id !== b.id) diffs.push({ index: i, from: a.id, to: b.id });
    }
    expect(diffs).toEqual([
      { index: 3, from: 'fourth-corner-front', to: 'fourth-corner-high' },
      { index: 4, from: 'homestretch-front', to: 'homestretch-side' },
    ]);
  });

  /* ⑥ fourth-corner-high が既定で選ばれる */
  it('⑥ 第4コーナーで fourth-corner-high が選ばれる', () => {
    for (const r of [0.55, 0.60, 0.65]) {
      expect(shotAt(r, scriptOf('')), `進行 ${r}`).toBe('fourth-corner-high');
      expect(shotAt(r, scriptOf('?cinematography=v4')), `進行 ${r} の旧 v4`).toBe('fourth-corner-front');
    }
  });

  /* ⑦ homestretch-side が既定で選ばれる */
  it('⑦ 直線で homestretch-side が選ばれる', () => {
    for (const r of [0.70, 0.80, 0.86, 0.93]) {
      expect(shotAt(r, scriptOf('')), `進行 ${r}`).toBe('homestretch-side');
      expect(shotAt(r, scriptOf('?cinematography=v4')), `進行 ${r} の旧 v4`).toBe('homestretch-front');
    }
    // ★発走・1 角・道中・ゴールは両方とも同じ
    for (const r of [0.05, 0.20, 0.40, 0.98]) {
      expect(shotAt(r, scriptOf('')), `進行 ${r}`).toBe(shotAt(r, scriptOf('?cinematography=v4')));
    }
  });

  /* ⑧ レース結果は台本に影響されない */
  it('⑧ 台本を変えても馬の位置（レース結果）は変わらない', () => {
    /**
     * ★`resolveBroadcastV2Scene` は「エンジンが決めた全馬の (s,w) を一切変更せず、
     *   中継カメラの注視対象だけを選ぶ」もの。台本はカメラの選択にしか触れないことを見ます。
     */
    const horses: BroadcastV2Horse[] = Array.from({ length: 12 }, (_, i) => ({
      gate: i + 1, s: 960 - i * 3.5, w: 4 + (i % 4) * 2,   // ★先頭 960m = 進行 60%（第4コーナー）
    }));
    const frozen = JSON.stringify(horses);
    const viewport = { width: 1280, height: 720 };
    const a = resolveBroadcastV2Scene(course, horses, viewport, false, { script: 'v4' });
    const b = resolveBroadcastV2Scene(course, horses, viewport, false, { script: 'starhorse-v1' });
    // ★入力を書き換えていない（憲法3: 描画側は結果に触らない）
    expect(JSON.stringify(horses), '馬の入力が書き換えられた').toBe(frozen);
    // ★どちらの台本でも、映っている馬の (gate, s, w) は同じ
    const idOf = (scene: { visibleHorses: readonly BroadcastV2Horse[] }): string =>
      JSON.stringify([...scene.visibleHorses].map((h) => [h.gate, h.s, h.w]).sort());
    expect(idOf(b), '台本で馬の位置が変わった').toBe(idOf(a));
    // ★変わってよいのはショットだけ
    expect(a.shot.id).toBe('fourth-corner-front');
    expect(b.shot.id).toBe('fourth-corner-high');
  });

  /* ⑨ 順位表の減光と、変えていない値 */
  it('⑨ 順位表は減光係数だけを変え、閾値・位置・大きさ・色は変えていない', () => {
    const page = readFileSync(PAGE, 'utf8');
    /**
     * ★**減光は 0.6（最も薄いとき 40%）でした。**
     *   旧 v4 の直線は `homestretch-front` で画面比 24% 前後だったのでほぼ発動しませんが、
     *   既定を `starhorse-v1` にすると横追従が 45% の閾値を超え、いちばん馬が大きい瞬間に
     *   順位表がいちばん薄くなり、1〜5 着の馬名と着差が読めなくなりました（進行 86〜88%）。
     *   → 0.25（最も薄いとき **75%**）。
     */
    expect(page, '減光係数が 0.25 でない').toContain('prevAlpha * (1 - 0.25 * ease)');
    expect(page, '古い減光係数 0.6 が残っている').not.toContain('(1 - 0.6 * ease)');
    /** ★閾値は変えない（28% までは通常、45% で最も薄く） */
    expect(page, '減光の閾値が変わっている').toContain('(v2HorseRatio - 0.28) / (0.45 - 0.28)');
    /** ★位置・大きさは順位表の部品側。変えていない */
    expect(readFileSync(OBLIQUE, 'utf8'), '順位表の位置・大きさが変わっている')
      .toContain('const px = vp.width - 350, py = 34, pw = 314;');
    /** ★地の色（`HUD.glass`）も変えていない */
    expect(readFileSync(HUD_KIT, 'utf8'), 'HUD.glass が変わっている')
      .toContain("glass: 'rgba(7,10,8,.86)'");
  });
});
