// @ts-check
/**
 * 🔴 ★**馬の購入**（★`buy_horse`・`0070`・D-102）— ★入口を作る前の確かめ
 *   ★レビュー側 承認の 3 条件: ★① EP 台帳の予行 ★② **本当に同時**の 2 件の購入 ★③ 動いてから入口
 *
 * 【★確かめること】
 *   ★① ★EP が ★**出品の額だけ**引かれ、★台帳の `balance_after` と残高が一致する
 *   ★② ★**再送で二度引かない**（★同じ `client_token`）
 *   ★③ 🔴 ★**本当に同時**（★別の接続 2 本）で ★同じ馬を買っても ★**1 件だけ通る**
 *   ★④ ★**別々の馬**を同時に買っても、★上限（現役 30 頭）を超えない
 *   ★⑤ ★他人の持ち馬・引退馬・出品されていない馬は買えない
 *   ★⑥ ★EP が足りなければ拒む（★`ST001`）
 *   ★⑦ ★PP に触らない（★D-102 ①）
 *
 * 【⚠️ ★③④ は「同時」でなければ意味がありません】
 *   ★同じ接続で 2 回 呼ぶと、★**2 回めは 1 回めの結果を見てしまいます**（★競り合いが起きません）。
 *   ★`0070` の註記自身が「★29 頭と数えて両方が通り、31 頭になる」穴を直したと書いています。
 *   → ★**接続を 2 本 張り、★同じ瞬間に投げます**（★`Promise.all`）。
 *   ⚠️ ★だから ★この 2 本は ★**サンドボックスで包めません**（★別の接続は同じ取引に入れない）。
 *      → ★③④ は ★**自分で作った馬と口座だけを触り、★最後に自分で消します**。
 *
 * ⚠️ ★**必ず `--env staging`**（★`loadEnv` の既定は本番）。
 *
 *   npx tsx tools/verify-buy-horse.mjs --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const main = new pg.Client({ connectionString: env.DATABASE_URL });
await main.connect();
await assertNotProduction(main, 'verify-buy-horse.mjs');

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
/** @param {pg.Client} c @param {string} s @param {unknown[]=} p @returns {Promise<any[]>} */
const q = async (c, s, p) => (await c.query(s, p)).rows;
/** @param {pg.Client} c @param {string} uid */
const asUser = async (c, uid) => {
  await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
};

/** ★片付けるもの（★最後に必ず消す） */
const made = { users: /** @type {string[]} */ ([]), listings: /** @type {string[]} */ ([]), horses: /** @type {string[]} */ ([]) };

