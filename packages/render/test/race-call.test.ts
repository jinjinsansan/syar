/**
 * ★実況の文（馬名で呼ぶ）を留める
 *
 * ⚠️ ★元は**常に自馬の枠番**だけを語っていました（「3番 は前と 1.2 馬身」）。
 *    オーナー評「本来の競馬レースのナレーターは**馬の名前を実況中継する**はずです」。
 */
import { describe, it, expect } from 'vitest';
import { raceCallAt, withPhasePrefix } from '../src/race-call.js';

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
