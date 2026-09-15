/**
 * ★**競馬場ごとの見た目**（★ゲート・ゴールの目印・距離標・刈り模様・観客・実況者・紹介 1 行・格の雰囲気・2026-09-15）
 *
 * 【★見ている壊れ方】
 *   ① ★場を足したのに見た目の表に無い（★画面が投げる／★黙って既定に落ちる）… R-33
 *   ② ★既定の鞍（スターパーク）の画が ★**知らないうちに変わる** … ★描画の命令列で 1 つずつ突き合わせる
 *   ③ ★2 つの場が同じ見た目（★「場ごとに違う」が成り立たない）
 *   ④ ★新しい口が ★**効いていない**（★値を持つだけで描画が読まない）… 対照つき
 *   ⑤ ★画面が表を読んでいない（★画面だけ別の値を持つ）… R-30
 *   ⑥ ★紹介 1 行の「いちばん長い直線」などが ★データと食い違う
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { VENUES, GRADED_RACES } from '@star/scheduler';
import {
  VENUE_LOOKS, venueLookOf, GRADE_LOOKS,
  GATE_WORLD_COLORS, GATE_WORLD_STYLE, FINISH_POST_COLORS, FINISH_POST_STYLE,
  DISTANCE_POLE_STYLE, MOW_STRIPE_PERIOD_M, MOW_STRIPE_ALPHA, CROWD_ACCENT_COLORS,
  drawStartingGateWorld, drawStartingGateWorldFront, drawFinishPost, drawBroadcastV2Scene, drawDistancePoles,
  paintCrowd, narratorCastForRace,
  ovalCourse, resolveBroadcastV2Scene,
  type StartingGateStyle, type FinishMarkerStyle, type DistancePoleStyle,
} from '@star/render';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** ★塗った色と座標を順に記録する（★丸めた座標まで比べるので、形の違いも拾う） */
function recorder() {
  const ops: string[] = [];
  const r = (v: number): string => v.toFixed(3);
  const state = { fillStyle: '' as unknown, globalAlpha: 1 };
  const target: Record<string, unknown> = {
    fillRect: (x: number, y: number, w: number, h: number) => ops.push(`fillRect:${String(state.fillStyle)}:${r(x)},${r(y)},${r(w)},${r(h)}`),
    fill: () => ops.push(`fill:${String(state.fillStyle)}`),
    moveTo: (x: number, y: number) => ops.push(`M${r(x)},${r(y)}`),
    lineTo: (x: number, y: number) => ops.push(`L${r(x)},${r(y)}`),
    ellipse: (x: number, y: number, rx: number) => ops.push(`E${r(x)},${r(y)},${r(rx)}`),
    beginPath: () => undefined, closePath: () => undefined, drawImage: () => undefined, stroke: () => undefined,
    fillText: (t: string) => ops.push(`text:${t}:${String(state.fillStyle)}`),
    measureText: () => ({ width: 10 }),
    save: () => undefined, restore: () => undefined, transform: () => undefined,
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'fillStyle' ? state.fillStyle : key === 'globalAlpha' ? state.globalAlpha
      : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'fillStyle') state.fillStyle = value;
      else if (key === 'globalAlpha') state.globalAlpha = value as number;
      else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, ops };
}

const FONT = (px: number, bold?: boolean): string => `${bold === true ? 'bold ' : ''}${px}px sans-serif`;

/** ★発走地点の真横のカメラで、ゲートの奥側と前扉を描いた命令列 */
function gateOps(style: StartingGateStyle | undefined): string[] {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: 0, w: 1.5 + i * 1.3 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false);
  const { ctx, ops } = recorder();
  const opts = { startS: 0, fieldSize: 12, closedRatio: 1, focusS: scene.focusS, font: FONT, ...(style === undefined ? {} : { style }) };
  drawStartingGateWorld(ctx as never, course, scene.camera, opts);
  drawStartingGateWorldFront(ctx as never, course, scene.camera, opts);
  return ops;
}

/** ★ゴール前の真横のカメラで、目印を描いた命令列 */
function finishOps(style: FinishMarkerStyle | undefined, line?: boolean): string[] {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: 1590 - i * 3, w: 2 + (i % 4) * 2.2 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: 'finish-line', script: 'v8' });
  const { ctx, ops } = recorder();
  drawFinishPost(ctx as never, course, scene.camera, {
    focusS: scene.focusS, ...(style === undefined ? {} : { style }), ...(line === undefined ? {} : { line }),
  });
  return ops;
}

