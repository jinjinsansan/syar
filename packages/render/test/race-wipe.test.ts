/**
 * ★**場面転換の合図（ワイプ）**（★2026-09-12・★オーナー指摘）
 *
 * 【★経緯】★オーナー評「★JRA の中継も参考映像も、★カメラワークの切り替わりがあっても
 *   ★**ちゃんと 1 つのレースとして見えます**。★この開発サーバーは ★**切れる感覚**があります。
 *   ★どこをどうすればいいのか？がわかりません」。
 *
 *   ★参考映像との突き合わせ（`REPORT_P4_2D_EDIT_GRAMMAR_AUDIT_20260824.md` §19-5）:
 *     ★「★**場面転換の合図がない。** ★参考は勝負どころでワイプ（1.4 秒）を入れる。
 *       ★`/race` は勝負どころ（直線）に転換の合図がない」
 *   ★2026-09-12 に測り直しても、★尺・走行方向の反転・被写体の引き継ぎは参考と揃っており、
 *   ★**合図だけが無い**状態でした。
 *
 * 【⚠️ ★ここには 2 回外している】
 *   ★ディゾルブ … ★12 頭が二重写し → ★「ごちゃごちゃする」
 *   ★ロゴのワイプ … ★「ダサい」
 *   → ★この検定が留めるのは ★**その 2 つに戻っていないこと**です:
 *      ★① ★**重ねない**（★不透明に塗るだけ・★下の絵を透かさない）
 *      ★② ★**開き切る**（★出っぱなしにならない）
 *      ★③ ★**文字も絵も描かない**（★ロゴを出さない）
 */
import { describe, it, expect } from 'vitest';
import { drawRaceWipeEdge, raceWipeEdgeX, RACE_WIPE_SEC } from '../src/race-cutin.js';
import type { Ctx2D } from '../src/oblique-draw.js';

const VP = { width: 1280, height: 720 } as const;

function recorder(): {
  ctx: Ctx2D<unknown>;
  rects: { x: number; y: number; w: number; h: number; fill: unknown; alpha: number }[];
  texts: string[];
  images: number;
} {
  const rects: { x: number; y: number; w: number; h: number; fill: unknown; alpha: number }[] = [];
  const texts: string[] = [];
  let images = 0;
  const ctx = {
    fillStyle: '#000' as unknown, strokeStyle: '#000' as unknown, lineWidth: 1,
    font: '', textAlign: 'left' as const, globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: this.fillStyle, alpha: this.globalAlpha });
    },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, ellipse() {},
    fillText(t: string) { texts.push(t); },
    measureText(t: string) { return { width: t.length * 10 }; },
    drawImage() { images += 1; },
  };
  return { ctx: ctx as unknown as Ctx2D<unknown>, rects, texts, images };
}

describe('★場面転換の合図（ワイプ）', () => {
  /**
   * ⚠️ ★**これが本題です**（★2026-09-12・★オーナー評
   *    「★黒の物体が左から右に高速で動くもの…★これがあなたの言うワイプですか？」）。
   *    ★ワイプは ★**2 つの絵を境目で分ける**もので、★板で覆うものではありません。
   *    ★この検定が留めるのは「★**境目の位置だけを決め、絵は覆わない**」ことです。
   */
  it('★境目は左端から右端へ動く（★行きつ戻りつしない）', () => {
    const xs = [0, 0.25, 0.5, 0.75, 0.99].map((u) => raceWipeEdgeX(RACE_WIPE_SEC * u, VP.width));
    for (const x of xs) expect(x, '★境目が出ていない').toBeDefined();
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]!, `${i} 番目で戻っている`).toBeGreaterThan(xs[i - 1]!);
    }
    expect(xs[0]!, '★入りは左端').toBe(0);
    expect(xs[xs.length - 1]!, '★出は右端の近く').toBeGreaterThan(VP.width * 0.9);
  });

  it('★過ぎたら出さない／前には出さない', () => {
    expect(raceWipeEdgeX(RACE_WIPE_SEC, VP.width), '★開き切ったら終わり').toBeUndefined();
    expect(raceWipeEdgeX(RACE_WIPE_SEC * 2, VP.width)).toBeUndefined();
    expect(raceWipeEdgeX(-0.1, VP.width), '★カットの前には出さない').toBeUndefined();
  });

  /**
   * ⚠️ ★**覆わない。** ★1 回目（中央から開く板）と 2 回目（黒い帯が通過）へ戻ったら、ここが落ちます。
   *    ★線と、その内側の細い影だけ。★画面の 2% を超えて塗らないこと。
   */
  it('★線だけを引く（★画面を覆わない）', () => {
    const r = recorder();
    drawRaceWipeEdge(r.ctx, { viewport: VP, x: Math.round(VP.width * 0.4) });
    expect(r.rects.length, '★何も描いていない').toBeGreaterThan(0);
    const painted = r.rects.reduce((s2, x) => s2 + x.w, 0);
    expect(painted / VP.width, '★覆いすぎ（★板になっている）').toBeLessThan(0.02);
  });

  /** ⚠️ ★**重ねない**。★ディゾルブへ戻ったら、ここが落ちる */
  it('★不透明に塗る（★混ぜない）', () => {
    const r = recorder();
    drawRaceWipeEdge(r.ctx, { viewport: VP, x: 400 });
    for (const rect of r.rects) expect(rect.alpha, '★半透明で重ねている').toBe(1);
  });

  /** ⚠️ ★**ロゴを出さない**。★「ダサい」で外した形へ戻らないこと */
  it('★文字も絵も描かない', () => {
    const r = recorder();
    drawRaceWipeEdge(r.ctx, { viewport: VP, x: 400 });
    expect(r.texts, '★文字を描いている').toEqual([]);
    expect(r.images, '★絵を描いている').toBe(0);
  });

  it('★端では線を引かない（★画面の外に出ない）', () => {
    for (const x of [0, VP.width]) {
      const r = recorder();
      drawRaceWipeEdge(r.ctx, { viewport: VP, x });
      expect(r.rects, `x=${x}`).toEqual([]);
    }
  });

  /**
   * ★**短いこと**（★佳境で目を離させない）。
   * ⚠️ ★参考映像のワイプは 1.4 秒ですが、★あちらは場面の区切りに 1 回入れるものです。
   *    ★こちらは真横の継ぎ目ごとに入るので、★同じ長さにすると画面が拭きだらけになります。
   */
  it('★0.2 秒以上・0.6 秒以下', () => {
    expect(RACE_WIPE_SEC).toBeGreaterThanOrEqual(0.2);
    expect(RACE_WIPE_SEC).toBeLessThanOrEqual(0.6);
  });
});
