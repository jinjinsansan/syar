/**
 * ★**staging の DB に繋いだ画面を 手元で立てる**（★ログインした姿を測るため・2026-09-29・レビュー側）
 *
 * 【★なぜ】 ★390px の実測（⑨・沈み・明度）は ★すべて未ログインの姿だった（簿 LAYOUT-AUDIT-LOGGED-OUT-ONLY）。
 *   ★本番の画面は本番の DB に繋がっていて ★本番の口座は使わない（★オーナーの資格情報を持たない）→ ★staging に繋いだ画面を別に立てる。
 *
 * 【★決まり】
 *   ★繋ぎ先は ★`--env staging` の SUPABASE_URL / SUPABASE_ANON_KEY だけ（★本番の値を渡す道は作らない・`--env production` は止める）。
 *   ★出力先は `.next-staging`・★口は 3211（★オーナーの dev（3210・.next）と奪い合わない）。
 *   ★秘密は 表示しない（★繋ぎ先のホストだけ出す）。
 *
 *   node tools/dev-web-staging.mjs --env staging
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadEnv } from './lib/env.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { NEXT_REWRITES } from './lib/next-rewrites.mjs';

const env = loadEnv();
if (env.STAR_ENV !== 'staging') {
  console.error(`★staging 以外には繋ぎません（STAR_ENV=${env.STAR_ENV}）`);
  process.exit(2);
}
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.error('★SUPABASE_URL / SUPABASE_ANON_KEY が staging の env に無い');
  process.exit(2);
}
const PORT = '3211';
console.log(`★繋ぎ先: ${new URL(env.SUPABASE_URL).host}（staging）・★口 ${PORT}・★出力先 .next-staging`);
/**
 * ★`next dev` は ★追跡ファイル 2 つ（tsconfig.json・next-env.d.ts）を ★出力先に合わせて書き換える（`tools/lib/next-rewrites.mjs`）。
 *   ★dev の間に戻すと ★next が tsconfig を見張っていて 書き換え直す → ★止めたときに 写しから戻す。
 */
const saved = new Map(NEXT_REWRITES.filter((f) => existsSync(f)).map((f) => [f, readFileSync(f, 'utf8')]));
const restore = () => { for (const [f, text] of saved) if (readFileSync(f, 'utf8') !== text) { writeFileSync(f, text); console.log(`★戻した: ${f}`); } };
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '-p', PORT], {
  cwd: path.resolve('apps/web'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    STAR_NEXT_DIST_DIR: '.next-staging',
  },
});
child.on('exit', (code) => { restore(); process.exit(code ?? 0); });
