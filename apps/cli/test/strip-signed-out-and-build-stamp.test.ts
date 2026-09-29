/**
 * ★**未ログインの帯は 本編を開かない**／★**画面に版の印**（★2026-09-28・レビュー側の決定 (b)・版の印）
 *
 * 【★なぜ】
 *   ★未ログインの `/home` で ★帯が「録画を出せませんでした」と出していた（★本番・2 回見て 2 回）。
 *   ★本編（`/race?race=<id>&embed=strip`）は ★未ログインを「ログインしてください」で止める作り（`race-real.ts`）。
 *   ★帯は それを知らずに開いていた → ★**予測できる状態でエラーを出していた**（★レビュー側: 欠陥）。
 *   ★簡易版（side-v8）に落とす案は ★取り下げ（★オーナーが簡易版そのものを「でたらめ」と呼んだ）→ ★文字の帯だけ。
 *
 *   ★版の印: ★オーナーの画面写しが 現行と違い、★配信物の束を読むまで「古いタブ」と言えなかった。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★帯が ★出せる人かを見ずに 本編を開く（★未ログインでエラー）
 *   ② 🔴 ★「出せる人」の判定が ★2 か所に分かれる（★帯と読む層が食い違う）
 *   ③ 🔴 ★判定が 逆向きに壊れる（★ログインしていても 開かない）
 *   ④ 🔴 ★版の印と healthz が ★別々の出どころを読む
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './lib/ts-blocks.js';

const ROOT = path.resolve(__dirname, '../../..');
const src = (p: string): string => stripComments(readFileSync(path.join(ROOT, p), 'utf8'));

const state = vi.hoisted(() => ({ loggedIn: false }));
vi.mock('../../web/src/lib/supabase', () => {
  const client = (): unknown => ({
    auth: { getSession: async () => ({ data: { session: state.loggedIn ? { user: { id: 'u1' } } : null } }) },
  });
  return { readClient: client, authClient: client };
});
const { canPlayRealRace } = await import('../../web/src/lib/race-real-access');
const { buildStampOf } = await import('../../web/src/lib/healthz');

beforeEach(() => { state.loggedIn = false; });

describe('★出せる人の判定（`canPlayRealRace`）', () => {
  it('🔴 ① 未ログインは 出せない', async () => {
    expect(await canPlayRealRace()).toBe(false);
  });
  it('🔴 ③ 対照: ログインしていれば 出せる', async () => {
    state.loggedIn = true;
    expect(await canPlayRealRace()).toBe(true);
  });
});

describe('★帯: 出せない人には 本編を開かない', () => {
  const STRIP = src('apps/web/src/components/uma/race-strip.tsx');
  /** ★本編を開く effect の 頭の門 */
  const gateAt = STRIP.indexOf('if (!embedsHere || motionReduced');
  const openAt = STRIP.indexOf('setEmbed({ ...target, live: false');

  it('🔴 ① 本編を開く前の門に `canPlay !== true`（★分からない間も開かない）', () => {
    expect(gateAt, '★門が見つからない').toBeGreaterThan(0);
    expect(openAt, '★本編を開く所が見つからない').toBeGreaterThan(gateAt);
    const gate = STRIP.slice(gateAt, STRIP.indexOf('\n', gateAt));
    expect(gate).toContain('canPlay !== true');
    expect(gate).toContain('setEmbed(null)');
  });

  it('🔴 ② 帯の判定は 読む層と同じ関数（★帯が自分で session を見ない）', () => {
    expect(STRIP).toContain("from '../../lib/race-real-access'");
    expect(STRIP).toContain('canPlayRealRace()');
    expect(STRIP, '★帯が自前で session を見ている').not.toContain('getSession');
    /** ★帯から race-real を読むと ★レースの計算まで帯の荷に入る */
    expect(STRIP).not.toContain("from '../../lib/race-real'");
  });

  it('🔴 ② 読む層（`loadRealRace`）も 同じ関数・★止める文言も 1 か所', () => {
    const REAL = src('apps/web/src/lib/race-real.ts');
    expect(REAL).toContain('canPlayRealRace()');
    expect(REAL).toContain('REAL_RACE_SIGN_IN_MESSAGE');
    expect(REAL, '★読む層が自前で session を判定している').not.toMatch(/session\.data\.session === null/);
    expect(REAL, '★止める文言が写されている').not.toContain('自分の馬が出たレースの録画だけを出しています');
  });
});

describe('★版の印（`star-build`）と healthz は 同じ出どころ', () => {
  it('★`buildStampOf` は Vercel の自動の値だけを読む', () => {
    expect(buildStampOf({ VERCEL_GIT_COMMIT_SHA: 'abc', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_ENV: 'production' }))
      .toEqual({ sha: 'abc', ref: 'main', env: 'production' });
    expect(buildStampOf({})).toEqual({ sha: null, ref: null, env: null });
  });

  it('🔴 ④ healthz と layout は ★`buildStampOf` を通す（★環境変数を じかに読まない）', () => {
    const ROUTE = src('apps/web/src/app/api/healthz/route.ts');
    const LAYOUT = src('apps/web/src/app/layout.tsx');
    expect(ROUTE).toContain('buildStampOf(process.env)');
    expect(ROUTE).not.toContain('VERCEL_GIT_COMMIT_SHA');
    expect(LAYOUT).toContain("'star-build': buildStampOf(process.env).sha");
    expect(LAYOUT).not.toContain('VERCEL_GIT_COMMIT_SHA');
  });
});
