/**
 * ★**利用者に見える文字の禁止語**（★2026-09-28・デザイナー R-18 回答 🔴 #1 #3・レビュー側の条件）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★「★中継」… ★生中継と読めます。★常設表示も `/race` も ★**録画・結果から再現**です（★誤認させない決まり）。
 *   ② 🔴 ★「★購入」… ★引き渡し資料 §2-1 の禁止語（★否定形でも使わない）。★語は §4-3「★市場で迎えた馬」「★馬市場」。
 *
 * ★見る範囲: ★`apps/web/src` と ★`packages/render/src`（★画布に描く文字）の ★註記を除いた原文。
 * ★除く: ★本番で 404 の開発用の画面（★`middleware.ts` の `DEV_ONLY_ROUTES`／★自分で `notFound()` する画面）。
 * ⚠️ ★DB の理由の語（`horse_purchase` など・★英字）は ★画面の文字ではないので ★対象外です。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DEV_ONLY_ROUTES } from '../../web/src/middleware.js';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');
const SELF_GATED = /if \(process\.env\.NODE_ENV (?:=== 'production'|!== 'development')\) notFound\(\);/;

/** ★開発用の画面のフォルダ（★本番は 404） */
function devDirs(): string[] {
  const out = DEV_ONLY_ROUTES.map((r) => path.join(APP, r.slice(1)));
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name === 'page.tsx' && SELF_GATED.test(readFileSync(p, 'utf8'))) out.push(path.dirname(p));
    }
  };
  walk(APP);
  return out;
}

function filesUnder(dir: string, skip: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!skip.some((s) => p === s || p.startsWith(`${s}${path.sep}`))) out.push(...filesUnder(p, skip)); continue; }
    if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** ★註記を除く（★ブロック・JSX のブロック・行） */
const strip = (s: string): string => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');

function offenders(word: string): string[] {
  const skip = devDirs();
  const files = [...filesUnder(path.join(ROOT, 'apps/web/src'), skip), ...filesUnder(path.join(ROOT, 'packages/render/src'), [])];
  const out: string[] = [];
  for (const f of files) {
    const live = strip(readFileSync(f, 'utf8'));
    live.split('\n').forEach((line, i) => { if (line.includes(word)) out.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 80)}`); });
  }
  return out;
}

describe('★利用者に見える文字の禁止語', () => {
  it('🔴 ① ★「中継」が無い（★録画を生中継に見せない）', () => {
    expect(offenders('中継')).toEqual([]);
  });

  it('🔴 ② ★「購入」が無い（★§2-1 の禁止語）', () => {
    expect(offenders('購入')).toEqual([]);
  });

  it('★対照: ★走査が ★註記を除いた原文を ★実際に読んでいる', () => {
    /** ★開発用の画面は ★除いている（★rig-lab は「購入リグ」を表示するが 本番は 404） */
    expect(devDirs().some((d) => d.endsWith(`${path.sep}rig-lab`)), '★開発用の画面を除けていない').toBe(true);
    /** ★註記の中の語は ★拾わない／★文字列の中の語は ★拾う */
    expect(strip('/* 中継 */ const a = 1;')).not.toContain('中継');
    expect(strip("const a = '中継'; // 中継")).toContain("'中継'");
    expect(strip("const a = '中継'; // 中継").match(/中継/g)?.length).toBe(1);
    /** ★実物の語を 1 つ ★拾えること（★常に空を返す走査ではない） */
    expect(offenders('レースを見る').length, '★走査が何も読んでいない').toBeGreaterThan(0);
  });
});
