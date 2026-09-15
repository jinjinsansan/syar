/**
 * ★**距離ロスの指紋の期待値を書く**（★ES 便 ES-1・★直す前のコミットで 1 回だけ流す）
 *
 * ★実行: `npx tsx packages/race-engine/test/lane-fingerprint.gen.ts`
 * ⚠️ ★**ES 便で `lane.ts`・`race.ts` を直した後にこれを流し直さないこと。** ★流し直すと、
 *    ★直した後のコードを直した後のコードと比べる検査になります（★R-16）。
 *    ★期待値を作り直してよいのは、★結果を変えることが裁定で決まった便だけです。
 * ⚠️ ★DB に触れません（★ファイルを 1 つ書くだけ）。
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fingerprintCases, fingerprintOf, FINGERPRINT_HEADS, FINGERPRINT_SEEDS, LANE_AT_STEP_M } from './lane-fingerprint.cases.js';

const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const dirty = execSync('git status --porcelain=v1 -- packages/race-engine/src packages/sim-engine/src packages/scheduler/src', { encoding: 'utf8' }).trim();
if (dirty !== '') {
  console.error(`★エンジン・遺伝・番組のコードに未コミットの変更があります。★直す前のコミットで取ってください:\n${dirty}`);
  process.exit(2);
}
const t0 = performance.now();
const expected: Record<string, string> = {};
for (const c of fingerprintCases()) expected[c.key] = fingerprintOf(c);
const out = {
  note: 'ES 便 ES-1。直す前のコミットで取った距離ロスの指紋。lane-fingerprint.gen.ts の註記を読んでから触ること',
  engineCommit: commit,
  heads: FINGERPRINT_HEADS, seeds: FINGERPRINT_SEEDS, laneAtStepM: LANE_AT_STEP_M,
  cases: Object.keys(expected).length,
  expected,
};
writeFileSync(new URL('./lane-fingerprint.expected.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(`★${out.cases} 組の指紋を書きました（エンジンのコミット ${commit}・${((performance.now() - t0) / 1000).toFixed(1)} 秒）`);
