/**
 * ★**争っている馬を画面に収める**（オーナー指摘 2026-08-22）
 *
 * 【何が起きていたか】
 *   参考に合わせて直線の寄りを 53% にした結果、★**画面に 1〜2 頭しか入らなくなりました。**
 *   ところがエンジンは差し・追い込みを出しています。60 レースの実測:
 *     残り 400m で 4 番手以下だった馬が勝つ … **35%**
 *     先頭のまま押し切る               … 43%
 *   デモ（シード 42）の勝ち馬 10 番は**追い込み**で、
 *     625m 地点で **10 番手・23.9m 差** → 1186m で 4 番手・8.6m → 1410m で先頭
 *   ★**その差し切りが、全部画面の外で起きていました。**
 *   オーナー評「最後の直線で最後 2 頭が走って、ただ前の馬が勝つだけ」。
 *
 * 【★この検査が見ているのは 3 つの壊れ方】
 *   ① 隊列が伸びても寄ったまま → 差してくる馬が画面に入らない（今回の実害）
 *   ② 隊列が詰まっても引いたまま → 参考の寄り（53%）が二度と出ない
 *   ③ 余白が足りない → 先頭と最後尾が画面の縁に来て、抜いた瞬間が切れる
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { BODY_DRAW_WIDTH_M, broadcastV2ContenderFov, broadcastV2ShotById } from '../src/broadcast-v2.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** 先頭 `lead`、後続を `gaps` m 後ろに置いたときの解決画角（度） */
function fovFor(shotId: string, lead: number, gaps: readonly number[]): number {
  const horses = [{ gate: 1, s: lead, w: 6 },
    ...gaps.map((g, i) => ({ gate: i + 2, s: lead - g, w: 6 + ((i % 4) * 2) }))];
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: shotId as never });
  return (scene.camera.fovY * 180) / Math.PI;
}

