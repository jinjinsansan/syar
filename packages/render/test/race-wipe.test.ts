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
import { drawRaceWipe, RACE_WIPE_SEC, RACE_WIPE_BAND } from '../src/race-cutin.js';
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

/** ★その時点で画面を覆っている横幅（★帯の、画面に掛かっている部分） */
function coveredWidth(sinceSec: number): number {
  const r = recorder();
  drawRaceWipe(r.ctx, { viewport: VP, sinceSec });
  return r.rects
    .filter((x) => x.h === VP.height && x.w > 3)   // ★金の細い線（幅 2）は除く
    .reduce((s, x) => s + Math.max(0, Math.min(VP.width, x.x + x.w) - Math.max(0, x.x)), 0);
}

/** ★帯の左端（★通り過ぎる向きを見る） */
function bandX(sinceSec: number): number {
  const r = recorder();
  drawRaceWipe(r.ctx, { viewport: VP, sinceSec });
  const band = r.rects.find((x) => x.h === VP.height && x.w > 3);
  return band === undefined ? Number.NaN : band.x;
}

describe('★場面転換の合図（ワイプ）', () => {
  /**
   * ⚠️ ★**これが本題です**（★2026-09-12・実画面で踏んだ）。
   *    ★最初は「中央から左右へ開く」形にしたので、★t=0 で ★**画面が全部まっ黒**になりました。
   *    ★参考映像のワイプは全面を覆いません。★帯が通り過ぎるだけです。
   */
  it('★どの瞬間も、画面の大半はレースが見えている（★まっ黒にしない）', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      const w = coveredWidth(RACE_WIPE_SEC * u);
      /** ★丸めの 1px ぶんだけ余裕を見る（★比の話であって、1 画素の話ではない） */
      expect(w, `${u.toFixed(2)} で覆いすぎ`).toBeLessThanOrEqual(VP.width * RACE_WIPE_BAND + 1);
    }
  });

  it('★終わりでは 1 画素も残らない', () => {
    expect(coveredWidth(RACE_WIPE_SEC * 2), '★過ぎたら描かない').toBe(0);
  });

  it('★帯が一方向へ通り過ぎる（★行きつ戻りつしない）', () => {
    const xs = [0, 0.25, 0.5, 0.75, 0.99].map((u) => bandX(RACE_WIPE_SEC * u));
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]!, `${i} 番目で戻っている`).toBeGreaterThan(xs[i - 1]!);
    }
    /** ★入りは画面の外から、★出は画面の外へ */
    expect(xs[0]!, '★入りは左の外から').toBeLessThanOrEqual(0);
    expect(bandX(RACE_WIPE_SEC * 0.999), '★出は右の外へ').toBeGreaterThan(VP.width - VP.width * RACE_WIPE_BAND);
  });

  /** ⚠️ ★**重ねない**。★ディゾルブへ戻ったら、ここが落ちる */
  it('★不透明に塗る（★下の絵を透かさない）', () => {
    const r = recorder();
    drawRaceWipe(r.ctx, { viewport: VP, sinceSec: RACE_WIPE_SEC * 0.4 });
    expect(r.rects.length, '★何も描いていない').toBeGreaterThan(0);
    for (const rect of r.rects) expect(rect.alpha, '★半透明で重ねている').toBe(1);
  });

  /** ⚠️ ★**ロゴを出さない**。★「ダサい」で外した形へ戻らないこと */
  it('★文字も絵も描かない', () => {
    const r = recorder();
    drawRaceWipe(r.ctx, { viewport: VP, sinceSec: RACE_WIPE_SEC * 0.4 });
    expect(r.texts, '★文字を描いている').toEqual([]);
    expect(r.images, '★絵を描いている').toBe(0);
  });

  /**
   * ★**短いこと**（★佳境で目を離させない）。
   * ⚠️ ★参考映像のワイプは 1.4 秒ですが、★あちらは ★**場面の区切り**に 1 回入れるものです。
   *    ★こちらは真横の継ぎ目ごとに入るので、★同じ長さにすると画面が拭きだらけになります。
   */
  it('★0.2 秒以上・0.6 秒以下', () => {
    expect(RACE_WIPE_SEC).toBeGreaterThanOrEqual(0.2);
    expect(RACE_WIPE_SEC).toBeLessThanOrEqual(0.6);
  });

  it('★負の秒では描かない（★カットの前に出さない）', () => {
    const r = recorder();
    drawRaceWipe(r.ctx, { viewport: VP, sinceSec: -0.1 });
    expect(r.rects).toEqual([]);
  });
});
