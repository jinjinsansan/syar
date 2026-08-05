/**
 * Q-3: 較正定数の登録を**構造で強制する**メタテスト
 *
 * 【背景】
 *   「較正に効く定数を新設したら同じ便で変異項目も追加する」という手順を求められたが、
 *   その同じ便で `OVERSAMPLE_RATIO` / `FLOOR_REDRAW_PASSES` / `FLOOR_FIELD_SIZE_SLOPE` を
 *   無防備なまま3つ増やした。**手順は守る努力に依存する限り漏れ続ける。**
 *
 * 【このテストが保証すること】
 *   走査対象ファイルの数値の `export const` は、
 *     (a) `CALIBRATION` に登録されている（→ 変異試験が自動生成され、防御が要求される）
 *     (b) または `EXEMPT` に**理由付きで**載っている
 *   のどちらかでなければならない。**理由なしの免除は作れない。**
 *
 *   さらに登録簿の `declaration` が実ソースと**一字一句一致**することも検査する。
 *   一致していないと変異試験が空振りし、「防御されている」と誤読される（R-9 / R-11）。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CALIBRATION,
  CALIBRATION_SCAN_DIRS,
  EXEMPT_PATTERNS,
  SCAN_EXCLUDED_FILES,
  EXEMPT,
  declarationPattern,
} from '../src/calibration.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function read(relPath: string): string {
  return readFileSync(`${ROOT}${relPath}`, 'utf8');
}

/**
 * 走査対象のファイル一覧を**ディレクトリから列挙**する（S-4）。
 * 手書きのファイルリストだと新規ファイルが黙って漏れる。除外は明示のみ。
 */
function scanFiles(): string[] {
  const excluded = new Set(SCAN_EXCLUDED_FILES.map((e) => e.file));
  const out: string[] = [];
  for (const dir of CALIBRATION_SCAN_DIRS) {
    for (const name of readdirSync(`${ROOT}${dir}`)) {
      if (!name.endsWith('.ts')) continue;
      const rel = `${dir}/${name}`;
      if (excluded.has(rel)) continue;
      out.push(rel);
    }
  }
  return out;
}

/** 数値・数値オブジェクトの `export const`（較正定数になりうるもの）を抜き出す */
function numericExports(text: string): string[] {
  const keys: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // ★`export const` だけでなくモジュールスコープの `const` も見る。
    //   `POOL_GENERATIONS`（判定を決める自由変数）は非 export だったため漏れていた。
    const m = line.match(/^(?:export )?const ([A-Z][A-Z0-9_]*)\s*[:=]/);
    if (m === null || m[1] === undefined) continue;
    // ★宣言が複数行に渡る場合（オブジェクト定数）も中身を見る。
    //   `DEFAULT_RACE_BALANCE` は `= {` の行に数値が無いため漏れていた。
    let block = line;
    if (line.includes('{') || line.includes('(')) {
      for (let j = i + 1; j < Math.min(lines.length, i + 120); j++) {
        const next = lines[j] ?? '';
        block += `\n${next}`;
        if (/^\}/.test(next) || /^\);/.test(next)) break;
      }
    }
    if (/-?[0-9]/.test(block.replace(/^[^=]*=/, ''))) keys.push(m[1]);
  }
  return keys;
}

describe('Q-3 較正定数の登録簿（メタテスト）', () => {
  const registered = new Set(CALIBRATION.map((c) => c.key));
  const exempt = new Map(EXEMPT.map((e) => [e.key, e.why]));

  it('走査対象の数値 export const はすべて登録済みか、理由付きで免除されている', () => {
    const unregistered: string[] = [];
    const patterns = EXEMPT_PATTERNS.map((p) => new RegExp(p.pattern));
    for (const file of scanFiles()) {
      if (patterns.some((re) => re.test(file))) continue;
      for (const key of numericExports(read(file))) {
        if (registered.has(key) || exempt.has(key)) continue;
        unregistered.push(`${file}: ${key}`);
      }
    }
    expect(
      unregistered,
      `較正定数の登録漏れ。apps/cli/src/calibration.ts の CALIBRATION に追加するか、` +
        `較正定数でないなら EXEMPT に理由付きで載せてください:\n  ${unregistered.join('\n  ')}`,
    ).toEqual([]);
  });

  it('免除には必ず理由が書かれている（理由なしの免除を作らない）', () => {
    for (const e of EXEMPT) {
      expect(e.why.length, `${e.key} の免除理由が短すぎる`).toBeGreaterThan(20);
    }
    for (const p of EXEMPT_PATTERNS) {
      expect(p.why.length, `${p.pattern} の免除理由が短すぎる`).toBeGreaterThan(20);
    }
    for (const f of SCAN_EXCLUDED_FILES) {
      expect(f.why.length, `${f.file} の除外理由が短すぎる`).toBeGreaterThan(20);
    }
  });

  it('★登録された定数が実ソースに1件だけ存在する（値には依存しない照合）', () => {
    // ★値まで照合すると、較正定数を摂動した瞬間に**このテストが落ちる**。
    //   すると変異試験は「登録簿テストが落ちただけ」で全件『守られている』と読めてしまう。
    //   実際それで13件を空振りのまま OK と読んだ（R-9: 検出器が自分自身を検出していた）。
    //   宣言の**存在**だけを見る。
    const mismatches: string[] = [];
    for (const c of CALIBRATION) {
      const matches = read(c.file).match(new RegExp(declarationPattern(c.key).source, 'gm'));
      const count = matches === null ? 0 : matches.length;
      if (count !== 1) mismatches.push(`${c.key}: ${c.file} に ${count} 件（1件であること）`);
    }
    expect(mismatches, `登録簿とソースの不一致:\n  ${mismatches.join('\n  ')}`).toEqual([]);
  });

  // ★「摂動後の宣言が現在の宣言と異なる」検査は**ここに置いてはいけない**。
  //
  //   置くと、較正定数を摂動した瞬間に（摂動後のソース＝登録簿の perturbed になるので）
  //   このテストが必ず落ちる。すると変異試験は「登録簿テストが落ちただけ」で
  //   全件『守られている』と読めてしまう。**検出器が自分自身を検出する**状態で、
  //   同じ形を Q-3 の実装中に2回作った（1回目は declaration の一字一句照合）。
  //
  //   この検査は変異ハーネスの事後条件(2)「置換で文字列が実際に変化したこと」が
  //   既に担っているので、テスト側では持たない。
  //   → 一般化: **変異試験の対象を検査するテストは、変異によって落ちてはいけない。**

  it('登録簿に重複キーがなく、affects が書かれている', () => {
    const seen = new Set<string>();
    for (const c of CALIBRATION) {
      expect(seen.has(c.key), `${c.key} が重複`).toBe(false);
      seen.add(c.key);
      expect(c.affects.length, `${c.key} の affects が短すぎる`).toBeGreaterThan(5);
    }
  });

  it('走査が空振りしていない（0件で緑になるのを防ぐ・R-9）', () => {
    let total = 0;
    for (const file of scanFiles()) total += numericExports(read(file)).length;
    expect(total).toBeGreaterThan(8);
    expect(CALIBRATION.length).toBeGreaterThan(8);
  });
});
