/**
 * ★**浴びた砂で馬が汚れる**（2026-08-29・報告 §10-2）
 *
 * 【★この検査が守るもの】
 *   ① ★**前の馬は汚れない**（砂は後ろへ流れる）
 *   ② ★**溜まる**（差してきた馬が先頭に立ってもきれいにならない）
 *   ③ ★**描画の刻みで結果が変わらない**（憲法 4・コマ落ちで絵が変わらないこと）
 *   ④ ★**芝では 1 粒も塗らない**（芝の見え方はオーナー承認済み）
 *   ⑤ ★**戻せる**（渡さなければ従来どおり）。★かつ**渡すと実際に画が変わる**
 *
 * ⚠️ ★⑤ の後半が要ります。★「戻せる」だけを見ると、
 *    ★**機構が最初から効いていなくても検査は緑**になります（R-16）。
 */
import { describe, it, expect } from 'vitest';
import {
  dustExposureCurve, dustIntakeRate,
  DUST_PLUME_M, DUST_PLUME_HALF_WIDTH_M, DUST_EXPOSURE_SATURATION_SEC,
  type DustExposureHorse,
} from '../src/dust-exposure.js';
import { drawPerspectiveHorses } from '../src/perspective-draw.js';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });

describe('★浴びた砂の量（dust-exposure）', () => {
  it('★前を行く馬は汚れない — 砂は後ろへ流れる', () => {
    const field: DustExposureHorse[] = [
      { gate: 1, s: 100, w: 5 },
      { gate: 2, s: 98, w: 5 },
    ];
    /** ★1 番は前にいるので浴びない */
    expect(dustIntakeRate(field[0]!, field)).toBe(0);
    /** ★2 番は真後ろ 2m なので浴びる */
    expect(dustIntakeRate(field[1]!, field)).toBeGreaterThan(0);
  });

  it('★砂煙の外に出れば浴びない（後ろ・横のどちらでも）', () => {
    const me: DustExposureHorse = { gate: 2, s: 100, w: 5 };
    /** ★尾の長さより遠い */
    const farBack = [me, { gate: 1, s: 100 + DUST_PLUME_M + 0.1, w: 5 }];
    expect(dustIntakeRate(me, farBack)).toBe(0);
    /** ★横に外れている */
    const offside = [me, { gate: 1, s: 102, w: 5 + DUST_PLUME_HALF_WIDTH_M + 0.1 }];
    expect(dustIntakeRate(me, offside)).toBe(0);
  });

  it('★近いほど・真後ろほど濃い', () => {
    const me: DustExposureHorse = { gate: 2, s: 100, w: 5 };
    const near = dustIntakeRate(me, [me, { gate: 1, s: 101, w: 5 }]);
    const far = dustIntakeRate(me, [me, { gate: 1, s: 105, w: 5 }]);
    expect(near).toBeGreaterThan(far);
    const aligned = dustIntakeRate(me, [me, { gate: 1, s: 102, w: 5 }]);
    const offset = dustIntakeRate(me, [me, { gate: 1, s: 102, w: 5.6 }]);
    expect(aligned).toBeGreaterThan(offset);
  });

  it('★複数頭の後ろにいれば濃くなる', () => {
    const me: DustExposureHorse = { gate: 3, s: 100, w: 5 };
    const one = dustIntakeRate(me, [me, { gate: 1, s: 102, w: 5 }]);
    const two = dustIntakeRate(me, [me, { gate: 1, s: 102, w: 5 }, { gate: 2, s: 103, w: 5 }]);
    expect(two).toBeGreaterThan(one);
  });

  it('★溜まる — 先頭に立っても、それまでの汚れは消えない', () => {
    /**
     * ★2 番は 40 秒間ずっと 1 番の真後ろ。★そのあと前へ出る。
     */
    const positionsAt = (t: number): DustExposureHorse[] => (t < 40
      ? [{ gate: 1, s: t * 16 + 2, w: 5 }, { gate: 2, s: t * 16, w: 5 }]
      : [{ gate: 1, s: t * 16, w: 5 }, { gate: 2, s: t * 16 + 2, w: 5 }]);
    const soil = dustExposureCurve(positionsAt, 60);
    const at40 = soil(40, 2);
    const at60 = soil(60, 2);
    /**
     * ★2m 後方に 40 秒で **0.40**。
     *   ★`near = (1 - 2/6)^2 = 0.44` を 40 秒積んで満量 45 秒で割った値です。
     *   ⚠️ ★**ここに「0.5 以上」と書いて 1 度落としました。** 私が近さを頭で見積もっただけで、
     *      ★式から出していませんでした。★閾値は式から引くこと。
     */
    expect(at40).toBeGreaterThan(0.3);
    /** ★前へ出たあとも減らない（★「洗い落とす」機構は入れていない） */
    expect(at60).toBeGreaterThanOrEqual(at40);
    /**
     * ★**入れ替わりは、汚れの向きも入れ替える。**
     *   ⚠️ ★ここに「1 番はきれいなまま」と書いて 1 度落としました。
     *      ★この筋書きでは 40 秒で**前後が入れ替わる**ので、
     *      ★1 番は 40 秒以降は後ろにいて**汚れるのが正しい**振る舞いです。
     *      ★検査のほうが間違っていました（★主張文が筋書きと合っていなかった）。
     */
    /**
     * ⚠️ ★**入れ替わりの瞬間（t=40）そのものは見ません。**
     *    ★積分の刻みは 0.1 秒なので、★t=40 には**入れ替わったあとの 1 刻み**が既に入っています
     *    （実測 0.00099 ＝ 0.444 × 0.1 ÷ 45）。★境界を跨いだ点で「0 のはず」と書くと落ちます。
     */
    expect(soil(39, 1), '★入れ替わりの手前まで前にいた 1 番は、その時点ではきれい').toBe(0);
    expect(soil(60, 1), '★後ろへ下がったのに汚れないなら、向きの判定が効いていない').toBeGreaterThan(0);
    /** ★それでも、40 秒ぶん先に浴びていた 2 番のほうが濃い */
    expect(soil(60, 2)).toBeGreaterThan(soil(60, 1));
  });

  it('★満量で頭打ちになる（1 を超えない）', () => {
    const positionsAt = (t: number): DustExposureHorse[] => [
      { gate: 1, s: t * 16 + 0.2, w: 5 }, { gate: 2, s: t * 16, w: 5 },
    ];
    const soil = dustExposureCurve(positionsAt, DUST_EXPOSURE_SATURATION_SEC * 3);
    expect(soil(DUST_EXPOSURE_SATURATION_SEC * 3, 2)).toBe(1);
  });

  it('★積分の刻みを変えても結果がほぼ変わらない（＝コマ落ちで絵が変わらない・憲法 4）', () => {
    const positionsAt = (t: number): DustExposureHorse[] => [
      { gate: 1, s: t * 16 + 1.5 + Math.sin(t) * 0.8, w: 5 },
      { gate: 2, s: t * 16, w: 5 },
    ];
    const coarse = dustExposureCurve(positionsAt, 50, { stepSec: 0.2 });
    const fine = dustExposureCurve(positionsAt, 50, { stepSec: 0.02 });
    /** ★刻みを 10 倍細かくしても 5% 以内 */
    expect(Math.abs(coarse(50, 2) - fine(50, 2))).toBeLessThan(0.05);
    /** ⚠️ ★空回り防止: そもそも 0 なら上の比較は無意味（R-3 / R-21） */
    expect(fine(50, 2)).toBeGreaterThan(0.1);
  });

  it('★同じ入力から同じ値が出る（決定論・憲法 4）', () => {
    const positionsAt = (t: number): DustExposureHorse[] => [
      { gate: 1, s: t * 16 + 1, w: 5 }, { gate: 2, s: t * 16, w: 5 },
    ];
    const a = dustExposureCurve(positionsAt, 30);
    const b = dustExposureCurve(positionsAt, 30);
    for (const t of [5, 12, 23, 30]) expect(a(t, 2)).toBe(b(t, 2));
  });
});