describe('争っている馬を画面に収める', () => {
  const preset = broadcastV2ShotById('homestretch-side').camera;

  /**
   * ★②: 詰まっていれば寄ること。
   *
   * 【★2026-08-26・指示書 §4-4 で「どこまで寄るか」の基準が変わりました】
   *   ⚠️ ★以前はここで**ショット本来の寄り（5.7°）まで寄り切る**ことを見ていました。
   *      ★しかしその画角では、隊列が 1.5m に詰まったとき
   *      **馬の絵が画面幅の約 9 割**を占めます（絵の幅は体高 × 1.71 ＝ 約 4.1m）。
   *      ★これがオーナー評「最後の直線で馬が巨大化する」の正体です。
   *   ★いまは `fillFraction`（＝**絵の外縁まで含めて画面幅の 68%**）で決めます。
   *     詰まるほど寄るという性質は同じで、★**寄り切る先が「縁ぎりぎり」から「68%」に変わった**だけです。
   *
   * ★R-14: `fillFraction` を外すとこの検査は落ちます（5.7° に張り付くため）。
   */
  it('★★詰まっていれば寄る。ただし絵が画面幅の 68% を超えて巨大化しない', () => {
    const spec = broadcastV2ShotById('homestretch-side').frameContenders!;
    const deg = fovFor('homestretch-side', 1200, [0.5, 1.0, 1.5]);
    /** ★下限は超えない（＝これ以上は寄らない） */
    expect(deg).toBeGreaterThanOrEqual(preset.fovDeg - 1e-9);
    /** ★★絵の外縁で 68% に収まっていること */
    const distM = Math.hypot(preset.backM, preset.upM, preset.sideM);
    const aspect = VIEWPORT.width / VIEWPORT.height;
    const visibleX = 2 * distM * Math.tan((deg * Math.PI) / 180 / 2) * aspect;
    const drawnM = 1.5 + BODY_DRAW_WIDTH_M;      // 隊列 1.5m ＋ 馬 1 頭ぶんの絵の幅
    expect(drawnM / visibleX, '馬の絵が画面幅の 68% を超えています').toBeCloseTo(spec.fillFraction!, 6);
  });

  /** ★①: 伸びていれば引くこと */
  it('★差してくる馬が離れていれば引く', () => {
    const tight = fovFor('homestretch-side', 1200, [0.5, 1.0]);
    const spread = fovFor('homestretch-side', 1200, [4, 8, 11]);
    expect(spread).toBeGreaterThan(tight);
    // ★上限を超えては引かない（引きすぎると馬が豆粒になる）
    const huge = fovFor('homestretch-side', 1200, [40, 80, 120]);
    expect(huge).toBeLessThanOrEqual(broadcastV2ShotById('homestretch-side').frameContenders!.maxFovDeg + 1e-6);
  });

  /**
   * ★**「争っている馬」の範囲の外は無視すること。**
   *   これが無いと、大きく離れた最後尾に引きずられて毎回いちばん引いた画になります。
   */
  it('★大きく離れた馬には引きずられない', () => {
    const spec = broadcastV2ShotById('homestretch-side').frameContenders!;
    const near = fovFor('homestretch-side', 1200, [1, 2]);
    const nearPlusFar = fovFor('homestretch-side', 1200, [1, 2, spec.withinM + 40]);
    expect(nearPlusFar).toBeCloseTo(near, 6);
  });

  /** ★③: 余白があること（先頭と最後尾が縁に来ない） */
  it('★視野は争っている範囲より広い（縁で切れない）', () => {
    const spanM = 9;
    const distM = Math.hypot(preset.backM, preset.upM, preset.sideM);
    const aspect = VIEWPORT.width / VIEWPORT.height;
    /** ★上限は**ショットの定義から**引くこと。ここに数字を書くと二重管理になります（R-30） */
    const deg = broadcastV2ContenderFov(
      spanM, distM, aspect, preset.fovDeg,
      broadcastV2ShotById('homestretch-side').frameContenders!.maxFovDeg,
    );
    const visibleX = 2 * distM * Math.tan((deg * Math.PI) / 180 / 2) * aspect;
    expect(visibleX).toBeGreaterThan(spanM + 2.4);   // 馬 1 頭ぶん以上の余白
  });

  /**
   * ★**直線で隊列が伸びたとき、上限に張り付かないこと**（2026-08-26・オーナー指摘①②）
   *
   *   ⚠️ ★上限が 13° だった頃、実測（seed 42・30fps）でこの画角は
   *      **直線の 18.6 秒ずっと 13.00° のまま**でした。＝ 引きたいのに止められていた。
   *      その結果、画面に入る馬は最少 **2 頭**、馬 1 頭が画面に占める面積は **6.7%**
   *      （参考映像は 2.8%）。★オーナー評「馬が巨大化する」「4〜5 頭が映らない」。
   *
   *   ★13° で頭打ちになる隊列の広がりは **9.8m** です
   *     （needM = span×1.45 + 4、視野 = 2·d·tan(fov/2)·aspect、d = 45.0m）。
   *     我々の上位 8 頭は直線で **27.7m** 伸びるので、★**ほとんどの時間が頭打ちでした。**
   *
   * ★R-14: 上限を 13° に戻すと、この検査は落ちます。
   */
  it('★★直線で隊列が 15m 伸びても、上限に張り付かないこと', () => {
    const cap = broadcastV2ShotById('homestretch-side').frameContenders!.maxFovDeg;
    const deg = fovFor('homestretch-side', 1200, [5, 10, 15]);
    /**
     * ★**「上限より大きい」ではなく「上限に**余裕がある**」を見ます。**
     *
     * ⚠️ ★最初 `toBeGreaterThan(13)` と書いて**素通りしました**。
     *    画角は `fovY = 13×π/180` を経由して度へ戻すので、往復の丸めで
     *    **13.000000000000002** になり、`> 13` が真になります。
     *    ★**上限に張り付いている状態こそが不具合**なので、そこを直接見ること。
     */
    expect(deg, `隊列 15m で画角が上限 ${cap}° に張り付いています`).toBeLessThan(cap - 0.5);
    /** ★引きすぎない: 上限そのものは超えない */
    expect(deg).toBeLessThanOrEqual(cap + 1e-6);
  });

  /**
   * ★**寄りの下限（`camera.fovDeg`）そのものは動かしていないこと**（対照）
   *
   *   ⚠️ ★`fillFraction` は「どこまで寄るか」を**下限より手前で**止める仕組みです。
   *      ★下限の値そのものは変えていないので、他のカット（`side-drive`）や、
   *      `fillFraction` を指定しない従来の経路は**まったく同じまま**です。
   */
  it('★★寄りの下限は動かしていない（`fillFraction` は下限より手前で止めるだけ）', () => {
    const deg = fovFor('homestretch-side', 1200, [0.3, 0.6, 0.9]);
    expect(deg).toBeGreaterThanOrEqual(preset.fovDeg - 1e-9);
    /** ★`fillFraction` 無しの従来式なら、この隊列では下限に張り付く（＝下限は生きている） */
    const distM = Math.hypot(preset.backM, preset.upM, preset.sideM);
    const legacy = broadcastV2ContenderFov(
      0.9, distM, VIEWPORT.width / VIEWPORT.height, preset.fovDeg,
      broadcastV2ShotById('homestretch-side').frameContenders!.maxFovDeg,
    );
    expect(legacy).toBeCloseTo(preset.fovDeg, 6);
  });

  /**
   * ★**`side-drive`（道中）は巻き込んでいないこと**（対照・指示書「一度に複数の要因を変えない」）
   *   ⚠️ ★道中は「隊列が伸びたら引く」が正しく、そこに §4-4 の構図を持ち込む理由がありません。
   */
  it('★★道中（`side-drive`）は画角を動かさない（馬群の広がりに追従しない）', () => {
    /**
     * ⚠️ ★**2026-08-28 に `frameContenders` を外しました**（オーナー指摘②）。
     *    ★あれは馬群の広がりに毎コマ追従するので、★**広がりが揺れるとズームも揺れます。**
     *    実測（seed 42・台本 v6）: 1 カットの中で画角 11.3° → 9.9° → 10.2°、
     *    ★馬の大きさが **69 → 89px/m（+27%）→ 78.7（−12%）**。
     *    → オーナー評「18 秒あたりで馬がだんだん大きくなり（また小さくなる）」。
     * ★いまは `camera.fovDeg` に固定です。★**馬群がどう伸び縮みしても動きません。**
     */
    expect(broadcastV2ShotById('side-drive').frameContenders,
      '★馬群追従のズームは付けない（付けるとカット内で大きさが揺れる）').toBeUndefined();
    expect(broadcastV2ShotById('side-drive').frameLeadGroup).toBeUndefined();
    /** ★どんな広がりでも `camera.fovDeg` のまま */
    const fixed = broadcastV2ShotById('side-drive').camera.fovDeg;
    for (const spread of [[0.3, 0.6, 0.9], [4, 9, 15], [10, 25, 40]]) {
      expect(fovFor('side-drive', 800, spread), `広がり ${spread.join('/')}m`).toBeCloseTo(fixed, 6);
    }
  });

  /**
   * ★指定の無いショットは画角を動かさない（対照）
   *
   *   ⚠️ ★以前ここは `finish-line` を対照にしていました。★2026-08-26 に
   *      **決着のカットにも主役群の枠取りを入れた**ので、対照になりません
   *      （`finish-line` の `frameContenders` の注記: 画面内 1〜2 頭しか映っていませんでした）。
   *      ★対照は `side-low`（`frameContenders` を持たない真横）へ移します。
   */
  it('★指定の無いショットは画角を動かさない（対照）', () => {
    expect(broadcastV2ShotById('side-low').frameContenders).toBeUndefined();
    const a = fovFor('side-low', 1200, [1, 2]);
    const b = fovFor('side-low', 1200, [8, 16, 24]);
    expect(a).toBeCloseTo(b, 6);
  });

  it('★決定論 — 同じ入力なら同じ画角（憲法4）', () => {
    expect(fovFor('homestretch-side', 1200, [4, 8])).toBe(fovFor('homestretch-side', 1200, [4, 8]));
  });

  /* ── ★主役群だけを画に収める（指示書 §4-4） ───────────── */

  /** 先頭 `lead`、後続を `gaps` m 後ろに置き、`leadGates` を渡したときの画角 */
  function fovWithLead(gaps: readonly number[], leadGates: readonly number[] | undefined): number {
    const horses = [{ gate: 1, s: 1200, w: 6 },
      ...gaps.map((g, i) => ({ gate: i + 2, s: 1200 - g, w: 6 + ((i % 4) * 2) }))];
    const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, {
      forceShotId: 'homestretch-side',
      ...(leadGates === undefined ? {} : { leadGates }),
    });
    return (scene.camera.fovY * 180) / Math.PI;
  }

  /**
   * ★**主役の間に挟まった着外の馬に、カメラが引きずられないこと**
   *
   *   ⚠️ ★実測（`tools/audit-climax-camera.mjs`・4 seed）で、これが無いと
   *      主役 5 頭は画面幅の **21.6〜38.6%** しか占めませんでした（要求は 60〜75%）。
   *      ★**画面内の頭数は足りていました。足りないのは 5 頭の大きさです。**
   *
   * ★R-14: `frameLeadGroup` / `leadGates` を外すとこの検査は落ちます。
   */
  it('★★主役群だけを収める（着外の後方馬に引きずられない）', () => {
    /** 馬番 1〜3 が主役、馬番 4 が 14m 後ろの着外馬 */
    const withOutsider = fovWithLead([2, 4, 14], undefined);
    const leadOnly = fovWithLead([2, 4, 14], [1, 2, 3]);
    expect(leadOnly, '着外の馬まで入れるために引いています').toBeLessThan(withOutsider);
  });

  it('★★主役群が全員入っていれば、渡しても渡さなくても同じ（対照）', () => {
    expect(fovWithLead([2, 4], [1, 2, 3])).toBeCloseTo(fovWithLead([2, 4], undefined), 9);
  });

  it('★空の `leadGates` は従来どおり（安全側へ落ちる）', () => {
    expect(fovWithLead([2, 4, 14], [])).toBeCloseTo(fovWithLead([2, 4, 14], undefined), 9);
  });
});
