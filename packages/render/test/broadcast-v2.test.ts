import { describe, expect, it } from 'vitest';
import {
  broadcastV2FinishCamera, broadcastV2FocusMeters, broadcastV2RangeCenterMeters, broadcastV2ShotAt,
  broadcastV2ShotById, ovalCourse, resolveBroadcastV2Scene, segmentStarts,
} from '../src/index.js';

describe('Broadcast V2', () => {
  const course = ovalCourse(1600, { turn: 'left' });

  it('実コース区間から方向別ショットを選ぶ', () => {
    for (const boundary of segmentStarts(course)) {
      const shot = broadcastV2ShotAt(course, Math.min(1599, boundary.s + 1), false, undefined, { script: 'v2' });
      if (boundary.label.includes('1角')) expect(shot.id).toBe('first-corner-front');
      if (boundary.label.includes('2角')) expect(shot.id).toBe('second-corner-high');
      if (boundary.label === '向正面') expect(shot.id).toBe('backstretch-side');
      if (boundary.label.includes('3角')) expect(shot.id).toBe('third-corner-rear');
      if (boundary.label.includes('4角')) expect(shot.id).toBe('fourth-corner-high');
      if (boundary.label === '直線' && boundary.s < 1520) expect(shot.id).toBe('homestretch-side');
    }
  });

  it('ゴール前と決着後を専用ショットへ切り替える', () => {
    expect(broadcastV2ShotAt(course, 1550, false, undefined, { script: 'v2' }).id).toBe('finish-line');
    expect(broadcastV2ShotAt(course, 1600, true).id).toBe('winner-follow');
  });

  /**
   * ★序盤の 2 カットを真横から斜めに替えました（2026-08-21）。
   *
   *   エンジンの `laneAt` は発走後どの馬もラチを取りにいく設計で、**残り 1350m の時点で
   *   12 頭の横の広がりは 0.85m しかありません**（8 頭が同じ横位置）。
   *   真横から撮ると同じ大きさの切り抜きが重なり、★オーナー評「**競艇のボートみたいな姿**」。
   *   ゴール前が合格なのは、そこでは**横に 11.9m 散っている**からです（同じ素材・同じ真横）。
   *
   *   ★このテストは**カットの並び**を留めるためのものです。並びを変えるときは、
   *     上のような理由を添えてここも直すこと。数字合わせで通さないこと。
   */
  /**
   * ★台本 v4（既定）— オーナー判定（2026-08-21・12 カット全数）で
   *   **後方・俯瞰が 5 戦 5 敗**だったため、**前からと真横だけ**で構成する。
   *   詳細は `JUDGE_RACE_CUTS_20260821.md`。
   *   ⚠️ ★このテストは**「後方・俯瞰が混ざっていないこと」**を留めるのが本体です。
   *      並びを変えるときは判定表を更新してからにすること。
   */
  it('★★台本 v4（既定）: 前からと真横だけ。後方・俯瞰を含まない', () => {
    /**
     * ★境界は 240 / 528 / 800 / 1056 / 1504m（`SCRIPT_V4` の until × 1600）
     *
     * 【★直線を正面固定に替えました（2026-08-22・オーナー指摘）】
     *   オーナー評「**差してくるのが見えない。最後は 2 頭が走ってそのままゴール**」。
     *   実測すると、我々の隊列は**ゴール前で上位 8 頭が 27.7m（11.5 馬身）**伸びます。
     *   参考（`ref-race2.png` 98s）は**同じ 8 頭が 2〜3 馬身**に収まっていました（4〜5 倍の差）。
     *   ★横から撮るかぎり「寄れば差し馬が画面外／入れれば豆粒」にしかなりません。
     *   → 直線は**正面追従**にして、走路方向の広がりを**奥行き**に変換します。
     */
    const seq = [30, 400, 700, 900, 1200, 1550]
      .map((s) => broadcastV2ShotAt(course, s).id);
    expect(seq).toEqual([
      'start-front', 'first-corner-front', 'side-drive', 'fourth-corner-front',
      'homestretch-front', 'finish-line',
    ]);
    // ★不合格だった 5 カットが、距離のどこにも現れないこと
    const banned = new Set(['second-corner-high', 'aerial', 'third-corner-rear', 'fourth-corner-wide']);
    for (let m = 0; m <= 1600; m += 10) {
      expect(banned.has(broadcastV2ShotAt(course, m).id)).toBe(false);
    }
  });

  it('★台本 v3（旧）: 明示指定したときだけ使う', () => {
    const seq = [30, 150, 300, 500, 700, 850, 950, 1050, 1200, 1400, 1550]
      .map((s) => broadcastV2ShotAt(course, s, false, undefined, { script: 'v3' }).id);
    expect(seq).toEqual(['start-front', 'first-corner-front', 'second-corner-high', 'aerial', 'third-corner-rear', 'side-drive',
      'fourth-corner-wide', 'fourth-corner-front', 'homestretch-side', 'front-close', 'finish-line']);
    expect(broadcastV2ShotAt(course, 1600, true).id).toBe('winner-follow');
    // 正面寄り素材が無いときは 4 角を俯瞰ワイドで代用
    expect(broadcastV2ShotAt(course, 1050, false, undefined, { fourthCornerFront: false }).id).toBe('fourth-corner-wide');
  });

  /**
   * ★**ショット定義の `camera:` が、実際に画面に効いていること**（2026-08-22）
   *
   * 【この検査が生まれた実害】
   *   `resolveBroadcastV2Scene` は `homestretch-side` と `finish-line` を
   *   `broadcastV2FinishCamera` に通します。その関数は **`SIDE_TELE` を直接**書いていたので、
   *   ★**この 2 つのショットの `camera:` は誰にも読まれていませんでした。**
   *
   *   直線の寄りを作るため preset を 12° → 7.6° に変えたのに**画面は 25.1% のまま**で、
   *   ★**定義を変えたのに何も起きない**という形で 1 度見落としました。
   *   ⚠️ 型は通り、テストも通り、コメントにも「変えた」と書いてあります。
   *      **効いていないことだけが、どこにも現れませんでした。**
   *
   * 【だから何を見るか】
   *   「値が正しいか」ではなく **「定義から画面までの経路が繋がっているか」** を見ます（R-1）。
   *   ★対照（下段）を必ず置くこと: 経路が切れていれば**両方が同じ値**になり、
   *     この検査は「差がある」で落ちます。
   */
  it('★ショット定義の画角が、解決後のカメラに実際に効いている（経路）', () => {
    /**
     * ★**馬群を詰めて置きます。**
     *   `homestretch-side` は「争っている馬を画面に収める」ため、隊列が伸びると
     *   画角を広げます（2026-08-22）。**preset は“いちばん寄ったときの値”**なので、
     *   詰まった状態で比べないと一致しません。
     *   ⚠️ ここを緩めて「だいたい合っていればよい」にすると、
     *      preset が読まれていない実害（12°→7.6° にしても画面が変わらなかった）を
     *      また見逃します。**条件を揃えて、厳密に比べます。**
     *   → **1 頭だけ**にすれば広がりは 0 なので、必ずいちばん寄った値になります。
     */
    const horses = [{ gate: 1, s: 1200, w: 6 }];
    const sceneOf = (leaderS: number, forceShotId?: string) => resolveBroadcastV2Scene(
      course,
      horses.map((h) => ({ ...h, s: h.s - (1200 - leaderS) })),
      { width: 1280, height: 720 }, false,
      forceShotId === undefined ? { finishStyle: 'solo' } : { finishStyle: 'solo', forceShotId: forceShotId as never },
    );

    // 直線（1200m）は `homestretch-side`。その preset の画角がそのまま出ること
    /**
     * ⚠️ ★**ショットは明示指定します。** 台本の並びは演出の都合で変わるので、
     *    「1200m なら◯◯」に頼ると、台本を触るたびにこの検査が落ちます。
     *    ここが見たいのは**定義から画面までの経路**であって、台本ではありません。
     */
    const straight = sceneOf(1200, 'homestretch-side');
    expect(straight.shot.id).toBe('homestretch-side');
    const preset = broadcastV2ShotById('homestretch-side').camera;
    expect((straight.camera.fovY * 180) / Math.PI).toBeCloseTo(preset.fovDeg, 4);

    /**
     * ★対照: `finish-line` は**別の preset**なので、解決後の画角も**違う値**になること。
     *   ⚠️ ここが同値なら経路が切れて既定値へ落ちている（＝実害の再発）。
     */
    const finishPreset = broadcastV2ShotById('finish-line').camera;
    expect(finishPreset.fovDeg).not.toBeCloseTo(preset.fovDeg, 2);
    const atFinish = sceneOf(1560, 'finish-line');
    expect(atFinish.shot.id).toBe('finish-line');
    expect((atFinish.camera.fovY * 180) / Math.PI).not.toBeCloseTo((straight.camera.fovY * 180) / Math.PI, 2);
  });

  /**
   * ★`broadcastV2FinishCamera` は**基準を受け取り、差分だけを決める**。
   *   重み 0（まだ引き始めていない）なら、渡した基準がそのまま返ること。
   */
  it('★ゴール前カメラは重み0で基準の画角を素通しする', () => {
    const base = { backM: 44, upM: 3.5, sideM: 9, fovDeg: 5.7 } as const;
    expect(broadcastV2FinishCamera('solo', 0, base).camera.fovDeg).toBeCloseTo(5.7, 6);
    expect(broadcastV2FinishCamera('contest', 0, base, 0.66).leadFraction).toBeCloseTo(0.66, 6);
    /**
     * ★重み 1 では接戦だけが引く（**15°**）。
     * ⚠️ ★以前は **22°** でした。2026-08-28、オーナー評「ゴール前で急に迫力がなくなる」。
     *    ★見た目の速さは画面上の地面の流れで決まり、それは馬の大きさに比例します。
     *    実測: `finish-line` の地面の流れは `straight-contest` の **30%** しかありませんでした。
     *    ★15° にして **52%** まで戻しています。入れるべきは「何頭でも」ではなく
     *    ★**競り合っている数頭**で、15° の画面には走路 19.4m が入ります（上位 5 頭は約 12.5m）。
     */
    expect(broadcastV2FinishCamera('contest', 1, base).camera.fovDeg).toBeCloseTo(15, 6);
    /** ★単騎のときは寄る（12°）— 接戦より狭いことを固定する */
    expect(broadcastV2FinishCamera('solo', 1, base).camera.fovDeg)
      .toBeLessThan(broadcastV2FinishCamera('contest', 1, base).camera.fovDeg);
  });

  it('注視点は両端の外れ値を除いた平均になる', () => {
    expect(broadcastV2FocusMeters([0, 100, 101, 102, 103, 104, 105, 106, 107, 300])).toBeCloseTo(103.5);
    expect(broadcastV2FocusMeters([])).toBe(0);
  });

  it('全馬群ショットは単独先頭と最後尾の中点を使う', () => {
    expect(broadcastV2RangeCenterMeters([100, 101, 102, 140])).toBe(120);
    expect(broadcastV2RangeCenterMeters([])).toBe(0);
  });
});
