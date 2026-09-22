/**
 * ★**運営が馬名を戻すときの部品**（★`tools/reset-horse-name.mjs`・`tools/verify-name-reset-live.mjs` が使う）。
 *   ★裁定 `REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md`（P-1〜P-5・§1・§2）。
 *
 *   ★`chooseNewName` … ★新しい名前を選ぶ純関数（★DB に触らない・★単体の試験で確かめる）
 *   ★`planNameReset` … ★読むだけ（★下見にも使う）
 *   ★`applyNameReset` … ★書く。★**`begin` / `commit` をしない**（★呼ぶ側が取引を張る・★予行が包んで必ず戻せる）
 *
 *   🔴 ★元の名前は ★出力しない・★記録に平文で残さない（★実在馬名・不快な語の可能性・憲法 §0.1）。★残すのはハッシュだけ（P-3）。
 *     ⚠️ ★`planNameReset` の戻り値の `oldName` は ★書き込みの競合よけ（`applyNameReset`）のためだけ。★呼ぶ側は表示しないこと。
 */
import {
  DEFAULT_NAME_SHAPE, Rng, generateHorseName, normalizeName, provisionalHorseName,
} from '../../packages/sim-engine/src/index.ts';
import { hashNormalizedName } from '../../apps/cli/src/name-blocklist.ts';
import { idAndSeedFromKey, stableOfNumericId } from '../../apps/worker/src/breeding-runner.ts';

/** ★戻す理由の語（★`0072` の check と同じ） */
export const RESET_REASONS = ['real_horse', 'offensive', 'person', 'trademark', 'other'];

/** ★仮の名前を引き直す上限（★ここまで重なったら投げる・★黙って重複を通さない） */
export const PROVISIONAL_MAX_ATTEMPTS = 50;

/**
 * ★**新しい名前を選ぶ**（★持ち主の有無で分ける・裁定 §2）。
 *   ★持ち主の居る馬 … ★仮の名前（`provisionalHorseName`・接頭辞 ＋ ID から決まるカタカナ）
 *   ★NPC の馬 … ★`generateHorseName` で普通の名前を引き直す（★NPC の仔の名付けと同じ関数・同じ一覧と重複の判定）
 *   ★どちらも ★一覧（`blocked`）と重複（`taken`）を通す（§1 条件 2）。
 *
 * @param {{ horseId: string, owned: boolean, stablePrefix: string, taken: ReadonlySet<string>,
 *           blocked: (normalized: string) => boolean, npcSeed: number }} o
 * @returns {{ name: string, key: string }}
 */
export function chooseNewName(o) {
  if (o.owned) {
    for (let k = 0; k < PROVISIONAL_MAX_ATTEMPTS; k += 1) {
      const name = provisionalHorseName(o.horseId, k);
      const key = normalizeName(name);
      if (!o.taken.has(key) && !o.blocked(key)) return { name, key };
    }
    throw new Error(`★仮の名前が ${PROVISIONAL_MAX_ATTEMPTS} 回 重なりました（馬 ${o.horseId}）`);
  }
  // ★`generateHorseName` は `taken` に書き足すので ★写しを渡す
  const r = generateHorseName(new Rng(o.npcSeed), { ...DEFAULT_NAME_SHAPE, prefix: o.stablePrefix }, new Set(o.taken), o.blocked);
  return { name: r.name, key: normalizeName(r.name) };
}

/**
 * ★**読むだけ**: ★馬と ★新しい名前を決める（★下見・★書く前の両方で使う）。
 * @param {import('pg').ClientBase} client
 * @param {string} horseId
 * @param {{ blocked: (k: string) => boolean, version: string | null }} checks ★`loadNameChecks` の結果
 */
export async function planNameReset(client, horseId, checks) {
  const h = (await client.query(
    'select id::text id, owner_id::text owner_id, name, name_key, npc_stable_id from horses where id = $1', [horseId],
  )).rows[0];
  if (h === undefined) throw new Error(`★馬が存在しません（${horseId}）`);
  const oldKey = h.name_key ?? normalizeName(h.name);
  // ★使用済みの名前（★この馬の今の名前は除く）。★name_key が空の行も名前で数える
  const taken = new Set((await client.query('select id::text id, name from horses')).rows
    .filter((r) => r.id !== h.id).map((r) => normalizeName(r.name)));
  const resets = Number((await client.query(
    'select count(*)::int n from horse_name_resets where horse_id = $1', [h.id],
  )).rows[0].n);
  // ★NPC の名前の種は ★ID と「何回目の戻しか」から（★同じ馬を 2 回戻したら ★別の名前になる）
  const { seed } = await idAndSeedFromKey(`${h.id}|rename|${resets}`);
  const owned = h.owner_id !== null;
  const chosen = chooseNewName({
    horseId: h.id, owned, stablePrefix: stableOfNumericId(h.npc_stable_id === null ? null : Number(h.npc_stable_id)).prefix,
    taken, blocked: checks.blocked, npcSeed: seed,
  });
  return {
    horseId: h.id,
    owned,
    oldName: h.name,
    oldHash: hashNormalizedName(oldKey),
    oldBlocked: checks.blocked(oldKey),
    newName: chosen.name,
    newKey: chosen.key,
    checkedWith: checks.version,
  };
}

/**
 * ★**書く**（★`begin` / `commit` をしない）。★名前を変え、★記録を 1 行足し、★読み直して確かめる。
 * @param {import('pg').ClientBase} client
 * @param {Awaited<ReturnType<typeof planNameReset>>} plan
 * @param {{ reason: string, note: string | null }} why
 */
export async function applyNameReset(client, plan, why) {
  if (!RESET_REASONS.includes(why.reason)) throw new Error(`★理由の語が不正（${why.reason}）`);
  // ★読んだ後に名前が変わっていたら書かない（★競合よけ）
  const upd = await client.query(
    'update horses set name = $2, name_key = $3, name_checked_with = $4 where id = $1 and name = $5',
    [plan.horseId, plan.newName, plan.newKey, plan.checkedWith, plan.oldName],
  );
  if (upd.rowCount !== 1) throw new Error('★名前が読んだ後に変わっていました（★書きません）');
  await client.query(
    'insert into horse_name_resets (horse_id, owned, reason, note, old_name_hash, new_name, checked_with)'
      + ' values ($1, $2, $3, $4, $5, $6, $7)',
    [plan.horseId, plan.owned, why.reason, why.note, plan.oldHash, plan.newName, plan.checkedWith],
  );
  const back = (await client.query('select name, name_key from horses where id = $1', [plan.horseId])).rows[0];
  if (back.name !== plan.newName || back.name_key !== plan.newKey) throw new Error('★読み直した名前が合いません');
}
