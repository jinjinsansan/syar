/**
 * 変異試験ハーネス（O-4 / R-11）
 *
 *   node tools/mutation/run.mjs            # 全変異を実行
 *   node tools/mutation/run.mjs --id O4-1  # 1件だけ
 *   node tools/mutation/run.mjs --list
 *
 * 【なぜ要るか】
 *   「テストがある」ことと「テストが守っている」ことは別である。P1 では
 *   **クラス係数を適用経路から外しても 196/196 が緑のまま**通った。
 *   テストが純関数しか見ていないと、本番経路から外れた瞬間に何も検出しない（R-1 の4度目）。
 *   ここで「壊すと落ちること」を機械的に実証し、報告書に貼れる形で出す。
 *
 * 【R-11: 検証ツールにも事後条件を持たせる】
 *   前便で、改変スクリプトが**空振りしたのに「改変した」と出力**し、
 *   「テストが検出できない」という誤った結論を出した。同じ穴を塞ぐため、本ツールは
 *     (1) アンカーがちょうど1件であること
 *     (2) 置換後に文字列が実際に変化したこと
 *     (3) 変異後のファイル内容が原本と異なること（書き込み後に読み直して確認）
 *     (4) 復元後に md5 が原本と一致すること
 *   をすべて assert する。1つでも破れたら非ゼロ終了する。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const md5 = (s) => createHash('md5').update(s).digest('hex');

/**
 * 変異の定義。
 * `expect: 'fail'` = この改変を入れたらテストが落ちなければならない（＝守られている）
 */
const MUTATIONS = [
  {
    id: 'O4-1',
    label: 'クラス係数を適用経路から外す（runSeason が掛けない）',
    file: 'apps/cli/src/racing-season.ts',
    from: 'c.prize += (PRIZE_BY_POSITION[row.finishPosition - 1] ?? 0) * classMult;',
    to: 'c.prize += PRIZE_BY_POSITION[row.finishPosition - 1] ?? 0;',
    expect: 'fail',
  },
  {
    id: 'O4-2',
    label: '素質開放率の幅を広げる（0.55–0.85 → 0.30–0.95）',
    file: 'apps/cli/src/race-field.ts',
    from: "export const PLACEHOLDER_UNLOCK = { MIN: 0.55, MAX: 0.85 } as const;",
    to: "export const PLACEHOLDER_UNLOCK = { MIN: 0.3, MAX: 0.95 } as const;",
    expect: 'fail',
  },
  {
    id: 'O4-3',
    label: 'クラス分けを撤廃する（クラス幅 6% → 100%）',
    file: 'apps/cli/src/race-field.ts',
    from: 'export const DEFAULT_CLASS_BAND = 0.06;',
    to: 'export const DEFAULT_CLASS_BAND = 1.0;',
    expect: 'fail',
  },
  {
    id: 'O4-4',
    label: '較正した K を正典の旧値へ戻す（0.26 → 0.12）',
    file: 'packages/race-engine/src/balance.ts',
    from: 'export const CALIBRATED_RACE_RANDOM_K = 0.26;',
    to: 'export const CALIBRATED_RACE_RANDOM_K = 0.12;',
    expect: 'fail',
  },
  {
    id: 'O4-5',
    label: '母集団を能力順に並べない（クラス分けが無意味になる）',
    file: 'apps/cli/src/race-field.ts',
    from: '    return ta - tb;',
    to: '    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;',
    expect: 'fail',
  },
  {
    id: 'O3-1',
    label: 'resolveRace の入口クランプを外す（憲法 ±10% が素通しになる）',
    file: 'packages/race-engine/src/race.ts',
    from: '    const interventionMult = clampInterventionMult(rawInterventionMult, balance);',
    to: '    const interventionMult = rawInterventionMult;',
    expect: 'fail',
  },
  {
    id: 'O1-1',
    label: '介入ログ→プラン変換を無視して常に無操作扱いにする',
    file: 'packages/race-engine/src/replay.ts',
    from: '    const plan = planFromInputs(inputs, ctx);',
    to: '    const plan = neutralPlan(ctx);',
    expect: 'fail',
  },
  {
    id: 'O1-2',
    label: '監査経路が着順の再計算をしない（ハッシュ検証だけに戻す）',
    file: 'packages/race-engine/src/replay.ts',
    from: '  for (const m of replayMismatches(params, replay.recordedOrder)) {',
    to: '  for (const m of [] as string[]) {',
    expect: 'fail',
  },
  {
    id: 'O1-3',
    label: '介入ログの判定にクライアント申告時刻を使う（詐称で有利にできる）',
    file: 'packages/race-engine/src/replay.ts',
    from: '    for (const s of starts) if (s.serverMs < earliest) earliest = s.serverMs;',
    to: '    for (const s of starts) if (s.clientMs < earliest) earliest = s.clientMs;',
    expect: 'fail',
  },
  {
    id: 'O2-1',
    label: '人気のタイブレークを枠順に戻す（V-6 が測定ノイズで決まる状態）',
    file: 'apps/cli/src/popularity.ts',
    from: '    (a, b) => b.wins - a.wins || a.meanRank - b.meanRank || a.index - b.index,',
    to: '    (a, b) => b.wins - a.wins || a.index - b.index,',
    expect: 'fail',
  },
  {
    id: 'O7-1',
    label: '疲労係数のクランプを外す（疲労500超でスコアの符号が反転する）',
    file: 'packages/race-engine/src/coefficients.ts',
    from: '  return clamp(1 - fatigue / balance.FATIGUE_DIV, 0, 1);',
    to: '  return 1 - fatigue / balance.FATIGUE_DIV;',
    expect: 'fail',
  },
  {
    id: 'O7-2',
    label: 'clamp が NaN を素通しする状態に戻す',
    file: 'packages/race-engine/src/coefficients.ts',
    from: '  if (Number.isNaN(value)) return (min + max) / 2;',
    to: '  if (false) return (min + max) / 2;',
    expect: 'fail',
  },
];

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const m of MUTATIONS) console.log(`${m.id.padEnd(6)} ${m.file.padEnd(42)} ${m.label}`);
  process.exit(0);
}
const only = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const targets = only === null ? MUTATIONS : MUTATIONS.filter((m) => m.id === only);
if (targets.length === 0) throw new Error(`変異が見つからない: ${only}`);

