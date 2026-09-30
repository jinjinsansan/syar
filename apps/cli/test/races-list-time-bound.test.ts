/**
 * ★**レースの一覧を古い順に読むなら ★時刻で絞る**（★2026-09-30・レビュー側「今日 3 例目なので網を 1 本」）。
 *
 * 【★見ている壊れ方】
 *   ★`races_public` を `scheduled_at` の ★古い順（ascending）に `limit` で読み、★時刻の条件が無い。
 *   ★レースは増え続けるので ★**いちばん古い過去のレース**が返り、★「次のレース」「発売中」が見つからない。
 *   ★実例: ★`/odds` の入口（★「いま発売中のレースがありません」・本番）／★`lib/queries.ts` の `upcomingRaces`（★呼び手 0 件のまま消した）。
 * ★語の列挙ではなく ★**読み方の形**で見る: ★1 つの文の中に `from('races_public')` と
 *   ★`order('scheduled_at', { ascending: true })` が在るなら、★同じ文に `scheduled_at` の比較（gt/gte/lt/lte）・★`id` の一致・★段（status）の絞り込みのどれかが要る。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(__dirname, '../../web/src');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

/** ★時刻の条件の無い「古い順の一覧」を返す（★文ごとに見る） */
export function unboundedAscending(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const bad: string[] = [];
  let at = code.indexOf("from('races_public')");
  while (at >= 0) {
    const end = code.indexOf(';', at);
    const stmt = code.slice(at, end < 0 ? undefined : end);
    const ascending = /\.order\(\s*'scheduled_at'\s*,\s*\{\s*ascending:\s*true\s*\}\s*\)/.test(stmt);
    const bounded = /\.(gt|gte|lt|lte)\(\s*'scheduled_at'/.test(stmt) || /\.eq\(\s*'id'/.test(stmt) || /\.in\(\s*'id'/.test(stmt)
      /** ★受付中・発売中など ★段で絞るのも可（★確定したレースは入らない・`ENTERABLE_RACE_STATUS` など） */
      || /\.(eq|in)\(\s*'status'/.test(stmt);
    if (ascending && !bounded) bad.push(stmt.slice(0, 120).replace(/\s+/g, ' '));
    at = code.indexOf("from('races_public')", at + 1);
  }
  return bad;
}

describe('★レースの一覧は 時刻で絞ってから 古い順に読む', () => {
  it('🔴 apps/web で 時刻の条件の無い「古い順の一覧」が無い', () => {
    const bad = files(WEB).flatMap((f) => unboundedAscending(readFileSync(f, 'utf8')).map((s) => `${path.relative(WEB, f)}: ${s}`));
    expect(bad).toEqual([]);
  });

  it('★対照: 旧 /odds の読み方は 捕まる・時刻で絞った形は 通る', () => {
    expect(unboundedAscending("c.from('races_public').select('*').order('scheduled_at', { ascending: true }).limit(48);")).toHaveLength(1);
    expect(unboundedAscending("c.from('races_public').select('*').gt('scheduled_at', now).order('scheduled_at', { ascending: true }).limit(8);")).toHaveLength(0);
    expect(unboundedAscending("c.from('races_public').select('*').order('scheduled_at', { ascending: false }).limit(1);"), '★新しい順は対象外').toHaveLength(0);
  });
});
