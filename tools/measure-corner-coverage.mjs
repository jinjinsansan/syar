/**
 * ★**コーナーに、コーナーのカットが当たっているか**を 50 鞍で測る（★2026-09-12・★オーナー指摘）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★他のあらゆるコースではカーブがもっとあり、右回り・左回りもあります。
 *   ★**コーナー映像がないのもおかしい**です」。
 *
 *   ⚠️ ★台本 v6 の切り替え地点は、★直線より手前を ★**距離の割合**で切っています
 *      （`v6BoundariesM` の錨②）。★コーナーの実際の位置は見ていません。
 *   ★`broadcast-v2.ts` の註記にも残件として書かれています:
 *     ★「★4 角のカットを 4 角の区間へ**貼り直してはいません**。
 *       ★桜星賞でも今日 36m ぶん 3 角に食い込んでおり…★別件として台帳に残します」
 *
 * 【★測ること】★1 鞍ごとに:
 *   ★① 走路にコーナーが何区間あるか（★1 角〜4 角・★右回り / 左回り）
 *   ★② 4 角のカットが、★**本当の 4 角**とどれだけ重なっているか
 *   ★③ ★**どのコーナーにも当たっていない**コーナーが何区間あるか（★＝映像が無いコーナー）
 *
 * ⚠️ ★DB に触れません。★読むだけです。
 *
 * ★実行: npx tsx tools/measure-corner-coverage.mjs
 */
import { GRADED_RACES, raceSetupById } from '@star/scheduler';
import { ovalCourse, broadcastV2ScriptBoundariesM, broadcastV2ShotById } from '@star/render';

/** ★コーナーのカットかどうか（★名前ではなく画角と素材で見る・★名前の並べ上げは漏れる） */
const isCornerShot = (id) => id.includes('-corner-');

const rows = [];
for (const race of GRADED_RACES) {
  const setup = raceSetupById(race.id);
  const course = ovalCourse(setup.distanceM, { ...setup.spec, turn: setup.turn });

  /** ★走路のコーナー区間（★実際の形から） */
  const corners = [];
  let acc = 0;
  for (const seg of course.segments) {
    if (seg.type === 'corner') corners.push({ label: seg.label, from: acc, to: acc + seg.length });
    acc += seg.length;
  }

  /** ★台本のカット区間 */
  const bounds = broadcastV2ScriptBoundariesM(course, 'v6');
  const cuts = [];
  let prev = 0;
  for (const b of bounds) { cuts.push({ id: b.id, from: prev, to: b.meters }); prev = b.meters; }
  const cornerCuts = cuts.filter((c) => isCornerShot(c.id));

  /** ★重なりの長さ */
  const overlap = (a, b) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
  const covered = corners.map((k) => ({
    ...k,
    len: k.to - k.from,
    hit: cornerCuts.reduce((s, c) => s + overlap(k, c), 0),
  }));
  const uncovered = covered.filter((k) => k.hit / k.len < 0.2);

  /**
   * ★コーナーのカットが ★**どのコーナーにも当たっていない**長さ。
   * ⚠️ ★2026-09-12 まで「4 角の外」で測っていましたが、★コーナーが複数あるコースでは
   *    ★2 角・3 角に当たっているカットまで「外」と数えてしまいます（★測る相手を間違えていました）。
   */
  const stray = cornerCuts.reduce((s, c) => s + Math.max(0,
    (c.to - c.from) - corners.reduce((t, k) => t + overlap(c, k), 0)), 0);

  rows.push({
    name: race.name ?? race.id, dist: setup.distanceM, turn: setup.turn,
    corners: corners.length, cornerCuts: cornerCuts.length,
    cutLen: cornerCuts.reduce((s, c) => s + (c.to - c.from), 0),
    stray, uncovered: uncovered.length, uncoveredLabels: uncovered.map((k) => k.label).join(','),
  });
}

console.log('鞍名                 距離  回り  コーナー区間  コーナーのカット  カットの長さ  コーナー外  映像が無いコーナー');
for (const r of rows) {
  console.log(
    `${r.name.padEnd(20).slice(0, 20)} ${String(r.dist).padStart(5)} ${r.turn === 'left' ? '左' : '右'}`
    + `  ${String(r.corners).padStart(10)}  ${String(r.cornerCuts).padStart(14)}`
    + `  ${r.cutLen.toFixed(0).padStart(10)}m  ${r.stray.toFixed(0).padStart(7)}m`
    + `  ${String(r.uncovered).padStart(6)} ${r.uncoveredLabels}`,
  );
}
const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
console.log('');
console.log(`★鞍数 ${rows.length}（★左回り ${rows.filter((r) => r.turn === 'left').length} ／ 右回り ${rows.filter((r) => r.turn === 'right').length}）`);
console.log(`★コーナー区間の合計 ${sum((r) => r.corners)} ／ ★そのうち映像が無い ${sum((r) => r.uncovered)}`
  + `（${(sum((r) => r.uncovered) / sum((r) => r.corners) * 100).toFixed(0)}%）`);
console.log(`★コーナーのカットがコーナーの外に出ている長さ 合計 ${sum((r) => r.stray).toFixed(0)}m`
  + ` ／ 1 鞍あたり平均 ${(sum((r) => r.stray) / rows.length).toFixed(0)}m`);
const worst = [...rows].sort((a, b) => b.stray - a.stray).slice(0, 5);
console.log('★コーナーの外へのはみ出しが大きい 5 鞍:');
for (const r of worst) console.log(`  ${r.name} … ${r.stray.toFixed(0)}m`);