function runTests() {
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter', 'dot'], {
      stdio: 'pipe',
      shell: true,
      encoding: 'utf8',
    });
    return { passed: true, output: '' };
  } catch (e) {
    return { passed: false, output: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

/** 落ちたテスト名を抜き出す（どのテストが守っているかを報告に書くため） */
function failedTestNames(output) {
  const names = new Set();
  for (const line of output.split('\n')) {
    const m = line.match(/×\s+(.+?)(?:\s+\d+ms)?\s*$/);
    if (m !== null && m[1] !== undefined) names.add(m[1].replace(/\[[0-9;]*m/g, '').trim());
  }
  return [...names];
}

console.log('=== 変異試験（O-4 / R-11: 事後条件つき） ===');
console.log('');

// --- ★事前条件: 改変なしでテストが全緑であること ---
//   ベースラインが赤いと、どんな変異でも「落ちた＝守られている」に見えてしまい、
//   **変異試験そのものが無意味になる**。実際にこれを一度踏んだ（K が 0.26 になったのに
//   テストが 0.12 を固定したまま赤くなっており、その状態で3件の変異を「OK」と読んだ）。
{
  const base = runTests();
  if (!base.passed) {
    console.error('!!! 改変なしの状態でテストが落ちている。変異試験は成立しない');
    for (const n of failedTestNames(base.output).slice(0, 10)) console.error(`    × ${n}`);
    process.exit(2);
  }
  console.log('ベースライン: 全緑を確認');
  console.log('');
}

const results = [];
let toolFailure = false;

for (const mut of targets) {
  const original = readFileSync(mut.file, 'utf8');
  const originalHash = md5(original);

  // --- 事後条件(1): アンカーがちょうど1件 ---
  const count = original.split(mut.from).length - 1;
  if (count !== 1) {
    console.error(`!!! [${mut.id}] アンカーが ${count} 件（1件でないと変異を特定できない）`);
    console.error(`    file: ${mut.file}`);
    console.error(`    from: ${mut.from.slice(0, 80)}`);
    toolFailure = true;
    continue;
  }

  // --- 事後条件(2): 置換で文字列が実際に変化した ---
  const mutated = original.replace(mut.from, mut.to);
  if (mutated === original) {
    console.error(`!!! [${mut.id}] 置換が空振りした（前便の失敗と同じ形）`);
    toolFailure = true;
    continue;
  }

  let result;
  try {
    writeFileSync(mut.file, mutated);
    // --- 事後条件(3): 書き込んだ内容がディスク上で原本と異なる ---
    const onDisk = readFileSync(mut.file, 'utf8');
    if (md5(onDisk) === originalHash) {
      throw new Error('書き込み後もディスク上の内容が原本と同じ（変異が入っていない）');
    }
    result = runTests();
  } finally {
    writeFileSync(mut.file, original);
    // --- 事後条件(4): 復元後に md5 が原本と一致 ---
    if (md5(readFileSync(mut.file, 'utf8')) !== originalHash) {
      console.error(`!!! [${mut.id}] ${mut.file} の復元に失敗した`);
      toolFailure = true;
    }
  }

  const detected = !result.passed;
  const ok = mut.expect === 'fail' ? detected : !detected;
  results.push({ ...mut, detected, ok, failed: failedTestNames(result.output) });

  console.log(`[${mut.id}] ${mut.label}`);
  console.log(`   → テスト: ${detected ? '落ちた（守られている）' : '★全緑（守られていない）'}  判定: ${ok ? 'OK' : 'NG'}`);
  if (detected && result.output !== '') {
    const names = failedTestNames(result.output);
    for (const n of names.slice(0, 4)) console.log(`      × ${n}`);
    if (names.length > 4) console.log(`      … ほか ${names.length - 4} 件`);
  }
  console.log('');
}

const ng = results.filter((r) => !r.ok);
console.log('---');
console.log(`実施 ${results.length} 件 / 守られている ${results.length - ng.length} 件 / 守られていない ${ng.length} 件`);
for (const r of ng) console.log(`  ★未防御: [${r.id}] ${r.label}`);
if (toolFailure) {
  console.error('!!! ツール自身の事後条件が破れた。結果は信用できない');
  process.exit(2);
}
process.exitCode = ng.length === 0 ? 0 : 1;
