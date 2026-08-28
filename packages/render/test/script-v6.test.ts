/**
 * ★**台本 v6 — 最後の直線を 4 カットに割る**（`SCRIPT_V6` の注記）
 *
 * 【この検査が守っているもの】
 *   オーナー要求は「差し・追い込み・逃げ・先行が JRA の中継のように読める」＋「馬が大きい」。
 *   ★実測で、この 2 つは **1 カットでは両立しません**（40% の大きさ＝画面に入る走路は 10〜11m）。
 *   v6 は割ることで両方を出します。★**その「割れていること」と「大きさ」を固定します。**
 *
 * ⚠️ ★**製品コードだけで再現できる検査に限ります。** `out/` の測定結果や
 *    未追跡の道具には依存しません（`script-v5.test.ts` と同じ方針）。
 */
import { describe, expect, it } from 'vitest';
import {
  SCRIPT_V5, SCRIPT_V6, broadcastV2ScriptFromSearch, cameraBasis, posOf, project,
  DEFAULT_RACE_SCRIPT, CUT_RACE_SCRIPT, ovalCourse,
} from '../src/index.js';
import { resolveBroadcastV2Scene, type BroadcastV2Horse } from '../src/broadcast-v2-scene.js';

const DIST = 1600;
const VIEWPORT = { width: 1280, height: 720 } as const;
const HORSE_H_M = 2.4;
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

/** ★12 頭の固定配置。★`spread` で馬群の伸びを変える（1 = 基準） */
const BASE_GAPS = [0, 1.4, 3.6, 5.9, 8.8, 12.1, 16.0, 20.4, 25.3, 31.0, 37.6, 45.2];
const LANES = [9.2, 7.6, 10.4, 6.2, 11.3, 8.4, 5.1, 12.0, 9.8, 4.3, 6.9, 10.9];
const fieldAt = (leadS: number, spread = 1): BroadcastV2Horse[] =>
  BASE_GAPS.map((g, i) => ({
    gate: i + 1, s: Math.max(0, leadS - g * spread), w: LANES[i]!,
    finished: leadS - g * spread >= DIST,
  }));

/** ★画面と同じ経路（`resolveBroadcastV2Scene`）を通して測る（R-30・式を作り直さない） */
function frameAt(leadS: number, script: 'v5' | 'v6', spread = 1): {
  shot: string; onScreen: number; leaderOnScreen: boolean; top4HeightRatio: number;
} {
  const horses = fieldAt(leadS, spread);
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, {
    cornerCutM: 400, raceDisplaySec: 30, fourthCornerFront: true, script,
    ...(script === 'v6' ? { noContenderFrameShots: ['finish-line'] as const } : {}),
  });
  const basis = cameraBasis(scene.camera);
  const ratios: number[] = [];
  let onScreen = 0;
  let leaderOnScreen = false;
  for (const h of scene.visibleHorses) {
    const p = posOf(course, h.s, h.w ?? 10);
    const foot = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(scene.camera, basis, { x: p.x, y: p.y, z: HORSE_H_M });
    if (foot.depth <= 0) continue;
    if (foot.x >= 0 && foot.x <= VIEWPORT.width) {
      onScreen += 1;
      if (h.gate === 1) leaderOnScreen = true;      // gate 1 = その瞬間の先頭
    }
    if (foot.x < -300 || foot.x > VIEWPORT.width + 300) continue;
    ratios.push(Math.max(0, foot.y - head.y) / VIEWPORT.height);
  }
  ratios.sort((a, b) => a - b);
  const top = ratios.slice(-4);
  return {
    shot: scene.shot.id, onScreen, leaderOnScreen,
    top4HeightRatio: top.length === 0 ? 0 : top.reduce((a, b) => a + b, 0) / top.length,
  };
}

