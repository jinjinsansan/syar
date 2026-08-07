/**
 * 合格基準3（2026-08-07 確定）: **出荷する1つの世界を選ぶ**。
 *
 * ★barely pass を選ばない。分布は 1.29〜10.14 に広がるので、
 *   4量すべてに余裕のある世界を選ぶ。選んだシードは正典 §10.5 に固定し、
 *   合格率（45%）も併記する（将来の読み手がチェリーピッキングと誤解しないため）。
 *
 * ★R-21: 抽出が0件なら「無かった」ではなく「抽出の失敗」を疑う。
 *   事前条件として **最低限見つかるはずの件数** を書き、下回ったら結果を報告せず失敗させる。
 */
import { execSync } from 'node:child_process';

const N = Number(process.argv[2] ?? 30);
/** ★事前条件: 合格率45%なので N シードなら中央値付近は必ず取れるはず */
const MIN_EXPECTED_CANDIDATES = Math.max(1, Math.floor(N * 0.15));

const rows = [];
for (let i = 0; i < N; i += 1) {
  const seed = 20260807 + i;
  const out = execSync(`npm run preseed --silent -- --seed ${seed} --generations 50`, {
    encoding: 'utf8', maxBuffer: 1 << 24,
  });
  const g = (re) => { const m = out.match(re); if (!m) throw new Error(`seed ${seed}: 読み取れず ${re}`); return Number(m[1]); };
  rows.push({
    seed,
    eff: g(/^y +50 .*有効=([\d.]+)/m),
    combos: g(/sire×bms の組 (\d+) 通り/),
    nicks: g(/ニックス表ヒット (\d+)/),
    highF: g(/高F\(>1\/16\)になる配合 ([\d.]+)%/),
    meanF: g(/平均F=([\d.]+)/),
  });
  process.stdout.write('.');
}
console.log('');

// 40シード分布の中央値を基準に「余裕がある」を定義する
const MED = { eff: 4.76, combos: 110, nicks: 7 };
const ok = rows.filter((r) => r.eff >= 5 && r.meanF <= 0.1);
const strong = ok.filter((r) => r.eff >= MED.eff && r.combos >= MED.combos && r.nicks >= MED.nicks);

if (ok.length < MIN_EXPECTED_CANDIDATES) {
  throw new Error(
    `合格シードが ${ok.length}件しかありません（${N}件中・期待 ${MIN_EXPECTED_CANDIDATES}件以上）。` +
      '抽出の失敗か、機構が変わった可能性があります（R-21）。結果は報告しません。',
  );
}

console.log(`# 世界候補の探索  ${N}シード × 50世代（近交回避 有効）`);
console.log(`  合格（有効≥5 かつ 平均F≤0.10）: ${ok.length}/${N}（${((ok.length / N) * 100).toFixed(0)}%）`);
console.log(`  うち4量すべてが中央値以上: ${strong.length}件\n`);
const sorted = (strong.length > 0 ? strong : ok).sort((a, b) => b.eff - a.eff);
console.log(`  ${'seed'.padStart(10)} ${'有効系統'.padStart(8)} ${'組数'.padStart(6)} ${'ニックス'.padStart(8)} ${'高F%'.padStart(7)} ${'平均F'.padStart(8)}`);
for (const r of sorted.slice(0, 10)) {
  console.log(
    `  ${String(r.seed).padStart(10)} ${r.eff.toFixed(2).padStart(8)} ${String(r.combos).padStart(6)} ` +
      `${String(r.nicks).padStart(8)} ${r.highF.toFixed(1).padStart(7)} ${r.meanF.toFixed(4).padStart(8)}`,
  );
}
