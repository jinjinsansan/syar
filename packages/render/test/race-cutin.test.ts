/**
 * ★**カットインは「その瞬間に意味のある情報」**（★2026-09-11・★オーナー判定の 2 回目）
 *
 * ★1 回目（★カットをまるごと置き換え）→ ★「内容がダメです」
 * ★2 回目（★ロゴが 0.42 秒）        → ★「あまりにもダサい。★今のカットインは使えません」
 * ★3 回目（★これ）                  → ★**毎回違う、意味のある 1 枚**
 *
 * ⚠️ ★置き換えは ★**カットの数・境界・尺を変えない**（★台帳「カット数は減らさない」）。
 *    ★この検査が留めるのは:
 *      ★① ★出す場所が ★**3 か所だけ**で、★**中身が全部違う**こと
 *      ★② ★**同じ名前のカットでも「どこから来たか」で答えが変わる**こと
 *      ★③ ★佳境（直線の継ぎ目）では ★**出さない**こと
 *      ★④ ★背面が不透明で、★**抜けきる**こと
 */
import { describe, it, expect } from 'vitest';
import {
  raceCutInAt, RACE_CUTIN_SEC, RACE_CUTIN_AT_START, drawRaceCutInFrame,
  drawOwnHorseCutIn, drawFormationCutIn, drawRunningStyleCutIn,
} from '../src/race-cutin.js';
import { SCRIPT_V6 } from '../src/broadcast-v2.js';
import type { Ctx2D } from '../src/oblique-draw.js';

/** ★台本 v6 に実際に並んでいる切り替わり（★名前の対で見る） */
const V6_TRANSITIONS = SCRIPT_V6.slice(1).map((row, i) => ({
  from: SCRIPT_V6[i]!.id, to: row.id,
}));

describe('カットインを出す場所', () => {
  it('台本 v6 の中で出るのは 3 か所だけ（位置取り・コーナー入り・直線への出）', () => {
    const shown = V6_TRANSITIONS.filter((t) => raceCutInAt(t.from, t.to) !== undefined)
      .map((t) => `${t.from}>${t.to}`);
    expect(shown).toEqual([
      'opening-side-lead>opening-formation',
      'side-drive>fourth-corner-front',
      'fourth-corner-front>side-drive',
    ]);
  });

  /** ★オーナー案「★入れる度に毎回異なる意味のあるカットインに」 */
  it('★出る 3 枚は、中身が全部違う', () => {
    const kinds = V6_TRANSITIONS
      .map((t) => raceCutInAt(t.from, t.to)?.kind)
      .filter((k): k is NonNullable<typeof k> => k !== undefined);
    expect(kinds).toHaveLength(3);
    expect(new Set(kinds).size, '★同じ中身が 2 回出ています').toBe(3);
    /** ★発走の 1 枚を足しても、まだ全部違う */
    expect(new Set([...kinds, RACE_CUTIN_AT_START.kind]).size).toBe(4);
  });

  it('★4 枚それぞれに、何の画面かを言う見出しが付いている', () => {
    const labels = [
      RACE_CUTIN_AT_START.label,
      ...V6_TRANSITIONS.map((t) => raceCutInAt(t.from, t.to)?.label).filter((l) => l !== undefined),
    ];
    expect(labels).toHaveLength(4);
    for (const l of labels) expect((l ?? '').length).toBeGreaterThan(0);
    expect(new Set(labels).size, '★見出しが重なっています').toBe(4);
  });

  /**
   * ⚠️ ★これが本題です。★`side-drive` は台本 v6 に ★**2 回**出てきます。
   *    ★カットの名前だけで判定すると、★**4 角明けでない方**でも出ます。
   */
  it('同じ `side-drive` でも、コーナー明けだけに出る', () => {
    expect(raceCutInAt('fourth-corner-front', 'side-drive')?.kind).toBe('to-straight');
    expect(raceCutInAt('opening-side-settle', 'side-drive')).toBeUndefined();
  });

  /**
   * ⚠️ ★4 角は撮り方を 3 通り選べます（★`?corner=front|wide|far`）。
   *    ★2026-09-11、★`far` に替えた日に ★**カットインが出なくなりました**
   *    （★表に `fourth-corner-front` しか書いていなかった）。★3 通りとも出ること。
   */
  it('4 角は撮り方を替えても出る（front / wide / far）', () => {
    for (const id of ['fourth-corner-front', 'fourth-corner-wide', 'fourth-corner-far']) {
      expect(raceCutInAt('side-drive', id)?.kind, `入り ${id}`).toBe('running-style');
      expect(raceCutInAt(id, 'side-drive')?.kind, `出 ${id}`).toBe('to-straight');
    }
  });

  /**
   * ★**佳境では出しません**（★オーナー ⑥ の継ぎ目はカメラの高さで解いた）。
   *   ★最後の直線でカットインを挟むと、★いちばん見たい場面から目を離させます。
   */
  it('★最後の直線の中では 1 枚も出さない', () => {
    for (const [from, to] of [
      ['side-drive', 'straight-contest'],
      ['straight-contest', 'straight-field'],
      ['straight-field', 'straight-contest'],
      ['straight-contest', 'finish-line'],
      ['finish-line', 'winner-follow'],
      ['winner-follow', 'finish-replay'],
      ['opening-formation', 'opening-side-settle'],
    ] as const) {
      expect(raceCutInAt(from, to), `${from}>${to}`).toBeUndefined();
    }
  });

  it('知らない名前でも落ちない', () => {
    expect(raceCutInAt('', '')).toBeUndefined();
    expect(raceCutInAt('no-such-shot', 'no-such-shot')).toBeUndefined();
  });

  /**
   * ★尺は ★**読める長さ**であること。
   * ⚠️ ★0.42 秒（★2 回目）は ★**読ませる気が無い長さ**でした。
   *    ★逆に 2 秒を超えたら、それは情報画面です（★1 回目の失敗）。
   */
  it('★1 枚は 1 秒以上・2 秒以下', () => {
    expect(RACE_CUTIN_SEC).toBeGreaterThanOrEqual(1);
    expect(RACE_CUTIN_SEC).toBeLessThanOrEqual(2);
  });
});