/** ★道中の真横のカメラで、距離標（奥と手前の 2 回）を描いた命令列 */
function poleOps(style: DistancePoleStyle | undefined): string[] {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: 1390 - i * 3, w: 2 + (i % 4) * 2.2 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: 'finish-line', script: 'v8' });
  const { ctx, ops } = recorder();
  for (const pass of ['behind', 'front'] as const) {
    drawDistancePoles(ctx as never, course, scene.camera, { focusS: scene.focusS, pass, font: FONT, ...(style === undefined ? {} : { style }) });
  }
  return ops;
}

/** ★座席だけの小さなタイルに観客を焼いた命令列 */
function crowdOps(accentColors: readonly string[] | undefined): string[] {
  const { ctx, ops } = recorder();
  paintCrowd(ctx as never, 80, 40, () => 1, accentColors === undefined ? {} : { accentColors });
  return ops;
}

describe('★競馬場ごとの見た目', () => {
  it('★① 10 場すべてに見た目があり、表に余分な場が無い（R-33）', () => {
    expect(VENUE_LOOKS.map((v) => v.venueId).sort()).toEqual(VENUES.map((v) => v.id).sort());
    for (const v of VENUES) expect(venueLookOf(v.id).venueId).toBe(v.id);
  });

  it('★① 知らない場は投げる（★黙って既定に落とさない・R-27）', () => {
    expect(() => venueLookOf('no-such-venue')).toThrow();
  });

  it('★② スターパークは既定の見た目そのもの（★実況者もシード 42 の人）', () => {
    const star = venueLookOf('star-park');
    expect(star.gate).toBe(GATE_WORLD_STYLE);
    expect(star.gate.colors).toEqual(GATE_WORLD_COLORS);
    expect(star.finish.style).toBe(FINISH_POST_STYLE);
    expect(star.finish.style.colors).toEqual(FINISH_POST_COLORS);
    expect(star.finish.sideView).toBe('bitmap');
    expect(star.poles).toBe(DISTANCE_POLE_STYLE);
    expect(star.mow).toEqual({ periodM: MOW_STRIPE_PERIOD_M, alpha: MOW_STRIPE_ALPHA });
    expect(star.crowdAccents).toBe(CROWD_ACCENT_COLORS);
    expect(star.cast).toBe(narratorCastForRace(42));
  });

  /**
   * ★**② 既定の画は 1 ビットも変わらない**。★見た目を渡さないときと、★スターパークの見た目を渡したときの
   *   ★描画の命令列（色・座標）が完全に一致すること。
   * ⚠️ ★対照: ★別の場（天河）では命令列が変わること（★この比較が空回りしていないこと）。
   */
  it('★② ゲート: 既定と スターパークの命令列が一致／天河とは違う', () => {
    const base = gateOps(undefined);
    expect(base.length, '★ゲートが画面に入っていない（この検査は何も見ていない）').toBeGreaterThan(100);
    expect(gateOps(venueLookOf('star-park').gate)).toEqual(base);
    expect(gateOps(venueLookOf('tenga').gate)).not.toEqual(base);
  });

  it('★② ゴールの目印: 既定と スターパークの命令列が一致／天河とは違う', () => {
    const base = finishOps(undefined);
    expect(base.some((o) => o.startsWith(`fillRect:${FINISH_POST_COLORS.post}`)), '★目印が画面に入っていない').toBe(true);
    expect(finishOps(venueLookOf('star-park').finish.style)).toEqual(base);
    expect(finishOps(venueLookOf('tenga').finish.style)).not.toEqual(base);
  });

  it('★② 距離標: 既定と スターパークの命令列が一致／天河とは違う（★帯が効く）', () => {
    const base = poleOps(undefined);
    expect(base.some((o) => o.startsWith(`fillRect:${DISTANCE_POLE_STYLE.pole}`)), '★距離標が画面に入っていない').toBe(true);
    expect(poleOps(venueLookOf('star-park').poles)).toEqual(base);
    const tenga = venueLookOf('tenga').poles;
    const tengaOps = poleOps(tenga);
    expect(tengaOps).not.toEqual(base);
    expect(tengaOps.some((o) => o.startsWith(`fillRect:${tenga.band}`)), '★帯が描かれていない').toBe(true);
  });

  it('★② 観客: 差し色を渡さなければ従来の並び／スターパークの差し色も同じ／天河とは違う', () => {
    const base = crowdOps(undefined);
    expect(base.length).toBeGreaterThan(100);
    expect(crowdOps(venueLookOf('star-park').crowdAccents)).toEqual(base);
    expect(crowdOps(venueLookOf('tenga').crowdAccents)).not.toEqual(base);
  });

  it('★③ 10 場の見た目がすべて違う（★ゲート・目印・距離標・刈り模様・観客のそれぞれで）', () => {
    const uniq = (f: (v: (typeof VENUE_LOOKS)[number]) => unknown): number => new Set(VENUE_LOOKS.map((v) => JSON.stringify(f(v)))).size;
    expect(uniq((v) => v.gate)).toBe(VENUE_LOOKS.length);
    expect(uniq((v) => v.finish.style)).toBe(VENUE_LOOKS.length);
    expect(uniq((v) => v.poles)).toBe(VENUE_LOOKS.length);
    expect(uniq((v) => v.mow)).toBe(VENUE_LOOKS.length);
    expect(uniq((v) => v.crowdAccents)).toBe(VENUE_LOOKS.length);
    expect(uniq((v) => v.feature)).toBe(VENUE_LOOKS.length);
    /** ★描いた結果でも違うこと（★表の値が違っても、描画が読まなければ同じ画になる） */
    const drawn = new Set(VENUE_LOOKS.map((v) => gateOps(v.gate).join('|')));
    expect(drawn.size).toBe(VENUE_LOOKS.length);
  });

  /** ★実況者は 4 名なので重複はするが、★1 人に偏らない（★4 名とも使う） */
  it('★③ 実況者は 4 名とも使い、1 人に 4 場以上を寄せない', () => {
    const count = new Map<string, number>();
    for (const v of VENUE_LOOKS) count.set(v.cast, (count.get(v.cast) ?? 0) + 1);
    expect([...count.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const [cast, n] of count) expect(n, `★${cast}`).toBeLessThanOrEqual(3);
  });

  it('★④ 屋根: canopy を立てると塗りが増える（★対照: 同じ色で canopy なし）', () => {
    const tenga = venueLookOf('tenga').gate;
    expect(tenga.canopy).toBe(true);
    const fills = (ops: string[]): number => ops.filter((o) => o.startsWith('fill:')).length;
    expect(fills(gateOps(tenga))).toBeGreaterThan(fills(gateOps({ ...tenga, canopy: false })));
  });

  it('★④ 番号板の倍率が座標に効く（★対照: 倍率 1）', () => {
    const aone = venueLookOf('aone').gate;
    expect(aone.plateScale).toBe(1.2);
    expect(gateOps(aone)).not.toEqual(gateOps({ ...aone, plateScale: 1 }));
  });

  it('★④ 目印の 3 つの形がどれも板の色を描き、形ごとに命令列が違う', () => {
    const colors = { post: '#101010', postShade: '#202020', board: '#303030', line: '#404040', accent: '#505050' };
    const byShape = (['board', 'disc', 'gantry'] as const).map((shape) => finishOps({ colors, shape }));
    for (const ops of byShape) {
      expect(ops.some((o) => o.includes(colors.board))).toBe(true);
      expect(ops.some((o) => o.includes(colors.post))).toBe(true);
    }
    expect(new Set(byShape.map((ops) => ops.join('|'))).size).toBe(3);
  });

  it('★④ line: false で決勝線を描かない（★対照: 既定は描く）', () => {
    const colors = { post: '#101010', postShade: '#202020', board: '#303030', line: '#404040' };
    expect(finishOps({ colors }).some((o) => o === `fill:${colors.line}`)).toBe(true);
    expect(finishOps({ colors }, false).some((o) => o === `fill:${colors.line}`)).toBe(false);
  });

  /**
   * ★**④ 横視点**: ★`finishPostInSideView` を立てた場だけ、★透視ワールドを使わないカットでも目印が立つ。
   *   ★対照: ★立てなければ横視点では 1 画素も描かない（★従来どおり・`finish-post.test.ts` ②と同じ）。
   */
  it('★④ 横視点では finishPostInSideView のときだけ目印を描く', () => {
    const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: 1590 - i * 3, w: 2 + (i % 4) * 2.2 }));
    const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: 'finish-line', script: 'v8' });
    const style = venueLookOf('tenga').finish.style;
    const draw = (inSide: boolean): string[] => {
      const { ctx, ops } = recorder();
      drawBroadcastV2Scene(ctx as never, course, scene, {
        palette: {},
        libraries: new Proxy({}, { get: () => ({ sheet: 'x', sheetWidth: 800, spec: { frames: 8, cellH: 100 } }) }) as never,
        fieldSize: 12, frameOf: () => 0, frameRoleOf: () => 'frame-1',
        surface: 'turf', condition: 'good', kickupColor: '#738b43',
        mowStripes: false, distancePoles: false,
        finishPostStyle: style, finishPostInSideView: inSide,
      });
      return ops;
    };
    const boardFills = (ops: string[]): number => ops.filter((o) => o === `fill:${style.colors.board}`).length;
    expect(boardFills(draw(true))).toBeGreaterThan(0);
    expect(boardFills(draw(false))).toBe(0);
  });

  /** ★④ 格の雰囲気: G1 がいちばん満員、G3 がいちばん空く／G1 の帯は従来の金のまま */
  it('★④ 格の雰囲気の表（★G1 > G2 > G3 の入り・G1 の帯は金のまま）', () => {
    expect(GRADE_LOOKS.G1.emptyRatio).toBeLessThan(GRADE_LOOKS.G2.emptyRatio);
    expect(GRADE_LOOKS.G2.emptyRatio).toBeLessThan(GRADE_LOOKS.G3.emptyRatio);
    expect(GRADE_LOOKS.G2.emptyRatio, '★G2 は従来の既定のまま').toBe(0.1);
    expect(GRADE_LOOKS.G1.edgeTint).toBeUndefined();
    expect(new Set(GRADED_RACES.map((r) => r.grade))).toEqual(new Set(Object.keys(GRADE_LOOKS)));
  });

  /** ★⑥ 紹介 1 行の最上級は、★`VENUES` の数値から見て本当に最上級であること */
  it('★⑥ 紹介 1 行の「いちばん」がデータと合う', () => {
    const by = (key: 'homeStretchM' | 'lapM', pick: 'max' | 'min'): string => {
      const sorted = [...VENUES].sort((a, b) => (pick === 'max' ? b[key] - a[key] : a[key] - b[key]));
      return sorted[0]!.id;
    };
    const radius = (v: (typeof VENUES)[number]): number => (v.lapM - v.homeStretchM * 2) / (2 * Math.PI);
    const deepest = [...VENUES].sort((a, b) => radius(a) - radius(b))[0]!.id;
    const claims: [string, string][] = [
      ['いちばん長い直線', by('homeStretchM', 'max')],
      ['いちばん短い直線', by('homeStretchM', 'min')],
      ['いちばん小さい', by('lapM', 'min')],
      ['いちばん大きい', by('lapM', 'max')],
      ['いちばん深いコーナー', deepest],
    ];
    for (const [phrase, id] of claims) {
      const owners = VENUE_LOOKS.filter((v) => v.feature.includes(phrase)).map((v) => v.venueId);
      expect(owners, `★「${phrase}」`).toEqual([id]);
    }
    /** ★右回りと書いた場は、★本当に右回り */
    for (const v of VENUE_LOOKS) {
      if (v.feature.includes('右回り')) expect(VENUES.find((x) => x.id === v.venueId)!.turn, v.venueId).toBe('right');
    }
  });

  /** ★⑤ 画面が同じ表から引いている（★画面だけ別の値を持たない・R-30） */
  it('★⑤ 画面（/race）は venueLookOf / GRADE_LOOKS から引き、各描画へ渡している', () => {
    const src = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    for (const needle of [
      'const VENUE_LOOK = venueLookOf(RACE_SETUP.venue.id);',
      'style: VENUE_LOOK.gate,',
      'finishPostStyle: VENUE_LOOK.finish.style,',
      "finishPostInSideView: VENUE_LOOK.finish.sideView === 'code',",
      "object.name === 'finish-tower' && VENUE_LOOK.finish.sideView === 'code'",
      'poleStyle: VENUE_LOOK.poles,',
      'mowStyle: VENUE_LOOK.mow,',
      'accentColors: VENUE_LOOK.crowdAccents',
      'emptyRatio: GRADE_LOOK.emptyRatio',
      'const cast = VENUE_LOOK.cast;',
      'venueFeature:',
    ]) expect(src, `★画面に ${needle} が無い`).toContain(needle);
  });
});
