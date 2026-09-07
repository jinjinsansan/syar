/**
 * ★**暫定契約 v0 を JSON に書き出す**（★Gate 0A の成果物）
 *
 * 【⚠️ ★この JSON は「生成物」です。手で書き換えないでください】
 *   ★出どころは `packages/render/src/deformed-horse-parts.ts` の 1 か所だけです。
 *   ★JSON を手で直すと、★**同じ数が 2 か所に置かれます**（★台帳 B-6 と同じ形）。
 *   ★`deformed-contract.test.ts` が、★盤面と生成物が一致することを機械で見ています。
 *
 * 【★なぜ TypeScript を正とし、JSON を生成物にしたか】
 *   ★`tsconfig.json` に `resolveJsonModule` が無く、★パッケージから JSON を読めません。
 *   ★JSON を正にすると読み込みの仕掛けが要り、★`@star/render` の「依存ゼロ」に触ります。
 *
 * ★実行: npx tsx tools/emit-deformed-contract.mjs [--check]
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  DEFORMED_HORSE_V0, DEFORMED_GAIT_V0, DEFORMED_PART_NAMES, DEFORMED_LEG_IDS,
  DEFORMED_STAND_BEND, DEFORMED_FLIGHT_RISE_M, DEFORMED_STANCE_DIP_M,
  legReachM, gaitFitsLegs, sweepHalfM,
} from '@star/render';

const OUT = path.resolve('design/art/deformed/deformed-horse-contract-v0.json');

export function contractDocument() {
  const fit = gaitFitsLegs(DEFORMED_HORSE_V0, DEFORMED_GAIT_V0);
  return {
    $comment:
      '★暫定契約 v0（★生成物・手で書き換えない）。出どころは packages/render/src/deformed-horse-parts.ts。'
      + '★Gate 0B を見て修正可、★オーナー承認後に v1 として固定する。',
    $generatedBy: 'tools/emit-deformed-contract.mjs',
    $units: 'メートル。x は進行方向が正・y は上が正・接地面が y = 0。角は反時計回りが正。',
    $colours: '★この契約は色を持たない。役割名だけを持ち、色は apps/web/public/art/palette.json が唯一の定義（裁定 7）。',
    contract: DEFORMED_HORSE_V0,
    gait: DEFORMED_GAIT_V0,
    /** ★描画順（★先が奥） */
    partOrder: DEFORMED_PART_NAMES,
    legIds: DEFORMED_LEG_IDS,
    posture: {
      standBend: DEFORMED_STAND_BEND,
      flightRiseM: DEFORMED_FLIGHT_RISE_M,
      stanceDipM: DEFORMED_STANCE_DIP_M,
      standingHipHeightM: Number((legReachM(DEFORMED_HORSE_V0.legs.foreNear) * DEFORMED_STAND_BEND).toFixed(4)),
    },
    derived: {
      sweepHalfM: Number(sweepHalfM(DEFORMED_GAIT_V0).toFixed(4)),
      legReachM: Number(legReachM(DEFORMED_HORSE_V0.legs.foreNear).toFixed(4)),
      legFitsOk: fit.ok,
      worstLeg: fit.worstLeg,
      needM: Number(fit.needM.toFixed(4)),
      haveM: Number(fit.haveM.toFixed(4)),
    },
  };
}

const text = `${JSON.stringify(contractDocument(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) { console.error(`★ありません: ${OUT}`); process.exit(1); }
  const now = readFileSync(OUT, 'utf8');
  if (now !== text) { console.error('★盤面と生成物がずれています。`npx tsx tools/emit-deformed-contract.mjs` を実行してください'); process.exit(1); }
  console.log('★一致');
} else {
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`★書き出しました: ${OUT}`);
}
