/**
 * ★**カットインは「境目で光るロゴの一瞬」**（★2026-09-11・★オーナー判定 ★A）
 *
 * ★オーナー評: ★「意味ないカットインにするならデザイン系のロゴを入れたようなカットインに
 *   してください」→ ★**A**。★旧の隊列図・コース図（★カット 1 つをまるごと置き換える）は外した。
 *
 * ⚠️ ★置き換えは ★**カットの数・境界・尺を変えない**（★台帳「カット数は減らさない」）。
 *    ★この検査は ★**光る境目が 3 つだけであること**と、
 *    ★**同じ名前のカットでも「どこから来たか」で答えが変わること**を固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  raceCutInFlashAt, LOGO_MARK_TEXT, LOGO_CUTIN_SEC, drawLogoCutIn,
} from '../src/race-cutin.js';
import { SCRIPT_V6 } from '../src/broadcast-v2.js';
import type { Ctx2D } from '../src/oblique-draw.js';

/** ★台本 v6 に実際に並んでいる切り替わり（★名前の対で見る） */
const V6_TRANSITIONS = SCRIPT_V6.slice(1).map((row, i) => ({
  from: SCRIPT_V6[i]!.id, to: row.id,
}));

describe('ロゴを光らせる境目', () => {
  it('台本 v6 の中で光るのは 3 か所だけ（位置取りの入り・コーナーの入り・直線への出）', () => {
    const lit = V6_TRANSITIONS.filter((t) => raceCutInFlashAt(t.from, t.to) !== undefined)
      .map((t) => `${t.from}>${t.to}`);
    expect(lit).toEqual([
      'opening-side-lead>opening-formation',
      'side-drive>fourth-corner-front',
      'fourth-corner-front>side-drive',
    ]);
  });

  /**
   * ⚠️ ★これが本題です。★`side-drive` は台本 v6 に ★**2 回**出てきます。
   *    ★カットの名前だけで判定すると、★**直線の入りでない方**でも光ります。
   */
  it('同じ `side-drive` でも、コーナー明けだけが光る', () => {
    expect(raceCutInFlashAt('fourth-corner-front', 'side-drive')).toBeDefined();
    expect(raceCutInFlashAt('opening-side-settle', 'side-drive')).toBeUndefined();
  });

  /**
   * ⚠️ ★4 角は撮り方を 3 通り選べます（★`?corner=front|wide|far`）。
   *    ★2026-09-11、★`far` に替えた日に ★**ロゴが出ず白い閃光だけ**になりました
   *    （★表に `fourth-corner-front` しか書いていなかった）。★3 通りとも光ること。
   */
  it('4 角は撮り方を替えても光る（front / wide / far）', () => {
    for (const id of ['fourth-corner-front', 'fourth-corner-wide', 'fourth-corner-far']) {
      expect(raceCutInFlashAt('side-drive', id), `入り ${id}`).toBeDefined();
      expect(raceCutInFlashAt(id, 'side-drive'), `出 ${id}`).toBeDefined();
    }
  });

  it('光るのは製品のロゴ字（★レース名ではない・★字送りが入る）', () => {
    const f = raceCutInFlashAt('side-drive', 'fourth-corner-front');
    expect(f?.text).toBe(LOGO_MARK_TEXT);
    expect(f?.letterSpacingEm).toBeGreaterThan(0);
  });

  it('★合格済みのカットの入りでは光らせない（★④⑥⑦⑧⑨）', () => {
    for (const [from, to] of [
      ['opening-formation', 'opening-side-settle'],
      ['side-drive', 'straight-contest'],
      ['straight-contest', 'straight-field'],
      ['straight-field', 'straight-contest'],
      ['straight-contest', 'finish-line'],
      ['finish-line', 'winner-follow'],
      ['winner-follow', 'finish-replay'],
    ] as const) {
      expect(raceCutInFlashAt(from, to), `${from}>${to}`).toBeUndefined();
    }
  });

  it('知らない名前でも落ちない', () => {
    expect(raceCutInFlashAt('', '')).toBeUndefined();
    expect(raceCutInFlashAt('no-such-shot', 'no-such-shot')).toBeUndefined();
  });

  it('★一瞬であること（★1 秒を超えたら、それは情報画面）', () => {
    expect(LOGO_CUTIN_SEC).toBeGreaterThan(0.2);
    expect(LOGO_CUTIN_SEC).toBeLessThan(1);
  });
});

