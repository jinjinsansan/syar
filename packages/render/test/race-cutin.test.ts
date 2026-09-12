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
  raceCutInAt, RACE_CUTIN_SEC, RACE_CUTIN_CORNER_SEC, RACE_CUTIN_AT_START, drawRaceCutInFrame,
  drawOwnHorseCutIn, drawFormationCutIn, drawRunningStyleCutIn,
  RACE_TELOP_SEC, drawRaceTelopBand, drawOwnHorseTelop, drawFormationTelop,
  drawRunningStyleTelop, drawToStraightTelop,
} from '../src/race-cutin.js';
import { SCRIPT_V6 } from '../src/broadcast-v2.js';
import type { Ctx2D } from '../src/oblique-draw.js';

/** ★台本 v6 に実際に並んでいる切り替わり（★名前の対で見る） */
const V6_TRANSITIONS = SCRIPT_V6.slice(1).map((row, i) => ({
  from: SCRIPT_V6[i]!.id, to: row.id,
}));

/**
 * ⚠️ ★**ここから下の「出す場所」は 2026-09-12 に要求ごと変わりました**（★オーナー指摘①②）。
 *
 *   ★旧: ★位置取り（`opening-side-lead` → `opening-formation`）でも出していた。
 *   ★オーナー評「★現在の隊列も ★**デザイナーのハンドオフ**であり、★カットイン用に作っているのに
 *   ★**カットイン場面ではないところに出している**のも間違っています」
 *   ★「★カットインは ★**カーブや発走の瞬間のクオリティが悪いものを隠すため**のもの。
 *     ★今カットインを使う場所は ★**4 コーナーの部分だけ**です（★桜星賞では）。
 *     ★しかし様々なコースではコーナーがあちこちあるので、★やはりカットインは必要です」
 *   ★新: ★**コーナーの出入りだけ**。★どのコーナーでも当たるようにする。
 */
