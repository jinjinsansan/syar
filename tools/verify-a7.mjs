/**
 * A-7「staging ワーカーが production DB に繋ぐと起動失敗する」を実 DB で確かめる。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { readDbEnvironment } from '../apps/worker/src/pg-store.ts';
import { assertEnvironmentMatches } from '../apps/worker/src/env.ts';

const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

const check = (declared, onDb) => { try { assertEnvironmentMatches(declared, onDb); return 'OK'; } catch (e) { return e.message.split('。')[0]; } };

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

// 実運用の宣言に戻す（この DB は development）
await c.query(`delete from app_environment`);
await c.query(`insert into app_environment (singleton, environment) values (true,'development')`);
console.log(`（app_environment を development に設定しました）`);
await c.end();
