/**
 * ★**いまどこに繋いでいるかが見えること**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §14-3）
 *
 * 【🔴 ★見ている壊れ方】
 *   ① 🔴 ★**本番の配信に帯が出る**（★利用者に開発用の表示が見える）
 *   ② 🔴 ★**帯が「名札」を印刷している** — ★`STAR_ENV=staging` のような人が置いた値を出すと、
 *      ★**名札だけ直して中身が本番のまま**という事故を見逃す
 *   ③ ★**帯が読む環境変数が、クライアントが実際に使うものと違う**（★指す先がずれる）
 *   ④ ★**URL が壊れていると画面が落ちる**（★帯のために本体を落とさない）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { connectedToOf } from '../../web/src/lib/connected-to.js';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const LIB = readFileSync(path.join(ROOT, 'apps/web/src/lib/connected-to.ts'), 'utf8');
const BANNER = readFileSync(path.join(ROOT, 'apps/web/src/components/connected-banner.tsx'), 'utf8');
const SUPABASE = readFileSync(path.join(ROOT, 'apps/web/src/lib/supabase.ts'), 'utf8');
const LAYOUT = readFileSync(path.join(ROOT, 'apps/web/src/app/layout.tsx'), 'utf8');
const CONFIG = readFileSync(path.join(ROOT, 'apps/web/next.config.mjs'), 'utf8');

describe('★繋ぎ先が見えること（★裁定 §14）', () => {
  it('★URL から ホストと識別子を取り出す', () => {
    const a = connectedToOf('https://abcdefghijklmnop.supabase.co');
    expect(a.host).toBe('abcdefghijklmnop.supabase.co');
    expect(a.ref).toBe('abcdefghijklmnop');
  });

  it('④ ★壊れた URL・未設定でも投げない（★帯のために画面を落とさない）', () => {
    for (const bad of [undefined, null, '', 'not a url', '://']) {
      const r = connectedToOf(bad);
      expect(r.host).toBe(null);
      expect(r.ref).toBe(null);
    }
  });

  it('① 🔴 ★本番の配信では出さない（★NODE_ENV で止める）', () => {
    expect(strip(LIB)).toMatch(/NODE_ENV !== 'production'/);
    expect(strip(BANNER)).toMatch(/showConnectedBanner\(\)/);
    // ★帯の本体より前に、出すかどうかの判断がある
    const live = strip(BANNER);
    expect(live.indexOf('showConnectedBanner')).toBeLessThan(live.indexOf('position:'));
  });

  it('② 🔴 ★名札を印刷していない（★環境の名前を持つ変数を読んでいない）', () => {
    const live = strip(LIB) + strip(BANNER);
    for (const label of ['STAR_ENV', 'NEXT_PUBLIC_ENV', 'VERCEL_ENV', 'APP_ENV']) {
      expect(live, `★名札（${label}）を読んでいる`).not.toMatch(new RegExp(label));
    }
    // ★「production」「staging」という語を、画面に出す文字として持っていない
    expect(strip(BANNER)).not.toMatch(/'production'|"production"|'staging'|"staging"/);
  });

  it('③ 🔴 ★クライアントが実際に使う環境変数と同じものを読む', () => {
    const used = /process\.env\['([A-Z_]*SUPABASE_URL)'\]/.exec(strip(SUPABASE));
    expect(used, '★supabase.ts が URL を読んでいる行が見つからない').not.toBe(null);
    expect(strip(LIB)).toMatch(new RegExp(`process\\.env\\['${used![1]!}'\\]`));
  });

  it('★帯が画面に入っている（★足したのに出していない、を防ぐ）', () => {
    expect(strip(LAYOUT)).toMatch(/<ConnectedBanner \/>/);
  });

  it('② 🔴 ★起動時の 1 行も、実際の URL から出す', () => {
    const live = strip(CONFIG);
    expect(live).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(live).toMatch(/new URL\(raw\)\.host/);
    // ★名札を出していない
    expect(live).not.toMatch(/STAR_ENV/);
  });
});
