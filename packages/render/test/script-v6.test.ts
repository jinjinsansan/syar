/**
 * 直線のカット数・尺と、先頭から追走集団まで読める構図を守る。
 * 2026-09-10: 旧「35%以上・正面必須」を、真横の群像を求める今回の構成へ更新。
 */
import { describe, expect, it } from 'vitest';
import {
  SCRIPT_V5, SCRIPT_V6, broadcastV2ScriptFromSearch, cameraBasis, posOf, project,
  DEFAULT_RACE_SCRIPT, CUT_RACE_SCRIPT, ovalCourse, screenTrackAngle,
} from '../src/index.js';
import { resolveBroadcastV2Scene, type BroadcastV2Horse } from '../src/broadcast-v2-scene.js';
import { broadcastV2ShotById, broadcastV2ScriptBoundariesM, broadcastV2ScriptAssets, SCRIPT_V4 } from '../src/broadcast-v2.js';

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
function frameAt(leadS: number, script: 'v5' | 'v6', spread = 1,
  cornerStyle?: 'front' | 'wide' | 'far'): {
  shot: string; onScreen: number; leaderOnScreen: boolean; top4HeightRatio: number;
} {
  const horses = fieldAt(leadS, spread);
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, {
    /** ⚠️ ★`fourthCornerFront` を渡しません。★**画面と同じ既定**（`far`）を歩かせます（★R-31） */
    cornerCutM: 400, raceDisplaySec: 30, script,
    ...(cornerStyle === undefined ? {} : { cornerStyle }),
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
  it('位置取りを横走行・隊列図・横走行に増やしても、その終端は維持する', () => {
    /**
     * ⚠️ ★以前ここは「**4 角（0.604）まで**同じ」を固定していました。
     *    ★2026-08-28、v6 の寄りカットの開始を 0.604 → **0.750** へ動かしたので成り立ちません。
     *    ★理由は `SCRIPT_V6` の注記のとおりで、★**0.604〜0.750 は時間が 5 倍速のまま**であり、
     *    ★そこに寄りのカットを置くと**馬が毎秒 360px 後退して見えた**ためです（オーナー指摘②）。
     *    ★v5 は同じ区間を `homestretch-side`（引き・注視点＝馬群）で受けるので後退が出ず、動かしていません。
     */
    /**
     * ⚠️ ★**2026-09-11 に頭のカットを 1 つ足しました**（★オーナー ②・★意図した変更です）。
     *    ★参考映像は発走の踏み出しを見せず、★空になったゲートの一拍のあと
     *    ★**高い後方の引き**へハードカットします。★そこで `start-front`（★〜100m）を
     *    ★`start-front`（★〜16m・ゲート）＋ `start-rear-far`（★〜100m・引き）へ割りました。
     * ⚠️ ★**カットは減っていません（増えています）。** ★台帳「カット数は減らさない」は下限です。
     * ★位置取り以降の終端（0.330）は ★**動かしていません**。
     */
    expect(SCRIPT_V6.slice(0, 5).map((r) => [r.until, r.id])).toEqual([
      [0.008, 'start-gate-side'], [0.0625, 'start-rear-far'], [0.165, 'opening-side-lead'],
      [0.206, 'opening-formation'], [0.330, 'opening-side-settle'],
    ]);
    expect(SCRIPT_V6[4]?.until).toBe(SCRIPT_V5[1]?.until);
  });

  /**
   * ★**引きのカットは、本当に引けているか**（★2026-09-11・★オーナー ②③④）
   *
   * 【★なぜ数で留めるか】
   *   ★「引きにしました」は ★**カメラの数値を書き換えただけ**でも言えます。
   *   ★`fourth-corner-wide` は ★引きのつもりの名前で、★実測 ★**23.8%**（＝真横とほぼ同じ）でした。
   *   ★参考映像の発走直後・コーナーは ★**5% 前後**です。
   * ⚠️ ★ここは ★**画面と同じ経路**（`resolveBroadcastV2Scene`）を通した幾何で見ます（★R-30）。
   *    ★画素で測った値（`tools/measure-shot-horse-size.mjs`）とは規則が違うので一致はしません。
   */
  it('★俯瞰のカットは、真横の半分以下にしか描かない', () => {
    const side = frameAt(700, 'v6');
    expect(side.shot, '★比較の相手は真横の勝負所').toBe('side-drive');

    /**
     * ⚠️ ★**位置取りは 2026-09-11 に俯瞰 → 高い真横へ移りました**（★オーナー
     *    「★上空からはまだ馬が斜め前を向いています」）。★残る俯瞰はコーナーだけです。
     */
    /**
     * ⚠️ ★**既定は 2026-09-12 に `front` へ戻りました**（★オーナー指示・★JUDGE_RACE_CUTS_20260821）。
     *    ★俯瞰はもう既定ではないので ★**明示して**測ります。★「俯瞰を使うなら小さく」という
     *    ★この検定の役目は残ります（★`?corner=far` は戻し口として生きています）。
     */
    const cases = [
      { leadS: 1100, shot: 'fourth-corner-far', style: 'far' as const },
    ];
    for (const c of cases) {
      const f = frameAt(c.leadS, 'v6', 1, c.style);
      expect(f.shot, `${c.leadS}m`).toBe(c.shot);
      expect(broadcastV2ShotById(c.shot as never).view, `${c.shot} は俯瞰`).toBe('high-diag');
      expect(f.top4HeightRatio, `${c.shot}: 引けていない`)
        .toBeLessThan(side.top4HeightRatio * 0.5);
      /** ⚠️ ★引きすぎて ★**何も読めない**のも駄目です（★隊列の形は残すこと） */
      expect(f.top4HeightRatio, `${c.shot}: 引きすぎ`).toBeGreaterThan(0.02);
    }
  });

  /**
   * ★**大きく写してよいのは、承認済みの素材を使うカットだけ**（★2026-09-11・★オーナー ③④⑤）
   *
   * ★オーナー評「★上空からのカメラワークはいいアイデアです。★ただし ★**馬が小さ過ぎ**です。
   *   ★しかし ★**大きくすると馬が斜め前向きになっているのが目立つ**ので、
   *   ★上手く出来るならばしてください」。
   *
   * 【★どう解いたか】★**カメラを走路の真横へ回しました。**
   *   ★高さは残したまま横へ回すと、★馬は ★**真横**を向きます。★真横素材は合格済みなので、
   *   ★大きくしても崩れません（★`start-rear-far` 5.5% → 18.8%）。
   * ⚠️ ★**コーナーには使えませんでした。** ★真横に回すと ★弧が消えて「コーナーに見えません」
   *    （★実測・★撮って確認）。★コーナーは俯瞰のままなので、★小さいままです。
   *
   * → ★この検定が留めるのは ★**「大きい＝真横素材」**という対応です。
   *    ★俯瞰のカットを大きくしたら、★ここが落ちます。
   */
  it('★真横の半分を超えて大きく写すカットは、必ず真横素材を使う', () => {
    const side = frameAt(700, 'v6');
    const offenders: string[] = [];
    for (const leadS of [50, 290, 700, 900, 1250, 1350, 1450]) {
      /**
       * ⚠️ ★**比較用の切り替え（`?corner=front` / `?corner=wide`）は対象外**です。
       *    ★あれは切り戻しと見比べの道で、★台帳「見比べる相手が一緒に動いたら、
       *    ★何を見比べているのか分からなくなる」に当たります。★ここは ★**既定の道**だけを見ます。
       */
      for (const style of [undefined]) {
        const f = frameAt(leadS, 'v6', 1, style);
        if (f.top4HeightRatio <= side.top4HeightRatio * 0.5) continue;
        const shot = broadcastV2ShotById(f.shot as never);
        /**
         * ⚠️ ★**承認済みの素材は「真横」だけではありません**（★2026-09-12・★訂正）。
         *    ★`JUDGE_RACE_CUTS_20260821.md` の全数判定:
         *      ★真横 `side-v6` …… ⑪ゴール ✅
         *      ★斜め前 `diag-front-v2` … ①発走 ✅ ②1 角 ✅ ⑧4 角正面 🔶「★馬の走り方は OK」
         *                                ⑩先頭争い 🟢ほぼ合格
         *      ★上・後ろから ………… ③④⑤⑦⑫ ★**5 戦 5 敗**
         *    ★この検定が本当に留めたいのは ★**「大きく写すなら上・後ろからの素材を使うな」**です。
         *    ★以前は既定が俯瞰だったので「真横だけ」で足りていました。
         */
        const approved = (shot.view === 'side' && shot.horseAsset === 'side-v6')
          || (shot.view === 'diag-front' && shot.horseAsset === 'diag-front-v2');
        if (!approved) {
          offenders.push(`${f.shot}（${shot.view} / ${shot.horseAsset}）`);
        }
      }
    }
    expect([...new Set(offenders)], '★承認していない素材を大きく写しています').toEqual([]);
  });

  /**
   * ★**真横どうしの継ぎ目で、カメラの高さが飛ばないこと**（★2026-09-11・★オーナー ⑥）
   *
   * 【★なぜ高さなのか — ★実測で切り分けました】
   *   ★オーナー評「★真横カメラワークから切り替わり→真横カメラワークですが、
   *   ★**レースがつながっているように見えません**」。
   *   ★継ぎ目（★`side-drive` → `straight-contest`）で ★**背景が芝＋木立 → 暗いスタンド**へ
   *   ★丸ごと入れ替わっていました。
   *
   *   ★「直線に入るから背景が変わるのだ」と思いましたが ★**違いました**。
   *   ★カメラはほぼ同じ場所にいて、★**高さだけが 3.5m → 6.0m**でした。
   *   ★高い位置から見下ろすと、★馬の向こう側に遠くのスタンドが入ります。
   *   ★対照（高さだけ戻す）を撮ると、★背景は繋がりました。
   *
   * 【★1.5m という線は発明していません — ★両側を撮って決めました】
   *   ★跳び ★**2.5m**（3.5 → 6.0）… ★背景が芝＋木立 → 暗いスタンドへ ★**入れ替わる**
   *   ★跳び ★**1.5m**（3.5 → 5.0）… ★背景は ★**繋がる**（★3 か所とも実測）
   *   → ★線は ★**1.5m 以下**。★これより荒くすると、飛ぶ組を通してしまいます。
   *
   * 【★この検定が実際に見つけたもの（★2026-09-11）】
   *   ★オーナーが指したのは 1 か所でしたが、★同じ欠陥は ★**5 か所**ありました。
   *   ★しかも最初の直し（`straight-contest` 6.0 → 4.0）は、★別の 2 か所を
   *   ★**悪化させて**いました（★`contest → field` が 2m → 4m）。
   *   → ★直線の高さを ★**一つの帯（3.5〜6.0m）**に揃えました。
   *
   * ⚠️ ★**「見た目が繋がっているか」は測れません。** ★ここで留めるのは
   *    ★**その原因になった量（高さの跳び）**だけです。★合否はオーナーの目です。
   */
  it('★真横どうしの継ぎ目で、カメラの高さが 1.5m 以上飛ばない', () => {
    const eyeZAt = (leadS: number): number =>
      resolveBroadcastV2Scene(course, fieldAt(leadS), VIEWPORT, false, {
        cornerCutM: 400, raceDisplaySec: 40, script: 'v6',
        noContenderFrameShots: ['finish-line'] as const,
      }).camera.eye.z;
    const shotAt = (leadS: number): string =>
      resolveBroadcastV2Scene(course, fieldAt(leadS), VIEWPORT, false, {
        cornerCutM: 400, raceDisplaySec: 40, script: 'v6',
        noContenderFrameShots: ['finish-line'] as const,
      }).shot.id;

    /**
     * ★**見るのは「同じ背景の作り方」どうしの継ぎ目だけ**（★2026-09-11 に絞りました）。
     *
     *   ★真横のカットには背景が 2 通りあります:
     *     ★① ★1 枚絵の板（★走路を水平の帯として持つ）
     *     ★② ★透視ワールド（★走路を実際の形で描く・`perspectiveWorld`）
     *   ★①どうしの継ぎ目でだけ、★高さの跳びが ★**背景の入れ替え**として出ます。
     *   ★①と②の間は ★**そもそも作りが違う**ので、★見る人にも「切り替わった」と分かります。
     *
     * ⚠️ ★最初は `start-rear-far → opening-side-lead` を ★**名指しで免除**していました。
     *    ★免除が増えるほど検定は形だけになるので、★**条件で書き直しています**。
     *    ★免除していた対は、★この条件でも外れます（★片方が透視ワールド）。
     */
    const offenders: string[] = [];
    let seams = 0;
    for (const b of broadcastV2ScriptBoundariesM(course, 'v6')) {
      const before = b.meters - 3;
      const after = b.meters + 3;
      if (before <= 0 || after >= DIST) continue;
      const from = shotAt(before); const to = shotAt(after);
      if (from === to) continue;
      /** ★真横どうしだけを見ます（★画角が変わる切替は、変わって当然） */
      if (broadcastV2ShotById(from as never).view !== 'side') continue;
      if (broadcastV2ShotById(to as never).view !== 'side') continue;
      /**
       * ★見るのは ★**1 枚絵の板どうし**の継ぎ目だけ（★上の注記）。
       * ★透視ワールドは走路を実際の形で描くので、★高さを変えても背景は破綻しません。
       */
      if (broadcastV2ShotById(from as never).perspectiveWorld === true) continue;
      if (broadcastV2ShotById(to as never).perspectiveWorld === true) continue;
      seams += 1;
      const gap = Math.abs(eyeZAt(after) - eyeZAt(before));
      if (gap > 1.5 + 1e-9) offenders.push(`${from}→${to} … ${gap.toFixed(2)}m`);
    }
    /** ⚠️ ★見る継ぎ目が 0 なら、★この検定は何も見ていません（★素通りを通さない・R-11） */
    expect(seams, '★真横どうしの継ぎ目が 1 つも見つかりません').toBeGreaterThan(0);
    expect(offenders, '★継ぎ目で高さが飛ぶと、背景が入れ替わって別のレースに見えます').toEqual([]);
  });

  /**
   * ★4 角は 3 通りから選べ、★`far` がいちばん小さいこと。
   * ⚠️ ★**既定は `front`**（★2026-09-12・★オーナー指示「コーナーは全部前から」）。
   *    ★`JUDGE_RACE_CUTS_20260821.md` の全数判定で ★**上・後ろからは 5 戦 5 敗**、
   *    ★前から（`diag-front`）だけが合格側でした。
   */
  it('★4 角の撮り方は選べる（★既定は正面固定・★俯瞰へ 1 手で戻せる）', () => {
    /** ⚠️ ★**1100m が 4 角**です（★2026-09-12 に走路の本当のコーナーへ貼り直した） */
    expect(frameAt(1100, 'v6').shot, '★既定は画面と同じ front').toBe('fourth-corner-front');
    expect(frameAt(1100, 'v6', 1, 'front').shot, '★明示しても同じ').toBe('fourth-corner-front');
    expect(frameAt(1100, 'v6', 1, 'wide').shot).toBe('fourth-corner-wide');
    expect(frameAt(1100, 'v6', 1, 'far').shot).toBe('fourth-corner-far');
    expect(frameAt(1100, 'v6', 1, 'far').top4HeightRatio)
      .toBeLessThan(frameAt(1100, 'v6', 1, 'wide').top4HeightRatio);
  });

  it('★v5 の直線は 1 カット、v6 は 4 カット', () => {
    const straight = (rows: typeof SCRIPT_V6, from: number): string[] =>
      rows.filter((r) => r.until > from).map((r) => r.id);
    expect(straight(SCRIPT_V5, 0.604)).toEqual(['homestretch-side', 'finish-line']);
    expect(straight(SCRIPT_V6, 0.750)).toEqual(['straight-contest', 'straight-field', 'straight-contest', 'finish-line']);
    /** ⚠️ ★頭に `start-rear-far`（0.0625）が入りました（★2026-09-11・★オーナー ②） */
    expect(SCRIPT_V6.map(r => r.until)).toEqual([0.008, 0.0625, 0.165, 0.206, 0.33, 0.54, 0.604, 0.75, 0.82, 0.87, 0.94, 1]);
  });

  // カットを削らず、既存の80mを横の引きに置き換える。
  it('直線の中間カットは尺を維持し、横の引きで追走集団を見せる', () => {
    const front = SCRIPT_V6.find((r) => r.id === 'straight-field');
    expect(front, '直線の中間カットを削らない').toBeDefined();
    const idx = SCRIPT_V6.findIndex((r) => r.id === 'straight-field');
    const span = SCRIPT_V6[idx]!.until - SCRIPT_V6[idx - 1]!.until;
    expect(span, '★窓は 0.05（80m）以上。詰めて誤魔化さない').toBeGreaterThanOrEqual(0.05 - 1e-9);
    const shot = broadcastV2ShotById('straight-field');
    expect(shot.view).toBe('side');
    expect(shot.horseAsset).toBe('side-v6');
    expect(shot.camera.fovDeg).toBeGreaterThan(broadcastV2ShotById('straight-contest').camera.fovDeg);
    expect(shot.closeIn).toBeUndefined();
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

  /**
   * ★**2026-08-28、v6 が既定になりました**（オーナー確定）。
   *   ⚠️ ★以前は「既定は v5・v6 は opt-in」を固定していました。★意図して書き換えています。
   *   ★代わりに★**切り戻しが効くこと**を固定します。こちらの方が重要です。
   */
  it('★既定は v6。★v5 / v4 へは URL で戻せる', () => {
    expect(broadcastV2ScriptFromSearch('')).toBe(DEFAULT_RACE_SCRIPT);
    expect(DEFAULT_RACE_SCRIPT).toBe(CUT_RACE_SCRIPT);
    expect(CUT_RACE_SCRIPT).toBe('v6');
    /** ★戻せること（既定へ黙って落ちない） */
    expect(broadcastV2ScriptFromSearch('?cinematography=v5')).toBe('v5');
    expect(broadcastV2ScriptFromSearch('?cinematography=v4')).toBe('v4');
    expect(broadcastV2ScriptFromSearch('?cinematography=v6')).toBe('v6');
  });

  // 大きさの下限だけを守って馬群を見切れさせない。
  it('直線の寄りは馬を巨大化させず、数頭の馬体を同時に見せる', () => {
    /**
     * ⚠️ ★標本点は **2026-08-28 に動かしました**。寄りのカットの開始を 0.604 → 0.750 へ
     *    移したため、旧の 1000m / 1080m は現在 `side-drive` です（`SCRIPT_V6` の注記）。
     *    ★①1200〜1312m ／ ②1312〜1392m ／ ③1392〜1504m から取ります。
     */
    for (const leadS of [1220, 1300, 1400, 1490]) {
      const f = frameAt(leadS, 'v6');
      expect(f.shot).toBe('straight-contest');
      expect(f.top4HeightRatio).toBeGreaterThan(0.20);
      expect(f.top4HeightRatio).toBeLessThan(0.30);
      expect(f.onScreen).toBeGreaterThanOrEqual(4);
    }
  });

  it('★v6 は同じ場面で v5 より大きい（直線の全域で）', () => {
    for (const leadS of [1000, 1080, 1320, 1440, 1560]) {
      expect(frameAt(leadS, 'v6').top4HeightRatio)
        .toBeGreaterThan(frameAt(leadS, 'v5').top4HeightRatio);
    }
  });

  // 引きは追走集団を含め、寄りと同じ構図を連続させない。
  it('直線の引きには先頭と追走集団が入り、前後の寄りと区別できる', () => {
    /**
     * ⚠️ ★標本点は **2026-08-28 に動かしました**。寄りのカットの開始を 0.604 → 0.750 へ
     *    移したため、旧の 1000m / 1080m は現在 `side-drive` です（`SCRIPT_V6` の注記）。
     *    ★①1200〜1312m ／ ②1312〜1392m ／ ③1392〜1504m から取ります。
     */
    /** ⚠️ ★②の窓は 2026-08-28 に 1312〜1392m → **1312〜1352m** へ詰めました（`SCRIPT_V6` の注記） */
    for (const leadS of [1320, 1345]) {
      const f = frameAt(leadS, 'v6');
      expect(f.shot).toBe('straight-field');
      expect(f.onScreen).toBeGreaterThanOrEqual(5);
      expect(f.leaderOnScreen).toBe(true);
      expect(f.top4HeightRatio).toBeLessThan(frameAt(1300, 'v6').top4HeightRatio);
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

/**
 * ★**発馬機は「形」なので、どの角度でも組み上がる**（★2026-09-11・★オーナー指示）
 *
 * ★オーナー評「★ゲートは真横からのゲートを作った方がいいです。★そのままゲート発走の瞬間の絵も
 *   ★上手くいくと思いますし、★そのままの陣地取りも上手くいくと思います」。
 *
 * ⚠️ ★以前の発馬機は ★**正面から描いた 1 枚絵**でした。★真横にすると横向きの黒い塊になります。
 *    ★この検定は ★**絵へ戻っていないこと**と、★発走まわりが真横であることを留めます。
 */
describe('★発走まわり（★世界座標の発馬機）', () => {
  it('★ゲート・発走直後・位置取りは、すべて真横で合格済みの素材を使う', () => {
    for (const id of ['start-gate-side', 'start-rear-far', 'opening-formation'] as const) {
      const shot = broadcastV2ShotById(id);
      expect(shot.view, `${id} の画角`).toBe('side');
      expect(shot.horseAsset, `${id} の素材`).toBe('side-v6');
    }
  });

  /**
   * ⚠️ ★**真横なのに 1 枚絵の板で描くと、高い位置から見たとき芝が合いません**
   *    （★オーナー ⑨「芝から出てしまっていて破綻しています」）。
   *    ★高い真横のカットは `perspectiveWorld` を立てること。
   */
  it('★高い真横のカットは、透視ワールドで描く', () => {
    for (const id of ['start-gate-side', 'start-rear-far', 'opening-formation'] as const) {
      expect(broadcastV2ShotById(id).perspectiveWorld, `${id}`).toBe(true);
    }
    /** ★低い真横（勝負所・直線）は板のままでよい */
    for (const id of ['side-drive', 'straight-contest', 'finish-line'] as const) {
      expect(broadcastV2ShotById(id).perspectiveWorld, `${id}`).not.toBe(true);
    }
  });

  /**
   * ⚠️ ★**旧台本（切り戻しの道）を動かさないこと。**
   *    ★一度 `start-front` を真横へ書き換えて、★台本 v4 の切替の数まで動きました。
   *    ★`start-gate-side` は ★**v6 だけ**が使います。
   */
  it('★真横のゲートは台本 v6 だけが使う', () => {
    expect(SCRIPT_V6.some((r) => r.id === 'start-gate-side')).toBe(true);
    for (const rows of [SCRIPT_V5, SCRIPT_V4] as const) {
      expect(rows.some((r) => r.id === 'start-gate-side')).toBe(false);
      expect(rows[0]?.id, '旧台本の頭は従来どおり').toBe('start-front');
    }
    expect(broadcastV2ShotById('start-front').view, '旧台本の発走は従来どおり').toBe('diag-front');
  });

  /**
   * ★**読む素材の組が増えていないこと**（★台帳 A-11 / A-12・★102MB → 76MB の最適化）。
   * ★4 角は実行時に差し替わるので、★**差し替わった先**で数えます。
   */
  it('★台本 v6 が読む組は 3 つだけ（★真横・斜め前・勝馬）', () => {
    /**
     * ⚠️ ★**2026-09-12、4 角の既定が `far` → `front` へ戻りました**（★オーナー指示）。
     *    ★読む組も ★**高所斜め → 斜め前**へ入れ替わります。★数は 3 つのまま
     *    （★台帳 A-11 / A-12・★102MB → 76MB の最適化を壊していないこと）。
     */
    expect([...broadcastV2ScriptAssets('v6')].sort())
      .toEqual(['diag-front-v2', 'side-v6', 'winner-v1']);
    /** ★`?corner=far` / `?corner=wide` へ切り替えたときは俯瞰の組が要ります */
    expect([...broadcastV2ScriptAssets('v6', true)].sort())
      .toEqual(['high-diag-v2', 'side-v6', 'winner-v1']);
  });
});

/**
 * ★**真横のカットは、走路が画面で「水平」に写ること**（★2026-09-11・★オーナー ⑨⑩）
 *
 * ★オーナー評「★芝の進行方向に対して、★**馬が右に向いているのがおかしい**です」。
 *
 * 【★なぜ起きるか】
 *   ★馬の絵は ★**画面に対してまっすぐ立つ板**です（★`drawPerspectiveHorses`）。★回りません。
 *   ★だから走路が画面上で ★**斜めに寝ると**、★馬だけが水平を向いたままになり、
 *   ★芝の流れと馬の向きが食い違います。
 *
 * 【★傾きは「ずらし」と「高さ」の ★**掛け算**で出ます — ★測って分かりました】
 *   ★`view: 'side'` のカメラは走路の真横に置かれますが、★`alongM` で前後にずらせます。
 *   ⚠️ ★最初は「ずらしただけで傾く」と思いました。★**違いました。**
 *      ★ゲート（★ずらし 26m・★高さ 5m）の傾きは ★**3.4°**しかありません（★実測）。
 *      ★ずらしが同じでも ★**高いほど傾きます**。★高さだけ、ずらしだけでは傾きません。
 *   → ★だから ★**高い真横のカットからずらしを抜き**、★低いゲートはずらしたままにしています。
 *
 * ★ここは ★**投影して角度を測ります**（★代理指標ではありません）。
 */
describe('★真横のカットの走路の傾き', () => {
  it('★真横のカットは、走路が水平から 6 度以内', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const { leadS, id } of [
      { leadS: 50, id: 'start-rear-far' },
      { leadS: 200, id: 'opening-side-lead' },
      { leadS: 290, id: 'opening-formation' },
      { leadS: 400, id: 'opening-side-settle' },
      { leadS: 700, id: 'side-drive' },
      { leadS: 1250, id: 'straight-contest' },
      { leadS: 1350, id: 'straight-field' },
    ]) {
      const scene = resolveBroadcastV2Scene(course, fieldAt(leadS), VIEWPORT, false, {
        cornerCutM: 400, raceDisplaySec: 30, script: 'v6',
        noContenderFrameShots: ['finish-line'] as const,
      });
      expect(scene.shot.id, `${leadS}m`).toBe(id);
      if (scene.shot.view !== 'side') continue;
      checked += 1;
      const basis = cameraBasis(scene.camera);
      const w = 10;
      const a = posOf(course, scene.focusS, w);
      const b = posOf(course, scene.focusS + 10, w);
      const pa = project(scene.camera, basis, { x: a.x, y: a.y, z: 0 });
      const pb = project(scene.camera, basis, { x: b.x, y: b.y, z: 0 });
      const deg = Math.abs((Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI);
      const tilt = Math.min(deg, 180 - deg);
      if (tilt > 6) offenders.push(`${scene.shot.id} … ${tilt.toFixed(1)}°`);
    }
    /** ⚠️ ★見るカットが 0 なら、★この検定は何も見ていません（★素通りを通さない・R-11） */
    expect(checked, '★真横のカットが 1 つも見つかりません').toBeGreaterThan(3);
    expect(offenders, '★走路が傾くと、★馬だけが水平を向いて芝の流れと食い違います').toEqual([]);
  });

  /**
   * ⚠️ ★**検定が効いていることを確かめます**（★R-21）。
   *    ★実物のカットは全部 6° 以内なので、★それだけでは ★**角度を見分けられているか分かりません**。
   *    → ★合格しているカットのカメラを ★**走路方向へ 25m ずらして**、★傾きが出ることを見ます。
   *    ★これは ★2026-09-11 に実際に起きていた状態（★高い真横＋ずらし）そのものです。
   */
  it('★高い真横のカメラを走路方向へずらすと、★この検定は傾きを捕まえる', () => {
    const scene = resolveBroadcastV2Scene(course, fieldAt(50), VIEWPORT, false, {
      cornerCutM: 400, raceDisplaySec: 30, script: 'v6',
      noContenderFrameShots: ['finish-line'] as const,
    });
    expect(scene.shot.id).toBe('start-rear-far');
    const tiltOf = (cam: typeof scene.camera): number => {
      const basis = cameraBasis(cam);
      const a = posOf(course, scene.focusS, 10);
      const b = posOf(course, scene.focusS + 10, 10);
      const pa = project(cam, basis, { x: a.x, y: a.y, z: 0 });
      const pb = project(cam, basis, { x: b.x, y: b.y, z: 0 });
      const deg = Math.abs((Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI);
      return Math.min(deg, 180 - deg);
    };
    /** ★走路の向き（単位ベクトル）だけずらす */
    const p0 = posOf(course, scene.focusS, 10);
    const p1 = posOf(course, scene.focusS + 10, 10);
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const shifted = {
      ...scene.camera,
      eye: {
        x: scene.camera.eye.x + ((p1.x - p0.x) / len) * 25,
        y: scene.camera.eye.y + ((p1.y - p0.y) / len) * 25,
        z: scene.camera.eye.z,
      },
    };
    expect(tiltOf(scene.camera), '★いまは水平').toBeLessThanOrEqual(6);
    expect(tiltOf(shifted), '★ずらすと傾く（★検定が見分けられている）').toBeGreaterThan(6);
  });
});

/**
 * ★**カットをまたいだ縮尺の連続**（★2026-09-11・★オーナー案 A）
 *
 * ★オーナー評「★カットインや真横カメラワークでも ★**切り替わりの時にレースが
 *   ★イメージとして繋がっていかない**」。
 *
 * 【★何を測るか — ★2 つ測って、片方を選びました】
 *   ★① ★**隊列の画面上の広がり**（★上位 5 頭）… ★最初これで見ました。
 *      ⚠️ ★発走まわりで ★**×6.79** と跳びますが、★これは ★**レースの実際の形**です。
 *         ★実測（seed 42）で、★馬群の前後の広がりは ★発走 4 秒で 5.0m、★12 秒で 21.6m。
 *         ★3 秒で 4 倍に伸びます。★どんなカメラでも、この変化は消せません。
 *   ★② ★**馬の大きさ**（★＝画面の縮尺）… ★こちらは ★**カメラだけで決まります**。
 *      ★見る人が「同じレースだ」と思う手掛かりは、★隊列の形ではなく ★**縮尺**のほうです。
 *
 * 【⚠️ ★合否の数字は ★**画面の実測**で出します。★ここでは出しません】
 *   ★この検定が使える幾何（★2.4m を投影した高さ）と、★画面が実際に描く矩形は
 *   ★**1.8 倍ずれます**（★俯瞰の素材は同じ 2.4m でも真横より大きく描かれる）。
 *   ★ずれた物差しで合否を決めると、★画面と検定が別の答えを持ちます（★R-30）。
 *   → ★**画面の数字は `tools/measure-shot-horse-size.mjs`** で出します。
 *     ★2026-09-11 の実測（★既定・seed 42）:
 *       ★勝負所 28.85% → ★4 角 入り 18.05%（★×0.63）→ ★出 14.61% → ★勝負所（★×1.97）
 *       ★中盤は 1.04〜1.29 倍。★2 倍を超える境目はありません。
 *   → ★ここで留めるのは ★**「画角の振りが実際に縮尺を寄せている」**という関係だけです。
 */
describe('★カットをまたいだ縮尺の連続', () => {
  it('★4 角の画角の振りは、入りを前のカットへ寄せている', () => {
    const corner = broadcastV2ShotById('fourth-corner-far');
    expect(corner.fovRamp, '★4 角に画角の振りが入っていること').toBeDefined();
    const ramp = corner.fovRamp!;
    /** ★入りは寄り（前のカットに近い大きさ）、★出は引き（弧を見せる） */
    expect(ramp.fromDeg, '★入りは出より寄っていること').toBeLessThan(ramp.toDeg);

    /**
     * ★**振りが効いていることを、同じ物差しの中で確かめます**（★R-21）。
     *   ★カットの頭（★振りの入り）と、★カットの終わり（★振りの出）で、
     *   ★馬の大きさが ★**実際に変わる**こと。★変わらなければ振りは効いていません。
     */
    const span = broadcastV2ScriptBoundariesM(course, 'v6');
    const idx = span.findIndex((b) => b.id === 'fourth-corner-front');
    expect(idx, '★4 角の境界が見つかりません').toBeGreaterThan(0);
    const start = span[idx - 1]!.meters, end = span[idx]!.meters;
    /**
     * ⚠️ ★**既定は 2026-09-12 に `front` へ戻りました。** ★画角の振りは `fourth-corner-far`
     *    ★固有の仕掛けなので、★**明示して**測ります（★戻し口として生きています）。
     */
    const enter = frameAt(start + 4, 'v6', 1, 'far');
    const exit = frameAt(end - 4, 'v6', 1, 'far');
    expect(enter.shot, '★入りは 4 角').toBe('fourth-corner-far');
    expect(exit.shot, '★出も 4 角').toBe('fourth-corner-far');
    expect(enter.top4HeightRatio, '★入りのほうが大きいこと（★寄りから引きへ）')
      .toBeGreaterThan(exit.top4HeightRatio * 1.15);

    /** ★引き切った画角（`camera.fovDeg`）は、★振りの出より広いまま（★弧を見せる役目） */
    expect(corner.camera.fovDeg).toBeGreaterThanOrEqual(ramp.toDeg);
  });
});


/**
 * ★**馬の絵を走路の向きに合わせて回す**（★2026-09-11・★見比べ用 `?tilt=track`）
 *
 * ★オーナー評（★4 角）「★芝に対して ★**馬が斜め前を向いている**」。
 *   ★馬の絵は画面に対してまっすぐ立つ板で、★回りません。
 *   ★直線はカメラで解けましたが（★⑨⑩ で走路が画面で水平になるよう構え直した）、
 *   ★**コーナーは走路が曲がっている**ので、どう構えても弧のどこかで必ずずれます。
 *   → ★絵のほうを、その場所の接線の角度だけ回します。
 *
 * ★**2026-09-11: 既定を「回す」にしました**（★オーナー判定「回したほうがまだマシ」）。
 *    ★既定そのものと「弧では回る／直線では回らない」は
 *    ★`align-to-track-default.test.ts` が留めています。★ここは角度の性質だけを見ます。
 *    ★戻し口は `/race?tilt=off`。
 */
describe('★走路の接線の角度（★絵を回すときに使う）', () => {
  const angleAt = (leadS: number): number => {
    const scene = resolveBroadcastV2Scene(course, fieldAt(leadS), VIEWPORT, false, {
      cornerCutM: 400, raceDisplaySec: 40, script: 'v6',
      noContenderFrameShots: ['finish-line'] as const,
    });
    return screenTrackAngle(course, scene.camera, leadS, 10);
  };
  const deg = (rad: number): number => Math.abs((rad * 180) / Math.PI);

  /**
   * ★直線では ★**ほぼ 0**（★＝回す必要がない）。
   * ★これが 0 でないなら、カメラが走路方向へずれています（★⑨⑩ で直した症状）。
   */
  it('★直線では 0 に近い（★回す必要が無い）', () => {
    for (const leadS of [200, 400, 700, 1250, 1350]) {
      expect(deg(angleAt(leadS)), `${leadS}m`).toBeLessThan(6);
    }
  });

  /**
   * ⚠️ ★**コーナーでは実際に傾いていること**（★検定が効いていることの確認・R-21）。
   *    ★ここが 0 なら、★「回す」という対処そのものが不要ということになります。
   */
  it('★コーナーでは傾いている（★だから絵を回す意味がある）', () => {
    expect(deg(angleAt(1100)), '★4 角').toBeGreaterThan(10);
  });

  /**
   * ⚠️ ★左右どちらへ走っても、★同じ向きの走路なら同じ角度を返すこと（★鏡像の基準）。
   *
   * ⚠️ ★**どのカメラで測るかを明示します**（★2026-09-12）。
   *    ★4 角の既定は `far`（★上から引き）→ `front`（★前から）へ戻りました。
   *    ★前からのカメラは ★**遠近が強い**ので、★前後 3m の標本で角度が少しずれます。
   *    ★実測: ★`far` 0.4° ／ ★`front` **2.77°**（★接線 28° に対して約 10%）。
   *    ★片方の数字で両方を縛ると、★**測っていないカメラの合否**を決めてしまいます。
   */
  const angleGapAt = (style: 'far' | 'front'): number => {
    const scene = resolveBroadcastV2Scene(course, fieldAt(900), VIEWPORT, false, {
      cornerCutM: 400, raceDisplaySec: 40, script: 'v6', cornerStyle: style,
      noContenderFrameShots: ['finish-line'] as const,
    });
    return deg(screenTrackAngle(course, scene.camera, 900, 10, 3)
      - screenTrackAngle(course, scene.camera, 900, 10, -3));
  };

  it('★左へ走る馬でも、同じ走路なら同じ角度（★上から引きのカメラ）', () => {
    expect(angleGapAt('far'), '★前後どちらを見ても同じ傾き').toBeLessThan(2);
  });

  it('★前からのカメラでも、前後の標本で符号が変わらない', () => {
    const gap = angleGapAt('front');
    /** ★遠近のぶんだけずれるが、★**向きが反転してはいけない**（★それは絵が裏返る原因） */
    expect(gap, '★ずれは遠近のぶんに収まること').toBeLessThan(4);
    expect(Math.sign(screenTrackAngle(course, resolveBroadcastV2Scene(course, fieldAt(900), VIEWPORT, false, {
      cornerCutM: 400, raceDisplaySec: 40, script: 'v6', cornerStyle: 'front',
      noContenderFrameShots: ['finish-line'] as const,
    }).camera, 900, 10, 3)), '★前向きの標本の符号').not.toBe(0);
  });
});

/**
 * ★**俯瞰のカットの素材**（★2026-09-11・★取り下げの記録）
 *
 * ★オーナー評（★4 角）「★上からのカメラワークなのに、★本来見えないはずの目が見えている」。
 *   ★実測で、★4 角が実際に描いていたのは ★**`side-v6`（真横の絵）**でした
 *   （★カット角 60.2° が後方素材の閾値 60° をわずかに外れていた）。
 *
 * ⚠️ ★**宣言どおり `high-diag-v2` を使う直しは、★取り下げました。**
 *    ★向きは合いましたが、★俯瞰の素材（`horse-jockey-high-diag-v4`）は ★**写実タッチ**で、
 *    ★他のカットのデフォルメ馬と ★**別の絵柄**です。★レースの途中で画風が変わります
 *    （★オーナー評「★急にリアル 2D の馬の真上のカメラワークが出ます」）。
 *    ★台帳にも同じ記録がありました。★読んでいたのに、★**絵を見る前に結線**しました。
 *
 * → ★**素材が揃うまでは真横のまま**。★この検定は「宣言と読み込みは在る」ことだけを留めます。
 */
describe('★俯瞰のカットが宣言する素材', () => {
  it('★俯瞰のカットは、俯瞰の素材を宣言している（★使うかは別）', () => {
    for (const id of ['fourth-corner-far', 'fourth-corner-wide', 'aerial'] as const) {
      const shot = broadcastV2ShotById(id);
      expect(shot.view, `${id} の画角`).toBe('high-diag');
      expect(shot.horseAsset, `${id} の素材`).toBe('high-diag-v2');
    }
  });

  /**
   * ⚠️ ★**2026-09-12 に意味が変わりました。** ★4 角の既定が `front` へ戻ったので、
   *    ★俯瞰の素材は ★**既定では読みません**（★描かないから）。
   *    ★`?corner=far` / `?corner=wide` へ切り替えたときだけ読みます。
   *    ★「描くものだけ読む」という規律は、★向きが変わっても生きています。
   */
  it('★俯瞰へ切り替えたときだけ、俯瞰の素材を読み込む', () => {
    expect(broadcastV2ScriptAssets('v6'), '★既定（前から）では読まない').not.toContain('high-diag-v2');
    expect(broadcastV2ScriptAssets('v6', true), '★俯瞰へ切り替えたら読む').toContain('high-diag-v2');
  });

  it('★真横のカットは真横の素材を宣言したまま', () => {
    for (const id of ['side-drive', 'straight-contest', 'start-rear-far', 'opening-formation'] as const) {
      expect(broadcastV2ShotById(id).horseAsset, id).toBe('side-v6');
    }
  });
});
