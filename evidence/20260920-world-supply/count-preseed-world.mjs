/**
 * ★プリシード世界の年齢構成と、`seed-world.mjs` が投入する集合の内訳を数える。
 *
 * 🔴 ★**DB に繋ぎません。** ★`runPreseed` は純関数です（★読むだけ・★状態を変えません）。
 * ★`seed-world.mjs:38-48` と **同じ手順**で「投入対象」を作ります（★写しであることを承知で。
 *   ★あちらは DB に入れる道具、★こちらは数えるだけ）。
 *
 * 実行: npx tsx evidence/20260920-world-supply/count-preseed-world.mjs
 * 所要: 約 95 秒（★50 世代の生成が大半）
 */
import { ALLOW_ALL_NAMES, NPC_STABLES } from '../../packages/sim-engine/src/index.ts';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../../apps/cli/src/preseed.ts';

/** ★`tools/seed-world.mjs` の既定と同じ */
const SEED = 20260833;
const GENERATIONS = 50;

const t0 = Date.now();
const pre = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS, seed: SEED, generations: GENERATIONS,
  nicks: preseedNicks(SEED, NPC_STABLES), blocklist: ALLOW_ALL_NAMES,
});
const w = pre.world;
console.log(`生成 ${w.all.size} 頭 / ${((Date.now() - t0) / 1000).toFixed(1)}秒 / 最終年 ${w.year}`);
console.log('');

const yearsOf = (ids) => {
  const m = new Map();
  for (const id of ids) { const y = w.all.get(id).record.birthYear; m.set(y, (m.get(y) ?? 0) + 1); }
  return m;
};

const active = yearsOf(w.activeIds);
console.log(`【現役】${w.activeIds.length} 頭 / birth_year の種類 ★${active.size}`);
for (const y of [...active.keys()].sort((a, b) => a - b)) {
  console.log(`    birth_year=${y}  ${w.year - y} 歳  ${active.get(y)} 頭`);
}
console.log(`【繁殖牝馬】${w.mareIds.length} 頭 / birth_year の種類 ${yearsOf(w.mareIds).size}`);
console.log(`【種牡馬】  ${w.stallionIds.length} 頭 / birth_year の種類 ${yearsOf(w.stallionIds).size}`);
console.log('');

// ── seed-world.mjs:38-48 と同じ手順で「投入対象」を作る ──
const need = new Set([...w.activeIds, ...w.stallionIds, ...w.mareIds]);
const core = need.size;
let frontier = [...need];
for (let depth = 0; depth < 5; depth += 1) {
  const next = [];
  for (const id of frontier) {
    const r = w.all.get(id)?.record;
    for (const p of [r?.sireId, r?.damId]) if (p && !need.has(p)) { need.add(p); next.push(p); }
  }
  frontier = next;
}
console.log(`【投入対象】現役 + 種牡馬 + 繁殖牝馬 = ${core} 頭（重複を除く）`);
console.log(`            ＋ 5 代の祖先          = ★${need.size} 頭`);

const activeSet = new Set(w.activeIds);
let done = 0;
for (const id of need) if (w.year - w.all.get(id).record.birthYear > 4) done += 1;
console.log('');
console.log(`🔴 ★投入 ${need.size} 頭 のうち、★最終年に 5 歳以上（＝プリシード世界では走り終えている）: ★${done} 頭`);
console.log(`   ★現役でないもの: ${need.size - activeSet.size} 頭 （★上と一致するはず）`);
console.log(`   ⚠️ ★\`tools/seed-world.mjs:74\` の insert の列に \`retired_at_week\` はありません。`);
console.log(`   → ★DB ではこの ${done} 頭も「現役」（retired_at_week is null）になります。`);
