/**
 * ★Q-P3-42 — 較正定数を壊したとき、**V-ゲートが本当に落ちるか**を実測する
 *
 * 【なぜ変異ハーネス（run.mjs）と別に要るか】
 *   `run.mjs` が回すのは **単体テスト（vitest）** です。較正定数の多くは単体テストでは
 *   守られておらず、**V-ゲートが振る舞いで守っています**（Q-P3-40 の裁定）。
 *   その対応表は `docs/MUTATION_TRIAGE.md` §6 に書きましたが、
 *   ★根拠は**登録簿の `affects` とソースのコメント**で、**実際に壊したのは4件だけ**でした。
 *
 *   > 登録簿とコメントは「守っているつもり」の記録で、
 *   > 守れているかは壊してみないと分かりません。
 *
 *   実例: `TEMPER_DIFFICULT_AT` を値域外に変異させても20件すべて通り、
 *   原因は**テストが閾値そのものを使っていた**ことでした。推論では足りません。
 *
 * 【★測りたいのは「帯を出るか」ではなく「その定数が効いているか」】
 *   だから**完全な標本数は不要**です（裁定）。既定は少ない本数で回します。
 *   ⚠️ ただし**縮小したことを黙らせない**: 本数と seed を必ず出力に出します。
 *
 * 【★事後条件（R-11 / R-16）】
 *   「落ちた」を理由を読まずに結果として扱わないため、次を全部確かめます:
 *     (1) アンカーがちょうど1件（空振り改変を検出）
 *     (2) 書き込み後、ディスク上の内容が原本と違う
 *     (3) ★**ゲートの `settings` に摂動後の値が出ている**
 *         ＝ 変異が**ゲートの実行経路に届いた**こと。
 *         ★これが無いと「経路から外れていて何も起きず、たまたま落ちた」と区別できません
 *         （P1 でクラス係数が適用経路から外れても196件が緑だった件）
 *     (4) 復元後に md5 が原本と一致
 *
 * 実行:
 *   node tools/mutation/gates.mjs --list
 *   node tools/mutation/gates.mjs --id LAMBDA_STAR
 *   node tools/mutation/gates.mjs --races 4000 --seeds 42,7
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const md5 = (s) => createHash('md5').update(s).digest('hex');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

/** ★縮小した本数。「効いているか」を見るだけなので帯の精度は要りません */
const RACES = arg('--races', '4000');
const SEEDS = arg('--seeds', '42,7');

/**
 * 対象。`settingsKey` は **ゲートの JSON が返す実効値の名前**で、
 * ★これが摂動後の値になっていることをもって「経路に届いた」と判定します。
 */
const TARGETS = [
  {
    key: 'TAIL_MIX_P_DEFAULT', file: 'packages/race-engine/src/balance.ts',
    from: 'export const TAIL_MIX_P_DEFAULT = 0.03;', to: 'export const TAIL_MIX_P_DEFAULT = 0;',
    gate: 'race', expect: ['V-6'], settingsKey: 'tailMixP', expectSetting: 0,
  },
  {
    key: 'TAIL_MIX_M_DEFAULT', file: 'packages/race-engine/src/balance.ts',
    from: 'export const TAIL_MIX_M_DEFAULT = 5;', to: 'export const TAIL_MIX_M_DEFAULT = 1;',
    gate: 'race', expect: ['V-6'], settingsKey: 'tailMixM', expectSetting: 1,
  },
  {
    key: 'DEFAULT_CLASS_BAND', file: 'apps/cli/src/race-field.ts',
    from: 'export const DEFAULT_CLASS_BAND = 0.06;', to: 'export const DEFAULT_CLASS_BAND = 1.0;',
    gate: 'race', expect: ['V-4'], settingsKey: 'classBand', expectSetting: 1.0,
  },
  {
    key: 'DISTANCE_SUIT_MIN', file: 'apps/cli/src/race-field.ts',
    from: 'export const DISTANCE_SUIT_MIN = 55;', to: 'export const DISTANCE_SUIT_MIN = 0;',
    gate: 'race', expect: ['V-6'], settingsKey: 'distanceSuitMin', expectSetting: 0,
  },
  {
    key: 'OFF_DISTANCE_ENTRY_RATE', file: 'apps/cli/src/race-field.ts',
    from: 'export const OFF_DISTANCE_ENTRY_RATE = 0.12;', to: 'export const OFF_DISTANCE_ENTRY_RATE = 1.0;',
    gate: 'race', expect: ['V-6'], settingsKey: 'offDistanceEntryRate', expectSetting: 1.0,
  },
  {
    key: 'OFF_SURFACE_ENTRY_RATE', file: 'apps/cli/src/race-field.ts',
    from: 'export const OFF_SURFACE_ENTRY_RATE = 0.15;', to: 'export const OFF_SURFACE_ENTRY_RATE = 1.0;',
    gate: 'race', expect: ['V-6', 'V-4'], settingsKey: 'offSurfaceEntryRate', expectSetting: 1.0,
  },
  {
    key: 'FIELD_STRENGTH_FLOOR', file: 'apps/cli/src/race-field.ts',
    from: 'export const FIELD_STRENGTH_FLOOR = 0.5;', to: 'export const FIELD_STRENGTH_FLOOR = 0.0;',
    gate: 'race', expect: ['V-4', 'V-6'], settingsKey: 'fieldStrengthFloor', expectSetting: 0.0,
  },
];

