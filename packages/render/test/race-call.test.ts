/**
 * ★実況の文（馬名で呼ぶ）を留める
 *
 * ⚠️ ★元は**常に自馬の枠番**だけを語っていました（「3番 は前と 1.2 馬身」）。
 *    オーナー評「本来の競馬レースのナレーターは**馬の名前を実況中継する**はずです」。
 */
import { describe, it, expect } from 'vitest';
import { raceCallAt, raceSurgeGate, RACE_SURGE_MIN_GAIN_M, withPhasePrefix } from '../src/race-call.js';

const NAMES = ['アカツキ', 'ブライト', 'コスモス', 'ディライト', 'エトワール'];
const horsesAt = (metres: readonly number[]) =>
  metres.map((m, i) => ({ gate: i + 1, name: NAMES[i]!, meters: m }));
const base = {
  distanceMeter: 1600, phaseLabel: '向正面', ownGate: 3, lineIndex: 0,
  frameRoleOf: (g: number) => `frame-${g}`,
};
const textOf = (parts: readonly { text: string }[]) => parts.map((p) => p.text).join('');

describe('★実況の文', () => {
  it('★★道中は「先頭は◯◯、2 番手に△△」と馬名で言う', () => {
    const line = raceCallAt({ ...base, horses: horsesAt([700, 690, 680, 670, 660]) })!;
    expect(textOf(line.parts)).toBe('先頭はアカツキ、2 番手にブライト');
    // ★馬名には枠色の役割が付く（色分けのため）
    expect(line.parts.find((p) => p.text === 'アカツキ')?.role).toBe('frame-1');
  });

  it('★★自馬の枠番を言い続けない（元の不具合）', () => {
    for (let i = 0; i < 3; i += 1) {
      const line = raceCallAt({ ...base, lineIndex: i, horses: horsesAt([700, 690, 680, 670, 660]) })!;
      expect(textOf(line.parts), `${i} 本目で自馬の枠番を語っています`).not.toContain('3番');
    }
  });

  it('★自馬は 4 本に 1 本だけ触れる（乱数は使わない）', () => {
    const mk = (i: number) => raceCallAt({ ...base, lineIndex: i, horses: horsesAt([700, 690, 680, 670, 660]) })!;
    expect(textOf(mk(3).parts)).toContain('コスモス');     // 3 番＝自馬
    expect(textOf(mk(3).parts)).toContain('3 番手');
    for (const i of [0, 1, 2, 4, 5, 6]) expect(textOf(mk(i).parts)).not.toContain('番手、');
  });

  it('★直線では追ってくる馬を呼ぶ', () => {
    const line = raceCallAt({
      ...base, phaseLabel: '最後の直線', horses: horsesAt([1300, 1296, 1280, 1270, 1260]),
    })!;
    expect(textOf(line.parts)).toBe('先頭はアカツキ、ブライトが迫る');
  });

  it('★★ゴール前で接戦なら 2 頭の名前を並べる', () => {
    const line = raceCallAt({
      ...base, phaseLabel: 'ゴール前', horses: horsesAt([1520, 1519.5, 1500, 1490, 1480]),
    })!;
    expect(textOf(line.parts)).toBe('アカツキとブライト、並んでゴールへ！');
  });

  it('★ゴール前で離していれば「抜け出した」', () => {
    const line = raceCallAt({
      ...base, phaseLabel: 'ゴール前', horses: horsesAt([1520, 1508, 1500, 1490, 1480]),
    })!;
    expect(textOf(line.parts)).toBe('アカツキ、抜け出した！');
  });

  it('★★同じ状態からは必ず同じ文（決定論・憲法 4）', () => {
    const ctx = { ...base, horses: horsesAt([700, 690, 680, 670, 660]) };
    expect(JSON.stringify(raceCallAt(ctx))).toBe(JSON.stringify(raceCallAt(ctx)));
  });

  it('★局面が変わったときだけ区間名から入る', () => {
    const line = raceCallAt({ ...base, horses: horsesAt([700, 690, 680, 670, 660]) })!;
    expect(textOf(withPhasePrefix(line, '第3コーナー/lead1', '向正面').parts)).toMatch(/^向正面、/);
    expect(textOf(withPhasePrefix(line, '向正面/lead1', '向正面').parts)).not.toMatch(/^向正面、/);
  });

  it('★話題が変わらなければ鍵も変わらない（同じことを言い続けない）', () => {
    const a = raceCallAt({ ...base, horses: horsesAt([700, 690, 680, 670, 660]) })!;
    const b = raceCallAt({ ...base, horses: horsesAt([720, 710, 700, 690, 680]) })!;
    expect(a.key).toBe(b.key);        // 先頭が同じなら同じ話題
    const c = raceCallAt({ ...base, horses: horsesAt([690, 700, 680, 670, 660]) })!;
    expect(c.key).not.toBe(a.key);    // 先頭が替われば別の話題
  });

  it('★馬がいなければ何も言わない', () => {
    expect(raceCallAt({ ...base, horses: [] })).toBeUndefined();
  });
});

/**
 * ★**後方から上がってきた馬を名指しする**（★2026-09-11・★オーナー ⑧）
 *
 * ★オーナー評「★真横カメラワークをここまで使うので、★最後の直線のせめぎ合い、
 *   ★**差し、追い込み馬**、逃げ馬、激しい展開などが必要です」。
 *
 * 【★実況が足りなかった、と言える根拠】
 *   ★エンジンは出しています … `tools/audit-real-overtakes.mjs`（8 seed）で
 *     ★直線の追い抜き ★**3〜8 回**／上位 5 頭の伸び 17〜25m → 1.3〜14.7m。
 *   ★カメラも映しています … `tools/audit-contest-focus.mjs` で主役 2 頭以上が ★**100%**。
 *   ⚠️ ★足りていなかったのは ★**名前を呼ぶこと**でした。
 *      ★「迫る」と呼ぶ相手は ★**常に 2 着馬**で、★後方から来た馬の名は一度も出ませんでした。
 */
