/**
 * ★引退と繁殖入り（§7.1・§10.5）。B-7 の要点は**専用経路を作らないこと**です。
 *
 *   正典 §10.5:「NPC 馬はプレイヤー馬と**同一の遺伝エンジン**で生成。
 *   **専用の簡易ロジックを作らない**（**同じ土俵にいることが公正性の担保**）」
 *
 *   → 「同じ結果になる」だけでなく、**同じ関数を通っている**ことを見ます。
 *     別実装が偶然同じ値を返す状態を、値の比較では検出できません。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
import {
  breedingRoleForSex, decideRetirement, shouldRetire, toBreedingStock,
} from '../src/index.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const horse = (sex: 'male' | 'female') =>
  ({
    id: 'H1', sex, generation: 3, birthYear: 3, sireId: null, damId: null,
    sireLine: 'L1', damSireLine: null,
    coveringsThisYear: 17, bredThisYear: true, foalCount: 2, g1Wins: 1,
  }) as unknown as Parameters<typeof toBreedingStock>[0];

describe('§7.1 引退の判定', () => {
  it('★260週で強制引退（境界の両側・R-2）', () => {
    expect(shouldRetire(LIFECYCLE_WEEKS.retireAt - 1, false)).toBeNull();
    expect(shouldRetire(LIFECYCLE_WEEKS.retireAt, false)).toBe('age');
  });

  it('★致命的故障は年齢によらず引退（§7.5）', () => {
    expect(shouldRetire(120, true)).toBe('career_ending_injury');
  });
});

describe('§7.1 引退後の行き先', () => {
  it('性別に応じて種牡馬／繁殖牝馬', () => {
    expect(breedingRoleForSex('male')).toBe('stallion');
    expect(breedingRoleForSex('female')).toBe('broodmare');
  });

  it('★致命的故障で引退しても繁殖には上がれる（§7.5「繁殖入りは可能」）', () => {
    const d = decideRetirement(horse('male'), 'career_ending_injury');
    expect(d.breeds).toBe(true);
    expect(d.role).toBe('stallion');
  });

  it('功労馬を選べば繁殖に上がらない', () => {
    const d = decideRetirement(horse('female'), 'age', true);
    expect(d.role).toBe('honored');
    expect(d.breeds).toBe(false);
  });

  it('★成績の閾値を発明していない（正典に無いため）', () => {
    // G1 勝ちの有無で行き先が変わらないこと＝閾値を勝手に作っていないこと
    const won = { ...horse('male'), g1Wins: 5 } as typeof horse extends never ? never : ReturnType<typeof horse>;
    const none = { ...horse('male'), g1Wins: 0 } as typeof won;
    expect(decideRetirement(won, 'age').role).toBe(decideRetirement(none, 'age').role);
  });
});

describe('★B-7 専用経路を作っていない', () => {
  it('★繁殖入りで新しい型を作らない（HorseRecord のまま）', () => {
    const s = toBreedingStock(horse('male'));
    // 同じ形のまま。専用型を挟むと、そこから専用の配合処理が生える
    expect(s.id).toBe('H1');
    expect(s.sireLine).toBe('L1');
    expect(s.foalCount).toBe(2);
  });

  it('★繁殖の年次カウンタだけ初期化する（§6.7）', () => {
    const s = toBreedingStock(horse('male'));
    expect(s.coveringsThisYear).toBe(0);
    expect(s.bredThisYear).toBe(false);
    // ★通算の産駒数や G1 勝利数は消さない（別物）
    expect(s.foalCount).toBe(2);
    expect(s.g1Wins).toBe(1);
  });

  it('★入力を書き換えない', () => {
    const h = horse('male');
    toBreedingStock(h);
    expect(h.coveringsThisYear).toBe(17);
    expect(h.bredThisYear).toBe(true);
  });

  it('★★配合の計算がこのパッケージに無い（構造で検出する）', () => {
    // 「同じ結果になる」の比較では、別実装が偶然一致している状態を検出できません。
    // ★`@star/training` に配合・遺伝の実装が現れていないことを直接見ます。
    const src = readFileSync(`${ROOT}packages/training/src/retirement.ts`, 'utf8');
    for (const forbidden of ['genotype', 'allele', 'inbreed', 'nicks', 'expressNumeric']) {
      expect(src.toLowerCase(), `retirement.ts に ${forbidden} が現れている`).not.toContain(forbidden);
    }
    // ★繁殖は sim-engine の関数を使う。training 側で breed を再実装していない。
    //   ⚠️ 'function breed' だと breedingRoleForSex に部分一致して**正しい実装を落とします**。
    //      単語境界で見ること（最初これで偽陽性を出しました）。
    expect(src).not.toMatch(/function\s+breed\s*\(/);
  });

  it('★sim-engine の繁殖 API が単一の入口であること', () => {
    const engine = readFileSync(`${ROOT}packages/sim-engine/src/breeding.ts`, 'utf8');
    // ★プレイヤー用・NPC用の分岐が入口に無いこと
    expect(engine).not.toMatch(/isPlayer|playerHorse|npcOnly/);
    expect(engine).toContain('export function breed');
  });
});
