/**
 * ★**芝の縞刈り**（設計 1-3）が、絵に出る形で描かれていることを留める
 *
 * 【参考で確かめたこと】
 *   ★近寄りのカット（62s / 104s）には**縞は見えません**。被写体ブラーと逆光で潰れます。
 *   見えるのは**引きのカット**（`out/judge/ref-high.png` 67s / 69s）で、
 *   芝に明暗の帯が並びます。★つまりこの機構は**引きの画のためのもの**です。
 *
 * 【★この検査が生まれた実害（2026-08-22）】
 *   最初、間引きを「**頂点のどれかが画面内か**」で書きました。帯は走路の内外へ 140m 伸びるので、
 *   ★**画面を横切っていても頂点は全部画面外**です。結果、**帯が 1 本しか描かれませんでした。**
 *   ⚠️ α を 0.05 にしていたので「薄すぎて見えないのだろう」と誤読しかけました。
 *      α を 0.6 に振って**機構が動いているかを先に確かめて**気づきました（R-21）。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { cameraBasis, project } from '../src/perspective.js';
import { posOf } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { drawMowStripes, MOW_STRIPE_ALPHA, MOW_STRIPE_PERIOD_M } from '../src/mow-stripes.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** fill された多角形の色とαを記録する */
function recorder() {
  const fills: { style: unknown; alpha: number }[] = [];
  const state = { globalAlpha: 1, fillStyle: '' as unknown };
  const target: Record<string, unknown> = {
    beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined, closePath: () => undefined,
    fill: () => fills.push({ style: state.fillStyle, alpha: state.globalAlpha }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'globalAlpha' ? state.globalAlpha : key === 'fillStyle' ? state.fillStyle
      : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'globalAlpha') state.globalAlpha = value as number;
      else if (key === 'fillStyle') state.fillStyle = value;
      else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, fills };
}

function projectorFor(shotId: string, focusS: number) {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: focusS - i * 3, w: 2 + i * 1.4, staminaRatio: 1 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: shotId as never });
  const basis = cameraBasis(scene.camera);
  return {
    scene,
    projectGround: (s: number, w: number) => {
      const p = posOf(course, s, w);
      const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      return { x: q.x, y: q.y, depth: q.depth };
    },
  };
}

/**
 * ★**帯の境目の `s`（世界座標）**を拾う。
 *   ★`drawMowStripes` に渡す投影関数を包んで、★問い合わせが来た `s` を記録します。
 *   ★境目は周期の倍数なので、★そこだけ残します。
 * ⚠️ ★画面の数（本数・色の並び）ではなく**世界の数**を見るための道具です。
 *    ★画面の数は間引き（外接矩形）に依るので、★縁の広さを変えると顔ぶれが変わります。
 */
function bandStarts(shotId: string, focusS: number, opts: { periodM?: number } = {}): number[] {
  const period = opts.periodM ?? MOW_STRIPE_PERIOD_M;
  const { projectGround } = projectorFor(shotId, focusS);
  const seen: number[] = [];
  const spy = (s: number, w: number): { x: number; y: number; depth: number } => {
    seen.push(s);
    return projectGround(s, w);
  };
  const { ctx } = recorder();
  drawMowStripes(ctx as never, course, spy, VIEWPORT, { focusS, ...opts });
  const out = new Set<number>();
  for (const s of seen) {
    if (Math.abs(s / period - Math.round(s / period)) < 1e-6) out.add(Math.round(s / period) * period);
  }
  return [...out].sort((a, b) => a - b);
}

function stripesAt(shotId: string, focusS: number, opts = {}) {
  const { projectGround } = projectorFor(shotId, focusS);
  const { ctx, fills } = recorder();
  drawMowStripes(ctx as never, course, projectGround, VIEWPORT, { focusS, ...opts });
  return fills;
}