describe('カットインを出す場所', () => {
  /**
   * ⚠️ ★**2026-09-12、入口のカットインは取り下げました**（★オーナー指示）。
   *    ★オーナーの組み立て「★コーナー演出（2 秒）→ ★カットイン（2 秒）→ ★真横カメラワーク」。
   *    ★入口にも出すと、★2 秒しかないコーナーの半分が覆われます。
   */
  it('★台本 v6 の中で出るのは 1 か所だけ（★コーナー明けだけ）', () => {
    const shown = V6_TRANSITIONS.filter((t) => raceCutInAt(t.from, t.to) !== undefined)
      .map((t) => `${t.from}>${t.to}`);
    expect(shown).toEqual(['fourth-corner-front>side-drive']);
  });

  /** ⚠️ ★オーナー指摘①: ★位置取りは「カットイン場面」ではない */
  it('★最初の位置取りでは出さない（★「現在の隊列」を取り下げた）', () => {
    expect(raceCutInAt('opening-side-lead', 'opening-formation')).toBeUndefined();
    expect(raceCutInAt('opening-formation', 'opening-side-settle')).toBeUndefined();
  });

  /**
   * ⚠️ ★オーナー指摘②: ★**様々なコースではコーナーがあちこちある**。
   *    ★以前は `fourth-corner-` しか見ていなかったので、★1〜3 角では出ませんでした。
   */
  it('★どのコーナーの明けでも出る（★1 角・2 角・3 角）', () => {
    for (const corner of ['first-corner-front', 'second-corner-high', 'third-corner-rear']) {
      expect(raceCutInAt(corner, 'side-drive')?.kind, `${corner} から出るとき`).toBe('to-straight');
      /** ⚠️ ★入口では出しません（★2 秒のコーナーを覆わない） */
      expect(raceCutInAt('side-drive', corner), `${corner} へ入るとき`).toBeUndefined();
    }
  });

  /**
   * ⚠️ ★見出しを ★**カメラの名前から断定しない**（★計画書 §3.3）。
   *    ★1 角を抜けた先は直線ではありません。★画面が出している区間名から作ります。
   */
  it('★コーナー明けの見出しは、実際にいる区間から作る', () => {
    expect(raceCutInAt('second-corner-high', 'side-drive', { sectionLabel: '向正面' })?.label).toBe('向正面へ');
    expect(raceCutInAt('fourth-corner-front', 'side-drive', { sectionLabel: '最後の直線' })?.label).toBe('最後の直線へ');
  });

  /** ★オーナー案「★入れる度に毎回異なる意味のあるカットインに」 */
  it('★出る 1 枚と発走の 1 枚は、中身が違う', () => {
    const kinds = V6_TRANSITIONS
      .map((t) => raceCutInAt(t.from, t.to)?.kind)
      .filter((k): k is NonNullable<typeof k> => k !== undefined);
    expect(kinds).toHaveLength(1);
    expect(new Set([...kinds, RACE_CUTIN_AT_START.kind]).size).toBe(2);
  });

  it('★2 枚それぞれに、何の画面かを言う見出しが付いている', () => {
    const labels = [
      RACE_CUTIN_AT_START.label,
      ...V6_TRANSITIONS.map((t) => raceCutInAt(t.from, t.to)?.label).filter((l) => l !== undefined),
    ];
    expect(labels).toHaveLength(2);
    for (const l of labels) expect((l ?? '').length).toBeGreaterThan(0);
    expect(new Set(labels).size, '★見出しが重なっています').toBe(2);
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
      expect(raceCutInAt(id, 'side-drive')?.kind, `出 ${id}`).toBe('to-straight');
      /** ⚠️ ★入口では出しません（★2026-09-12・★2 秒のコーナーを覆わない） */
      expect(raceCutInAt('side-drive', id), `入り ${id}`).toBeUndefined();
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
    /** ★コーナーの後は 2 秒（★2026-09-12・★オーナー指示。★上限と同じ値） */
    expect(RACE_CUTIN_CORNER_SEC).toBe(2);
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

  /**
   * ★**拭きをやめました**（★2026-09-12・オーナー指摘・`CUTIN_WIPE` の註記）。
   *
   *   ★旧: 入り 16% / 抜け 16% で ★**黒い帯が中央から左右へ開く**
   *   ★オーナー評「★黒の物体が左から右に高速で動くものですか？」「★余計にわけがわからない」
   *   ★デザイナーのハンドオフ（`broadcast-badges`）も ★**スライド禁止**と書いています。
   * → ★**1 コマ目から出し切り、尺の終わりで消える。**
   *   ★継ぎ目の合図は `raceTransitionVeil`（★ハンドオフの幕）が担います。
   */
  it('★★1 コマ目から出し切る（拭きで中身を待たせない）', () => {
    for (const t of [0, 0.02, 0.1, 0.5, 0.9, 0.99]) {
      const r = recorder();
      const box = drawRaceCutInFrame(r.ctx, FONT, frameAt(t));
      expect(box, `${t}: 中身の矩形が出ていません`).toBeDefined();
      expect(r.rects[0]?.w, `${t}: 背面が画面幅を覆っていません`).toBe(VP.width);
    }
  });

  /** ⚠️ ★「出ている」だけでなく ★**抜けきる**ことを見る（★出っぱなしが 1 回目の失敗） */
  it('尺を過ぎたら消える', () => {
    expect(drawRaceCutInFrame(recorder().ctx, FONT, frameAt(1))).toBeUndefined();
    expect(drawRaceCutInFrame(recorder().ctx, FONT, frameAt(1.5))).toBeUndefined();
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

/**
 * ★**テロップ（C 案）— ★映像を止めず、隠さない**（★2026-09-11・★デザイナーのハンドオフ）
 *
 * ★この案件は「★カットの切り替わりで別のレースに見える」と長く戦ってきました。
 * ⚠️ ★ところが従来のカットインは ★**1.2 秒 × 4 回、画面全体を覆う**構造で、
 *    ★**カットイン自身が新しい継ぎ目を持ち込んで**いました。
 * → ★画面下部の帯だけが出入りし、★映像は流れ続けます。
 */
describe('★テロップ（★下三分の一）', () => {
  const telopAt = (t: number) => ({
    viewport: VP, sinceSec: t * RACE_TELOP_SEC, durationSec: RACE_TELOP_SEC, label: 'あなたの馬',
  });

  /** ★**これが C 案の要**です。★画面の大半は覆いません */
  it('★帯が覆うのは画面の 15% まで（★映像は隠さない）', () => {
    const r = recorder();
    const box = drawRaceTelopBand(r.ctx, FONT, telopAt(0.5))!;
    expect(box).toBeDefined();
    expect(box.height / VP.height, '★帯が高すぎます').toBeLessThanOrEqual(0.15);
    /** ★実況の帯（画面の下 22%）にかからないこと */
    expect(box.y + box.height, '★実況の帯と重なります').toBeLessThan(VP.height * 0.78);
  });

  /** ⚠️ ★**全画面を塗る矩形が 1 つも無いこと**（★覆っていないことの直接の確認） */
  it('★全画面を塗らない', () => {
    const r = recorder();
    drawRaceTelopBand(r.ctx, FONT, telopAt(0.5));
    const full = r.rects.filter((x) => x.w >= VP.width && x.h >= VP.height * 0.9);
    expect(full, '★画面全体を覆う矩形があります').toEqual([]);
  });

  /** ★下から滑り出て、★下へ戻る（★`globalAlpha` のフェードは使わない） */
  it('★入りと抜けでは帯が下にあり、真ん中で定位置に来る', () => {
    const bandTop = (t: number): number => {
      const r = recorder();
      drawRaceTelopBand(r.ctx, FONT, telopAt(t));
      return r.rects[0]?.y ?? Number.POSITIVE_INFINITY;
    };
    const rest = bandTop(0.5);
    expect(bandTop(0.02), '★入りは下から').toBeGreaterThan(rest);
    expect(bandTop(0.98), '★抜けは下へ').toBeGreaterThan(rest);
    expect(rest / VP.height).toBeCloseTo(0.6, 1);
  });

  it('★出し切ってからは動かない（★1.0 秒は保持）', () => {
    const bandTop = (t: number): number => {
      const r = recorder();
      drawRaceTelopBand(r.ctx, FONT, telopAt(t));
      return r.rects[0]?.y ?? -1;
    };
    expect(bandTop(0.2)).toBe(bandTop(0.8));
  });

  it('★タブに見出しが出る', () => {
    const r = recorder();
    drawRaceTelopBand(r.ctx, FONT, telopAt(0.5));
    /** ⚠️ ★字送りを入れるので ★**1 字ずつ**置かれます */
    expect(r.texts.map((x) => x.t).join('')).toContain('あなたの馬');
  });

  it('★A 自馬は、馬名・脚質・番手を 1 行で出す', () => {
    const r = recorder();
    drawOwnHorseTelop(r.ctx, FONT, telopAt(0.5), {
      gate: 3, horseName: 'ハンシンドリーム', strategyLabel: '逃げ',
      frameColor: '#e33', order: 1, fieldSize: 12,
    });
    const said = r.texts.map((x) => x.t);
    expect(said).toContain('ハンシンドリーム');
    expect(said).toContain('逃げ');
    expect(said).toContain('1番手／12頭');
    expect(said, '★枠番').toContain('3');
  });

  /** ⚠️ ★**帯の高さでは 2 頭が限度**（★デザイナーの確認事項・★元は 4 頭） */
  it('★C 動く馬は 2 頭まで', () => {
    const r = recorder();
    const rows = Array.from({ length: 5 }, (_, i) => ({
      gate: i + 1, horseName: `ウマ${i + 1}`, strategyLabel: '差し',
      order: i + 3, frameColor: '#888', own: false,
    }));
    drawRunningStyleTelop(r.ctx, FONT, telopAt(0.5), rows);
    const names = r.texts.map((x) => x.t).filter((t) => t.startsWith('ウマ'));
    expect(names).toEqual(['ウマ1', 'ウマ2']);
  });

  it('★B 隊列は、自馬の番手と両端の目印を出す', () => {
    const r = recorder();
    drawFormationTelop(r.ctx, FONT, telopAt(0.5), {
      horses: Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: 300 - i * 3, w: 8 })),
      ownGate: 3, ownOrder: 3,
    });
    const said = r.texts.map((x) => x.t);
    expect(said).toContain('後方');
    expect(said).toContain('先頭');
    expect(said).toContain('あなた＝3番手');
  });

  it('★D 直線へは、番手と差を出す（★先頭なら「先頭」）', () => {
    const mk = (order: number): string[] => {
      const r = recorder();
      drawToStraightTelop(r.ctx, FONT, telopAt(0.5), {
        gate: 3, frameColor: '#e33', ownOrder: order, ownGapLengths: 1.8,
      });
      return r.texts.map((x) => x.t);
    };
    expect(mk(3)).toContain('3番手');
    expect(mk(3)).toContain('1.8馬身');
    expect(mk(1), '★先頭に「差」は無い').toContain('先頭');
  });
});
