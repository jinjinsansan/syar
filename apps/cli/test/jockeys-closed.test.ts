/**
 * ★**騎手の名簿の表（jockeys）は 利用者から閉じる**（★2026-09-28・移行 `0093`・V-20 ②③・レビュー側の裁定 (a)）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★元の表を anon / authenticated に開け直す（★列を足した日に黙って公開になる・§14.3）
 *   ② 🔴 ★画面やワーカーが ★元の表を直に読み始める（★閉じたので読めない＝壊れる）
 *   ③ ★出走登録（enter_race）が ★definer でなくなる（★その中で名簿を読むので、★definer でないと読めなくなる）
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error -- .mjs の素の JS を読む（型定義は置いていない・`exposure-registry.test.ts` と同じ作法）
import { EXPECTED_EXPOSURE, CLOSED } from '../../../tools/lib/exposure-registry.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const MIG = path.join(ROOT, 'db/migrations');
const SQL = readFileSync(path.join(MIG, '0093_close_jockeys_table.sql'), 'utf8');
const live = (s: string): string => s.replace(/--[^\n]*/g, ' ');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'test') out.push(...filesUnder(p)); continue; }
    if (/\.(ts|tsx|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('★jockeys は利用者から閉じる', () => {
  it('🔴 ① ★移行が public / anon / authenticated から剥がし、★開け直していない', () => {
    expect(live(SQL)).toContain('revoke all on table jockeys from public, anon, authenticated;');
    expect(live(SQL), '★閉じた後で開けている').not.toMatch(/grant [a-z, ]+ on (table )?jockeys/);
    /** ★0093 より後の移行が ★開け直していない */
    const later = readdirSync(MIG).filter((f) => f.endsWith('.sql') && f > '0093');
    for (const f of later) {
      expect(live(readFileSync(path.join(MIG, f), 'utf8')), `★${f} が jockeys を開けている`).not.toMatch(/grant [a-z, ]+ on (table )?jockeys\b/);
    }
    expect(EXPECTED_EXPOSURE['jockeys']).toBe(CLOSED);
  });

  /**
   * ★例外は ★service role で読む点検の道具だけ（★名指し・理由つき）。
   * ★`verify-jockey-roster-live.mjs` … ★TS と生きている行の突き合わせ（★読むだけ・手順書 ⑧b）
   */
  const SERVICE_ROLE_CHECKERS = ['tools/verify-jockey-roster-live.mjs'];

  it('🔴 ② ★画面・ワーカー・道具が ★元の表を直に読まない', () => {
    for (const f of SERVICE_ROLE_CHECKERS) expect(readFileSync(path.join(ROOT, f), 'utf8')).toMatch(/from jockeys\b/);
    const offenders: string[] = [];
    for (const dir of ['apps/web/src', 'apps/worker/src', 'packages', 'tools']) {
      for (const f of filesUnder(path.join(ROOT, dir))) {
        if (SERVICE_ROLE_CHECKERS.includes(path.relative(ROOT, f).replace(/\\/g, '/'))) continue;
        const s = readFileSync(f, 'utf8');
        if (/\.from\(\s*['"`]jockeys['"`]\s*\)|from\s+(public\.)?jockeys\b/i.test(s)) offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('③ ★名簿を読む出走登録は ★definer のまま（★最後の定義）', () => {
    const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
    let last = '';
    for (const f of files) {
      const s = readFileSync(path.join(MIG, f), 'utf8');
      const i = s.search(/create (or replace )?function (public\.)?enter_race\s*\(/i);
      if (i < 0) continue;
      /** ★その関数の定義から ★次の関数の定義（か ファイルの終わり）まで */
      const next = s.slice(i + 10).search(/create (or replace )?function /i);
      last = next < 0 ? s.slice(i) : s.slice(i, i + 10 + next);
    }
    expect(last, '★enter_race の定義が見つからない').not.toBe('');
    expect(last).toMatch(/security definer/i);
  });
});
