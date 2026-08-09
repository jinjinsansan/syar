/**
 * NPC 厩舎40を DB に投入する（正典 §4.8・§10.5）。
 * ★冪等: 何度実行しても同じ状態になる（on conflict do update）。
 *   ワーカーと同じ性質を運用スクリプトにも持たせます。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { NPC_STABLES } from '../packages/sim-engine/src/index.ts';

import { assertNotProduction } from './lib/guard.mjs';
const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'seed-stables.mjs');

let n = 0;
for (const s of NPC_STABLES) {
  // id は 'NPC01' 形式なので数値部分を取る
  const id = Number(s.id.replace(/\D/g, ''));
  await c.query(
    `insert into npc_stables (id, prefix, distance_bias, surface_bias, growth_bias, heavy, emphasis)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (id) do update set
       prefix = excluded.prefix, distance_bias = excluded.distance_bias,
       surface_bias = excluded.surface_bias, growth_bias = excluded.growth_bias,
       heavy = excluded.heavy, emphasis = excluded.emphasis`,
    [id, s.prefix, s.distance, s.surface, s.growth, s.heavy, s.emphasis],
  );
  n += 1;
}
const r = await c.query('select count(*)::int n from npc_stables');
console.log(`投入 ${n} 件 / DB 上 ${r.rows[0].n} 件`);

// ★憲法 §0.1 の確認: 冠名が実在の牧場名でないこと（すべて造語）
const p = await c.query('select prefix from npc_stables order by id limit 5');
console.log('冠名の例:', p.rows.map(x=>x.prefix).join(', '));
const dup = await c.query('select count(*)::int n from (select prefix from npc_stables group by 1 having count(*)>1) t');
console.log('★冠名の重複:', dup.rows[0].n, '件（0 でなければプレイヤーが血統を見分けられない）');
await c.end();
