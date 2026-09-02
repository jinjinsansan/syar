/**
 * ★**本番で動いているのが、手元のどのコミットかを突き合わせる**（★読取専用・正典 R-28）
 *
 * 【★なぜ要るか — ★2026-09-02 の事故】
 *   ★`main` が **13 日間** 止まっており、★本番はそこから作られていました。
 *   ★P4 の作業は ★**1 つも本番に出ていませんでした。**
 *   ★気づいたのは ★**オーナーが「ナレーターの絵が古い」と言ったから**です。
 *   ★検定も型も全部緑でした（★測っていたのはリポジトリであって、★本番ではありません）。
 *
 * ⚠️ ★**「開く」だけでは分かりません。** ★古いビルドも 200 を返し、★絵も出ます。
 *    ★違いは ★**中身を知っている人にしか見えません**。★だから機械で突き合わせます。
 *
 * ⚠️ ★**手で回す道具に置いたゲートは、回さなかった日から静かに外れます**（R-32）。
 *    ★この道具は ★**push のたびに回すこと。** ★検定に入れられないのは、
 *    ★検定が本番へ出られない（★出てはいけない）ためです。
 *
 * 【★DB に触りません】★HTTP で 1 本読むだけです。
 *
 * 使い方:
 *   npx tsx tools/verify-deployed-build.mjs --base https://star-two-chi.vercel.app
 *   npx tsx tools/verify-deployed-build.mjs --base <URL> --expect <SHA>
 */
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = arg('base', process.env.AUDIT_BASE ?? '');
if (BASE === '') {
  console.error('★--base <本番URL> か AUDIT_BASE が要ります');
  process.exit(2);
}

/** ★手元の HEAD。★引数で上書きできます（★別の枝と突き合わせたいとき） */
const expected = arg('expect', execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());

const url = `${BASE.replace(/\/$/, '')}/api/healthz`;
console.log(`★手元の HEAD : ${expected}`);
console.log(`★問い合わせ先 : ${url}`);

let body;
try {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) {
    /**
     * ⚠️ ★**404 は「口が無い」であって「一致しない」ではありません。**
     *    ★この口を入れる前のビルドが動いている、という意味です（★それ自体が答えです）。
     */
    console.error(`★★${res.status} が返りました。★この口より前のビルドが動いています`);
    process.exit(1);
  }
  body = await res.json();
} catch (e) {
  console.error(`★★届きませんでした: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const { sha, ref, env, at } = body;
console.log(`★本番の SHA  : ${sha ?? '（出ていません）'}`);
console.log(`★枝 / 環境    : ${ref ?? '—'} / ${env ?? '—'}　（応答時刻 ${at ?? '—'}）`);

/**
 * ⚠️ ★**`sha` が無いときは「一致」と言いません**（R-3・判定不能は FAIL へ）。
 *    ★Vercel 以外で動いている／システム環境変数が切られている、のどちらかです。
 */
if (typeof sha !== 'string' || sha.length < 7) {
  console.error('\n★★本番が SHA を出していません。★判定できないので、通しません');
  process.exit(1);
}
if (sha !== expected) {
  console.error(`\n★★食い違っています。★本番は手元と別のコミットです`);
  console.error(`   ★手元 ${expected.slice(0, 12)} ／ ★本番 ${sha.slice(0, 12)}`);
  console.error('   ★push が済んでいないか、★ビルドがまだか、★別の枝から作られています');
  process.exit(1);
}
console.log('\n★一致しました。★本番は手元と同じコミットです');