describe('台本 v6 — 直線を 4 カットに割る', () => {
  it('★1 角までは v5 と 1 行も違わない（変えたのは直線側だけ）', () => {
    /**
     * ⚠️ ★以前ここは「**4 角（0.604）まで**同じ」を固定していました。
     *    ★2026-08-28、v6 の寄りカットの開始を 0.604 → **0.750** へ動かしたので成り立ちません。
     *    ★理由は `SCRIPT_V6` の注記のとおりで、★**0.604〜0.750 は時間が 5 倍速のまま**であり、
     *    ★そこに寄りのカットを置くと**馬が毎秒 360px 後退して見えた**ためです（オーナー指摘②）。
     *    ★v5 は同じ区間を `homestretch-side`（引き・注視点＝馬群）で受けるので後退が出ず、動かしていません。
     */
    const upTo = (rows: typeof SCRIPT_V6): unknown[] =>
      rows.filter((r) => r.until <= 0.330).map((r) => [r.until, r.id]);
    expect(upTo(SCRIPT_V6)).toEqual(upTo(SCRIPT_V5));
  });

  it('★v5 の直線は 1 カット、v6 は 4 カット', () => {
    const straight = (rows: typeof SCRIPT_V6, from: number): string[] =>
      rows.filter((r) => r.until > from).map((r) => r.id);
    expect(straight(SCRIPT_V5, 0.604)).toEqual(['homestretch-side', 'finish-line']);
    expect(straight(SCRIPT_V6, 0.750)).toEqual(['straight-contest', 'homestretch-front', 'straight-contest', 'finish-line']);
  });

  it('★v6 の寄りカットは、表示が実時間に戻ってから始まる', () => {
    /**
     * ★時間割が実時間へ戻る境界は**残り 400m ＝ 進行 0.750**（`replayPositionModel` の
     *   `straightMetersLeft: 400`）。★寄りのカット（`straight-contest`）はそこから。
     * ⚠️ ★ここを 0.750 より手前へ戻すと、オーナー指摘②の「後退」が再発します。
     */
    const firstContest = SCRIPT_V6.findIndex((r) => r.id === 'straight-contest');
    expect(firstContest).toBeGreaterThan(0);
    expect(SCRIPT_V6[firstContest - 1]!.until, '★寄りの手前の境界＝実時間に戻る 0.750').toBe(0.750);
  });

  it('★既定は v5 のまま。v6 は URL で明示したときだけ', () => {
    expect(broadcastV2ScriptFromSearch('')).toBe(DEFAULT_RACE_SCRIPT);
    expect(broadcastV2ScriptFromSearch('?cinematography=v6')).toBe(CUT_RACE_SCRIPT);
    expect(CUT_RACE_SCRIPT).toBe('v6');
    expect(DEFAULT_RACE_SCRIPT).not.toBe(CUT_RACE_SCRIPT);
  });

  /**
   * ★**これが本題**。オーナー要求「終盤で馬が大きい」を数字で固定します。
   *   ⚠️ ★参考: v5 は同じ場面で 12〜16% でした。
   */
  it('★直線の寄りカット（①③）で馬が画面高の 35% 以上になる', () => {
    /**
     * ⚠️ ★標本点は **2026-08-28 に動かしました**。寄りのカットの開始を 0.604 → 0.750 へ
     *    移したため、旧の 1000m / 1080m は現在 `side-drive` です（`SCRIPT_V6` の注記）。
     *    ★①1200〜1312m ／ ②1312〜1392m ／ ③1392〜1504m から取ります。
     */
    for (const leadS of [1220, 1300, 1400, 1490]) {
      const f = frameAt(leadS, 'v6');
      expect(f.shot).toBe('straight-contest');
      expect(f.top4HeightRatio).toBeGreaterThan(0.35);
    }
  });

  it('★v6 は同じ場面で v5 より大きい（直線の全域で）', () => {
    for (const leadS of [1000, 1080, 1320, 1440, 1560]) {
      expect(frameAt(leadS, 'v6').top4HeightRatio)
        .toBeGreaterThan(frameAt(leadS, 'v5').top4HeightRatio);
    }
  });

  /**
   * ★② は大きさではなく**奥行き**の担当。全 12 頭が入ることを固定します
   *   （差し・追い込みは「奥から大きくなりながら上がる」で読めるため）。
   */
  it('★② の正面カットは全 12 頭を画面に入れる', () => {
    /**
     * ⚠️ ★標本点は **2026-08-28 に動かしました**。寄りのカットの開始を 0.604 → 0.750 へ
     *    移したため、旧の 1000m / 1080m は現在 `side-drive` です（`SCRIPT_V6` の注記）。
     *    ★①1200〜1312m ／ ②1312〜1392m ／ ③1392〜1504m から取ります。
     */
    /** ⚠️ ★②の窓は 2026-08-28 に 1312〜1392m → **1312〜1352m** へ詰めました（`SCRIPT_V6` の注記） */
    for (const leadS of [1320, 1345]) {
      const f = frameAt(leadS, 'v6');
      expect(f.shot).toBe('homestretch-front');
      expect(f.onScreen).toBe(12);
    }
  });

  /**
   * ★**この大きさで映すのは 4〜5 頭まで**（オーナー指摘 2026-08-26）。
   *   ⚠️ ★密集したレース（seed 99 相当）だと 9.3m の窓に **10 頭**が入り、
   *      重なって勝負服が破綻していました。
   */
  it('★寄りのカットで描く馬は 5 頭まで（着外も含めて）', () => {
    /**
     * ⚠️ ★標本点は **2026-08-28 に動かしました**。寄りのカットの開始を 0.604 → 0.750 へ
     *    移したため、旧の 1000m / 1080m は現在 `side-drive` です（`SCRIPT_V6` の注記）。
     *    ★①1200〜1312m ／ ②1312〜1392m ／ ③1392〜1504m から取ります。
     */
    for (const leadS of [1220, 1300, 1400, 1490]) {
      /** ★馬群が密集した配置（12 頭が 12m に収まる） */
      const horses = fieldAt(leadS, 0.26);
      const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, {
        cornerCutM: 400, raceDisplaySec: 30, fourthCornerFront: true, script: 'v6',
      });
      expect(scene.shot.id).toBe('straight-contest');
      expect(scene.visibleHorses.length).toBeLessThanOrEqual(5);
    }
  });

  it('★間引くのは注視点から遠い馬（近い馬は必ず残る）', () => {
    const horses = fieldAt(1320, 0.26);
    const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, {
      cornerCutM: 400, raceDisplaySec: 30, fourthCornerFront: true, script: 'v6',
    });
    const kept = scene.visibleHorses.map((h) => Math.abs(h.s - scene.focusS));
    const dropped = horses.filter((h) => !scene.visibleHorses.includes(h))
      .map((h) => Math.abs(h.s - scene.focusS));
    if (dropped.length > 0) expect(Math.max(...kept)).toBeLessThanOrEqual(Math.min(...dropped));
  });

  /**
   * ★**ゴールの通過を見せてから勝馬の寄りへ移る**（オーナー指摘 2026-08-26）。
   *   ⚠️ ★以前は勝馬が線を通過した瞬間に切り替わり、
   *      ★他馬が入線する画が **1 コマも無い**状態でした。
   */
  it('★接続部: v6 は勝馬通過後もゴール板のカメラを保持する', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync('apps/web/src/app/race/page.tsx', 'utf8');
    expect(page).toContain('const goalHeld = cutScript && winnerFinishedNow && winnerAfterSec < GOAL_HOLD_SEC;');
    expect(page).toContain('const winnerShotNow = winnerFinishedNow && !goalHeld;');
    /** ★v5 は素通し（保持しない）ままであること */
    expect(page).not.toContain('winnerFinishedNow, {');
  });

  /**
   * ★**先頭を画面から失わないこと。** `side-close` は 40% を出せますが
   *   先頭が画面外になるため v6 では採っていません。ここで退行を止めます。
   */
  it('★馬群が 1.6 倍に伸びても、直線のどのカットでも先頭が画面内', () => {
    for (const leadS of [1000, 1160, 1320, 1440, 1560]) {
      expect(frameAt(leadS, 'v6', 1.6).leaderOnScreen).toBe(true);
    }
  });

  /**
   * ★`finish-line` の `frameContenders` は v5 が直線を 1 カットで通すための
   *   「引く」仕掛けです。v6 で外していることを固定します。
   */
  it('★ゴール板のカットで、枠取りを外すと馬が大きくなる', () => {
    const horses = fieldAt(1580);
    const opts = { cornerCutM: 400, raceDisplaySec: 30, fourthCornerFront: true, script: 'v6' } as const;
    const withFrame = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, opts);
    const withoutFrame = resolveBroadcastV2Scene(course, horses, VIEWPORT, false,
      { ...opts, noContenderFrameShots: ['finish-line'] });
    expect(withFrame.shot.id).toBe('finish-line');
    expect(withoutFrame.shot.id).toBe('finish-line');
    /** ★画角は `fovY`（ラジアン）。狭い＝寄っている＝馬が大きい */
    expect(withoutFrame.camera.fovY).toBeLessThan(withFrame.camera.fovY);
  });

  /**
   * ★**v6 は表示位置の演出を使いません。** 演出は「1 カットで大きさと頭数を
   *   両立させる」ための代償でした。★接続部がそうなっていることを固定します。
   */
  it('★接続部: v6 のときは演出を切り、ゴール板の枠取りも外している', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync('apps/web/src/app/race/page.tsx', 'utf8');
    expect(page).toContain('const cutScript = scriptFromSearch(search) === CUT_RACE_SCRIPT;');
    /**
     * ★**`cutScript ||` が残っていること**が、この検査の本体です（2026-08-27）。
     *   ⚠️ ★既定を「演出を使わない」へ変えたとき（オーナー判断・R-27）、一度この項を
     *      `!search.includes('climax=on')` だけにしました。★すると `?cinematography=v6&climax=on` で
     *      ★**v6 に演出が入り**、上のコメントが守ろうとしている不変条件が壊れます。
     *      ★この検査がそれを捕まえました。**文字列ではなく `cutScript ||` の有無を見ます。**
     */
    expect(page).toContain('const climaxDisabled = cutScript || ');
    expect(page).toContain('noContenderFrameShots: CUT_SCRIPT_NO_FRAME_SHOTS');
  });
});
