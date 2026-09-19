/**
 * A-7「staging ワーカーが production DB に繋ぐと起動失敗する」を実 DB で確かめる。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { readDbEnvironment } from '../apps/worker/src/pg-store.ts';
import { assertEnvironmentMatches } from '../apps/worker/src/env.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';
import { takeSnapshot, readSnapshot, dropSnapshot } from './lib/snapshot-file.mjs';
import { RESTORE_A7 } from './lib/tool-restores.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-a7.mjs');

const check = (declared, onDb) => { try { assertEnvironmentMatches(declared, onDb); return 'OK'; } catch (e) { return e.message.split('。')[0]; } };

// ★★元の宣言を控えてから壊す。
//   以前この後始末が `development` の固定値だった。**現在の DB は production 宣言**なので、
//   このスクリプトを流すだけで**次の再起動からワーカーが起動しなくなる**状態でした
//   （A-7 のガードが正しく働くぶん、確実に止まります）。
//   「この DB は development」という**古い前提**がコメントごと残っていたのが原因です。
/**
 * 🔴 ★**前の実行が残した控えを、★何より先に戻す**（★**SB-6**・2026-09-19）。
 *
 * 🔴 ★**ここを元の宣言を読むより前に置くこと。**
 *   ★前回が殺されていると `app_environment` は空で、
 *   ★そのまま読むと `original = null` になり、★**「元から無かった」と誤認して
 *   ★空のまま確定させます**。★順番がこの道具の安全です。
 *
 * ⚠️ ★`assertNotProduction` は上で通していますが、★それも `app_environment` を読みます。
 *   ★空だとそこで投げるので、★その場合はこの行まで来ません —
 *   ★そのときは ** 手で戻す**ことになります（★控えは `tmp/snapshots/verify-a7.json`）。
 *   🔴 ★**その手順を下の案内に出します。**
 */
const leftA7 = readSnapshot(RESTORE_A7.snapshot);
if (leftA7 !== null) {
  const { rows } = await RESTORE_A7.restore(c, leftA7.data);
  console.log(`★前の実行（${leftA7.takenAt}）の控えから宣言を戻しました: ${leftA7.data.environment ?? '（無し）'}（${rows} 行）`);
  dropSnapshot(RESTORE_A7.snapshot);
}

const original = (await c.query(`select environment from app_environment`)).rows[0]?.environment ?? null;
console.log(`（元の宣言: ${original ?? 'なし'}）`);

/**
 * 🔴 ★**壊す前に、★プロセスの外へ控える**（★**SB-6**）。
 * ⚠️ ★下の `original`（メモリ）はそのまま使いますが、★**それは控えではありません**。
 *   ★控えはこのファイルのほうです。★メモリは SIGKILL で消えます。
 */
takeSnapshot(RESTORE_A7.snapshot, { environment: original });

const restore = async () => {
  await c.query(`delete from app_environment`);
  if (original !== null) {
    await c.query(`insert into app_environment (singleton, environment) values (true,$1)`, [original]);
  }
};
// ★異常終了しても必ず戻す（R-18）。戻せないと本番が起動しなくなる
let done = false;
const bail = async (why) => {
  if (done) return;
  done = true;
  try { await restore(); console.error(`
★${why} で中断。宣言を ${original} に戻しました`); }
  finally { process.exit(1); }
};
for (const sig of ['SIGINT','SIGTERM','SIGHUP']) process.on(sig, () => void bail(sig));
process.on('uncaughtException', (e) => void bail(`例外(${e.message})`));

// ① 宣言が無い状態
await c.query(`delete from app_environment`);
const none = await readDbEnvironment(c);
console.log(`① DB に宣言なし: 読み取り=${none} → ${check('production', none)}`);

// ② production を宣言。staging ワーカーが繋ぐ
await c.query(`insert into app_environment (singleton, environment) values (true,'production')`);
const onDb = await readDbEnvironment(c);
console.log(`② DB=production / ワーカー=staging → ${check('staging', onDb)}`);
console.log(`③ DB=production / ワーカー=production → ${check('production', onDb)}`);

const ok = none === null && check('production', none) !== 'OK' && check('staging', onDb) !== 'OK' && check('production', onDb) === 'OK';
console.log(`\n★A-7: ${ok ? 'PASS' : 'FAIL'}`);

// ★元の宣言に戻す（固定値を書かない）
await restore();
done = true;
const back = (await c.query(`select environment from app_environment`)).rows[0]?.environment ?? null;
console.log(`★後片付け: 宣言を ${back} に戻しました（元 ${original}）`);
/**
 * 🔴 ★**戻ったことを確かめてから控えを捨てる**（★**SB-6**）。
 *   ★戻っていなければ ** わざと残します** — ★残骸が「まだ戻っていない」の印です。
 */
if (back === original) {
  dropSnapshot(RESTORE_A7.snapshot);
} else {
  console.log(`🔴 ★控えを残します（tmp/snapshots/${RESTORE_A7.snapshot}.json） — ★次の実行が戻します。`);
  console.log('   ★もし他の道具も起動しないなら、★そのファイルの environment を app_environment に手で入れてください。');
}
await c.end();
if (!ok || back !== original) process.exit(1);
