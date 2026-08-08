/**
 * ★公開ビューを anon で実際に叩いて確かめる（§14.3・§5.5）。
 *   「書いた」と「見えない」は別。A-4 と同じ形で実証する。
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const check = async (label, table, cols='*') => {
  const r = await anon.from(table).select(cols).limit(1);
  if (r.error) return { label, ok:false, msg: r.error.message.slice(0,50), row:null };
  return { label, ok:true, msg:`${r.data.length}行`, row: r.data[0] ?? null };
};

console.log('=== ★見えるべきもの ===');
for (const [l,t] of [['レース一覧','races_public'],['出馬表','race_entries_public'],['オッズ','race_odds_public']]) {
  const r = await check(l,t);
  console.log(`  ${l.padEnd(10)} ${r.ok?'見える':'★見えない'} ${r.msg}`);
  if (r.row) console.log(`    列: ${Object.keys(r.row).join(', ')}`);
}

console.log('\n=== ★見えてはいけないもの ===');
for (const [l,t] of [['races（実体）','races'],['race_entries（実体）','race_entries'],['race_odds（実体）','race_odds'],['horses（素質が入る）','horses']]) {
  const r = await check(l,t);
  console.log(`  ${l.padEnd(22)} ${r.ok?'★見えてしまう':'拒否'} ${r.ok?'':r.msg}`);
}

console.log('\n=== ★列の中身 ===');
const e = await anon.from('race_entries_public').select('*').limit(1);
if (!e.error && e.data[0]) {
  const k = Object.keys(e.data[0]);
  console.log(`  出馬表に intervention_log が無い: ${!k.includes('intervention_log')}`);
  console.log(`  出馬表に cap_violations が無い:  ${!k.includes('cap_violations')}`);
  console.log(`  出馬表に horse_id が無い:        ${!k.includes('horse_id')}`);
}
const o = await anon.from('race_odds_public').select('*').limit(1);
if (!o.error && o.data[0]) {
  console.log(`  オッズに probability が無い:     ${!Object.keys(o.data[0]).includes('probability')}`);
}
