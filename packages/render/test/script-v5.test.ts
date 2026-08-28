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
    /**
     * ★**2026-08-28・4 角の正面カットは台本に在ります。**
     *
     * ⚠️ ★同日、一度これを**外しました**（案 B）。境目で走行方向が反転して
     *    「別のレースに見える」ためでした。★しかしオーナー評
     *    「**どんどんカットしていけばレース演出としての品質が下がります**」で撤回。
     *    → ★**外して消すのではなく、カットそのものを良くする**（`fixedCamera.approach`）。
     * ★ここが `false` に戻ったら、また「減らす」で処理したということです。
     */
    expect(SCRIPT_V5.length).toBe(SCRIPT_V4.length);
    expect(SCRIPT_V5.some((cut) => cut.id === 'fourth-corner-front'),
      '★4 角の正面カットを台本から外さない（減らして直さない）').toBe(true);
    /**
     * ★**発走の正面カットを 240m → 100m に詰めました**（2026-08-28・案 A・オーナー指摘②）。
     *   ★正面から見ると 12 頭が横一列に並んで見え、その列ごと横へ動くため
     *   ★オーナー評「**インベーダーみたいな動き**」になっていました。
     *   ★飛び出しだけを正面で見せ、以降は斜め前（`first-corner-front`）が受けます。
     *   ⚠️ ★**真横（`side-low`）は不採用**です。実画面で馬が画面高の 43% まで寄って
     *      大きく重なり、12 頭中 6 頭しか映りませんでした（旧注記「競艇のボートみたいな姿」の再来）。
     */
    expect(SCRIPT_V5[0]!.until, '★発走の正面は 100m で切る').toBe(0.0625);
    expect(SCRIPT_V5[0]!.until, '★v4 より短いこと').toBeLessThan(SCRIPT_V4[0]!.until);
    /** ★1 角の出口は v4 のまま（詰めたのは入口だけ） */
    expect(SCRIPT_V5[1]!.until, '#1 の境界は動かさない').toBe(SCRIPT_V4[1]!.until);
    /** ★直線とゴールの境界も v4 のまま（末尾から数える） */
    expect(SCRIPT_V5.at(-1)!.until).toBe(SCRIPT_V4.at(-1)!.until);
    /**
     * ★`side-drive` が 4 角ぶんを受けるので、v4 より**後ろまで延びます。**
     *   ⚠️ ★以前ここは「4 角は手前で切る」も見ていましたが、★**その 4 角自体が無くなりました。**
     */
    const cornerIdx = SCRIPT_V5.findIndex((r) => r.id === 'fourth-corner-front');
    expect(cornerIdx, '★4 角が台本に在る').toBeGreaterThan(0);
    /**
     * ★**案 B は「直線の始まり」を動かしていません。**
     *   ⚠️ ★v5 の直線は **0.604** から始まります（2026-08-26 に 4 角の窓を 0.660→0.604 へ
     *      狭めたときの値）。★v4 の 0.660 とは**元から違います**。
     *   ★案 B でやったのは「0.540〜0.604 を誰が受けるか」を 4 角の正面 → `side-drive` に
     *      替えただけで、★**直線の入りは 0.604 のまま**です。ここが動くと直線の尺が変わります。
     */
    expect(SCRIPT_V5[cornerIdx]!.until, '★直線の始まりは 0.604 のまま').toBe(0.604);
  });

  /* ⑥ 第4コーナーは真横の side-drive が受ける（案 B） */
  it('⑥ 第4コーナーは正面から（俯瞰は撤回・外すのも撤回）', () => {
    /**
     * ★経緯は 3 段あります。★**どれも「戻すと壊れる」ので固定します。**
     *   ①当初の v5 は `fourth-corner-high`（上・後ろから）→ オーナー評「ぴょんぴょんする」で撤回
     *     （後ろ・上からは 2026-08-21 の 12 カット全数判定で 5 戦 5 敗・例外なし）
     *   ②`fourth-corner-front`（前から）へ戻した（`e009b34`）
     *   ③★**その正面カットも 2026-08-28 に外した**（案 B・オーナー判断）。境目で
     *     ★**画面上の走行方向が反転**しており（→83px/m → ←26px/m）、
     *     ★オーナー評「**同じレースなのか分からない**」の原因だったため。
     *     ★カメラでは直せないことを掃引 32 通りで実測済み（`audit-corner-camera-sweep.mjs`）。
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
    // ★第4コーナーは台本で違う: v4 は正面固定、v5 は真横追従（案 B で外したため）
    expect(a.shot.id, '旧 v4 は 4 角を正面から').toBe('fourth-corner-front');
    expect(b.shot.id, '★v5 も 4 角は正面から（外すのは撤回した）').toBe('fourth-corner-front');
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
