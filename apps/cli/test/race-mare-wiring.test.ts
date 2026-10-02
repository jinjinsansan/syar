/**
 * ★**レースの牝馬**（★2026-10-02・オーナー「パドックは牝馬なのに レース演出はオスでは辻褄が合わない」）。
 *
 * 【★見ている壊れ方】
 *   ① ★出走表の性別が レースの画面まで届かない（★牝馬が牡馬の絵で走る）
 *   ② ★型の判定が `-b` / `-c` しか知らず ★牝馬の役 `-m` を 型 A と取り違える（★携帯の焼いた素材）
 *   ③ ★後ろ斜め・高い斜め・パドックの歩きだけ 牝馬にならない（★型を混ぜていない組・★`b` 決め打ち）
 *   ④ ★焼く道具・配置の対象に 牝馬の組が無い（★携帯で出ない・★配置が別の決め方に落ちて跳ねる）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const PAGE = strip(readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8'));
const REAL = strip(readFileSync(path.join(ROOT, 'apps/web/src/lib/race-real.ts'), 'utf8'));
const BAKE = strip(readFileSync(path.join(ROOT, 'tools/bake-race-frames.mjs'), 'utf8'));
const GROUND = strip(readFileSync(path.join(ROOT, 'packages/render/src/horse-ground.ts'), 'utf8'));

describe('★レースの牝馬', () => {
  it('🔴 ① ★出走表の性別 → 名簿の female → 型 m', () => {
    expect(REAL).toContain("auth.from('race_entries_public').select('gate,sex').eq('race_id', raceId)");
    expect(REAL).toMatch(/if \(r\['sex'\] === 'female' && Number\.isInteger\(g\)\) femaleGates\.add\(g\);/);
    expect(PAGE).toContain('female: data.femaleGates.has(r.gate),');
    expect(PAGE).toContain("const typeOf = (gate: number): HorseType => (setup.roster[gate - 1]?.female === true ? 'm' : tableTypeOf(gate));");
    /** ★読み込む型は このレースの枠から（★表だけで決めると 牝馬の素材を読まない） */
    expect(PAGE).toContain('(t) => Array.from({ length: FIELD }, (_, i) => typeOf(i + 1)).includes(t));');
    /** ★対照: ★モジュールの表だけの型（旧）は もう 読み込みの鍵にしない */
    expect(PAGE).not.toMatch(/const HORSE_TYPES_IN_USE[^=]*= HORSE_TYPES\.filter\(\s*\(t\) => HORSE_TYPE_BY_GATE\.includes\(t\)\)/);
  });

  it('🔴 ② ★役名の型は -b / -c / -m（★1 か所）', () => {
    expect(PAGE).toContain('const m = /-([bcm])$/.exec(role);');
    expect(PAGE).toContain("const baseRole = set.role.replace(/-[bcm]$/, '');");
    expect(PAGE).not.toContain("role.endsWith('-b') ? 'b' : role.endsWith('-c') ? 'c' : 'a'");
    /** ★型 1 つだけの判定は「a だけか」（★b・c の決め打ちだと m が全枠を組む） */
    expect(PAGE).toContain("const only = Object.keys(byType).every((k) => k === 'a');");
  });

  it('🔴 ③ ★後ろ斜め・高い斜め・歩きも 型を混ぜる', () => {
    expect(PAGE).toContain('buildFramesByType({ a: rearV4, ...rearByType }, undefined, SILKS_LAYOUT_REAR)');
    expect(PAGE).toContain('buildFramesByType({ a: highDiagV3, ...highByType }, undefined, SILKS_LAYOUT_REAR, highMode)');
    expect(PAGE).toContain('buildFramesByType({ a: walkA, ...walkByType }, undefined, SILKS_LAYOUT_CROUCH, sideMode)');
    expect(PAGE).toContain('const got = await loadNativeSet(`horse-jockey-side-walk-v1${t}`);');
    expect(PAGE).toContain('entry.role === `side-walk${roleSuffixOf(t)}`');
  });

  it('🔴 ④ ★焼く道具の 5 役・★配置の対象', () => {
    for (const [role, prefix] of [
      ['side-v6-m', 'horse-jockey-side-v8m'], ['diag-front-v2-m', 'horse-jockey-diag-front-v4m'],
      ['diag-rear-v2-m', 'horse-jockey-diag-rear-v5m'], ['high-diag-v2-m', 'horse-jockey-high-diag-v4m'],
      ['side-walk-m', 'horse-jockey-side-walk-v1m'],
    ]) {
      expect(BAKE).toContain(`role: '${role}'`);
      expect(BAKE).toContain(`pickSet('${prefix}')`);
    }
    for (const p of ['horse-jockey-side-v8m', 'horse-jockey-diag-front-v4m', 'horse-jockey-high-diag-v4m']) expect(GROUND).toContain(`'${p}'`);
    /** ★元の組が 配置の対象でないもの（後ろ斜め）は 牝馬も入れない（★元と同じ決め方） */
    expect(GROUND).not.toContain("'horse-jockey-diag-rear-v5m'");
  });
});