/** ★描いた矩形・文字を控えるだけの偽の画布 */
function recorder(): { ctx: Ctx2D<unknown>; rects: { x: number; y: number; w: number; h: number; fill: unknown }[]; texts: { t: string; x: number; y: number }[] } {
  const rects: { x: number; y: number; w: number; h: number; fill: unknown }[] = [];
  const texts: { t: string; x: number; y: number }[] = [];
  const ctx = {
    fillStyle: '#000' as unknown, strokeStyle: '#000' as unknown, lineWidth: 1,
    font: '', textAlign: 'left' as const, globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h, fill: this.fillStyle }); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, ellipse() {},
    fillText(t: string, x: number, y: number) { texts.push({ t, x, y }); },
    measureText(t: string) { return { width: t.length * 10 }; },
    drawImage() {},
  };
  return { ctx: ctx as unknown as Ctx2D<unknown>, rects, texts };
}

describe('ロゴの一瞬の描画', () => {
  const viewport = { width: 1280, height: 720 };

  it('背面は不透明に塗る（★不合格の走行を透かさない）', () => {
    const r = recorder();
    drawLogoCutIn(r.ctx, { viewport, fallbackText: 'STAR', sinceSec: 0.2, durationSec: LOGO_CUTIN_SEC });
    const ground = r.rects[0]!;
    expect(ground).toMatchObject({ x: 0, y: 0, w: 1280, h: 720 });
    expect(r.ctx.globalAlpha).toBe(1);
  });

  /** ⚠️ ★「出ている」だけでなく ★**抜けきる**ことを見る（★出っぱなしが前回の失敗） */
  it('入りと抜けでは字を出さない／真ん中では出す', () => {
    const at = (t: number): number => {
      const r = recorder();
      drawLogoCutIn(r.ctx, { viewport, fallbackText: 'STAR', sinceSec: t * LOGO_CUTIN_SEC, durationSec: LOGO_CUTIN_SEC });
      return r.texts.length;
    };
    expect(at(0)).toBe(0);
    expect(at(0.5)).toBeGreaterThan(0);
    expect(at(1)).toBe(0);
  });

  it('字送りを入れると、1 字ずつ置かれて横に広がる', () => {
    const spread = (em: number): number => {
      const r = recorder();
      drawLogoCutIn(r.ctx, {
        viewport, fallbackText: 'STAR', letterSpacingEm: em,
        sinceSec: 0.5 * LOGO_CUTIN_SEC, durationSec: LOGO_CUTIN_SEC,
      });
      const xs = r.texts.map((x) => x.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    /** ★4 字 → 影と本体で 8 回 */
    const r = recorder();
    drawLogoCutIn(r.ctx, { viewport, fallbackText: 'STAR', letterSpacingEm: 0.22, sinceSec: 0.5 * LOGO_CUTIN_SEC, durationSec: LOGO_CUTIN_SEC });
    expect(r.texts).toHaveLength(8);
    expect(spread(0.22)).toBeGreaterThan(spread(0));
  });

  it('字は画面の中でまん中に置かれる（★はみ出さない）', () => {
    const r = recorder();
    drawLogoCutIn(r.ctx, {
      viewport, fallbackText: 'STAR', letterSpacingEm: 0.22,
      sinceSec: 0.5 * LOGO_CUTIN_SEC, durationSec: LOGO_CUTIN_SEC,
    });
    const xs = r.texts.map((t) => t.x);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(viewport.width);
    /** ★中央よりやや上（★下は実況の帯に譲る） */
    for (const t of r.texts) expect(t.y).toBeLessThan(viewport.height * 0.55);
  });
});
