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
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

// ────────────────────────────────────────────────────────────────
// ★★変異は**使い捨ての作業ツリーの中だけ**で起こす（R-18 の拡張・2度目の是正）
//
// 【なぜ手順ではだめか】
//   「実行中はコミットしない」は**手順**です。**2度**踏みました:
//     1回目 … 実行中にコミットし、`NPC_FOLLOW_TOP_RATIO` の変異が `aec4467` に焼き付いた
//     2回目 … 実行中にコミットし（今回は運良く無事）、さらに**ハーネスを中断したら
//              `FIELD_STRENGTH_FLOOR = 0.0` が作業ツリーに残っていた**
//   ★中断・異常終了では `finally` すら走りません。**手順で守る限り3度目が来ます。**
//
// 【構造で守る】
//   `git worktree` で別のツリーを作り、**そこで改変してそこでゲートを回します**。
//   本体のツリーは**一度も触られません**。中断しても残るのは捨てるツリーだけです。
// ────────────────────────────────────────────────────────────────
const KEEP = process.argv.includes('--keep-worktree');
/**
 * ★作業ツリーは**リポジトリの外**に作ります。
 *   中に作ると、掃除に失敗したとき本体の `git status` に混ざります。
 */
const WORKTREE = arg('--worktree', join(tmpdir(), 'star-mutation-worktree'));
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', ...opts });

// ★汚れたツリーから作ると「原本」が何か分からなくなります
const dirty = sh('git', ['status', '--porcelain', '--untracked-files=no']).trim();
if (dirty !== '') {
  console.error('★作業ツリーに未コミットの変更があります。原本が確定しないので中止します:');
  console.error(dirty.split('\n').map((l) => `    ${l}`).join('\n'));
  console.error('  （コミットするか stash してから回してください）');
  process.exit(2);
}
const HEAD_SHA = sh('git', ['rev-parse', 'HEAD']).trim();

if (existsSync(WORKTREE)) {
  // ★ここでも**リンクを先に外す**。rmSync の recursive はジャンクションを辿ります
  const oldNm = join(WORKTREE, 'node_modules');
  if (existsSync(oldNm)) {
    try {
      if (process.platform === 'win32') sh('cmd', ['/c', 'rmdir', oldNm], { stdio: 'pipe' });
      else sh('unlink', [oldNm]);
    } catch { /* 下で確認する */ }
  }
  if (existsSync(oldNm)) {
    console.error(`★前回の node_modules リンクを外せません。手で外してください: ${oldNm}`);
    process.exit(2);
  }
  try { sh('git', ['worktree', 'remove', '--force', WORKTREE], { stdio: 'pipe' }); } catch { rmSync(WORKTREE, { recursive: true, force: true }); }
}
sh('git', ['worktree', 'prune'], { stdio: 'pipe' });
sh('git', ['worktree', 'add', '--detach', WORKTREE, HEAD_SHA], { stdio: 'pipe' });
console.log(`  ★変異は別ツリーの中だけで起こします: ${WORKTREE}（${HEAD_SHA.slice(0, 7)}）`);
// ★node_modules はツリーに含まれないので、本体のものを指す（npm ci をやり直さない）
//   Windows のジャンクションは管理者権限が要らない
/**
 * ★`node_modules` はツリーに含まれないので、本体のものを指します（`npm ci` をやり直さない）。
 *
 * ⚠️⚠️ **リンクを張ったまま `git worktree remove --force` を実行してはいけません。**
 *   ★実際にやって**本体を壊しました**: Windows のジャンクションを再帰削除が辿り、
 *     **本体の `node_modules` が空になり、追跡ファイル178件が消えました**
 *     （コミット済みだったので `git checkout -- .` と `npm ci` で復旧）。
 *   → 片付けでは**必ず先にリンクだけを外します**（下の `unlinkNodeModules`）。
 */
const nm = join(WORKTREE, 'node_modules');
const realNodeModules = join(process.cwd(), 'node_modules');
if (!existsSync(nm)) {
  if (process.platform === 'win32') {
    sh('cmd', ['/c', 'mklink', '/J', nm, realNodeModules], { stdio: 'pipe' });
  } else {
    sh('ln', ['-s', realNodeModules, nm]);
  }
}

