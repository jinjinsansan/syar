/**
 * A-6「自馬ベット制限が効く」（正典 §9.5・八百長利得の遮断装置）を実 DB で確かめる。
 *   ① 自馬が出るレースで、自馬絡みでない買い目が**買えない**
 *   ② 自馬絡みでも 5,000 EP を超えられない
 *   ③ 自馬が出ていないレースでは通常どおり買える（制限が広すぎないこと）
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const uid='00000000-0000-4000-8000-00000000a6a6';
// ★パラメータを使う SQL と使わない SQL を混ぜて一律に [uid] を渡すと
//   exec_bind_message で落ちる（bind するパラメータ数が合わない）。個別に呼ぶ。
const clean = async () => {
  await c.query(`delete from ep_ledger where user_id=$1`, [uid]);
  await c.query(`delete from bets where user_id=$1`, [uid]);
  await c.query(`delete from race_entries where race_id in (select id from races where name like 'A6-%')`);
  await c.query(`delete from race_odds where race_id in (select id from races where name like 'A6-%')`);
  await c.query(`delete from horses where owner_id=$1`, [uid]);
  await c.query(`delete from races where name like 'A6-%'`);
  await c.query(`delete from users where id=$1`, [uid]);
};
await clean();
await c.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','a6@test.local','x',now(),now()) on conflict (id) do nothing`,[uid]);
await c.query(`insert into users (id,display_name,stable_name,entry_points) values ($1,'A6','A6牧場',1000000)`,[uid]);

const mkRace=async(n)=> (await c.query(`insert into races (name,class_rank,surface,distance,track_condition,course_id,scheduled_at,seed_commit,purse) values ($1,1,'turf',2000,'good','C1',now()+interval '1 hour','C',0) returning id`,[n])).rows[0].id;
const own=await mkRace('A6-OWN'), other=await mkRace('A6-OTHER');
const g={}; for(const [k,r] of [['own',own],['other',other]]) { for(const sel of ['[1]','[5]']) await c.query(`insert into race_odds (race_id,bet_type,selection,probability,odds) values ($1,'win',$2::jsonb,0.2,4.1)`,[r,sel]); g[k]=r; }

// 自馬（馬番1）を own レースに出す
const h=(await c.query(`insert into horses (owner_id,name,sex,birth_year,sire_line,genotype,potential,stats,unlock_rate,surface_aptitude,distance_center,distance_range,strategy_aptitude,heavy_aptitude,growth,temper,durability) values ($1,'ジバウマ','male',2026,'L-1','{}','{}','{}',0.3,'{}',2000,600,'{}',55,'normal',50,700) returning id`,[uid])).rows[0].id;
await c.query(`insert into race_entries (race_id,horse_id,gate,weight,strategy) values ($1,$2,1,55.0,'senko')`,[own,h]);

const asUser=async(sql,p)=>{ await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`,[uid]); return c.query(sql,p); };
const tok=()=>crypto.randomUUID();
const tryBuy=async(race,sel,amt)=>{ await c.query('begin'); try{ await asUser(`select place_bet($1,'win',$2::jsonb,$3,$4)`,[race,sel,amt,tok()]); await c.query('commit'); return 'OK'; }catch(e){ await c.query('rollback'); return e.message.split('\n')[0]; } };

const r1=await tryBuy(own,'[5]',1000);
console.log(`① 自馬レースで自馬絡みでない買い目: ${r1==='OK'?'⚠️ 買えてしまった':'拒否 → '+r1.slice(0,40)}`);
const r2=await tryBuy(own,'[1]',1000);
console.log(`② 自馬レースで自馬絡み 1,000EP: ${r2==='OK'?'OK（買える）':'⚠️ '+r2.slice(0,40)}`);
const r3=await tryBuy(own,'[1]',5000);
console.log(`③ 自馬レースで累計 6,000EP: ${r3==='OK'?'⚠️ 上限を超えられた':'拒否 → '+r3.slice(0,40)}`);
const r4=await tryBuy(other,'[5]',1000);
console.log(`④ 自馬が出ないレース: ${r4==='OK'?'OK（買える）':'⚠️ '+r4.slice(0,40)}`);
console.log(`\n★A-6: ${r1!=='OK'&&r2==='OK'&&r3!=='OK'&&r4==='OK'?'PASS':'FAIL'}`);
await clean(); await c.end();