/** ★描いた矩形・文字を控えるだけの偽の画布 */
function recorder(): {
  ctx: Ctx2D<unknown>;
  rects: { x: number; y: number; w: number; h: number; fill: unknown }[];
  texts: { t: string; x: number; y: number; fill: unknown }[];
} {
  const rects: { x: number; y: number; w: number; h: number; fill: unknown }[] = [];
  const texts: { t: string; x: number; y: number; fill: unknown }[] = [];
  const ctx = {
    fillStyle: '#000' as unknown, strokeStyle: '#000' as unknown, lineWidth: 1,
    font: '', textAlign: 'left' as const, globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h, fill: this.fillStyle }); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, ellipse() {},
    /** ⚠️ ★**そのときの `fillStyle` も控えます。** ★あとから `ctx.fillStyle` を読むと
     *    ★**最後に置いた別の文字の色**が返ります（★2026-09-11 に実際にそれで検定を外しました）。 */
    fillText(t: string, x: number, y: number) { texts.push({ t, x, y, fill: this.fillStyle }); },
    measureText(t: string) { return { width: t.length * 10 }; },
    drawImage() {},
  };
  return { ctx: ctx as unknown as Ctx2D<unknown>, rects, texts };
}

const VP = { width: 1280, height: 720 } as const;
const FONT = (px: number, bold?: boolean): string => `${bold === true ? 'bold ' : ''}${px}px sans-serif`;
const frameAt = (t: number) => ({
  viewport: VP, sinceSec: t * RACE_CUTIN_SEC, durationSec: RACE_CUTIN_SEC,
  label: '現在の隊列', raceLabel: '11R　桜星賞', metersLeft: 630,
});

describe('カットインの枠', () => {
  it('背面は不透明に塗る（★不合格の走行を透かさない）', () => {
    const r = recorder();
    drawRaceCutInFrame(r.ctx, FONT, frameAt(0.5));
    const ground = r.rects[0]!;
    expect(ground).toMatchObject({ x: 0, y: 0, w: VP.width, h: VP.height });
    expect(r.ctx.globalAlpha).toBe(1);
  });

  /** ⚠️ ★「出ている」だけでなく ★**抜けきる**ことを見る（★出っぱなしが 1 回目の失敗） */
  it('入りと抜けでは中身を置かない／真ん中では置く', () => {
    expect(drawRaceCutInFrame(recorder().ctx, FONT, frameAt(0))).toBeUndefined();
    expect(drawRaceCutInFrame(recorder().ctx, FONT, frameAt(0.5))).toBeDefined();
    expect(drawRaceCutInFrame(recorder().ctx, FONT, frameAt(1))).toBeUndefined();
  });

  /** ★拭きは中央から左右へ広がる（★`Ctx2D` に切り抜きが無いので矩形の幅で作っている） */
  it('拭きは中央から広がる', () => {
    const width = (t: number): number => {
      const r = recorder();
      drawRaceCutInFrame(r.ctx, FONT, frameAt(t));
      return r.rects[0]?.w ?? 0;
    };
    expect(width(0.04)).toBeGreaterThan(0);
    expect(width(0.04)).toBeLessThan(VP.width);
    expect(width(0.10)).toBeGreaterThan(width(0.04));
    expect(width(0.5)).toBe(VP.width);
  });

  it('中身の矩形は、下の実況の帯にかからない', () => {
    const box = drawRaceCutInFrame(recorder().ctx, FONT, frameAt(0.5))!;
    expect(box.y).toBeGreaterThan(0);
    /** ★実況の帯は画面の下 2 割強。★そこへ伸ばすと隠れます */
    expect(box.y + box.height).toBeLessThan(VP.height * 0.78);
    expect(box.x).toBeGreaterThan(0);
    expect(box.x + box.width).toBeLessThan(VP.width);
  });

  it('見出しと、どのレースか、残り距離が出る', () => {
    const r = recorder();
    drawRaceCutInFrame(r.ctx, FONT, frameAt(0.5));
    const said = r.texts.map((x) => x.t);
    expect(said).toContain('現在の隊列');
    expect(said).toContain('11R　桜星賞');
    expect(said).toContain('630m');
  });
});

