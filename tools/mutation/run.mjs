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
 * 振る舞いを固定するテストの目印（R-14）。
 *
 * ★値照合テスト（`toBe(0.26)` の類）は摂動すれば必ず落ちるので、
 *   「落ちた＝守られている」は成立しない。**振る舞いのテストが落ちたこと**を要求する。
 *   規約: 振る舞いを固定するテストは名前の先頭に ★ を付ける。
 */
const BEHAVIOURAL_MARK = "★";

/**
 * 変異の定義。
 * `expect: 'fail'` = この改変を入れたらテストが落ちなければならない（＝守られている）
 */
const MUTATIONS = [
  {
    // ★V-13 / R-16: 旧スタミナ実装（絶対値 1.0/秒）へ戻す。全馬のゲージが必ず空になり、
    //   仕掛けの巧拙が結果に出なくなる。**V-8（比）も V-9a（範囲）もこれを検出できなかった**
    //   ので、差を見る ★V-13 が唯一の検出器であることを、この変異で毎回確かめる。
    id: 'V13-1',
    label: 'D-017 を撤回し毎秒消費を距離非依存の絶対値に戻す（全馬バテる）',
    file: 'packages/race-engine/src/intervention.ts',
    from: 'const unit = balance.STAMINA_BASE_DRAIN / raceSec;',
    to: 'const unit = 1.0;',
    expect: 'fail',
  },
  {
    id: 'O4-1',
    label: 'クラス係数を適用経路から外す（runSeason が掛けない）',
    file: 'apps/cli/src/racing-season.ts',
    from: 'c.prize += (PRIZE_BY_POSITION[row.finishPosition - 1] ?? 0) * classMult;',
    to: 'c.prize += PRIZE_BY_POSITION[row.finishPosition - 1] ?? 0;',
    expect: 'fail',
  },
  // ★O4-2（開放率）/ O4-3（クラス幅）/ O4-4（K）は `calibration.ts` の登録簿へ移した。
  //   手書きと登録簿の二重管理にすると片方だけ更新される（L-2 で潰したクラス）。
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

/**
 * ★較正定数の変異は**登録簿から自動生成する**（Q-3）。
 *
 *   手で書いた変異集合は、定数を新設したときに必ず漏れる（実際 P1-fix2 の1便で3つ漏れた）。
 *   登録簿から生成すれば、**新しい較正定数を追加した瞬間に変異項目も増える**ので、
 *   防御するテストが無ければ `npm run mutation` がその場で落ちる。
 *   登録漏れそのものは `apps/cli/test/calibration-registry.test.ts` が塞ぐ。
 */
function calibrationMutations() {
  const raw = execFileSync('npx', ['tsx', 'tools/mutation/dump-calibration.ts'], {
    encoding: 'utf8',
    shell: true,
  });
  const start = raw.indexOf('[');
  if (start < 0) throw new Error('登録簿の JSON を取得できなかった');
  const list = JSON.parse(raw.slice(start));
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('登録簿が空。変異試験が何も検査しない状態になる');
  }
  return list.map((c) => ({
    id: `CAL-${c.key}`,
    label: `較正定数 ${c.key} を摂動（${c.affects}）`,
    file: c.file,
    from: c.declaration,
    to: c.perturbed,
    expect: 'fail',
  }));
}

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const m of [...MUTATIONS, ...calibrationMutations()]) {
    console.log(`${m.id.padEnd(30)} ${m.file.padEnd(40)} ${m.label}`);
  }
  process.exit(0);
}
const ALL = [...MUTATIONS, ...calibrationMutations()];
const only = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const targets = only === null ? ALL : ALL.filter((m) => m.id === only);
if (targets.length === 0) throw new Error(`変異が見つからない: ${only}`);