describe('芝の縞刈り', () => {
  /**
   * ★**帯が複数本出ること。**
   *   ⚠️ 「1 本以上」では駄目です。実害のときも**ちょうど 1 本**出ていました（R-16）。
   */
  it('★引きのカットで帯が何本も並ぶ（頂点が全部画面外でも描く）', () => {
    const fills = stripesAt('fourth-corner-front', 894);
    expect(fills.length).toBeGreaterThanOrEqual(6);
  });

  it('★明部と暗部が交互で、濃さは同じ（芝全体の明るさを変えない）', () => {
    const fills = stripesAt('fourth-corner-front', 894);
    const styles = new Set(fills.map((f) => String(f.style)));
    expect(styles.size).toBe(2);
    for (const f of fills) expect(f.alpha).toBeCloseTo(MOW_STRIPE_ALPHA, 9);
  });

  it('★止めれば 1 本も描かない（対照）', () => {
    expect(stripesAt('fourth-corner-front', 894, { alpha: 0 })).toHaveLength(0);
    expect(stripesAt('fourth-corner-front', 894, { periodM: 0 })).toHaveLength(0);
  });

  it('★周期は実寸で一定 — 寄っても引いても本数は画角なりに変わる', () => {
    /**
     * ⚠️ ★**2026-08-31 に書き換えました**（A-10 の直しで落ちたため。★数を合わせにいっていません）。
     *
     * ★旧: `fourth-corner-front` と `homestretch-side` の**描かれた帯の本数**を比べ、
     *      「寄りのほうが少ない」と主張していました。
     * ⚠️ ★**「描かれた本数」は「見える本数」ではありません。** ★間引きは多角形の外接矩形で
     *    行うので、★**画面外の帯も条件次第で通ります**。★A-10 で縁を走路に絞ったところ、
     *    ★通る帯の顔ぶれが変わり（15 対 18）、★この大小関係が崩れました。
     *    → ★**代わりに、この検査の名前どおり「周期が実寸で一定か」を直接測ります。**
     *    ★これはカメラにも間引きにも依りません。
     */
    const boundaries = (opts: object): number[] => {
      const seen = bandStarts('fourth-corner-front', 894, opts);
      return seen;
    };
    const base = boundaries({});
    expect(base.length, '★境目が 1 つも出ない＝この検査は何も見ていない（R-21）').toBeGreaterThan(4);
    // ★境目はすべて周期の倍数（＝世界の格子の上にある）
    for (const s of base) expect(Math.abs(s / MOW_STRIPE_PERIOD_M - Math.round(s / MOW_STRIPE_PERIOD_M))).toBeLessThan(1e-6);
    // ★周期を倍にすれば、同じ窓に入る境目はおよそ半分になる（＝実寸で決まっている）
    const doubled = boundaries({ periodM: MOW_STRIPE_PERIOD_M * 2 });
    expect(doubled.length).toBeLessThan(base.length);
    expect(doubled.length).toBeGreaterThan(base.length / 3);
    expect(MOW_STRIPE_PERIOD_M).toBeGreaterThan(0);
  });

  it('★決定論 — 同じ入力なら同じ描画（憲法4）', () => {
    const a = stripesAt('fourth-corner-front', 894);
    const b = stripesAt('fourth-corner-front', 894);
    expect(a.map((f) => String(f.style))).toEqual(b.map((f) => String(f.style)));
  });

  it('★注視点が進むと帯も進む（世界に固定されている・その場に貼り付かない）', () => {
    /**
     * ⚠️ ★**2026-08-31 に書き換えました**（A-10 の直しで落ちたため）。
     *
     * ★旧: 明暗（`#eaffd0` / `#0d2408`）を並べた**文字列**を比べていました。
     * ⚠️ ★これは ★**本数と先頭の明暗が偶然変わることに乗っていた**だけで、
     *    ★「帯が世界に固定されている」を測っていません。★実際、縁を絞って本数が揃った途端、
     *    ★**同じ文字列**になって落ちました（★機構は何も壊れていないのに）。★R-16 の家族です。
     * → ★**帯の境目の s（世界座標）そのもの**を見ます。★画面に貼り付いていれば動きません。
     */
    const a = bandStarts('fourth-corner-front', 894);
    const b = bandStarts('fourth-corner-front', 894 + 300);
    expect(a.length).toBeGreaterThan(4);
    /**
     * ⚠️ ★境目は**周期の格子の上**にしか立たないので、★窓の端は 1 周期ぶん丸まります
     *    （`from = floor((focusS - range) / period)` / `to = ceil(...)`）。
     *    → ★ぴったり 300 ではなく **300 ± 1 周期**で見ます。★格子に乗っていること自体は上の検査が見ています。
     */
    for (const [x, y] of [[Math.min(...a), Math.min(...b)], [Math.max(...a), Math.max(...b)]] as const) {
      expect(y - x).toBeGreaterThanOrEqual(300 - MOW_STRIPE_PERIOD_M);
      expect(y - x).toBeLessThanOrEqual(300 + MOW_STRIPE_PERIOD_M);
    }
  });
});