describe('★直線で「上がってきた馬」を名指しする', () => {
  const DIST = 1600;
  /** ★先頭 1 番が 1300m、以下 5m ずつ後ろ。★6 番だけが 2 秒で 8m 詰めている */
  const horses = [1, 2, 3, 4, 5, 6].map((gate) => ({
    gate, name: `ウマ${gate}`, meters: 1300 - (gate - 1) * 5,
  }));
  const base = {
    horses, distanceMeter: DIST, phaseLabel: '最後の直線', ownGate: 2,
    lineIndex: 0, frameRoleOf: () => 'frame-1',
  };
  /** ★2 秒前の位置。★6 番だけが余分に詰めている */
  const agoMap = new Map(horses.map((h) => [h.gate, h.meters - 20 - (h.gate === 6 ? 8 : 0)] as const));
  const agoOf = (gate: number): number => agoMap.get(gate) ?? 0;

  /**
   * ★**線は実測から引いています**（★`RACE_SURGE_MIN_GAIN_M` の注記）。
   *   ★「その瞬間いちばん詰めている馬の詰め量」は中央値 0.9〜1.6m ＝ ★**誰かは常に詰めています**。
   *   ★だから線はそこではなく、★上位 1 割（1.3〜4.7m）のあたり ★**2.5m** に置いています。
   */
  it('★線は「詰めていない馬を名指ししない」ためだけの下限', () => {
    expect(RACE_SURGE_MIN_GAIN_M).toBeGreaterThan(0);
    expect(RACE_SURGE_MIN_GAIN_M).toBeLessThan(3);
  });

  it('★「今」と「少し前」が同じ入力なら、いちばん詰めた馬を返す', () => {
    expect(raceSurgeGate(horses, agoMap)).toBe(6);
    /** ⚠️ ★線に届かない詰めは返しません */
    const flat = new Map(horses.map((h) => [h.gate, h.meters - 20] as const));
    expect(raceSurgeGate(horses, flat)).toBeUndefined();
    /** ⚠️ ★先頭は返しません */
    const leadOnly = new Map(horses.map((h) => [h.gate, h.meters - 20 - (h.gate === 1 ? 8 : 0)] as const));
    expect(raceSurgeGate(horses, leadOnly)).toBeUndefined();
  });

  it('詰めてきた馬の名を呼ぶ（★2 着馬ではない）', () => {
    const line = raceCallAt({ ...base, metersAgoOf: agoOf });
    const said = (line?.parts ?? []).map((p) => p.text).join('');
    expect(said).toContain('ウマ6');
    expect(said).toContain('後方から上がってくる');
    expect(said, '★2 着馬を「迫る」と呼んでいます').not.toContain('ウマ2');
    expect(line?.key).toContain('surge6');
  });

  /** ⚠️ ★渡さなければ ★**1 文字も変わらない**こと（★既定は動かさない・R-27） */
  it('2 秒前を渡さなければ、従来どおり先頭と 2 着馬を言う', () => {
    const line = raceCallAt(base);
    const said = (line?.parts ?? []).map((p) => p.text).join('');
    expect(said).toContain('先頭は');
    expect(said).toContain('ウマ1');
    expect(said).not.toContain('上がってくる');
  });

  /** ⚠️ ★**動いていないのに言わない**こと（★毎コマ誰かを名指しすると意味が消えます） */
  it('誰も詰めていなければ、上がってきたとは言わない', () => {
    const flat = (gate: number): number =>
      (horses.find((h) => h.gate === gate)?.meters ?? 0) - 20;
    const said = (raceCallAt({ ...base, metersAgoOf: flat })?.parts ?? [])
      .map((p) => p.text).join('');
    expect(said).not.toContain('上がってくる');
  });

  /**
   * ⚠️ ★**2 番手は名指ししません**（★下の「◯◯が迫る」が同じ馬を指すので、
   *    ★同じことを 2 通りの言い方で繰り返すだけになります）。
   */
  it('2 番手が詰めていても、上がってくるとは言わない', () => {
    const ago2 = new Map(horses.map((h) => [h.gate, h.meters - 20 - (h.gate === 2 ? 8 : 0)] as const));
    const said = (raceCallAt({ ...base, metersAgoOf: (g) => ago2.get(g) ?? 0 })?.parts ?? [])
      .map((p) => p.text).join('');
    expect(said).not.toContain('後方から上がってくる');
    expect(said).toContain('先頭は');
  });

  /** ⚠️ ★**先頭を「上がってきた」と言わない**（★日本語として成り立ちません） */
  it('先頭自身は名指ししない', () => {
    const leadSurges = (gate: number): number =>
      (horses.find((h) => h.gate === gate)?.meters ?? 0) - 20 - (gate === 1 ? 8 : 0);
    const line = raceCallAt({ ...base, metersAgoOf: leadSurges });
    expect(line?.key).not.toContain('surge1');
  });

  /** ★ゴール前（残り 120m 以下）は、従来どおり「並んでゴールへ！」の側が優先 */
  it('ゴール前では従来の言い回しを崩さない', () => {
    const near = horses.map((h) => ({ ...h, meters: h.meters + 200 }));
    const said = (raceCallAt({ ...base, horses: near, metersAgoOf: agoOf })?.parts ?? [])
      .map((p) => p.text).join('');
    expect(said).not.toContain('上がってくる');
  });
});
