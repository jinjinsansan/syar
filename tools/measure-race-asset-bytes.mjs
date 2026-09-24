/**
 * ★**1 レースを見たときに、実際に落ちてくる馬素材の量を測る**（★2026-09-24・レビュー側の条件）
 *
 * 【★なぜ要るか】
 *   ★焼いた素材は ★**91 ファイル・96.5MB**（★1 枚 1〜2MB）です。★しかし ★**全部は落ちてきません**。
 *   ★画面が読むのは「★台本が描く役」×「★その組に実在する毛色」だけです。
 *   🔴 ★**毛色が散るほど、1 画面で引く表の種類が増えます。**
 *      ★毛色を ★枠番から引く（いま）→ ★馬 ID から引く（これから）に変えると、★引く枚数が増えます。
 *   ★正典に容量の線はまだありません。★数を出してから線を決めます。
 *
 * 【★repo の大きさを測るのではありません】
 *   ★測るのは ★**その画面が引く量**（★ファイル数と合計バイト）です。
 *
 * 【★どこから読むか — ★書き写さない】
 *   ★役の一覧  … `broadcastV2ScriptAssets`（`@star/render`。★画面と同じ関数）
 *   ★勝馬の 2 役 … `race/page.tsx` の `WINNER_POSE` / `WINNER_FOLLOW_REAR` を ★**原文から**読む
 *   ★型の割当  … 同じく `HORSE_TYPE_BY_GATE` を原文から読む
 *   ★枠番の毛色 … 同じく `COAT_BY_GATE` を原文から読む
 *   ★馬 ID の毛色 … `coatOfHorseId`（`@star/render`）
 *   ⚠️ ★読めなかったら ★**止まります**（★既定値で測って「少ない」と言わないため）。
 *
 * ⚠️ ★DB にもネットワークにも触れません。★ファイルの大きさを足すだけです。
 *
 * ★実行: npx tsx tools/measure-race-asset-bytes.mjs [--fields 12,18] [--samples 2000]
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { broadcastV2ScriptAssets, coatOfHorseId, RACE_INTRO_PADDOCK_COUNT } from '@star/render';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FIELDS = String(arg('fields', '12,18')).split(',').map(Number);
const SAMPLES = Number(arg('samples', 2000));
const BAKED = 'apps/web/public/art/baked';
const PAGE_PATH = 'apps/web/src/app/race/page.tsx';
const PAGE = readFileSync(PAGE_PATH, 'utf8');

/** ★原文から 1 つ読む。★読めなければ止まる（★既定値で測らない） */
function fromPage(re, what) {
  const m = PAGE.match(re);
  if (m === null) {
    console.error(`🔴 ★${PAGE_PATH} から「${what}」を読めませんでした。★書き方が変わっています。`);
    console.error('★既定値で測ると「少ない」と嘘を言うので、ここで止まります。');
    process.exit(2);
  }
  return m;
}

const winnerPose = fromPage(/const WINNER_POSE:[^=]*=\s*'(\w+)'/, 'WINNER_POSE')[1];
const winnerRear = fromPage(/const WINNER_FOLLOW_REAR\s*=\s*(true|false)/, 'WINNER_FOLLOW_REAR')[1] === 'true';
const typesByGate = [...fromPage(/const HORSE_TYPE_BY_GATE[^=]*=\s*\[([\s\S]*?)\]/, 'HORSE_TYPE_BY_GATE')[1]
  .matchAll(/'(\w+)'/g)].map((m) => m[1]);
const coatByGate = [...fromPage(/const COAT_BY_GATE[^=]*=\s*\[([\s\S]*?)\]/, 'COAT_BY_GATE')[1]
  .matchAll(/'([\w-]+)'/g)].map((m) => m[1]);

const manifest = JSON.parse(readFileSync(join(BAKED, 'manifest.json'), 'utf8'));
const setByRole = new Map(manifest.sets.map((s) => [s.role, s]));
const sizeOf = (f) => statSync(join(BAKED, f)).size;

/** ★画面と同じ順で、読む役を組み立てる */
const baseRoles = [
  ...broadcastV2ScriptAssets('v6', false),
  ...(winnerRear ? ['winner-rear'] : []),
  ...(winnerPose === 'celebrate' ? ['winner-cycle'] : []),
];
const typesInUse = [...new Set(typesByGate)];
const suffix = (t) => (t === 'a' ? '' : `-${t}`);
const rolesInUse = [...new Set(baseRoles.flatMap((r) => typesInUse.map((t) => `${r}${suffix(t)}`)))]
  .filter((r) => setByRole.has(r));

