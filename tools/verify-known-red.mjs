/**
 * ★**登録外の赤が 1 つでもあれば落ちる**（★RD-2・2026-09-19）
 *   ★裁定 `REVIEW_UI4_PREP_VERDICT_20260919.md` §4
 *
 * ★`npm test` を流し、★落ちた検査の名前を `tools/lib/known-red.mjs` と突き合わせます。
 *
 * 【★落ちる条件】
 *   ① ★登録簿に無い赤がある
 *   ② ★登録簿にあるのに緑になっている（★悲観的な登録簿は、本当の赤を隠します）
 *   ③ ★登録の期限が切れている
 *   ④ ★登録に `why` / `owner` / `until` が欠けている
 *
 * ⚠️ ★**検査そのものは動かしません**。★ここは照合だけです。
 * ⚠️ ★これは ★**状態を変えない道具**です（★分類: READ_ONLY）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KNOWN_RED, diffAgainstRegistry } from './lib/known-red.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'star-known-red-'));
const jsonPath = path.join(dir, 'result.json');

console.log('★npm test を流しています（★数分かかります）…');
/**
 * ⚠️ ★**`npx` を呼びません**。★Windows では `npx.cmd` を `shell: false` で起動できず
 *    （`spawnSync npx.cmd EINVAL`）、★`shell: true` にすると引数が shell に解釈されます。
 *    → ★**vitest の入口 js を node で直接**呼びます（★どの OS でも同じ形）。
 */
const VITEST = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
if (!existsSync(VITEST)) { console.error('★vitest が見つかりません:', VITEST); process.exit(2); }
const run = spawnSync(
  process.execPath,
  [VITEST, 'run', '--reporter=json', '--outputFile', jsonPath],
  { stdio: ['ignore', 'ignore', 'inherit'], shell: false },
);
if (run.error) { console.error('★vitest を起動できませんでした:', run.error.message); process.exit(2); }

let report;
try {
  report = JSON.parse(readFileSync(jsonPath, 'utf8'));
} catch (e) {
  console.error('★結果の JSON を読めませんでした:', e.message);
  process.exit(2);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

/** ★落ちた検査の名前（★ファイル > describe > it）。★`assertionResults` の `fullName` を使う */
const failing = [];
/**
 * 🔴 ★**読み込めなかったファイル**（★**CI-4**・2026-09-19・★CI の 1 回目で見つかった）。
 *
 * 【★何が起きていたか】
 *   ★ファイルが ★**モジュールの段階で落ちる**と、★vitest は
 *   ★`status: 'failed'` ／ ★**`assertionResults: []`** ／ ★`numFailedTests: 0` を返します。
 *   → ★下のループは `assertionResults` しか見ていなかったので、
 *     ★★**1 件も数えず、1 件も赤にしませんでした。**
 *   → ★★**「走らなかった」が「緑」として通っていました**（★R-21 そのもの）。
 *
 * ✔ ★実測（2026-09-19・手元で再現）: ★`out/2d-edit-grammar` を退避して
 *   ★`edit-grammar-audit.test.ts` を流すと ★**`numTotalTests: 0` / `numFailedTests: 0`**。
 *   ★登録済みの 2 件は ★**「緑に戻った」ように見え**、★登録を消せと言われました。
 *   🔴 ★**CI の 1 回目が、まさにそれを言ってきました**（★CI には `out/` が無い）。
 *
 * ⚠️ ★**登録簿に「どの機械で赤か」を足して隠しません**（★CI-5）。
 *    ★**機械で結果が変わることが欠陥**で、★足すとその欠陥が仕様になります。
 */
const unloadable = [];
let total = 0;
for (const file of report.testResults ?? []) {
  const rel = path.relative(process.cwd(), file.name).split(path.sep).join('/');
  const asserts = file.assertionResults ?? [];
  for (const a of asserts) {
    total += 1;
    if (a.status === 'failed') failing.push(`${rel} > ${a.fullName}`);
  }
  /**
   * 🔴 ★**検査が 1 つも拾えなかったのに、ファイルが落ちている** ＝ ★読み込めていません。
   *   ★名前が無いので照合できません。★**登録簿で許すこともできません**（★そこが要点）。
   */
  if (asserts.length === 0 && file.status === 'failed') {
    const firstLine = (file.message ?? '').split(String.fromCharCode(10))[0] ?? '';
    unloadable.push({ file: rel, message: firstLine.slice(0, 200) });
  }
}
if (total === 0) {
  console.error('🔴 ★検査を 1 つも拾えていません（★走査が空・R-21）。★照合していません');
  process.exit(2);
}

/** ⚠️ ★今日はここで 1 回だけ作り、★照合の関数には**渡します**（★純粋に保つ） */
const todayIso = new Date().toISOString().slice(0, 10);
const d = diffAgainstRegistry(failing, todayIso, undefined, unloadable);

console.log(`\n=== 赤の照合（★検査 ${total} 件・赤 ${failing.length} 件・登録 ${KNOWN_RED.length} 件） ===`);
const say = (label, list) => {
  if (list.length === 0) { console.log(`  ✅ ${label}`); return false; }
  console.log(`  🔴 ${label}`);
  for (const x of list) console.log(`       ${x}`);
  return true;
};
let bad = false;
bad = say('★登録簿に無い赤がない', d.unregistered) || bad;
bad = say('★登録簿に、緑に戻ったものが残っていない', d.staleGreen) || bad;
bad = say('★登録の期限が切れていない', d.expired) || bad;
bad = say('★登録に why / owner / until が揃っている', d.missingFields) || bad;
/**
 * 🔴 ★**読み込めなかったファイル**（★**CI-4** → ★**CI-8** で簿に載せられるようにしました）。
 *
 * ★「走らなかった」は「緑」でも「既知の赤」でもなく、★**照合そのものが成り立っていない**状態です。
 * ✅ ★ただし ★**物の理由**（★「この生成物はブラウザの撮影が要る」）なら、
 *   ★`KNOWN_UNLOADABLE` に ★**理由・担当・期限つき**で載せられます。
 * 🔴 ★**機械の理由**（★「CI では通らない」）は載せられません（★**CI-5**）—
 *   ★機械差は**欠陥**で、★載せると**欠陥が仕様になります**。
 */
bad = say('★簿に無い「読み込めないファイル」がない（★CI-4）', d.unregisteredUnloadable) || bad;
bad = say('★「読み込めない」の登録の期限が切れていない', d.unloadableExpired) || bad;
bad = say('★「読み込めない」の登録に why / owner / until が揃っている', d.unloadableMissing) || bad;
bad = say('🔴 ★「機械が違うから」を理由にしていない（★CI-5）', d.machineExcuses) || bad;

if (bad) {
  console.log('\n🔴 ★不合格。★赤を直すか、★理由・担当・期限を書いて tools/lib/known-red.mjs に載せてください');
  process.exit(1);
}
console.log('\n✅ ★合格（★赤は登録簿のとおり）');
