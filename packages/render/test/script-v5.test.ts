/**
 * ★**編集台本 v5 が通常 `/race` の既定であることの検査**
 *
 * ⚠️ ★**製品コードだけで再現できる検査に限ります。**
 *    比較動画・コンタクトシート（`out/`）や未追跡の測定ツールには依存しません。
 *    それらは監査用で `.gitignore` の対象なので、本線のテストからは外してあります。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SCRIPT_V4, SCRIPT_V5, broadcastV2ShotAt, broadcastV2ScriptFromSearch,
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

describe('既定台本 v5', () => {
  /* ① 既定が v5 */
  it('① パラメータなしの /race は v5', () => {
    expect(scriptOf('')).toBe('v5');
    expect(scriptOf('?')).toBe('v5');
    expect(scriptOf('?seed=42')).toBe('v5');
    expect(DEFAULT_RACE_SCRIPT).toBe('v5');
  });

  /* ② 明示指定も同じ */
  it('② cinematography=v5 も既定と同じ', () => {
    expect(scriptOf('?cinematography=v5')).toBe(scriptOf(''));
  });

  /* ③ 不正値は既定へ戻る */
  it('③ 不正なフラグ値は v5 へ戻る', () => {
    /**
     * ⚠️ ★`v6` は 2026-08-26 に**実在する台本**になったのでここから外しました
     *    （`SCRIPT_V6`・直線を 4 カットに割る）。★既定が v5 のままであることは
     *    上の ① と `script-v6.test.ts` が別に固定しています。
     */
    for (const q of ['?cinematography=invalid', '?cinematography=', '?cinematography=V4',
      '?cinematography=V5', '?cinematography=V6', '?cinematography=v4-old']) {
      expect(scriptOf(q), q).toBe('v5');
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

  /* ⑤ 台本差は 1 ショットだけ */
  it('⑤ 旧 v4 との違いは「直線の向き」と「第4コーナーの窓」だけ', () => {
    /**
     * ★**2026-08-26 に第4コーナーのカット境界を動かしました**（指示書 §3-2）。
     *
     *   ⚠️ ★以前この検査は「境界は 1 つも動いていない」を固定していました。
     *      オーナー評「**斜め向いたまま曲がっている**」の原因が、まさに
     *      ★**カットが素材の描かれた角度から 26.4° も離れた区間まで通っていたこと**だったので、
     *      窓を狭めました（`side-drive` 0.500→0.540 / `fourth-corner-front` 0.660→0.604）。
     *   ★**動かしてよいのはこの 2 つだけ**です。ほかの境界は v4 のままであることを固定します。
     */
    expect(SCRIPT_V5.length).toBe(SCRIPT_V4.length);
    const MOVED = new Set([2, 3]);   // side-drive と fourth-corner-front
    const diffs: { index: number; from: string; to: string }[] = [];
    for (let i = 0; i < SCRIPT_V4.length; i += 1) {
      const a = SCRIPT_V4[i]!;
      const b = SCRIPT_V5[i]!;
      if (!MOVED.has(i)) expect(b.until, `#${i} の境界は動かさない`).toBe(a.until);
      if (a.id !== b.id) diffs.push({ index: i, from: a.id, to: b.id });
    }
    expect(diffs).toEqual([
      { index: 4, from: 'homestretch-front', to: 'homestretch-side' },
    ]);
    /** ★動かした 2 つは、狭める向きにしか動かしていないこと */
    expect(SCRIPT_V5[2]!.until, 'side-drive は後ろへ延ばす').toBeGreaterThan(SCRIPT_V4[2]!.until);
    expect(SCRIPT_V5[3]!.until, '4 角は手前で切る').toBeLessThan(SCRIPT_V4[3]!.until);
  });

  /* ⑥ 第4コーナーは v4 と同じ「前から」 */
  it('⑥ 第4コーナーは v4 と同じ fourth-corner-front（俯瞰は 2026-08-25 に撤回）', () => {
    /**
     * ★当初の v5 はここを `fourth-corner-high`（上・後ろから）にしていました。
     *   オーナー評「ぴょんぴょんする」→ 2026-08-21 の 12 カット全数判定（後ろ・上からは
     *   5 戦 5 敗・例外なし）に照らして撤回しました。
     */
    for (const r of [0.56, 0.58, 0.60]) {
      expect(shotAt(r, scriptOf('')), `進行 ${r}`).toBe('fourth-corner-front');
      expect(shotAt(r, scriptOf('?cinematography=v4')), `進行 ${r} の旧 v4`).toBe('fourth-corner-front');
    }
    // ★俯瞰はどちらの台本にも残っていない
    expect(SCRIPT_V5.some((cut) => cut.id === 'fourth-corner-high')).toBe(false);
    expect(SCRIPT_V4.some((cut) => cut.id === 'fourth-corner-high')).toBe(false);
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
    const b = resolveBroadcastV2Scene(course, horses, viewport, false, { script: 'v5' });
    // ★入力を書き換えていない（憲法3: 描画側は結果に触らない）
    expect(JSON.stringify(horses), '馬の入力が書き換えられた').toBe(frozen);
    // ★どちらの台本でも、映っている馬の (gate, s, w) は同じ
    const idOf = (scene: { visibleHorses: readonly BroadcastV2Horse[] }): string =>
      JSON.stringify([...scene.visibleHorses].map((h) => [h.gate, h.s, h.w]).sort());
    expect(idOf(b), '台本で馬の位置が変わった').toBe(idOf(a));
    // ★変わってよいのはショットだけ
    // ★第4コーナーは両方とも同じショット（俯瞰を撤回したので差が無い）
    expect(a.shot.id).toBe('fourth-corner-front');
    expect(b.shot.id).toBe('fourth-corner-front');
    /* ★台本の違いが出るのは直線だけ: 先頭 1300m（進行 81%） */
    const straight: BroadcastV2Horse[] = horses.map((h) => ({ ...h, s: h.s + 340 }));
    const c = resolveBroadcastV2Scene(course, straight, viewport, false, { script: 'v4' });
    const d = resolveBroadcastV2Scene(course, straight, viewport, false, { script: 'v5' });
    expect(c.shot.id).toBe('homestretch-front');
    expect(d.shot.id).toBe('homestretch-side');
  });

  /* ⑨ 順位表の減光と、変えていない値 */
  it('⑨ 順位表は減光係数だけを変え、閾値・位置・大きさ・色は変えていない', () => {
    const page = readFileSync(PAGE, 'utf8');
    /**
     * ★**減光は 0.6（最も薄いとき 40%）でした。**
     *   旧 v4 の直線は `homestretch-front` で画面比 24% 前後だったのでほぼ発動しませんが、
     *   既定を `v5` にすると横追従が 45% の閾値を超え、いちばん馬が大きい瞬間に
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
