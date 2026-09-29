/**
 * ★**オッズを 券種で絞らずに読まない・★読み切れなければ 黙らない**（★2026-09-29・レビュー側）
 *
 * 【★なぜ】
 *   ★`race_odds_public` は 1 レースで数千行（★15 頭で 3,635 行）。★読む口は既定で 1,000 行で切る。
 *   ★本番 R12423（13 頭）の /odds で ★単勝が全部「—」だった（★先頭 1,000 行に win が 0 行）。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★`race_odds_public` を ★券種で絞らずに読む所が 在る
 *   ② 🔴 ★読み切れていないのに ★読み切れたと言う（★総数が分からないときも）
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './lib/ts-blocks.js';
import { oddsReadComplete } from '../../web/src/lib/odds-read';

const ROOT = path.resolve(__dirname, '../../..');
const WEB = path.join(ROOT, 'apps/web/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** ★`from('race_odds_public')` から ★その式の終わり（`,`＋改行 か `;`）までを 1 件として返す */
function oddsReads(): { readonly rel: string; readonly expr: string }[] {
  const out: { rel: string; expr: string }[] = [];
  for (const abs of files(WEB)) {
    const src = stripComments(readFileSync(abs, 'utf8'));
    for (const m of src.matchAll(/from\(\s*'race_odds_public'\s*\)/g)) {
      const rest = src.slice(m.index);
      const end = rest.search(/;|,\s*\n/);
      out.push({ rel: path.relative(ROOT, abs).replace(/\\/g, '/'), expr: rest.slice(0, end < 0 ? 400 : end) });
    }
  }
  return out;
}

describe('★オッズを 券種で絞って読む', () => {
  it('★対照: 走査が空振りしていない（★読む所が 3 件以上）', () => {
    expect(oddsReads().length).toBeGreaterThanOrEqual(3);
  });

  it('🔴 ① race_odds_public を 券種で絞らずに読む所が 0 件', () => {
    const bad = oddsReads().filter((r) => !/\.(eq|in)\(\s*'bet_type'/.test(r.expr)).map((r) => `${r.rel}: ${r.expr.replace(/\s+/g, ' ').slice(0, 120)}`);
    expect(bad, '★券種で絞らずに読んでいる（★1,000 行で切れて 単勝が欠ける）').toEqual([]);
  });

  it('🔴 ② 読む 1 か所（odds-read.ts）は 総数を数えて比べる', () => {
    const src = stripComments(readFileSync(path.join(WEB, 'lib/odds-read.ts'), 'utf8'));
    expect(src).toContain("{ count: 'exact' }");
    expect(src).toContain('oddsReadComplete(rows.length, res.count)');
    expect(src).toContain('throw new OddsIncompleteError(');
  });
});

describe('★読み切れたか（oddsReadComplete）', () => {
  it('★届いた数が総数に届けば 読み切れた', () => {
    expect(oddsReadComplete(26, 26)).toBe(true);
  });
  it('🔴 ② 足りなければ 読み切れていない（★1,000 行で切れた形）', () => {
    expect(oddsReadComplete(1000, 3635)).toBe(false);
  });
  it('🔴 ② 総数が分からなければ 読み切れていない扱い', () => {
    expect(oddsReadComplete(26, null)).toBe(false);
  });
});