/** ★口座を 1 つ作る */
async function mkUser(ep) {
  const uid = randomUUID();
  await main.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'x', now(), now())`,
    [uid, `buy-${uid.slice(0, 8)}@test.local`],
  );
  await main.query(
    `insert into users (id, display_name, stable_name, entry_points) values ($1, $2, $3, $4)`,
    [uid, `検査 ${uid.slice(0, 8)}`, '検査厩舎', ep],
  );
  made.users.push(uid);
  return uid;
}

/**
 * ★NPC の未出走馬を借りて出品する。
 * ⚠️ ★`horses` に列を発明しません（★NOT NULL の列が在る）。★既に在る馬を使います。
 */
async function listNpcHorse(price) {
  const h = (await q(main,
    `select h.id from horses h
      where h.owner_id is null and h.npc_stable_id is not null and h.retired_at_week is null
        and not exists (select 1 from horse_market_listing l where l.horse_id = h.id and l.active)
      limit 1 for update skip locked`,
  ))[0];
  if (h === undefined) throw new Error('★出品できる NPC 馬がいません');
  const row = (await q(main,
    `insert into horse_market_listing (horse_id, price_ep, active, sell_back_ep)
     values ($1, $2, true, $3) returning id`,
    [h.id, price, Math.floor(price / 3)],
  ))[0];
  made.listings.push(row.id);
  made.horses.push(h.id);
  return h.id;
}

try {
  const PRICE = 500;

  // ───── ① EP 台帳の予行 ─────
  const u1 = await mkUser(10_000);
  const horse1 = await listNpcHorse(PRICE);
  await asUser(main, u1);
  const token = randomUUID();
  await main.query('select buy_horse($1, $2)', [horse1, token]);

  const bal = Number((await q(main, 'select entry_points from users where id = $1', [u1]))[0].entry_points);
  must(bal === 10_000 - PRICE, `① 残高が ${10_000 - PRICE}（実測 ${bal}・★出品の額 ${PRICE} だけ引かれた）`);
  const led = (await q(main,
    `select delta, balance_after, reason from ep_ledger where dedupe_key = $1`, [`purchase:${token}`],
  ))[0];
  must(led !== undefined && Number(led.delta) === -PRICE, `① 台帳の delta が ${-PRICE}（実測 ${led?.delta}）`);
  must(led !== undefined && Number(led.balance_after) === bal, `① 台帳の balance_after (${led?.balance_after}) ＝ 残高 (${bal})`);
  must(led?.reason === 'horse_purchase', `① 台帳の理由が horse_purchase（実測 ${led?.reason}）`);
  const owner = (await q(main, 'select owner_id, npc_stable_id from horses where id = $1', [horse1]))[0];
  must(owner.owner_id === u1 && owner.npc_stable_id === null, '① 馬の持ち主が自分になり、NPC 厩舎から外れた');
  const stillListed = Number((await q(main,
    'select count(*)::int n from horse_market_listing where horse_id = $1 and active', [horse1],
  ))[0].n);
  must(stillListed === 0, `① 出品が閉じた（実測 ${stillListed} 件 まだ active）`);

  // ───── ② 再送で二度引かない ─────
  await main.query('select buy_horse($1, $2)', [horse1, token]);
  const bal2 = Number((await q(main, 'select entry_points from users where id = $1', [u1]))[0].entry_points);
  must(bal2 === bal, `② 同じ client_token を再送しても残高が変わらない（実測 ${bal2}）`);
  const rows2 = Number((await q(main,
    'select count(*)::int n from ep_ledger where dedupe_key = $1', [`purchase:${token}`],
  ))[0].n);
  must(rows2 === 1, `② 台帳は 1 行のまま（実測 ${rows2} 行）`);

  // ───── ⑦ PP に触っていない ─────
  const pp = Number((await q(main, 'select count(*)::int n from pp_ledger where user_id = $1', [u1]))[0].n);
  must(pp === 0, `⑦ PP の台帳に 1 行も書いていない（実測 ${pp} 行・★D-102 ①）`);

  // ───── ⑥ EP 不足 ─────
  const poor = await mkUser(10);
  const horse2 = await listNpcHorse(PRICE);
  await asUser(main, poor);
  let short = false;
  try { await main.query('select buy_horse($1, $2)', [horse2, randomUUID()]); }
  catch (e) { short = e instanceof Error && /ST001|不足/.test(`${e.message}${/** @type {any} */ (e).code ?? ''}`); }
  must(short, '⑥ EP が足りなければ拒む（★ST001）');

  // ───── ⑤ 買えないもの ─────
  await asUser(main, u1);
  let mine = false;
  try { await main.query('select buy_horse($1, $2)', [horse1, randomUUID()]); }
  catch (e) { mine = e instanceof Error && /出品されていません/.test(e.message); }
  must(mine, '⑤ 出品されていない馬（★自分が買った直後の馬）は買えない');

  // ───── ③ 🔴 本当に同時に、同じ馬を 2 人が買う ─────
  const a = await mkUser(10_000);
  const b = await mkUser(10_000);
  const contested = await listNpcHorse(PRICE);
  const ca = new pg.Client({ connectionString: env.DATABASE_URL });
  const cb = new pg.Client({ connectionString: env.DATABASE_URL });
  await ca.connect(); await cb.connect();
  await asUser(ca, a); await asUser(cb, b);
  const results = await Promise.allSettled([
    ca.query('select buy_horse($1, $2)', [contested, randomUUID()]),
    cb.query('select buy_horse($1, $2)', [contested, randomUUID()]),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const why = results.filter((r) => r.status === 'rejected')
    .map((r) => /** @type {any} */ (r).reason?.message?.split('\n')[0] ?? '').join(' / ');
  must(ok === 1, `③ 同時に同じ馬を買って ★**1 件だけ通る**（実測 ${ok} 件 成功）${why === '' ? '' : ` — 落ちた側: ${why}`}`);
  const finalOwner = (await q(main, 'select owner_id from horses where id = $1', [contested]))[0].owner_id;
  must(finalOwner === a || finalOwner === b, '③ 持ち主がどちらか 1 人になっている');
  const paid = await q(main,
    `select user_id, delta from ep_ledger where ref_id = $1 and reason = 'horse_purchase'`, [contested]);
  must(paid.length === 1, `③ 引き落としも 1 件だけ（実測 ${paid.length} 件）`);
  must(paid[0]?.user_id === finalOwner, '③ 払ったのは持ち主になった人（★別人から引いていない）');

  /**
   * ───── ④ 🔴 ★**別々の馬を同時に買って、上限（現役 30 頭）を超えない** ─────
   *
   * ★これが ★`0070` が直した穴そのものです。★あの註記が自分でこう書いています:
   *   「★どちらも 29 頭と数えて両方が通り、★**31 頭になる**（★別々の馬なので馬の行のロックでは止まらない）」
   * → ★`0070` は ★**利用者の行を、数える前にロック**しました。★それが効いているかを見ます。
   *
   * ⚠️ ★同じ馬なら ★馬の行のロックで止まるので、★**別々の馬でなければ意味がありません**。
   */
  const limiter = await mkUser(10_000);
  /** ★29 頭 持たせる（★NPC の馬を借りる。★列を発明しない） */
  const borrowed = (await q(main,
    `select h.id from horses h
      where h.owner_id is null and h.npc_stable_id is not null and h.retired_at_week is null
      limit 29 for update skip locked`,
  )).map((r) => r.id);
  must(borrowed.length === 29, `④ 前提: 29 頭 借りられた（実測 ${borrowed.length} 頭）`);
  for (const id of borrowed) {
    await main.query('update horses set owner_id = $2, npc_stable_id = null where id = $1', [id, limiter]);
    made.horses.push(id);
  }
  const active29 = Number((await q(main,
    'select count(*)::int n from horses where owner_id = $1 and retired_at_week is null', [limiter],
  ))[0].n);
  must(active29 === 29, `④ 前提: 現役 29 頭（実測 ${active29} 頭・★あと 1 頭で上限）`);

  const horseX = await listNpcHorse(PRICE);
  const horseY = await listNpcHorse(PRICE);
  const cx = new pg.Client({ connectionString: env.DATABASE_URL });
  const cy = new pg.Client({ connectionString: env.DATABASE_URL });
  await cx.connect(); await cy.connect();
  await asUser(cx, limiter); await asUser(cy, limiter);
  const two = await Promise.allSettled([
    cx.query('select buy_horse($1, $2)', [horseX, randomUUID()]),
    cy.query('select buy_horse($1, $2)', [horseY, randomUUID()]),
  ]);
  const okTwo = two.filter((r) => r.status === 'fulfilled').length;
  const whyTwo = two.filter((r) => r.status === 'rejected')
    .map((r) => /** @type {any} */ (r).reason?.message?.split('\n')[0] ?? '').join(' / ');
  must(okTwo === 1,
    `④ ★**別々の馬**を同時に買って ★1 件だけ通る（実測 ${okTwo} 件）${whyTwo === '' ? '' : ` — 落ちた側: ${whyTwo}`}`);
  const finalActive = Number((await q(main,
    'select count(*)::int n from horses where owner_id = $1 and retired_at_week is null', [limiter],
  ))[0].n);
  must(finalActive === 30, `④ 🔴 ★現役が ★**30 頭で止まった**（実測 ${finalActive} 頭。★31 なら 0070 の直しが効いていない）`);
  await cx.end(); await cy.end();
  await ca.end(); await cb.end();
} finally {
  // ───── 片付け（★戻り値でなく DB で確かめる）─────
  console.log('  ---- 片付け ----');
  for (const id of made.listings) await main.query('delete from horse_market_listing where id = $1', [id]);
  for (const id of made.horses) {
    await main.query(
      `update horses set owner_id = null, npc_stable_id = (select min(id) from npc_stables) where id = $1`, [id],
    );
  }
  for (const id of made.users) {
    await main.query('delete from ep_ledger where user_id = $1', [id]);
    await main.query('delete from users where id = $1', [id]);
    await main.query('delete from auth.users where id = $1', [id]);
  }
  const left = {
    listing: Number((await q(main, 'select count(*)::int n from horse_market_listing where id = any($1)', [made.listings]))[0].n),
    users: Number((await q(main, 'select count(*)::int n from users where id = any($1)', [made.users]))[0].n),
    owned: Number((await q(main, 'select count(*)::int n from horses where id = any($1) and owner_id is not null', [made.horses]))[0].n),
  };
  console.log(`  ✅ 片付きました（出品 ${left.listing} / 口座 ${left.users} / 持ち主つき馬 ${left.owned}）`);
  if (left.listing + left.users + left.owned > 0) { console.log('  🔴 ★残っています'); failed += 1; }
  await main.end();
}

console.log(failed === 0 ? '\n✅ すべて通りました' : `\n🔴 ${failed} 件 落ちました`);
process.exit(failed === 0 ? 0 : 1);