if (process.argv.includes('--list')) {
  for (const t of TARGETS) console.log(`${t.key}  → ${t.expect.join(' / ')}`);
  process.exit(0);
}
const only = arg('--id', null);
const targets = only === null ? TARGETS : TARGETS.filter((t) => t.key === only);
if (targets.length === 0) {
  console.error(`★該当なし: ${only}`);
  process.exit(2);
}

/** ゲートを回して JSON を返す */
const runGate = (gate) => {
  if (gate !== 'race') throw new Error(`未対応のゲート: ${gate}`);
  const out = execFileSync('npx', [
    'tsx', 'apps/cli/src/verify-race.ts',
    '--races', RACES, '--seeds', SEEDS, '--json',
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: process.platform === 'win32' });
  const start = out.lastIndexOf('\n{');
  if (start < 0) throw new Error('JSON が見つかりません');
  return JSON.parse(out.slice(start + 1));
};

console.log('# ★較正定数を壊したとき V-ゲートが落ちるか（Q-P3-42）');
console.log('');
console.log(`  ★縮小して回しています: races=${RACES} seeds=${SEEDS}`);
console.log('    「帯を出るか」ではなく「その定数が効いているか」を見るためです。');
console.log('    ⚠️ この本数は**帯の判定には足りません**。ゲート本体は本来の本数で回すこと。');
console.log('');

console.log('【基準】改変なしで回します');
const base = runGate('race');
const baseById = new Map(base.checks.map((c) => [c.id, c]));
for (const c of base.checks) console.log(`  ${c.id}  ${c.value}  ${c.pass ? 'PASS' : '★FAIL'}`);
// ★基準が緑でなければ、以後の「落ちた」は変異のせいだと言えません
const baseBad = base.checks.filter((c) => !c.pass);
if (baseBad.length > 0) {
  console.error('');
  console.error(`★基準が緑ではありません（${baseBad.map((c) => c.id).join(', ')}）。`);
  console.error('  この状態で「変異で落ちた」とは言えないので中止します。');
  console.error('  ★縮小した本数のせいで帯を外れている可能性があります（--races を増やしてください）');
  process.exit(2);
}
console.log('');

const rows = [];
for (const t of targets) {
  const original = readFileSync(t.file, 'utf8');
  const originalMd5 = md5(original);
  console.log(`── ${t.key} → ${t.expect.join(' / ')} が落ちるはず`);

  // 事後条件(1): アンカーがちょうど1件
  const hits = original.split(t.from).length - 1;
  if (hits !== 1) {
    console.error(`  ★アンカーが ${hits} 件です（1件でなければ改変が空振りします）`);
    process.exit(2);
  }
  const mutated = original.replace(t.from, t.to);
  writeFileSync(t.file, mutated, 'utf8');

  let row;
  try {
    // 事後条件(2): ディスク上で変わった
    if (md5(readFileSync(t.file, 'utf8')) === originalMd5) {
      throw new Error('書き込んだのに内容が変わっていません');
    }
    const got = runGate(t.gate);

    // ★事後条件(3): 変異がゲートの実行経路に届いたか
    const eff = got.settings[t.settingsKey];
    const reached = Number(eff) === Number(t.expectSetting);
    const failed = t.expect.filter((id) => {
      const c = got.checks.find((x) => x.id === id);
      return c !== undefined && !c.pass;
    });
    const detail = t.expect.map((id) => {
      const b = baseById.get(id);
      const c = got.checks.find((x) => x.id === id);
      return `${id} ${b?.value ?? '?'} → ${c?.value ?? '?'} ${c?.pass ? 'PASS' : '★FAIL'}`;
    });
    row = { key: t.key, reached, eff, detail, caught: failed.length > 0, failed };
    console.log(`  経路に届いた: ${reached ? `✓（${t.settingsKey}=${eff}）` : `★届いていない（${t.settingsKey}=${eff}）`}`);
    for (const d of detail) console.log(`  ${d}`);
    console.log(`  → ${failed.length > 0 ? `✓ ゲートが捕まえた（${failed.join(', ')}）` : '★どのゲートも捕まえなかった'}`);
  } finally {
    // 事後条件(4): 復元して md5 一致
    writeFileSync(t.file, original, 'utf8');
    if (md5(readFileSync(t.file, 'utf8')) !== originalMd5) {
      console.error('  ★★復元に失敗しました。手で確認してください');
      process.exit(2);
    }
  }
  rows.push(row);
  console.log('');
}

console.log('【まとめ】');
for (const r of rows) {
  const ok = r.reached && r.caught;
  console.log(`  ${ok ? '✓' : '★'} ${r.key}  経路${r.reached ? '○' : '×'} / 捕捉${r.caught ? `○(${r.failed.join(',')})` : '×'}`);
}
const bad = rows.filter((r) => !(r.reached && r.caught));
console.log('');
console.log(bad.length === 0
  ? `★全 ${rows.length} 件: ゲートが実際に捕まえました（推論ではなく実測）`
  : `★${bad.length} 件が未証明: ${bad.map((r) => r.key).join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
