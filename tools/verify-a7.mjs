/**
 * A-7「staging ワーカーが production DB に繋ぐと起動失敗する」を実 DB で確かめる。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { readDbEnvironment } from '../apps/worker/src/pg-store.ts';
import { assertEnvironmentMatches } from '../apps/worker/src/env.ts';

import { assertNotProduction } from './lib/guard.mjs';
const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
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
const original = (await c.query(`select environment from app_environment`)).rows[0]?.environment ?? null;
console.log(`（元の宣言: ${original ?? 'なし'}）`);

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
await c.end();
if (!ok || back !== original) process.exit(1);