/**
 * ★描画側。★カメラは `resolveBroadcastV2Scene` に決めさせます（★手で組むと別の画になる・R-30）。
 *
 * ⚠️ ★`createRadialGradient` を**わざと生やしません**。生やすと砂は `fillStyle` に
 *    gradient が入って色で見分けられなくなります。★実装は濃淡が無い環境では
 *    均一な塗りに落ちるので、そちらの枝を通して色で数えます
 *    （★`dirt-dust-order.test.ts` と同じ作法）。
 */
const DUST = '#cdb494';
const GROUND = '#796047';
const VIEWPORT = { width: 1280, height: 720 };

const frameFor = (gate: number) => [{
  image: `horse-${gate}` as never,
  source: { x: 0, y: 0, width: 300, height: 200 },
  referenceHeight: 200,
  bodyAnchorSourcePx: { x: 150, y: 120 },
  bodyLiftSourcePx: 0,
  shadow: { image: `shadow-${gate}` as never, width: 300, height: 200 },
}];

/** ★先頭が前、2 番手が 3m 後ろ（`dirt-dust-order.test.ts` と同じ配置） */
const LEADER = { gate: 1, s: 700, w: 2.2 };
const CHASER = { gate: 2, s: 697, w: 2.2 };

/** ★砂色で塗られた粒の数を返す */
function dustPuffs(
  surface: 'turf' | 'dirt',
  dustExposureOf?: ((gate: number) => number) | undefined,
): number {
  const horses = [LEADER, CHASER];
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: 'side-drive' });
  let puffs = 0;
  const state = { globalAlpha: 1, fillStyle: '' };
  const target: Record<string, unknown> = {
    save: () => undefined, restore: () => undefined, transform: () => undefined,
    drawImage: () => undefined,
    beginPath: () => undefined, ellipse: () => undefined,
    fill: () => { if (state.fillStyle === DUST) puffs += 1; },
    fillRect: () => undefined, moveTo: () => undefined, lineTo: () => undefined,
    closePath: () => undefined, stroke: () => undefined,
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => {
      if (key === 'globalAlpha') return state.globalAlpha;
      if (key === 'fillStyle') return state.fillStyle;
      if (key === 'createRadialGradient') return undefined;
      return key in obj ? obj[key as string] : (): undefined => undefined;
    },
    set: (obj, key, value) => {
      if (key === 'globalAlpha') state.globalAlpha = value as number;
      else if (key === 'fillStyle') state.fillStyle = value as string;
      else obj[key as string] = value;
      return true;
    },
  });
  drawPerspectiveHorses(ctx as never, course, scene.camera, horses, {
    sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
    frameImagesByGate: horses.map((h) => frameFor(h.gate)),
    fieldSize: horses.length, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
    trackEffect: { surface, condition: 'good', color: GROUND, dustColor: DUST },
    dustExposureOf,
  });
  return puffs;
}

