/**
 * ★**ログインした姿で測る**ための部品（★2026-09-29・レビュー側・簿 LAYOUT-AUDIT-LOGGED-OUT-ONLY）
 *
 * ★`tools/staging-measure-account.mjs` が書いたセッション（★staging の測定用の口座）を ★ブラウザの localStorage に入れる。
 *   ★supabase-js（v2）は ★`sb-<プロジェクト>-auth-token` に ★セッションをそのまま置く。
 * ⚠️ ★staging の画面（`tools/dev-web-staging.mjs`・3211）でだけ使う。★本番の画面に staging のセッションを入れても ★ログインにならない（★別の DB）。
 * ⚠️ ★読むだけ（★ブラウザの保存を書くだけ・DB に触らない）。
 */
import { readFileSync } from 'node:fs';

/** ★--session <ファイル> を読む（★無ければ null ＝ 未ログインの姿） */
export function readSessionArg(argv = process.argv) {
  const i = argv.indexOf('--session');
  if (i < 0) return null;
  const file = argv[i + 1];
  if (!file) throw new Error('★--session <ファイル> を渡してください');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof data?.projectRef !== 'string' || data?.session?.access_token === undefined) throw new Error(`★セッションの形が違う: ${file}`);
  return data;
}

/**
 * ★画面の源に 1 度開いて ★localStorage にセッションを入れ、★ログインしたかを確かめる（★入らなければ投げる）。
 * @param {{ goto: Function, evaluate: Function }} browser
 */
export async function injectSession(browser, base, data) {
  await browser.goto(`${base}/login`, "document.readyState==='complete'", { timeoutMs: 60000, settleMs: 1500 });
  const key = `sb-${data.projectRef}-auth-token`;
  await browser.evaluate(`(()=>{localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(data.session))});return true;})()`);
  const back = String(await browser.evaluate(`localStorage.getItem(${JSON.stringify(key)}) !== null`));
  if (back !== 'true') throw new Error('★セッションを入れられなかった');
  return key;
}

/** ★射程の 1 行（★どちらの姿で測ったか） */
export function scopeLine(data) {
  return data === null ? '★未ログインの姿' : `★ログインした姿（★staging の測定用の口座・${data.session.user?.email ?? '?'}）`;
}