/**
 * ★**A-10 — 縞の縁は「世界に在る線」でなければならない**（2026-08-31）
 *
 * 【★出どころ】★オーナー [EYES]:「★**ゲートがある地面が別の絵と交差しています**」
 *
 * 【★何が起きていたか】★既定 `overhangM = 60` は、縞を **w = −60 〜 幅+60** に塗ります。
 *   ★ところが内馬場の芝は **w = −150** まで描かれる（`INFIELD_LAYOUT.infieldInnerW`）ので、
 *   ★**縞の面のほうが地面より小さく**、★その縁が**何でもない線**として画面に出ます。
 *   ★実測（`tools/_gatecross.mjs`・発走のカメラ・10s・seed 42）: ★縁は画面 (490,262)→(638,267)、
 *   ★**発馬機（x 239〜678 / y 232〜323）の真上**を通っていました。
 *
 * 【★なぜ画面座標で測らないか】★画角やカットが変われば画面の数は変わります。
 *   → ★**`projectGround` が問い合わせた `w` の範囲**を見ます。★これはカメラに依りません。
 */
describe('★A-10 芝の縞の縁', () => {
  /** ★`drawMowStripes` が投影を頼んだ `w` の最小・最大を拾う */
  function widthsRequested(shotId: string, focusS: number, opts = {}): { min: number; max: number } {
    const { projectGround } = projectorFor(shotId, focusS);
    const seen: number[] = [];
    const spy = (s: number, w: number): { x: number; y: number; depth: number } => {
      seen.push(w);
      return projectGround(s, w);
    };
    const { ctx } = recorder();
    drawMowStripes(ctx as never, course, spy, VIEWPORT, { focusS, ...opts });
    expect(seen.length, '★1 度も投影していない＝この検査は何も見ていない（R-21）').toBeGreaterThan(0);
    return { min: Math.min(...seen), max: Math.max(...seen) };
  }

  it('★縞は走路の外に出ない（縁が内ラチ・外ラチと一致する）', () => {
    for (const [shot, focus] of [['fourth-corner-front', 894], ['start-front', 27], ['homestretch-side', 1200]] as const) {
      const { min, max } = widthsRequested(shot, focus);
      expect(min, `★${shot}: 内ラチより内へ出ている`).toBe(0);
      expect(max, `★${shot}: 外ラチより外へ出ている`).toBe(course.widthM);
    }
  });

  it('★旧形（overhangM 60）に戻すと、この検査が落ちる（★検査が実際に効いていることの担保・R-14）', () => {
    const { min, max } = widthsRequested('fourth-corner-front', 894, { overhangM: 60 });
    // ★旧形では縁が走路の外にある＝上の検査が通らない状態
    expect(min).toBe(-60);
    expect(max).toBe(course.widthM + 60);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(course.widthM);
  });

  /**
   * ⚠️ ★縁を走路に閉じても、★**縞そのものは消えません。**
   *    ★「直したつもりで機構ごと止めていた」を弾きます（R-16）。
   */
  it('★縁を閉じても帯は今までどおり出る（機構ごと止めていないこと）', () => {
    expect(stripesAt('fourth-corner-front', 894).length).toBeGreaterThanOrEqual(6);
  });
});