describe('★汚れの描画', () => {
  it('★渡さなければ従来どおり（戻せる）／★渡すと実際に粒が増える', () => {
    const clean = dustPuffs('dirt');
    const filthy = dustPuffs('dirt', () => 1);
    /**
     * ⚠️ ★`clean` は 0 ではありません — ★**尾を引く砂煙**が別に出ているためです。
     *    ★見るのは「**増えたか**」です。★空回り防止に、そもそも描かれていることも確かめます。
     */
    expect(clean, '★砂が 1 粒も描かれていない（検査が空回りしている）').toBeGreaterThan(0);
    expect(filthy, '★量を満量で渡しても粒が増えない＝汚れの機構が効いていない').toBeGreaterThan(clean);
  });

  it('★きれいな馬（量 0）は、渡しても粒が増えない', () => {
    expect(dustPuffs('dirt', () => 0)).toBe(dustPuffs('dirt'));
  });

  it('★汚れが濃いほど粒が多い（単調）', () => {
    expect(dustPuffs('dirt', () => 1)).toBeGreaterThan(dustPuffs('dirt', () => 0.25));
  });

  it('★芝では 1 粒も塗らない（量を満量で渡しても）', () => {
    expect(dustPuffs('turf', () => 1)).toBe(dustPuffs('turf'));
  });
});
