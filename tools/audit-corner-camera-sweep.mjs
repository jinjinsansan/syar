/**
 * ★**第4コーナーの固定カメラを、どこに据えれば「反転しない・角度が破綻しない」かを掃引する**（読取専用）
 *
 * 【なぜ要るか】
 *   指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §3-3 は
 *   ★**「カット内で左右が反転しない」「斜めの馬が横移動だけで曲がって見えない」**を要求します。
 *
 *   ⚠️ ★カットを短くするだけでは反転は消えません。固定カメラの据え位置は
 *      **`shotEnd + sFromSegmentEnd`**（`broadcast-v2-scene.ts:239`）＝ ★**カットの終わりに追従**するので、
 *      カットを詰めても**カメラごと動き**、同じ掃引を圧縮するだけでした（実測で確認）。
 *   → ★動かすべきは**カメラをどれだけ先に置くか**（`sFromSegmentEnd`）です。
 *
 * 【★この道具は幾何を自前で組みます（R-30 の例外）】
 *   ⚠️ 製品の `cameraAt` は**ショット定義の定数**を読むので、**まだ入れていない値**を試せません。
 *      そこで `broadcast-v2-scene.ts:239-243` と**同じ式**をここに写して掃引します。
 *   ★写しである以上ずれる危険があるので、★**採用した値は必ず製品へ入れてから
 *     `tools/audit-corner-turn.mjs`（製品経路）で確認すること。** この道具は候補を絞るだけです。
 *
 * ⚠️ 製品コードは変更しません（憲法3）。時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/audit-corner-camera-sweep.mjs
 */
import { posOf, cameraBasis, project, broadcastV2FixedFov } from '@star/render';
import { buildAuditRace, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720;
const SEED = RACE_DEFAULTS.seed;
const built = buildAuditRace({ seed: SEED });
const course = built.course;
const DIST = built.DIST;

/** ★ショット定義の現行値（`broadcast-v2.ts` の `fourth-corner-front`） */
const CAM_W = 27, CAM_UP = 7, FOV_MAX = 13.6;
/** 馬の内ラチからの距離（代表値）。上位馬はおおむねこの辺り */
const HORSE_W = 6;

/** ★`broadcast-v2-scene.ts:239-243` と同じ式（写し） */
function viewAt(cutEndM, sFrom, horseS) {
  const eyePos = posOf(course, cutEndM + sFrom, CAM_W);
  const target = posOf(course, horseS, HORSE_W);
  const dist = Math.hypot(target.x - eyePos.x, target.y - eyePos.y);
  const cam = {
    eye: { x: eyePos.x, y: eyePos.y, z: CAM_UP },
    target: { x: target.x, y: target.y, z: 0.8 },
    fovY: (broadcastV2FixedFov(dist, FOV_MAX) * Math.PI) / 180,
    width: W, height: H,
  };
  const basis = cameraBasis(cam);
  const p0 = posOf(course, horseS, HORSE_W);
  const p1 = posOf(course, horseS + 1, HORSE_W);
  const f = { x: p1.x - p0.x, y: p1.y - p0.y };
  const v = { x: p0.x - cam.eye.x, y: p0.y - cam.eye.y };
  const nf = Math.hypot(f.x, f.y), nv = Math.hypot(v.x, v.y);
  const cosT = Math.max(-1, Math.min(1, (f.x * v.x + f.y * v.y) / (nf * nv)));
  const q0 = project(cam, basis, { x: p0.x, y: p0.y, z: 0 });
  const q1 = project(cam, basis, { x: p1.x, y: p1.y, z: 0 });
  /** 馬の画面上の高さ（体高 2.4m） */
  const top = project(cam, basis, { x: p0.x, y: p0.y, z: 2.4 });
  return {
    viewDeg: (Math.acos(cosT) * 180) / Math.PI,
    forwardDx: q1.x - q0.x,
    heightRatio: Math.max(0, q0.y - top.y) / H,
    distM: dist,
  };
}

console.log(`★seed ${SEED} / 第4コーナー固定カメラの掃引`);
console.log(`★斜め前素材は α=12°（viewDeg 168°）で描かれています。ここからのずれが小さいほど絵が合います。`);
console.log(`★現行: カット 0.555〜0.612 / カメラ ${30}m 先\n`);

const CUT_ENDS = [0.600, 0.612, 0.630, 0.660];
const S_FROMS = [30, 60, 90, 120, 160, 200, 260];

console.log('  カット終  カメラ   カット内の向き        168°ずれ  ★反転  馬高比(始→終)  カメラ距離(始→終)');
for (const uEnd of CUT_ENDS) {
  for (const sFrom of S_FROMS) {
    const cutEndM = uEnd * DIST;
    /** ★入口は「出口から 90m 手前」で揃える（カットの長さを条件間で同じにする） */
    const startM = cutEndM - 90;
    const rows = [];
    for (let s = startM; s <= cutEndM; s += 1) rows.push({ s, ...viewAt(cutEndM, sFrom, s) });
    let flips = 0;
    for (let i = 1; i < rows.length; i += 1) {
      if ((rows[i].forwardDx < 0) !== (rows[i - 1].forwardDx < 0)) flips += 1;
    }
    const degs = rows.map((r) => r.viewDeg);
    const dev = Math.max(...degs.map((d) => Math.abs(d - 168)));
    const a = rows[0], b = rows[rows.length - 1];
    console.log(
      `  ${uEnd.toFixed(3)}   ${String(sFrom).padStart(4)}m`
      + `   ${Math.min(...degs).toFixed(0).padStart(3)}°〜${Math.max(...degs).toFixed(0).padStart(3)}°`
      + `   ${dev.toFixed(1).padStart(9)}°`
      + `   ${flips === 0 ? ' なし' : `★${flips} 回`}`
      + `   ${(a.heightRatio * 100).toFixed(0).padStart(3)}%→${(b.heightRatio * 100).toFixed(0).padStart(3)}%`
      + `   ${a.distM.toFixed(0).padStart(4)}m→${b.distM.toFixed(0).padStart(3)}m`,
    );
  }
  console.log('');
}
console.log('★読み方');
console.log('   ★反転が「なし」で、168°ずれがいちばん小さい行が候補です。');
console.log('   ⚠️ 馬高比が小さすぎると「奥から迫ってくる迫力」が消えます（オーナー判定で一度差し戻された）。');
console.log('   ⚠️ ★この道具は式の写しです。採用値は製品へ入れてから `audit-corner-turn.mjs` で確認すること。');
