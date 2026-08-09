/**
 * A-4 の完全実証（正典 §8.6・合格基準「実際に叩いて確認」）:
 * anon / authenticated から races_public を引き、
 *   - scheduled の行では seed_reveal が null
 *   - settled の行では seed_reveal が見える
 * ことを確認する。★実体テーブル races が直接引けないことも確認する。
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

import { assertNotProduction } from './lib/guard.mjs';
const env = Object.fromEntries(
  readFileSync('secrets.local.env', 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

// --- 準備: service_role で scheduled と settled を1件ずつ作る ---
const admin = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await admin.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(admin, 'verify-a4.mjs');

await admin.query(`delete from races where name in ('A4-SCHEDULED','A4-SETTLED')`);
const mk = async (name, status, reveal) =>
  admin.query(
    `insert into races (name,class_rank,surface,distance,track_condition,course_id,scheduled_at,seed_commit,seed_reveal,status,purse)
     values ($1,1,'turf',2000,'good','C1',now()+interval '1 hour','COMMIT-VALUE',$2,$3,1000)`,
    [name, reveal, status],
  );
await mk('A4-SCHEDULED', 'scheduled', null);
await mk('A4-SETTLED', 'settled', 'REVEAL-VALUE');

// --- 検証: anon key（未ログイン = anon ロール）で引く ---
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const pub = await anon.from('races_public').select('name,status,seed_commit,seed_reveal')
  .in('name', ['A4-SCHEDULED', 'A4-SETTLED']);
console.log('races_public:', pub.error ? `ERROR ${pub.error.message}` : JSON.stringify(pub.data));

const raw = await anon.from('races').select('name,seed_reveal').limit(1);
console.log('races（実体テーブル）:', raw.error ? `拒否 → ${raw.error.message.slice(0, 60)}` : `⚠️ 引けてしまった ${JSON.stringify(raw.data)}`);

// --- 判定 ---
const rows = pub.data ?? [];
const sched = rows.find((r) => r.name === 'A4-SCHEDULED');
const settled = rows.find((r) => r.name === 'A4-SETTLED');
const ok =
  sched !== undefined && sched.seed_reveal === null &&
  sched.seed_commit === 'COMMIT-VALUE' &&
  settled !== undefined && settled.seed_reveal === 'REVEAL-VALUE' &&
  raw.error !== null;
console.log(`\n★A-4: ${ok ? 'PASS' : 'FAIL'}`);
if (!ok) {
  console.log('  内訳:');
  console.log('   scheduled の seed_reveal が null:', sched?.seed_reveal === null);
  console.log('   scheduled でも seed_commit は見える:', sched?.seed_commit === 'COMMIT-VALUE');
  console.log('   settled の seed_reveal が見える:', settled?.seed_reveal === 'REVEAL-VALUE');
  console.log('   実体テーブルは引けない:', raw.error !== null);
}

await admin.query(`delete from races where name in ('A4-SCHEDULED','A4-SETTLED')`);
await admin.end();
