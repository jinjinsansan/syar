/**
 * ★**`horses.pedigree_cache` の鍵を、★DB の id に直す**（★簿 `PEDIGREE-CACHE-IDS-NOT-DB-IDS`・2026-09-21）
 *
 *   ★分類: **STATE_CHANGING**（★`--apply` で書きます。★既定は ★**下見だけ**）
 *
 * ============================================================================
 * 【🔴 ★何が壊れているか】
 *   ★`tools/seed-world.mjs` は ★`Object.fromEntries(r.pedigreeCache)` を ★**そのまま**入れていました。
 *   ★プリシードの中の id（`NPC-F00014` など）が ★**そのまま鍵**になり、★`horses.id`（uuid）と
 *   ★一致しません。→ ★配合が `invalid input syntax for type uuid` で落ち、
 *     ★近交係数（§6.5）も 5 代血統の表示も ★**成立しません**。
 *
 * 【✅ ★なぜ「世界の作り直し」が要らないか】
 *   ★`sire_id` / `dam_id` は ★**正しい uuid で入っています**。
 *   ★`buildPedigreeCache(sire, dam, depth)` は ★**親の記録から子の写しを作る純関数**です。
 *   → ★★**親子の連鎖を辿り直せば、★写しは作り直せます。★馬もレースも失いません。**
 *
 * 【⚠️ ★ただし「辿り直せる」は ★**仮定**でした。★測ったら、★ずれが出ました】
 *   ✔ ★**staging の実測（2026-09-21・7,370 頭）**:
 *     ★形が食い違う ★**215 頭**。★その全部が ★**38 頭**で説明できました。
 *     ★その 38 頭は ★**親が投入されていません**（★`sire_id`/`dam_id` が `null`）。
 *   ✔ ★原因は ★**枝刈り**です（★`simulator.ts` 手順 8）。★生きている馬と、★その 5 代に出る祖先だけを
 *     ★残します。★**残った祖先のさらに親は残りません。** ★模擬としては正しい枝刈りです。
 *   → ★★**作り直した写しのほうが正しい**（★DB に居ない馬を指しません）。
 *     ★保存分は ★**DB に存在しない馬を 指していました**。
 *
 * 【★判定（★`counted-verdict`・★0 件 通過を合格にしない）】
 *   ★① ★`sire_id`/`dam_id` の指す行が DB に在る（★壊れた参照が無い）
 *   ★② 🔴 ★**説明できない食い違いが 0**（★食い違いは、★親を落とされた馬の子孫に限る）
 *   ★③ 🔴 ★**発明が 0**（★作り直しのほうが祖先が多い馬が、★1 頭も無い）
 *       ⚠️ ★これは ★**②の言い訳が効きません**。★全頭に課します（★**CK-16** の逆向き）
 *   ★④ ★作り直した鍵が ★**すべて uuid**（★これが直したかったこと）
 *   ★⑤ ★`inbreed_coeff` を作り直した写しから ★**再計算**して、★丸め（`numeric(6,5)`）か
 *       ★影響圏で説明しきれる
 *   ★⑥ ★`--apply` の後に ★**DB を読み直して**、★uuid でない鍵が 0 件であること
 *
 * 【★使い方】
 *   npx tsx tools/repair-pedigree-cache.mjs --env staging                 # ★下見（書きません）
 *   npx tsx tools/repair-pedigree-cache.mjs --env staging --apply
 *   npx tsx tools/repair-pedigree-cache.mjs --env production --apply \
 *       --yes-production --repair-pedigree --expect-broken <いまの壊れている頭数>
 *
 * 🔴 ★本番の関門は ★**旗 2 つ ＋ 写せない数 1 つ**です（★`seed-world` と同じ作法・★数は別物）。
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { productionRepairOptInProblem } from './lib/args.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import {
  buildPedigreeCache,
  calcInbreedCoefficient,
  DEFAULT_BALANCE,
} from '../packages/sim-engine/src/index.ts';

const DEPTH = DEFAULT_BALANCE.PEDIGREE_DEPTH;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * ★`inbreed_coeff` は `numeric(6,5)`。★DB は ★**5 桁に丸めて**持っています。
 * ⚠️ ★「差が 5e-6 以下なら丸め」とすると ★**境目で取り違えます**
 *    （★実測: 0.015625 → 0.01563 の差は 5.000000000000004e-06 で、★"5e-6 以下" を外れました。
 *     ★それで ★**271 頭が食い違い**に見え、★本当の食い違い 2 頭が埋もれました）。
 *    → ★★**丸めてから比べます。**
 */
