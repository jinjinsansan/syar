/**
 * ★**配備された画面が どの DB を向いているか**を ★束から読む（★読むだけ・2026-09-29・簿 PREVIEW-DEPLOYS-USE-PRODUCTION-DB）
 *
 * 【★なぜ】 ★Vercel の Preview が ★本番の DB を向いていた（★古いコード ＋ 本番のデータ）。★`NEXT_PUBLIC_*` は ★束を作るときに焼き込まれるので、
 *   ★環境変数を直しても ★**古い配備は古い値のまま**。★配備ごとに ★束の中身で確かめるしかない。
 * 【★何をする】 ★その URL の /login が読む束（`/_next/static/…js`）から ★`<ref>.supabase.co` を拾い、
 *   ★`--env staging|production` の SUPABASE_URL のホストと比べる（★秘密は出さない・ホストだけ）。★/api/healthz の env も出す。
 *
 *   node tools/verify-deployed-db-host.mjs --base <配備の URL> --env staging
 *   → ★終了コード 0 = 期待どおり ／ 1 = 違う DB を向いている ／ 2 = 分からない（束にホストが無い・読めない）
 */
import { loadEnv } from './lib/env.mjs';

const i = process.argv.indexOf('--base');
const BASE = i < 0 ? null : process.argv[i + 1];
if (!BASE) { console.error('★--base <配備の URL>（★既定を置かない）'); process.exit(2); }
const env = loadEnv();
const expected = new URL(env.SUPABASE_URL).host;

const health = await fetch(new URL('/api/healthz', BASE)).then((r) => r.json()).catch(() => null);
console.log(`★${BASE}: healthz env=${health?.env ?? '？'} sha=${String(health?.sha ?? '？').slice(0, 7)}`);
const html = await fetch(new URL('/login', BASE)).then((r) => r.text()).catch(() => '');
const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"\\]+\.js/g)].map((m) => m[0]))];
const hosts = new Set();
for (const c of chunks) {
  const js = await fetch(new URL(c, BASE)).then((r) => r.text()).catch(() => '');
  for (const m of js.matchAll(/[a-z0-9]{20}\.supabase\.co/g)) hosts.add(m[0]);
}
console.log(`★束 ${chunks.length} 本から見つけた DB のホスト: ${[...hosts].join('・') || '無し'}`);
console.log(`★期待（--env ${env.STAR_ENV}）: ${expected}`);
console.log('終了コード: 0 = 期待どおり ／ 1 = 違う DB を向いている ／ 2 = 分からない');
if (hosts.size === 0) process.exit(2);
process.exit(hosts.size === 1 && hosts.has(expected) ? 0 : 1);