/** ★リンクだけを外す（中身は消さない）。`rmdir` / `unlink` はリンクを辿りません */
const unlinkNodeModules = () => {
  if (!existsSync(nm)) return;
  try {
    if (process.platform === 'win32') sh('cmd', ['/c', 'rmdir', nm], { stdio: 'pipe' });
    else sh('unlink', [nm]);
  } catch { /* 外せなければ worktree を消さない（下で確認する） */ }
};

const cleanupWorktree = () => {
  if (KEEP) { console.log(`  ★--keep-worktree が付いているので残します: ${WORKTREE}`); return; }
  unlinkNodeModules();
  // ★事後条件: リンクが残っているのに再帰削除しない（本体を巻き添えにするため）
  if (existsSync(nm)) {
    console.error(`  ★node_modules のリンクを外せませんでした。**worktree を消しません**: ${WORKTREE}`);
    console.error('    （このまま消すと本体の node_modules を巻き添えにします）');
    return;
  }
  try { sh('git', ['worktree', 'remove', '--force', WORKTREE], { stdio: 'pipe' }); } catch { /* 残っても本体は無傷 */ }
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanupWorktree(); process.exit(130); });

/**
 * ゲートを回して JSON を返す。
 *
 * ★**ゲートが FAIL すると非ゼロ終了し、`execFileSync` は例外を投げます。**
 *   つまり素直に書くと「**捕まえたときに必ず落ちる**」ツールになります（実際そうなりました）。
 *   ここで拾うのが目的そのものなので、**終了コードではなく出力を読みます**。
 */
const runGate = (gate) => {
  if (gate !== 'race') throw new Error(`未対応のゲート: ${gate}`);
  const opts = { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: process.platform === 'win32' };
  const argv = ['tsx', 'apps/cli/src/verify-race.ts', '--races', RACES, '--seeds', SEEDS, '--json'];
  let out;
  let exitCode = 0;
  try {
    // ★cwd を作業ツリーにする。**本体のソースは一度も読まれません**
    out = execFileSync('npx', argv, { ...opts, cwd: WORKTREE });
  } catch (e) {
    // ★非ゼロ終了は**想定内**（ゲートが落ちた場合）。出力が取れていなければ本当の異常
    out = typeof e.stdout === 'string' ? e.stdout : '';
    exitCode = typeof e.status === 'number' ? e.status : -1;
    if (out === '') throw new Error(`ゲートが出力なしで終了しました (status=${exitCode}): ${e.message}`);
  }
  const start = out.lastIndexOf('\n{');
  if (start < 0) throw new Error(`JSON が見つかりません (status=${exitCode})`);
  const parsed = JSON.parse(out.slice(start + 1));
  return { ...parsed, exitCode };
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
// ★終了コードと判定が食い違ったら、どちらかが壊れています（R-21）
if ((base.exitCode === 0) !== (baseBad.length === 0)) {
  console.error(`★基準の終了コード(${base.exitCode})と判定(${baseBad.length}件FAIL)が食い違います。中止します`);
  process.exit(2);
}
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
  // ★改変するのは**作業ツリー側のファイル**。本体は触りません
  const path = join(WORKTREE, t.file);
  const original = readFileSync(path, 'utf8');
  const originalMd5 = md5(original);
  console.log(`── ${t.key} → ${t.expect.join(' / ')} が落ちるはず`);

  // 事後条件(1): アンカーがちょうど1件
  const hits = original.split(t.from).length - 1;
  if (hits !== 1) {
    console.error(`  ★アンカーが ${hits} 件です（1件でなければ改変が空振りします）`);
    process.exit(2);
  }
  const mutated = original.replace(t.from, t.to);
  writeFileSync(path, mutated, 'utf8');

  let row;
  try {
    // 事後条件(2): ディスク上で変わった
    if (md5(readFileSync(path, 'utf8')) === originalMd5) {
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
    writeFileSync(path, original, 'utf8');
    if (md5(readFileSync(path, 'utf8')) !== originalMd5) {
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

// ★本体のツリーが一度も触られていないことを、最後に機械で確かめる
const after = sh('git', ['status', '--porcelain', '--untracked-files=no']).trim();
if (after !== '') {
  console.error('');
  console.error('★★本体の作業ツリーが汚れています（worktree 分離が効いていません）:');
  console.error(after.split('\n').map((l) => `    ${l}`).join('\n'));
  cleanupWorktree();
  process.exit(2);
}
console.log('  ✓ 本体の作業ツリーは無傷（git status が空）');
cleanupWorktree();
process.exit(bad.length === 0 ? 0 : 1);