const DECIMALS = 5;

const APPLY = process.argv.includes('--apply');
const YES_PRODUCTION = process.argv.includes('--yes-production');
const REPAIR_FLAG = process.argv.includes('--repair-pedigree');
/**
 * ★**`inbreed_coeff` も直すか**（★2026-09-21・レビュー側の裁定 ②「上書き」）。
 * ⚠️ ★**既定は直しません** — ★遊びに効く値を動かすので、★旗を立てたときだけ。
 */
const FIX_INBREED = process.argv.includes('--fix-inbreed');
const EXPECT_BROKEN = (() => {
  const i = process.argv.indexOf('--expect-broken');
  if (i < 0) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) ? n : null;
})();

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => {
  console.error(`🔴 ★接続が落ちました: ${e.message}`);
  process.exit(VERDICT.UNDECIDABLE);
});
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

const dbEnvironment = (await q('select environment from app_environment'))[0]?.environment ?? null;
console.log(`# ★血統の写しを直す  接続先の申告: ${dbEnvironment ?? '(不明)'}  /  ${
  APPLY ? '🔴 ★書きます（--apply）' : '★下見だけ（書きません）'}`);
console.log(`  ★代数の上限: ${DEPTH}（★\`DEFAULT_BALANCE.PEDIGREE_DEPTH\`。★ここに数を書きません）`);

// ── 読み込み ────────────────────────────────────────────────
const rows = await q(
  'select id::text as id, sire_id::text as sire_id, dam_id::text as dam_id,'
  + ' generation, inbreed_coeff::float8 as inbreed_coeff, pedigree_cache from horses order by id',
);
console.log(`  ★${rows.length} 頭 読みました`);
if (rows.length === 0) {
  console.error('🔴 ★1 頭も居ません。★判定になりません');
  await c.end();
  process.exit(VERDICT.UNDECIDABLE);
}
const byId = new Map(rows.map((r) => [r.id, r]));

/** ★壊れている頭数（★uuid でない鍵を 1 つでも持つ馬） */
const brokenNow = rows.filter(
  (r) => Object.keys(r.pedigree_cache ?? {}).some((k) => !UUID_RE.test(k)),
).length;

// ── 🔴 ★本番の関門（★書くときだけ） ─────────────────────────────
if (APPLY) {
  const problem = productionRepairOptInProblem({
    environment: dbEnvironment,
    yesProduction: YES_PRODUCTION,
    repairFlag: REPAIR_FLAG,
    expectBroken: EXPECT_BROKEN,
    actualBroken: brokenNow,
  });
  if (problem !== null) {
    console.error('');
    console.error(`🔴 ★本番には通しません: ${problem}`);
    // 🔴 ★**実数を出さないこと**（★出すと 1 回 失敗して画面の数を写すだけになります）
    console.error('   ★通る形: --env production --apply --yes-production --repair-pedigree'
      + ' --expect-broken <いまの壊れている頭数>');
    console.error('   ★数え方（★自分で数えてください）:');
    console.error('     select count(*) from horses h where exists ('
      + ' select 1 from jsonb_object_keys(h.pedigree_cache) k'
      + " where k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');");
    await c.end();
    process.exit(VERDICT.UNDECIDABLE);
  }
}
await assertNotProduction(c, 'repair-pedigree-cache.mjs', {
  allowProduction: APPLY && YES_PRODUCTION && REPAIR_FLAG,
});

// ── 偽の記録（★本物と形が違わないように、★想定外の欄を読んだら投げます） ───────
/**
 * 🔴 ★**2026-09-21 に 2 度、★偽物が本物と違っていて本番を壊しました**
 *   （★`genotype` を持たない祖先／★DB と形の違う行）。
 *   → ★★**偽物には「読まれたら投げる」を付ける**（★`breeding-runner` と同じ作法）。
 */
