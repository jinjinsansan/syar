/**
 * ★**出走登録の取消（除外）の移行**（★2026-09-16・移行 `0028`・正典 **D-111** ③⑤）
 *
 * 【★見ている壊れ方】
 *   ① ★**理由の無い取消**が作れる（★黙って消える・D-111 ⑤）
 *   ② ★**既定値で全行が取消済みに見える**（★列を足した瞬間に全レースが壊れる）
 *   ③ ★**D-056 の安全網を外している**（★この移行は何も外さない）
 *   ④ ★RPC を混ぜている（★1 つの移行で 1 つのこと）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const MIGRATION = '0028_entry_scratch.sql';
const sql = readFileSync(path.join(DIR, MIGRATION), 'utf8');
const blank = (s: string): string => s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
const body = blank(sql);

describe('★出走登録の取消の移行（0028・D-111）', () => {
  it('② ★列は既定値を持たない（★null ＝ 出走する）', () => {
    expect(body).toMatch(/add column if not exists scratched_at timestamptz/i);
    expect(body).toMatch(/add column if not exists scratch_reason text/i);
    /** ★`default` を付けると、足した瞬間に全行が取消済みに見える */
    expect(body).not.toMatch(/scratched_at timestamptz[^,;]*default/i);
    expect(body).not.toMatch(/scratch_reason text[^,;]*default/i);
  });

  it('① ★理由の無い取消は作れない（★黙って消さない・D-111 ⑤）', () => {
    expect(body).toMatch(/check \(\(scratched_at is null\) = \(scratch_reason is null\)\)/i);
  });

  it('★取消でない行を引く索引がある（★発走前・確定の走査）', () => {
    expect(body).toMatch(/create index if not exists race_entries_active_idx[\s\S]{0,80}where scratched_at is null/i);
  });

  it('③ ★安全網（D-056）を外していない・④ RPC を混ぜていない', () => {
    /** ★確定側の中止の経路に触れていない */
    expect(body).not.toMatch(/drop constraint|drop index|drop column/i);
    expect(body).not.toMatch(/create or replace function/i);
    expect(body).not.toMatch(/entrant_snapshot\s*(=|set)/i);
  });

  it('★移行の番号が連番', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    expect(files).toContain(MIGRATION);
    const numbers = files.map((f) => Number(f.slice(0, 4)));
    for (const [i, n] of numbers.entries()) {
      expect(n, `★移行の番号が連番でない: ${files[i]}`).toBe(i + 1);
    }
  });
});