describe('カットインの中身', () => {
  it('★A 自馬カードは、馬名・騎手・脚質・現在位置を出す', () => {
    const r = recorder();
    drawOwnHorseCutIn(r.ctx, FONT, { ...frameAt(0.5), label: 'あなたの馬' }, {
      gate: 3, horseName: 'ハンシンドリーム', jockeyName: '山本 誠',
      strategyLabel: '差し', frameColor: '#e33', order: 4, fieldSize: 12,
    });
    const said = r.texts.map((x) => x.t);
    expect(said).toContain('ハンシンドリーム');
    expect(said).toContain('騎手　山本 誠');
    expect(said).toContain('差し');
    expect(said).toContain('4番手');
    expect(said).toContain('／ 12頭');
    expect(said, '★枠番を出さないと「どれが自分の馬か」が分かりません').toContain('3');
  });

  it('★B 隊列図は、12 頭ぶんの番号を置く', () => {
    const r = recorder();
    const horses = Array.from({ length: 12 }, (_, i) => ({
      gate: i + 1, s: 300 - i * 3, w: 4 + (i % 5) * 2, own: i === 2,
    }));
    drawFormationCutIn(r.ctx, {}, FONT, frameAt(0.5), {
      horses, frameColorOf: () => '#888',
    });
    const said = r.texts.map((x) => x.t);
    for (let g = 1; g <= 12; g += 1) expect(said, `${g} 番`).toContain(String(g));
  });

  /** ⚠️ ★居ないときに ★**無理に埋めない**（★嘘の予告を出さない） */
  it('★C 脚質の画面は、該当が無ければ「居ない」と言う', () => {
    const r = recorder();
    drawRunningStyleCutIn(r.ctx, FONT, { ...frameAt(0.5), label: 'ここから動く馬' }, []);
    expect(r.texts.map((x) => x.t)).toContain('後方から動く馬はいません');
  });

  it('★C 脚質の画面は 4 頭までしか出さない（★読めなくなる）', () => {
    const r = recorder();
    const rows = Array.from({ length: 7 }, (_, i) => ({
      gate: i + 1, horseName: `ウマ${i + 1}`, strategyLabel: '追い込み',
      order: i + 3, frameColor: '#888', own: false,
    }));
    drawRunningStyleCutIn(r.ctx, FONT, { ...frameAt(0.5), label: 'ここから動く馬' }, rows);
    const names = r.texts.map((x) => x.t).filter((t) => t.startsWith('ウマ'));
    expect(names).toHaveLength(4);
    expect(names).toEqual(['ウマ1', 'ウマ2', 'ウマ3', 'ウマ4']);
  });
});

/**
 * ★**暗い枠色の上でも番号が読めること**（★2026-09-11）
 *
 * ⚠️ ★字を ★**暗い色に決め打ち**していたので、★黒枠・青枠の馬は
 *    ★隊列図で ★**番号の無い黒い点**になっていました（★実測）。
 * ★この検定は「読めるか」ではなく、★**字の色が地の明暗で変わるか**を見ます。
 */
describe('枠色の上の番号', () => {
  const numberColorOn = (frameColor: string): unknown => {
    const r = recorder();
    drawFormationCutIn(r.ctx, {}, FONT, frameAt(0.5), {
      horses: [{ gate: 7, s: 300, w: 10 }],
      frameColorOf: () => frameColor,
    });
    return r.texts.find((t) => t.t === '7')?.fill;
  };
  it('暗い枠では明るい字、明るい枠では暗い字', () => {
    expect(numberColorOn('#000000'), '黒枠には明るい字').toBe('#eef2f6');
    expect(numberColorOn('#ffffff'), '白枠には暗い字').toBe('#14181a');
  });
  it('読めない書式は明るい字へ倒す（★地が暗いので安全側・R-27）', () => {
    const r = recorder();
    drawFormationCutIn(r.ctx, {}, FONT, frameAt(0.5), {
      horses: [{ gate: 7, s: 300, w: 10 }],
      frameColorOf: () => 'rgba(10,10,10,1)',
    });
    expect(r.texts.map((t) => t.t)).toContain('7');
  });
});