function runTests() {
  try {
    // ★`--reporter dot` はテスト名を出さないため、落ちたテスト名が**常に空**だった（Q-6c）。
    //   その結果「どのテストが守っているか」を誰も確認できず、
    //   自己検出（値照合テストだけが落ちている状態）を見逃した。
    //   **ハーネスの verdict が監査できないなら、ハーネスを信頼する根拠がない。**
    execFileSync('npx', ['vitest', 'run', '--reporter', 'basic'], {
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
    const clean = line.replace(new RegExp(String.fromCharCode(27) + String.raw`[[0-9;]*m`, 'g'), '');
    const m = clean.match(/(?:×|FAIL)\s+(.+?)(?:\s+\d+ms)?\s*$/);
    if (m !== null && m[1] !== undefined) names.add(m[1].trim());
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

/** 実行中に摂動しているファイル。異常終了時に復元する */
let pendingRestore = null;
const restoreOnAbort = (signal) => {
  if (pendingRestore !== null) {
    writeFileSync(pendingRestore.file, pendingRestore.content);
    console.error(`
!!! ${signal} を受けたので ${pendingRestore.file} を復元しました`);
    pendingRestore = null;
  }
  process.exit(1);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => restoreOnAbort(sig));
}

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
  // ★強制終了（Ctrl-C / タイムアウトの SIGTERM）でも復元する。
  //   finally は SIGTERM では走らないため、これが無いと**摂動したままのファイルが
  //   作業ツリーに残る**。実際に10分タイムアウトで POLICY_FIT_WEIGHT = 0 が残り、
  //   次の実行が「改変なしの状態でテストが落ちている」と誤判定した。
  //   R-11 の系: 検証ツールは異常終了したときの後始末まで含めて検証ツールである。
  pendingRestore = { file: mut.file, content: original };
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
    pendingRestore = null;
    // --- 事後条件(4): 復元後に md5 が原本と一致 ---
    if (md5(readFileSync(mut.file, 'utf8')) !== originalHash) {
      console.error(`!!! [${mut.id}] ${mut.file} の復元に失敗した`);
      toolFailure = true;
    }
  }

  const detected = !result.passed;
  const failed = failedTestNames(result.output);
  // ★R-14 の機械強制:
  //   「何かが落ちた」だけでは不十分。**振る舞いのテストが落ちること**を要求する。
  //   値照合テスト（`toBe(0.26)` の類）は摂動すれば必ず落ちるので、それだけでは
  //   「守られている」と言えない — K と OFF_SURFACE_ENTRY_RATE が実際にその状態だった。
  //   規約: 振る舞いを固定するテストは名前に ★ を付ける。
  const behavioural = failed.filter((n) => n.includes(BEHAVIOURAL_MARK));
  const ok =
    mut.expect === 'fail' ? detected && behavioural.length > 0 : !detected;
  results.push({ ...mut, detected, ok, failed, behavioural });

  const verdictText = !detected
    ? '全緑（守られていない）'
    : behavioural.length > 0
      ? '落ちた（振る舞いのテストが検出）'
      : `落ちたが**値照合のみ**（${BEHAVIOURAL_MARK} 付きのテストが1件も落ちていない）`;
  console.log(`[${mut.id}] ${mut.label}`);
  console.log(`   → テスト: ${verdictText}  判定: ${ok ? 'OK' : 'NG'}`);
  if (detected && failed.length > 0) {
    for (const n of failed.slice(0, 4)) {
      console.log(`      ${n.includes(BEHAVIOURAL_MARK) ? '×★' : '× '} ${n}`);
    }
    if (failed.length > 4) console.log(`      … ほか ${failed.length - 4} 件`);
  }
  console.log('');
}

const ng = results.filter((r) => !r.ok);
console.log('---');
console.log(`実施 ${results.length} 件 / 守られている ${results.length - ng.length} 件 / 守られていない ${ng.length} 件`);
for (const r of ng) {
  const why =
    r.detected && r.behavioural.length === 0
      ? `値照合テストしか落ちていない（${BEHAVIOURAL_MARK} 付きの振る舞いテストが要る）`
      : 'テストが全緑';
  console.log(`  未防御: [${r.id}] ${r.label}`);
  console.log(`          理由: ${why}`);
}
if (toolFailure) {
  console.error('!!! ツール自身の事後条件が破れた。結果は信用できない');
  process.exit(2);
}
process.exitCode = ng.length === 0 ? 0 : 1;
