/**
 * 解釈IDの参照と登録の一致（M-1 対策の一般化）
 *
 * ★M-1 で踏んだのは「コードのコメントが、存在しない防御を宣言していた」ことだった。
 *   race-engine では正典の空白を埋めた箇所に `I-XXX` というIDを振り、
 *   `INTERPRETATIONS` に登録して報告書 §7 を**そこから生成**する運用にしている。
 *   運用が成立する条件は次の2つで、どちらもここで機械的に検査する:
 *     (1) ソース中で参照している `I-XXX` が登録簿に**存在する**
 *     (2) 登録簿の `I-XXX` がソースのどこかで**実際に使われている**（幽霊登録を作らない）
 *
 * ★このテストだけは `fs` を使うのでエンジン側でなく CLI 側に置く
 *   （race-engine は依存ゼロを保つ）。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INTERPRETATIONS } from '@star/race-engine';
import { describe, expect, it } from 'vitest';

/**
 * ★走査範囲（O-6）。
 *
 * P1 提出時は `packages/race-engine/src` だけを見ており、`apps/cli` 側のプレースホルダが
 * 対象外だった。その結果、報告書 §7 の「全件」は**この範囲での全件**にすぎず、
 * 未登録の解釈が4件あった。**「全件」と書くときは、その全件がどの範囲の全件かを併記する**（R-9 の一般形）。
 */
const SCAN_DIRS = [
  fileURLToPath(new URL('../../../packages/race-engine/src', import.meta.url)),
  fileURLToPath(new URL('../../../packages/sim-engine/src', import.meta.url)),
  fileURLToPath(new URL('../src', import.meta.url)),
];

function readAllSources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const dir of SCAN_DIRS) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      out.push({ file: `${dir}/${f}`, text: readFileSync(`${dir}/${f}`, 'utf8') });
    }
  }
  return out;
}

/** ソース中に現れる解釈ID。登録簿定義そのものの行（`id: 'I-XXX'`）は除く */
function referencedIds(sources: { file: string; text: string }[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const { file, text } of sources) {
    for (const line of text.split('\n')) {
      if (/^\s*id:\s*'I-/.test(line)) continue; // 登録簿の定義行
      for (const m of line.matchAll(/\bI-[A-Z][A-Z0-9-]*\b/g)) {
        const id = m[0];
        const files = found.get(id) ?? [];
        if (!files.includes(file)) files.push(file);
        found.set(id, files);
      }
    }
  }
  return found;
}

describe('解釈IDの参照と登録の一致', () => {
  const sources = readAllSources();
  const registered = new Set(INTERPRETATIONS.map((i) => i.id));
  const referenced = referencedIds(sources);

  it('ソースが参照する解釈IDはすべて登録簿にある（存在しないIDを書かない）', () => {
    const missing = [...referenced.keys()].filter((id) => !registered.has(id));
    expect(missing, `未登録の解釈ID: ${missing.join(', ')}`).toEqual([]);
  });

  it('登録簿の解釈IDはすべてソースで使われている（幽霊登録を作らない）', () => {
    const unused = [...registered].filter((id) => !referenced.has(id));
    expect(unused, `どこからも参照されていない解釈ID: ${unused.join(', ')}`).toEqual([]);
  });

  it('検査対象のソースを実際に読めている（0件で緑になる空振りを防ぐ・R-9）', () => {
    expect(sources.length).toBeGreaterThan(3);
    expect(referenced.size).toBeGreaterThan(5);
    expect(registered.size).toBeGreaterThan(5);
  });
});
