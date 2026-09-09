/**
 * ★**コーナーで、馬の向きがどれだけ食い違うか**を測る（★2026-09-09）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★コーナーが不自然」。★レビュー側 codex も同じ見立てです:
 *     ★「カットの注視点から向きを 1 つ求めて、★全馬に同じ方向画像を当てている。
 *       ★コーナーの接線は走行位置ごとに違うので、★曲線に追従しない」
 *
 * ⚠️ ★**「馬ごとに向きを変える」は過去に 2 回却下されています**（★`broadcast-v2-scene.ts` の注記）:
 *    ★2026-08-21 … ★同じカットで馬ごとに別素材・別反転になり
 *                   ★オーナー評「★1 匹別の方向に馬が走っている」
 *    ★2026-08-26 … ★横縮小は回転ではない／素材切替は 1 コマで絵が跳ぶ
 *    → ★**直す前に、まず「どれだけ食い違うか」を数字にします。**
 *
 * 【★何を測るか】
 *   ★コーナーの各地点で、★**先頭馬と最後方馬の接線の向きの差**（度）。
 *   ★これが小さければ「全馬に同じ向き」で足ります。★大きいほど破綻します。
 *
 * ⚠️ ★**「6° だから目に見えない」とは、この数字だけでは言えません**（★2026-09-09・撤回）。
 *    ★開発側は静止画しか見ずに断定し、★レビュー側に指摘されました。
 *    ★見えるかどうかは ★**動画で確かめること**。
 *
 * ★実行: npx tsx tools/measure-corner-facing.mjs
 */
import { ovalCourse, posOf } from '@star/render';
import { raceSetupFromParam } from '@star/scheduler';

const setup = raceSetupFromParam(null).setup;
const course = ovalCourse(setup.distanceM, { ...setup.spec, turn: setup.turn });

/** ★走路上の 2 点から接線の向き（度） */
const headingAt = (s, w) => {
  const a = posOf(course, s, w);
  const b = posOf(course, s + 1, w);
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
};
const wrap = (d) => { let x = d; while (x > 180) x -= 360; while (x < -180) x += 360; return x; };

console.log('# ★コーナーで、馬の向きがどれだけ食い違うか');
console.log(`  ★走路 ${setup.distanceM}m ／ 幅 ${setup.spec.widthM}m`);
console.log();
console.log('  走破位置   区間          ★先頭と最後方の向きの差（★馬群 20m）   ★内と外の差（★幅いっぱい）');
for (let s = 0; s <= setup.distanceM; s += 100) {
  const packSpread = Math.abs(wrap(headingAt(Math.max(0, s - 20), 4) - headingAt(s, 4)));
  const laneSpread = Math.abs(wrap(headingAt(s, 1) - headingAt(s, setup.spec.widthM - 1)));
  const label = packSpread > 6 ? '  ★大きい' : '';
  console.log(`  ${String(s).padStart(6)}m              ${packSpread.toFixed(1).padStart(6)}°`
    + `                       ${laneSpread.toFixed(1).padStart(5)}°${label}`);
}

/**
 * ★**4 角の正面カットで、馬はカメラに対して何度を向くべきか**（★2026-09-09）
 *   ★これが「素材を増やすなら何段要るか」の答えになります。
 */
console.log();
console.log('# ★4 角の正面カットで、馬がカメラに対して向く角度');
console.log('  ★0° = カメラへ真正面 ／ 90° = 真横');
const cam = { x: 0, y: 0 };
for (const s of [900, 930, 960, 990, 1020]) {
  const a = posOf(course, s, 4);
  const b = posOf(course, s + 1, 4);
  /** ★カメラは馬群の少し前方・走路の外側に置かれます（★`fourth-corner-front` の camera） */
  const c = posOf(course, s + 34, 4);
  const fx = b.x - a.x; const fy = b.y - a.y;
  const vx = a.x - c.x; const vy = a.y - c.y;
  const cosT = (fx * vx + fy * vy) / ((Math.hypot(fx, fy) || 1) * (Math.hypot(vx, vy) || 1));
  const deg = (Math.acos(Math.max(-1, Math.min(1, cosT))) * 180) / Math.PI;
  console.log(`  ${String(s).padStart(5)}m   ${deg.toFixed(0).padStart(4)}°`);
}

/**
 * ★**4 角で、馬群は画面上でどう並ぶか**（★2026-09-09）
 *   ★オーナー評「コーナーが不自然」。★実際の絵では ★**内ラチが曲がっているのに
 *   ★馬群が横一列**に見えました。★それが位置のせいか、★カメラのせいかを分けます。
 */
console.log();
console.log('# ★4 角で、20m 後ろの馬は画面上どこに来るか');
console.log('  ★走路の曲がりに沿えば、★横にも縦にもずれるはずです');
for (const s of [900, 950, 1000]) {
  const a = posOf(course, s, 4);
  const b = posOf(course, s - 20, 4);
  const dx = b.x - a.x; const dy = b.y - a.y;
  console.log(`  ${String(s).padStart(5)}m   20m 後ろの馬は 走路上で (${dx.toFixed(1)}, ${dy.toFixed(1)}) m ずれる`);
}