console.log('=== 1 レースで落ちてくる馬素材 ===');
console.log(`  焼いてある: ${manifest.sets.length} 役 × ${manifest.coats.length} 毛色`);
console.log(`  台本 v6 が描く役: ${baseRoles.join(' ')}`);
console.log(`  使う型: ${typesInUse.join(' ')}（WINNER_POSE=${winnerPose} / WINNER_FOLLOW_REAR=${winnerRear}）`);
/**
 * 🔴 ★**パドックの歩きは、台本の一覧に入っていません。**
 *   ★`race/page.tsx` の `bakedWalk` が ★**別の口**で読みます（★発走前の人気馬の紹介）。
 *   ★引く毛色は ★**紹介に出る `RACE_INTRO_PADDOCK_COUNT` 頭ぶん ＋ 鹿毛**だけです。
 *   ⚠️ ★開発側は 1 度この口を数え落とし、★量を少なく報告しました（★2026-09-24・同日に訂正）。
 *      ★「台本が描く役」だけ数えると、★**台本の外から読む口**が落ちます。
 *   ⚠️ ★型 A 以外の枠があるときは読みません（★原版経路へ戻る）。
 */
const walkRole = typesInUse.every((t) => t === 'a') && setByRole.has('side-walk') ? 'side-walk' : undefined;
console.log(`  → 実際に引く役: ${rolesInUse.length} 件  ${rolesInUse.join(' ')}`);
console.log(`  ＋ 台本の外から: ${walkRole ?? 'なし'}（★発走前の紹介・毛色は ${RACE_INTRO_PADDOCK_COUNT} 頭ぶん＋鹿毛）`);
const unused = manifest.sets.map((s) => s.role)
  .filter((r) => !rolesInUse.includes(r) && r !== walkRole);
console.log(`  ⚠️ 焼いてあるが引かない役: ${unused.length} 件  ${unused.join(' ')}`);

/** ★1 役ぶん（★影は毛色に依らず 1 枚・★鹿毛は必ず要る） */
function bytesOfRole(role, coats) {
  const set = setByRole.get(role);
  const need = new Set(['bay', ...coats]);
  let bytes = 0, files = 0;
  for (const c of need) {
    const f = set.coats[c];
    if (f === undefined) continue;
    bytes += sizeOf(f); files += 1;
  }
  if (set.shadow !== undefined) { bytes += sizeOf(set.shadow); files += 1; }
  return { bytes, files };
}

/**
 * ★毛色の並び（★枠順ぶん） → 落ちてくるバイト。
 *   ★走りの役は ★**全枠の毛色**、★パドックは ★**紹介に出る頭ぶん**だけ引きます。
 */
function bytesFor(coatsByGate) {
  const all = new Set(['bay', ...coatsByGate]);
  let bytes = 0, files = 0;
  for (const role of rolesInUse) {
    const r = bytesOfRole(role, all);
    bytes += r.bytes; files += r.files;
  }
  let walk = { bytes: 0, files: 0 };
  if (walkRole !== undefined) {
    // ★紹介は 1〜`COUNT` 番人気。★どの枠かは人気で決まるので、★先頭から `COUNT` 頭で代表させます
    walk = bytesOfRole(walkRole, coatsByGate.slice(0, RACE_INTRO_PADDOCK_COUNT));
    bytes += walk.bytes; files += walk.files;
  }
  return { bytes, files, coats: all.size, walkBytes: walk.bytes };
}
const mb = (b) => `${(b / 1048576).toFixed(1)}MB`;

for (const n of FIELDS) {
  console.log(`\n── ${n} 頭立て ──`);

  /** ★いま: 枠番から引く */
  const nowCoats = Array.from({ length: n }, (_, i) => coatByGate[i % coatByGate.length]);
  const now = bytesFor(nowCoats);
  console.log(`  いま（枠番から）  毛色 ${now.coats} 種  ${String(now.files).padStart(3)} ファイル  ${mb(now.bytes)}`
    + `（うち発走前の紹介 ${mb(now.walkBytes)}）`);

  /** ★これから: 馬 ID から引く（★毛色の散り方が毎レース変わるので、たくさん試す） */
  const seen = [];
  for (let s = 0; s < SAMPLES; s += 1) {
    seen.push(bytesFor(Array.from({ length: n }, () => coatOfHorseId(randomUUID()))));
  }
  seen.sort((a, b) => a.bytes - b.bytes);
  const at = (p) => seen[Math.min(seen.length - 1, Math.floor(seen.length * p))];
  const mean = seen.reduce((s, x) => s + x.bytes, 0) / seen.length;
  const meanCoats = seen.reduce((s, x) => s + x.coats, 0) / seen.length;
  console.log(`  これから（馬 ID から・${SAMPLES} 回）`);
  console.log(`      平均  毛色 ${meanCoats.toFixed(1)} 種  ${mb(mean)}`);
  console.log(`      p95   毛色 ${at(0.95).coats} 種  ${String(at(0.95).files).padStart(3)} ファイル  ${mb(at(0.95).bytes)}`);
  console.log(`      最大  毛色 ${at(1).coats} 種  ${String(at(1).files).padStart(3)} ファイル  ${mb(at(1).bytes)}`);
  console.log(`      → いまの ${(mean / now.bytes).toFixed(2)} 倍（最大 ${(at(1).bytes / now.bytes).toFixed(2)} 倍）`);
}

console.log('\n⚠️ ★これは ★**落ちてくる量**です。★待ちの長さは回線と端末で決まります（★オーナーの目が要ります）。');
console.log('⚠️ ★キャッシュは数えていません（★2 レース目は減ります）。★測っているのは ★**初回**です。');
