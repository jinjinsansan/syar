/**
 * N-2 / R-10: テスト棚卸しの実行時計測。
 *
 *   node tools/inventory/measure.mjs
 *
 * 本番エントリ5点に一時プローブを挿入 → 全テストを実行 → プローブを撤去 → 集計。
 *
 * 【分類の定義】（報告書にそのまま書ける形で明示する）
 *   経路テスト = 実行中に本番エントリ（runSimulation / resolveRuntimeConfig / breed /
 *                createFounder / expressPhenotype）が **1回以上呼ばれた** テスト。
 *   単体テスト = 1回も呼ばれなかったテスト（純関数を直接叩くもの）。
 *
 * 【安全策】
 *   - 挿入・撤去とも「実際に文字列が変化したか」を assert する（M-1 の空振り事故対策）。
 *   - 撤去後に md5 が挿入前と一致することを検証する。一致しなければ非ゼロ終了。
 *   - finally で必ず撤去する（テストが落ちても本番コードを汚さない）。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/** 本番エントリ: [ファイル, 関数名, プローブを挿す直前のアンカー文字列] */
const ENTRIES = [
  ['packages/sim-engine/src/breeding.ts', 'breed', 'export function breed(params: BreedParams): HorseRecord {'],
  ['packages/sim-engine/src/founders.ts', 'createFounder', 'export function createFounder(params: FounderParams): HorseRecord {'],
  ['packages/sim-engine/src/phenotype.ts', 'expressPhenotype', '): Phenotype {'],
  ['apps/cli/src/config.ts', 'resolveRuntimeConfig', '): RuntimeConfig {'],
  ['apps/cli/src/simulator.ts', 'runSimulation', '): SimulationResult {'],
  // --- P1（race-engine）の本番エントリ ---
  ['packages/race-engine/src/race.ts', 'resolveRace', 'export function resolveRace(params: ResolveRaceParams): RaceResult {'],
  ['packages/race-engine/src/skills.ts', 'resolveSkills', '): SkillOutcome {'],
  ['packages/race-engine/src/intervention.ts', 'resolveIntervention', '): InterventionOutcome {'],
  ['packages/race-engine/src/fairness.ts', 'commitServerSeed', 'export function commitServerSeed(serverSeed: string, hash: HashProvider): string {'],
  ['packages/race-engine/src/fairness.ts', 'auditFailures', 'export function auditFailures(record: RaceAuditRecord, hash: HashProvider): string[] {'],
];

const OUT = 'tools/inventory/.probe.jsonl';
const md5 = (s) => createHash('md5').update(s).digest('hex');
const probeLine = (name) =>
  `  (globalThis as unknown as Record<string, ((n: string) => void) | undefined>)['__PATH_PROBE__']?.('${name}'); // TEMP-PROBE`;

const originals = new Map();

function inject() {
  // ★原本は**ファイルごとに1度だけ**読む。
  //   当初これをエントリごとに読んでいたため、同一ファイルに2点挿すと
  //   2回目の読み込みが「1点挿した後の内容」を原本として記録してしまい、
  //   **復元でプローブが本番コードに残った**（fairness.ts で実際に発生）。
  //   復元検査（md5 と TEMP-PROBE 走査）は検出できたが、修復はできなかった。
  for (const [file] of ENTRIES) {
    if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'));
  }
  // ファイル単位に集約してから一括で書く
  const pending = new Map();
  for (const [file, name, anchor] of ENTRIES) {
    const text = pending.get(file) ?? originals.get(file);
    if (text === undefined) throw new Error(`${file}: 原本が読めていない`);
    const count = text.split(anchor).length - 1;
    if (count !== 1) {
      throw new Error(`${file}: アンカー「${anchor}」が ${count} 件（1件でないと挿入位置が定まらない）`);
    }
    const next = text.replace(anchor, `${anchor}\n${probeLine(name)}`);
    if (next === text) throw new Error(`${file}: プローブ挿入が空振りした`);
    pending.set(file, next);
  }
  for (const [file, text] of pending) writeFileSync(file, text);
  console.log(`プローブ挿入: ${ENTRIES.length}件（${pending.size}ファイル）`);
}

function restore() {
  let ok = true;
  for (const [file] of ENTRIES) {
    const original = originals.get(file);
    if (original === undefined) continue;
    writeFileSync(file, original);
    const after = readFileSync(file, 'utf8');
    if (md5(after) !== md5(original)) {
      console.error(`!!! ${file} の復元に失敗`);
      ok = false;
    }
    if (after.includes('TEMP-PROBE')) {
      console.error(`!!! ${file} にプローブが残っている`);
      ok = false;
    }
  }
  console.log(ok ? 'プローブ撤去: 全件 md5 一致で復元を確認' : 'プローブ撤去: 失敗');
  return ok;
}

let restored = false;
try {
  if (existsSync(OUT)) rmSync(OUT);
  writeFileSync(OUT, '');
  inject();

  console.log('全テストを実行中（プローブ有効）...');
  execFileSync(
    'npx',
    ['vitest', 'run', '--config', 'tools/inventory/vitest.probe.config.ts', '--reporter', 'dot'],
    { stdio: 'inherit', env: { ...process.env, PATH_PROBE_OUT: OUT }, shell: true },
  );
} finally {
  restored = restore();
}
if (!restored) process.exit(1);

// ---- 集計 ----
const rows = readFileSync(OUT, 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l));

const seen = new Map();
for (const r of rows) seen.set(`${r.file}::${r.test}`, r);
const all = [...seen.values()];

const path = all.filter((r) => r.entries.length > 0);
const unit = all.filter((r) => r.entries.length === 0);

const byFile = new Map();
for (const r of all) {
  const key = r.file.replace(/\\/g, '/').replace(/^.*\/(apps|packages)\//, '$1/');
  const acc = byFile.get(key) ?? { path: 0, unit: 0 };
  if (r.entries.length > 0) acc.path += 1;
  else acc.unit += 1;
  byFile.set(key, acc);
}

const entryCounts = new Map();
for (const r of all) for (const e of r.entries) entryCounts.set(e, (entryCounts.get(e) ?? 0) + 1);

console.log('\n===== N-2 テスト棚卸し（実行時計測） =====');
console.log(`総テスト数: ${all.length}`);
console.log(`  経路テスト: ${path.length}`);
console.log(`  単体テスト: ${unit.length}  (${((unit.length / all.length) * 100).toFixed(1)}%)`);
console.log('\n--- ファイル別 (経路/単体) ---');
for (const [f, c] of [...byFile].sort()) console.log(`  ${f.padEnd(42)} ${c.path}/${c.unit}`);
console.log('\n--- 本番エントリ別 到達テスト数 ---');
for (const [e, c] of [...entryCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${e.padEnd(22)} ${c}`);
console.log('\n--- 単体テスト（本番エントリ未到達）の一覧 ---');
for (const r of unit) console.log(`  [${r.file.replace(/\\/g, '/').split('/').slice(-1)[0]}] ${r.test}`);