function guarded(fields, allowed, where) {
  return new Proxy(fields, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (!allowed.has(k)) {
        throw new Error(
          `repair-pedigree-cache: ${where} が想定外の欄 "${String(k)}" を読みました。`
          + '★この道具の偽の記録が、★本物の記録と違っています（★作り直しを中止します）',
        );
      }
      return t[k];
    },
  });
}
const PARENT_FIELDS = new Set(['id', 'pedigreeCache']);
const F_FIELDS = new Set(['id', 'sireId', 'damId', 'pedigreeCache', 'inbreedCoeff']);

// ── 作り直し（★親を先に・★循環は投げる） ──────────────────────────
const built = new Map();
const inProgress = new Set();
let danglingParents = 0;
const danglingSample = [];

function parentOf(pid, childId) {
  if (pid === null || pid === undefined) return null;
  const p = byId.get(pid);
  if (p === undefined) {
    danglingParents += 1;
    if (danglingSample.length < 5) danglingSample.push(`${childId} → ${pid}`);
    return null;
  }
  return guarded({ id: pid, pedigreeCache: recompute(pid) }, PARENT_FIELDS, 'buildPedigreeCache');
}

function recompute(id) {
  const hit = built.get(id);
  if (hit !== undefined) return hit;
  if (inProgress.has(id)) {
    throw new Error(`repair-pedigree-cache: ★血統に循環があります（${id}）。★作り直せません`);
  }
  inProgress.add(id);
  const r = byId.get(id);
  const out = buildPedigreeCache(parentOf(r.sire_id, id), parentOf(r.dam_id, id), DEPTH);
  inProgress.delete(id);
  built.set(id, out);
  return out;
}
for (const r of rows) recompute(r.id);

// ── ★「親を落とされた馬」と、★その影響圏 ─────────────────────────
/**
 * ★保存の写しが言う親の数（★代数 1 の延べ数）と、★DB の親の数が合わない馬。
 *   → ★★**枝刈りの縁**です（★`simulator.ts` 手順 8。★不具合ではありません）。
 * ⚠️ ★ここを「言い訳」に使うので、★**数と割合を必ず出します**。
 *   ★これが全頭に広がっていたら、★②はただの素通しになります（★**CK-14**）。
 */
const DROPPED = new Set();
/**
 * 🔴 ★**印は 2 つ 使います。★片方は直すと消えるからです**（★2026-09-21・★2 回 流して気づきました）。
 *
 * 【★何が起きたか】
 *   ★旧: ★保存の写しが言う親の数と、★DB の親の数を比べていました。
 *   🔴 ★**この道具が直すと、★その差が消えます。** → ★2 回目に流すと ★`DROPPED` が **0 頭**になり、
 *     ★⑤ が ★**「説明できない 2 頭」で赤**になりました（★直した後だけ赤くなる道具）。
 *   → ★★**直しても消えない印**が要ります。
 *
 * 【★`generation`】★創始馬は `generation = 0`、★それ以外は親を持つはずです。
 *   ✔ ★実測（staging・repair 後）: ★`generation > 0` かつ親が欠けている ＝ **38 頭**（★repair 前と同じ）。
 *   ✔ ★対照: ★`generation = 0` で親が在る ＝ **0 頭**（★印そのものが壊れていない）。
 *
 * ⚠️ ★**2 つの和を取ります**（★どちらか一方が壊れても気づけるように）。★差は下で印字します。
 */
const byGeneration = new Set();
const byCache = new Set();
for (const r of rows) {
  const d1 = Object.values(r.pedigree_cache ?? {}).flat().filter((d) => d === 1).length;
  const parents = (r.sire_id !== null ? 1 : 0) + (r.dam_id !== null ? 1 : 0);
  if (d1 !== parents) byCache.add(r.id);
  if (Number(r.generation) > 0 && parents < 2) byGeneration.add(r.id);
  if (byCache.has(r.id) || byGeneration.has(r.id)) DROPPED.add(r.id);
}
/** ★自分か、★`DEPTH + 1` 代以内の祖先が `DROPPED`（★近交係数は親から 5 代ぶん辿ります） */
const affected = new Set();
{
  const memo = new Map();
  const walk = (id, depth) => {
    if (depth > DEPTH + 1) return false;
    if (DROPPED.has(id)) return true;
    const key = `${id}|${depth}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const r = byId.get(id);
    let out = false;
    if (r !== undefined) {
      for (const pid of [r.sire_id, r.dam_id]) {
        if (pid !== null && walk(pid, depth + 1)) { out = true; break; }
      }
    }
    memo.set(key, out);
    return out;
  };
  for (const r of rows) if (walk(r.id, 0)) affected.add(r.id);
}

// ── 署名（★鍵を無視した「形」。★鍵の数も代数の並びも入ります＝増減の両方を見ます） ──
function signature(entries) {
  const per = entries.map(([, depths]) => [...depths].sort((a, b) => a - b).join('.'));
  per.sort();
  return `${per.length}|${per.join(' ')}`;
}
const sigStored = (r) => signature(Object.entries(r.pedigree_cache ?? {}));
const sigBuilt = (id) => signature([...built.get(id)]);
const storedN = (r) => Object.keys(r.pedigree_cache ?? {}).length;

// ── 判定 ───────────────────────────────────────────────────
const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

console.log('');
console.log(`  ★枝刈りの縁（★親が投入されていない馬）: ${DROPPED.size} 頭`
  + `（★generation で ${byGeneration.size} / ★写しで ${byCache.size}）`
  + ` / ★その影響圏: ${affected.size} 頭（★全 ${rows.length} 頭の`
  + `${(affected.size / rows.length * 100).toFixed(1)}%）`);
console.log('     ⚠️ ★②はこの影響圏を「説明」に使います。★ここが全頭に広がったら'
  + '、★②は素通しです（★割合を必ず見てください）');

// ① 参照が壊れていない
check(danglingParents === 0,
  '① ★`sire_id`/`dam_id` の指す行が DB に在る',
  danglingParents === 0 ? `★${rows.length} 頭 すべて`
    : `🔴 ★迷子 ${danglingParents} 件（例: ${danglingSample.join(' / ')}）`);

// ② 🔴 説明できない食い違いが 0
let sigChecked = 0;
let sigMismatch = 0;
let sigUnexplained = 0;
const sigSample = [];
for (const r of rows) {
  if (r.sire_id === null && r.dam_id === null) continue;   // ★創始馬。★比べるものが在りません
  sigChecked += 1;
  if (sigStored(r) === sigBuilt(r.id)) continue;
  sigMismatch += 1;
  if (affected.has(r.id)) continue;
  sigUnexplained += 1;
  if (sigSample.length < 3) {
    sigSample.push(`${r.id}: 保存 ${sigStored(r).slice(0, 55)} / 作り直し ${sigBuilt(r.id).slice(0, 55)}`);
  }
}
const founders = rows.length - sigChecked;
if (sigChecked === 0) {
  checked += 1;
  fails.push('② ★判定不能');
  console.log('  🔴 ★② を 1 件も判定できませんでした（★親を持つ馬が 0 頭）。★合格にしません');
} else {
  check(sigUnexplained === 0,
    '② 🔴 ★形の食い違いが、★枝刈りの縁で説明しきれる',
    `★判定 ${sigChecked} 頭 / 食い違い ${sigMismatch} 頭 / ★説明できない ${sigUnexplained} 頭`
    + ` / ★創始馬 ${founders} 頭は対象外`
    + (sigSample.length > 0 ? `\n      ${sigSample.join('\n      ')}` : ''));
}

// ③ 🔴 発明が 0（★②の言い訳が効かない。★全頭に課します）
let invented = 0;
const inventedSample = [];
for (const r of rows) {
  if (built.get(r.id).size <= storedN(r)) continue;
  invented += 1;
  if (inventedSample.length < 3) {
    inventedSample.push(`${r.id}: 保存 ${storedN(r)} → 作り直し ${built.get(r.id).size}`);
  }
}
check(invented === 0,
  '③ 🔴 ★発明が 0（★作り直しで祖先が増えた馬が 1 頭も無い）',
  `★${rows.length} 頭 すべてに課しました / 増えた ${invented} 頭`
  + (inventedSample.length > 0 ? `\n      ${inventedSample.join('\n      ')}` : ''));

// ④ 作り直した鍵がすべて uuid
let badKeys = 0;
let builtEntries = 0;
for (const [, m] of built) {
  for (const k of m.keys()) {
    builtEntries += 1;
    if (!UUID_RE.test(k)) badKeys += 1;
  }
}
check(badKeys === 0 && builtEntries > 0,
  '④ ★作り直した鍵が、★すべて DB の uuid',
  builtEntries === 0 ? '🔴 ★1 件も作られていません（★判定になりません）'
    : `★${builtEntries} 件 / uuid でない ${badKeys} 件`);

// ⑤ 近交係数を作り直した写しから再計算して突き合わせる（★全頭）
const fRecord = (id) => {
  const r = byId.get(id);
  if (r === undefined) return undefined;
  return guarded({
    id, sireId: r.sire_id, damId: r.dam_id,
    pedigreeCache: built.get(id), inbreedCoeff: r.inbreed_coeff,
  }, F_FIELDS, 'calcInbreedCoefficient');
};
let fChecked = 0;
let fRounding = 0;
let fMismatch = 0;
let fUnexplained = 0;
let fMaxDiff = 0;
let fHigher = 0;
const fSample = [];
/**
 * ✅ ★**`inbreed_coeff` を直す候補**（★`--fix-inbreed`・★2026-09-21・レビュー側の裁定 ②「上書き」）。
 *
 * 【★なぜ上書きするか（★裁定の理由・★そのまま写します）】
 *   ★① ★**保存値は、★DB の血統から再現できません。** ★再現できない数を残すのは、
 *     ★今日ずっと潰してきたもの（★出どころ不明の数）と同じ形です。
 *   ★② ★Wright の式の `1 + F_A` を通じて ★**次の世代に効き続ける** ＝ ★**嘘が増殖する**。
 *   ★③ ★2 頭・★下がる向きだけ → ★遊びへの影響は無視できる（★近交の罰がわずかに減るだけ）。
 *
 * 【⚠️ ★条件 2 つ（★裁定）】
 *   ★上書き前の値を ★**素性に残す**（★id と 前後の値）。★簿にも「上書きした」と書く。
 *
 * 🔴 ★**候補に入れるのは、★説明できて、★下がる向きのものだけ**です。
 *   ★上がる向き（★`fHigher`）は ★**発明**なので、★1 頭でも在れば ★**何も書きません**。
 */
const fFixable = [];
for (const r of rows) {
  if (r.sire_id === null || r.dam_id === null) continue;
  const sire = fRecord(r.sire_id);
  const dam = fRecord(r.dam_id);
  if (sire === undefined || dam === undefined) continue;
  fChecked += 1;
  const got = calcInbreedCoefficient(sire, dam, fRecord, DEPTH).F;
  if (Number(got.toFixed(DECIMALS)) === r.inbreed_coeff) {
    if (got !== r.inbreed_coeff) fRounding += 1;
    continue;
  }
  fMismatch += 1;
  if (got > r.inbreed_coeff) fHigher += 1;                 // 🔴 ★増えるのは「発明」側
  fMaxDiff = Math.max(fMaxDiff, Math.abs(got - r.inbreed_coeff));
  if (affected.has(r.id)) {
    // ✅ ★説明できて、★**下がる向き**のものだけを、★直す候補にします（★`--fix-inbreed`）
    if (got < r.inbreed_coeff) {
      fFixable.push({ id: r.id, before: r.inbreed_coeff, after: Number(got.toFixed(DECIMALS)) });
    }
    continue;
  }
  fUnexplained += 1;
  if (fSample.length < 3) fSample.push(`${r.id}: 保存 ${r.inbreed_coeff} / 再計算 ${got}`);
}
if (fChecked === 0) {
  checked += 1;
  fails.push('⑤ ★判定不能');
  console.log('  🔴 ★⑤ を 1 件も判定できませんでした（★両親を持つ馬が 0 頭）。★合格にしません');
} else {
  check(fUnexplained === 0 && fHigher === 0,
    '⑤ ★`inbreed_coeff` の再計算が、★丸めか枝刈りの縁で説明しきれる',
    `★判定 ${fChecked} 頭 / 丸めの範囲 ${fRounding} 頭 / 丸めを超える ${fMismatch} 頭`
    + ` / ★説明できない ${fUnexplained} 頭 / 🔴 ★増えた ${fHigher} 頭 / 最大差 ${fMaxDiff.toExponential(2)}`
    + (fSample.length > 0 ? `\n      ${fSample.join('\n      ')}` : ''));
}

console.log('');
console.log(`  ★いま壊れている（uuid でない鍵を持つ）馬: ${brokenNow} 頭`);

// ── 書く（★①〜④ が通ったときだけ） ──────────────────────────────
/**
 * 🔴 ★**①〜④ が落ちたら書きません。★⑤ が落ちても書きます。**
 *   ★①〜④ … ★**作り直しそのものが信用できない**（★参照が壊れている・★説明できない食い違い・
 *            ★発明・★鍵が uuid でない）→ ★書けません
 *   ★⑤   … ★**重い所見**ですが、★`pedigree_cache` を壊れたまま置く理由にはなりません。
 *           ★所見として残します
 */
const safeToApply = danglingParents === 0 && sigChecked > 0 && sigUnexplained === 0
  && invented === 0 && badKeys === 0 && builtEntries > 0;
let written = 0;
/** ★上書きした近交係数の前後（★素性に残します・★裁定の条件） */
let inbreedFixed = [];

if (APPLY && !safeToApply) {
  console.log('🔴 ★判定 ①〜④ のどれかが落ちたので ★**書きません**（★--apply は付いています）');
  fails.push('★--apply が付いているのに書けませんでした');
  checked += 1;
} else if (APPLY) {
  const nowMs = Number((await q('select (extract(epoch from now()) * 1000)::bigint as ms'))[0].ms);
  const fs = await import('node:fs');
  const provenancePath = `evidence/pedigree-repair/${
    new Date(nowMs).toISOString().replace(/[:.]/g, '-')}.json`;
  const writeProvenance = (phase, extra = {}) => {
    fs.mkdirSync('evidence/pedigree-repair', { recursive: true });
    fs.writeFileSync(provenancePath, `${JSON.stringify({
      phase, atIso: new Date(nowMs).toISOString(), environment: dbEnvironment,
      horses: rows.length, brokenBefore: brokenNow, pedigreeDepth: DEPTH,
      danglingParents, droppedEdge: DROPPED.size, affected: affected.size,
      sigChecked, sigMismatch, sigUnexplained, invented, builtEntries, badKeys,
      fChecked, fRounding, fMismatch, fUnexplained, fHigher, fMaxDiff,
      yesProduction: YES_PRODUCTION, repairFlag: REPAIR_FLAG, expectBroken: EXPECT_BROKEN,
      fixInbreed: FIX_INBREED, inbreedFixed,
      ...extra,
    }, null, 2)}\n`, 'utf8');
    return provenancePath;
  };
  // 🔴 ★素性は ★**始める前**に書きます（★落ちたときこそ要ります・★`seed-world` の教訓）
  console.log(`  ★素性を先に書きました: ${writeProvenance('started')}`);

  const BATCH = 500;
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const payload = chunk.map((id) => JSON.stringify(Object.fromEntries(built.get(id))));
    const r = await c.query(
      'update horses h set pedigree_cache = d.pc::jsonb'
      + ' from (select unnest($1::uuid[]) as id, unnest($2::text[]) as pc) d'
      + ' where h.id = d.id',
      [chunk, payload],
    );
    written += r.rowCount;
  }
  console.log(`  ★${written} 行 書きました`);

  /**
   * ✅ ★**`inbreed_coeff` の上書き**（★`--fix-inbreed`・★レビュー側の裁定 ②・2026-09-21）。
   *
   * 🔴 ★**書くのは、★説明できて ★下がる向きのものだけ**です。
   *   ★上がる向き（★`fHigher`）が ★**1 頭でも在れば、★何も書きません**（★それは発明）。
   *   ★説明できないもの（★`fUnexplained`）が在るときも ★**何も書きません**。
   * ⚠️ ★裁定の条件: ★**上書き前の値を素性に残す**（★下の `inbreedFixed`）。
   */
  if (FIX_INBREED) {
    if (fUnexplained > 0 || fHigher > 0) {
      console.log('🔴 ★--fix-inbreed は付いていますが ★**近交係数は書きません**'
        + `（★説明できない ${fUnexplained} 頭 / ★増える向き ${fHigher} 頭）`);
      fails.push('★--fix-inbreed が付いているのに書けませんでした');
      checked += 1;
    } else if (fFixable.length === 0) {
      console.log('  ✓ ★--fix-inbreed: ★直す対象は 0 頭（★既に血統と一致しています）');
    } else {
      const r = await c.query(
        'update horses h set inbreed_coeff = d.f::numeric'
        + ' from (select unnest($1::uuid[]) as id, unnest($2::text[]) as f) d'
        + ' where h.id = d.id',
        [fFixable.map((x) => x.id), fFixable.map((x) => String(x.after))],
      );
      inbreedFixed = fFixable.map((x) => ({ ...x }));
      console.log(`  ✅ ★近交係数を ${r.rowCount} 頭 上書きしました（★前後の値は素性に残します）`);
      for (const x of fFixable) console.log(`     ${x.id}: ${x.before} → ${x.after}`);
      // ⑦ 🔴 ★書いた後に DB で確かめる（★道具の言い分ではなく DB に訊く）
      const back = await q(
        'select id::text as id, inbreed_coeff::float8 as f from horses where id = any($1::uuid[])',
        [fFixable.map((x) => x.id)],
      );
      const backMap = new Map(back.map((b) => [b.id, b.f]));
      const wrong = fFixable.filter((x) => backMap.get(x.id) !== x.after);
      check(r.rowCount === fFixable.length && wrong.length === 0,
        '⑦ ★近交係数の上書きが、★DB に届いた（★読み直して確かめました）',
        `★対象 ${fFixable.length} 頭 / 書いた ${r.rowCount} 行 / 食い違い ${wrong.length} 頭`);
    }
  } else if (fFixable.length > 0) {
    console.log(`  ⚠️ ★近交係数が血統と合わない馬が ${fFixable.length} 頭 います`
      + '（★`--fix-inbreed` を付けると、★再計算値で上書きします。★簿 `INBREED-COEFF-ABOVE-PEDIGREE`）');
  }

  // ⑥ 🔴 ★**書いた後に DB を読み直す**（★道具の言い分ではなく、★DB に訊く）
  const afterKeys = Number((await q(
    'select coalesce(sum((select count(*) from jsonb_object_keys(h.pedigree_cache))), 0)::bigint'
    + ' as keys from horses h',
  ))[0].keys);
  const afterBroken = Number((await q(
    'select count(*)::int n from horses h where exists ('
    + ' select 1 from jsonb_object_keys(h.pedigree_cache) k'
    + " where k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')",
  ))[0].n);
  check(afterBroken === 0 && written === rows.length && afterKeys === builtEntries,
    '⑥ ★書いた後、★DB を読み直して確かめた（★uuid でない鍵 0 / 鍵の総数が一致）',
    `★書いた ${written} 行 / 対象 ${rows.length} 行 / 残り ${afterBroken} 頭`
    + ` / ★鍵の総数 DB ${afterKeys} 対 作り直し ${builtEntries}`);
  console.log(`  ★素性を書き足しました: ${
    writeProvenance('done', { written, afterBroken, afterKeys })}`);
} else {
  console.log('  ★下見です。★書くには --apply を付けてください'
    + (safeToApply ? '（★①〜④ は通っています）' : '（🔴 ★①〜④ が落ちているので、★付けても書きません）'));
}

await c.end();
exitWithVerdict(verdictOf({
  checked,
  failed: fails.length,
  label: `★血統の写しの直し（${APPLY ? '書き込みあり' : '下見'}）`,
  skipped: { '★創始馬（②の対象外）': founders },
}));
