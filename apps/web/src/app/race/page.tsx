/**
 * ★レース観戦 — **斜め俯瞰**（D-066・β）
 *
 * 【★守っていること】
 *   ・**着順はエンジンが決めたもの**（開始時に D-059 のゲートを通す）
 *   ・★横位置 `w` は**エンジンが引いたもの**（D-071）。**距離ロスは着順に効いています**
 *     （D-065 は 2026-08-16 にエンジンへ入りました＝`race.ts` の `laneCoef`）
 *   ・★**描き方はこの画面に持ちません** — `@star/render` の `drawObliqueWorld` が唯一の出どころで、
 *     **動画の道具と同じ関数**を呼びます（2か所で描いたら必ず離れます）
 *   ・色は 16進を持たず `palette.json` から役割名で引く
 *
 * 【⚠️ ★まだ入っていないもの】
 *   ・実況帯／ゲージ／順位表示（★動画の道具にはあります。この画面には**まだ移していません**）
 *   ・★ゲージを入れるときは**エンジンの `staminaAt()` を読むこと**（D-072）。
 *     **この画面で式を作らないでください** — 一度作って**符号が逆**になりました。
 *
 * 【★毛色と逆光は既定で切っています】
 *   どちらも元の素材の階調を殺すためです（オーナー判定）。上のチェックで入れられます。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_RACE_BALANCE, DEFAULT_INTERVENTION_BALANCE,
  resolveRace, paceOf, replayOf, finalOrderMatches,
  laneAt, laneAtStart, TRACK_WIDTH_M,
  aiProxyPlan, staminaTrackOf, staminaGaugeOf, staminaAt, boundaryTimesOf,
} from '@star/race-engine';
import { deriveRng } from '@star/sim-engine';
import type { Strategy } from '@star/sim-engine';
import type { Surface, TrackCondition } from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, withFinishRunOut, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  phaseOf, HORSE_LENGTH_M,
  // ★描き方は package が唯一の出どころ（この画面には持たない）
  frameRoleOf, SHEET_V2,
  raceShotAt,
  focusForRaceShot,
  drawFixed2DSideScene, fixed2DBackgroundRoleOf, fixed2DPackLayout,
  // ★UI も package が唯一の出どころ（動画の道具と同じ関数）
  drawStandings, drawCallBand, drawResultPanel, drawResultsBoard, drawRaceHeadlineChip, drawEntryBoard,
  drawCourseSectionTag, drawWinnerLowerThird, raceCourseSectionAt,
  raceHudVisibilityAt, shouldEmitRaceCall, type CallPart,
  raceIntroAt, RACE_INTRO_RACE_START_SEC, RACE_INTRO_END_SEC,
  drawRaceTitleCard, drawStartingGate, drawStartCallBand,
  ovalCourse, resolveBroadcastV2Scene, drawBroadcastV2Scene, broadcastV2AnchorWeight, broadcastV2SectionLabel,
  climaxDisplayPositions, CLIMAX_LEAD_COUNT, CUT_RACE_SCRIPT,
  broadcastV2FinishStyleOf, broadcastV2StartLagM, broadcastV2ShotById, broadcastV2ScriptFromSearch, FLASH_INTO, type BroadcastV2FinishStyle, type BroadcastV2ShotId,
  BROADCAST_STRIDE_M, MOTION_BLUR_ENABLED, MOTION_BLUR_EXPOSURE_SEC, MOTION_BLUR_SAMPLES,
  // ★参考映像にあって我々に無かった HUD 3 点（設計 1-4 / 1-5 / 1-6）
  drawFormationBar, drawHorseNamePlates, drawOwnHorseMarker, referenceNamePlateRows,
  paintCrowd, seatMaskFromPixels, seatBandFromPixels,
  cameraBasis, project, HORSE_HEIGHT_M,
  buildVisualScroll, type VisualScroll, type VisualScrollSample,
  type BroadcastV2FrameLibraries, type ParallaxPlate, type TexturedWorldAssets, type WorldBillboard,
  drawCourseMinimap, drawTexturedWorld, posOf, RACE_INTRO_FLYOVER_SEC, RACE_INTRO_TITLE_END_SEC,
  isSkinTone,
  typedCount,
  raceCallAt,
  withPhasePrefix,
  narratorPortrait,
  narratorCastForRace,
  NARRATOR_NAMES,
  NARRATOR_ROLES,
  type NarratorCast,
  type NarratorSet,
  applyCoat,
  isHorseCoat,
  COAT_TRANSFORMS,
  type CoatName,
  ratesForTarget,
  targetDisplaySec,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
/**
 * ★描画分岐（引継ぎ書 2026-08-17 §1）
 *   既定は Broadcast V2。旧固定2Dは `?renderer=legacy` でのみ表示する（比較用）。
 *   ⚠️ 通常 URL を旧版のままにしてはいけない（ユーザーが見る画面が変わらない）。
 */
type RendererKind = 'v2' | 'legacy';
function rendererFromSearch(search: string): RendererKind {
  return new URLSearchParams(search).get('renderer') === 'legacy' ? 'legacy' : 'v2';
}
/**
 * ★一時バッジ（引継ぎ書 §1-4）— どの分岐が実ブラウザで描いたかを Canvas 上に証明する。
 *   ユーザー合格後に撤去する（§11-8）。
 */
let rendererBadgeHidden = false; // `?badge=0` で非表示（LP 用のキャプチャなど。描画分岐には影響しない）
/**
 * ★発走の見せ方。**位置に係数を掛けず、全馬から同じ距離を引きます**（2026-08-22）。
 *
 * ⚠️ ★以前は `meters × ease(t)` でした。実測で 2 つの実害:
 *    ① 見た目の速さが **25.0 m/s まで行き過ぎてから 18.0 m/s へ戻る**（馬は減速しない）
 *    ② **着差が縮む** — 実際 5 馬身が発走 0.2 秒で **0.66 馬身**に見える
 *   引き算なら、速さは単調に上がり、**着差はそのまま**です。
 */
const startShownMeters = (meters: number, raceDisplaySec: number): number =>
  Math.max(0, meters - broadcastV2StartLagM(raceDisplaySec, RACE_SPEED_MPS));
/** ★立ち上がりの基準にする走速（m/s）。1600m をおよそ 100 秒で走る前提 */
const RACE_SPEED_MPS = 15.6;
/** ★被写体ブラーの速度を求める微分幅（**レース秒**。表示秒ではない — 上の注記を読むこと） */
const BLUR_PROBE_RACE_SEC = 0.08;

function drawRendererBadge(ctx: CanvasRenderingContext2D, kind: RendererKind, stage: string): void {
  if (rendererBadgeHidden) return;
  /**
   * ★**サーバーを起動した時刻**を併記します（2026-08-21）。
   *   直した内容が画面に出ているかの取り違えが続いたため、
   *   ★**スクリーンショットから「どの版を見ているか」が分かる**ようにします。
   */
  const stamp = process.env.NEXT_PUBLIC_BUILD_STAMP ?? '--:--:--';
  const label = kind === 'v2' ? `BROADCAST V2 ${stamp}` : `LEGACY ${stamp}`;
  ctx.save();
  ctx.font = 'bold 15px monospace';
  const text = `${label}  [${stage}]`;
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = kind === 'v2' ? 'rgba(200,30,120,0.92)' : 'rgba(80,80,80,0.92)';
  ctx.fillRect(24, 76, w, 28);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 36, 90);
  ctx.restore();
}
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const ASSET_VERSION = '54';
/**
 * ★コマごとの持ち上げ量。**単位は「基準画布（高さ 1536px）での px」**。
 *
 * 【なぜ基準を明示するか（2026-08-20 の実害）】
 *   この表は旧素材（高さ 1536 前後）に手で合わせた値でしたが、**画布の大きさに関係なく
 *   そのまま px として適用**していました。
 *   シート方式で作った俯瞰 v4 は画布が **518×424** しかなく、そこに 90px が掛かると
 *   **画面高の 21% を 2 コマ目だけ跳ね上げる**ことになります。
 *   → 素材をどれだけ綺麗に揃えても、描画側が跳ねさせるので必ずガクガクする。
 *      オーナー確認「止まれば合格、動かすとガクガクして走れていない」の主因。
 *
 *   ★**素材ごとに画布の大きさが違う以上、px の直値は素材に依存する。割合で持たせる。**
 */
const LIFT_REFERENCE_HEIGHT_PX = 1536;
const HORSE_GROUND_LIFTS = [55, 90, 25, 0, 0, 0, 0, 55] as const;
/**
 * ★コーナー専用カット（3角後方・4角俯瞰）の長さ（m）。**0 = 使わない**。
 *   方向別 8 コマ（`diag-rear-v2` / `high-diag-v2`）は 271×724 の低解像度で真横 v6 と釣り合わず、
 *   ユーザー指摘③④「カーブで急におかしい」の主因。承認水準の素材ができるまでコーナーも望遠横追従で通す。
 */
const CORNER_CUT_M_WEB = 400;
/** ★ゴール後の勝馬追従: 走り抜けを 0.6 倍のスローで見せ、6.5 秒（アーケード参考映像 114〜123s は約 9 秒） */
const RUNOUT_SLOW = 0.6;
/**
 * ★勝馬を映す長さ（秒）。6.5 → 4.2（2026-08-22・オーナー評「騎手が喜ぶ時間が長い」）。
 */
const WINNER_FOLLOW_SEC = 2.4;

/**
 * ★**勝馬がゴールしてから、勝利の見せ方に切り替えるまでの間**（レース秒）
 *
 *   ⚠️ ★これが無いと、**体の中心が決勝線を通った瞬間**に切り替わります。
 *      鼻先はまだ線の上なので、オーナー評「**ゴールする前に騎手が喜んでいる**」になります。
 *      実測（39.2s → 39.5s）で、切替時点では決勝線がまだ馬の後肢の位置でした。
 *   実際の競馬でも、抜けてから一拍おいて手綱を緩めます。
 */
const WINNER_CELEBRATE_DELAY_SEC = 0.8;

/**
 * ★**勝馬の見せ方**（2026-08-22・オーナー判定）
 *
 *   オーナー評「**騎手の喜び方は身体をかくかくするのが治らないので、
 *   もっと別の喜び方にかえるべき**」。
 *
 *   ガッツポーズ素材は 2 姿勢 → 1 姿勢に固定してもガクつきが残りました。
 *   ★原因は姿勢の切替ではなく、**騎手が硬直したまま馬体だけが上下する**ことにあります。
 *     腕を上げた姿勢は上下動を吸収しないので、馬の上下がそのまま騎手に出ます。
 *     ⚠️ これは**素材を差し替えないと直りません**（合成側では吸収できない）。
 *
 *   → 当面は **`'run'`（走行のまま）** にし、勝利は**カメラの寄りと勝利テロップ**で見せます。
 *     走行の絵はオーナーが 8/21 に合格を出したものなので、ガクつきません。
 *   ⚠️ 素材（腕を上げない鐙立ち等）が来たら `'celebrate'` に戻せます。機構は残してあります。
 */
const WINNER_POSE: 'run' | 'celebrate' = 'run';
/** ★その後の着順ボード（参考映像 124〜134s）: 6 秒 */
const RESULTS_BOARD_SEC = 6;
const POST_RACE_SEC = WINNER_FOLLOW_SEC + RESULTS_BOARD_SEC;
/**
 * ★4 角を「奥からこちらへ向かってくる」固定カメラにするか（build 時のショット列挙にも使うので定数）。
 *   正面寄りの一体素材 diag-front-v3 が承認されたら true にする。
 */
const FOURTH_CORNER_FRONT_WEB = true;
/**
 * ★2026-08-18: テクスチャ付き透視ワールド（`world-textured.ts`）で背景が動くようになったので、
 *   コーナー専用ショット（3角後方・4角俯瞰）を**コーナー全区間**で復活（オーナー指示「元のカメラワークを復活、ただし背景は動く」）。
 *   方向別 8 コマは高解像度版へ順次差し替え。
 */
/**
 * ★空中局面の浮き（元画像 px・そのコマの「最下点の蹄が地面」を 0 とする）。
 *   支持局面（04〜07）は蹄が地面に接し（0）、離地〜空中（08・01・02）だけ体高の 3〜5% 浮く。03 は着地直前で僅か。
 *   ⚠️ 旧方式（全コマ平均の高さ＋bob）は支持局面で蹄が地面より上に来て「浮いて見える」原因だった。
 */
/** ★同じく基準画布（1536px）での px。使うときは実際の画布で比例させる */
const HORSE_FLIGHT_LIFT_SOURCE_PX = [15, 20, 6, 0, 0, 0, 0, 22] as const;
/** 8 コマ表を任意のコマ数へ（16 コマなら中間は両隣の平均、1 コマなら 0） */
function flightLiftFor(index: number, count: number): number {
  if (count === 8) return HORSE_FLIGHT_LIFT_SOURCE_PX[index] ?? 0;
  if (count === 16) {
    const a = HORSE_FLIGHT_LIFT_SOURCE_PX[Math.floor(index / 2) % 8] ?? 0;
    if (index % 2 === 0) return a;
    const b = HORSE_FLIGHT_LIFT_SOURCE_PX[(Math.floor(index / 2) + 1) % 8] ?? 0;
    return (a + b) / 2;
  }
  return 0;
}
/**
 * ★**勝負服の色は「枠」から引きます**（2026-08-22・オーナー指摘で是正）
 *
 * 【何が起きていたか】
 *   ここには**馬番ごとに 12 色**を並べていました。ところが HUD（順位表・隊列バー・名札）は
 *   `frameRoleOf` → `palette.json` の **8 枠色**を使います。
 *   ★12 頭立ての枠は `1,2,3,4 / 5,6 / 7,8 / 9,10 / 11,12` なので、
 *     ★**5 番以降が全部ずれます**（6 番は画面では緑、HUD では黄）。
 *   オーナー評「**上の順位で動く数字の図柄と実際の馬が合っていない**」はこれです。
 *
 * 【どちらに寄せたか】
 *   正典が決めています（D-060 ／ `packages/render/src/bracket.ts`）:
 *     ★**色は枠、数字は個体。** 実際の競馬も 8 枠の色を複数頭で共有し、馬番で区別します。
 *   → **馬の側を枠色に合わせます。** HUD は正しかったので触りません。
 *   ⚠️ 同じ枠の 2 頭は同じ色になりますが、**鞍布の馬番**で区別できます（それが枠色の作法）。
 *
 * ⚠️ ★16 進をここに持ちません。`palette.json` から役割名で引きます（アートバイブル §6）。
 *    ここに 12 色を直書きしていたことが、そもそも食い違いの原因でした。
 */
const silksColorsFor = (pal: Record<string, string>, fieldSize: number): readonly string[] =>
  Array.from({ length: fieldSize }, (_, index) => pal[frameRoleOf(index + 1, fieldSize)] ?? '#ffffff');
/**
 * ★表示用のレース情報（憲法 §0.1: 実在の競馬場名・レース名は使わない）。
 *   以前は実在名のプレースホルダーが直書きされていたので架空名に置換した。
 */
const RACE_META = { venue: 'スターパーク競馬場', raceName: '桜星賞', raceNo: '11R' } as const;
/** 実況アナ（架空・design/hud-ds/components/narrator-cast の A） */
const NARRATOR_NAME = '星野 亮太';
/** HUD が載るのは発走 0.8 秒後（motion-spec §6） */
const HUD_SETTLE_SEC = 0.8;
/**
 * ★毛色バリエーション（案 A・docs/race-horse-art-options-20260819.md）。
 *   素材は鹿毛 1 頭のまま、**馬体の画素だけ**を色相・明度・彩度で変えて作る。
 *   ゲート番号から決定論で割り当て（鹿毛が最多、栗毛・黒鹿毛・青鹿毛・芦毛を混ぜる）。
 *
 * ⚠️ ★**`ctx.filter`（CSS フィルタ）では作りません**（2026-08-21）。
 *    あれは**素材全体**に掛かるので、芦毛の `saturate(0.12)` は**騎手ごと脱色**します。
 *    勝負服は別描画で色が残るため、★**肌だけグレー**になりました
 *    （オーナー評「黄色の服の騎手の肌の色がグレー」）。
 *
 * ⚠️ ★開発側は最初「芦毛を割り当てから外す」で片付けようとしました。**問題のすり替え**です。
 *    オーナー指摘: 「消えたはいいですが今後葦毛の馬はどうするのですか？
 *    これは参考映像ゲームですよ？ 消すのが目的になっていませんか？
 *    **騎手の肌を治すだけなのに**」
 *    → **毛色は減らさず、掛ける範囲を馬体に限る**（`@star/render` の `isHorseCoat`）。
 */
const COAT_BY_GATE: readonly CoatName[] = ['bay', 'chestnut', 'dark-bay', 'bay', 'grey', 'bay', 'chestnut', 'blue-black', 'bay', 'dark-bay', 'chestnut', 'bay'];
const coatOf = (gate: number): CoatName => COAT_BY_GATE[(gate - 1) % COAT_BY_GATE.length] ?? 'bay';
/**
 * ★毛色を**焼き込んだ**画像を作る。馬体の画素だけを変換し、騎手・馬具・白斑は触らない。
 *   ⚠️ 読み込み時に 1 回だけ作ること（毎コマ画素を触ると重い）。
 */
function bakeCoat(image: FrameImage, coat: CoatName): FrameImage {
  const t = COAT_TRANSFORMS[coat];
  if (t === undefined) return image;                       // 鹿毛は素材そのまま
  const w = imgW(image), h = imgH(image);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return image;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 8) continue;
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    if (!isHorseCoat(r, g, b)) continue;
    const [R, G, B] = applyCoat(r, g, b, t);
    d[i] = R; d[i + 1] = G; d[i + 2] = B;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

const HORSE_NAMES = ['スターライト', 'サクラブリーズ', 'ハンシンドリーム', 'ミライノツバサ', 'グリーンアロー', 'オウカノキセキ', 'ナニワスピリット', 'ローズクイーン', 'ムラサキノホシ', 'アオバハヤテ', 'ブラウンエース', 'ピンクレディ'] as const;
const JOCKEY_NAMES = ['田中 守', '佐藤 翼', '山本 誠', '中村 駿', '高橋 蓮', '松本 拓海', '藤田 昇', '小林 亮', '伊藤 健', '吉田 直樹', '岡田 悠', '森川 浩'] as const;
/** ★固定2D中継の基準幅 */

/**
 * ⚠️ ★**カットごとの `horseW`（120px / 300px）は撤去しました。**
 *    透視投影では、馬の大きさは**深さから連続的に決まります**。
 *    固定の px を持つと、遠近と食い違って**手前と奥で同じ大きさ**になります。
 */

interface Built {
  readonly model: ReturnType<typeof replayPositionModel>;
  readonly warp: ReturnType<typeof timeWarpFor>;
  readonly pace: 'slow' | 'middle' | 'high';
  readonly result: readonly { place: number; gate: number; margin: string }[];
  /** ★自馬のゲージ（D-072）。**エンジンが出した状態**を読むだけ */
  readonly gauge: ReturnType<typeof staminaGaugeOf>;
  /** ★確定着順と走破タイム（ゴール後の順位表示に使う） */
  readonly finishPos: ReadonlyMap<number, number>;
  readonly finishSec: ReadonlyMap<number, number>;
  /**
   * ★見た目の速度の補正 Δ(d)（`visual-scroll.ts`）。背景の流れと脚の周期に使う。
   *   位置・時刻・着順には触れない（時間圧縮 D-062 はそのまま）。
   */
  readonly visualScroll: VisualScroll;
  /** ★ゴール前のカメラの型（接戦=引く／単独=寄る）。先頭が残り 80m に達した時点の着差から決定論的に決める */
  readonly finishStyle: BroadcastV2FinishStyle;
  /** ★ショット切替の時刻（表示秒）と前後の id。切替直後は前ショットとディゾルブする（ユーザー指摘⑥） */
  readonly shotChanges: readonly { readonly displaySec: number; readonly from: BroadcastV2ShotId; readonly to: BroadcastV2ShotId }[];
  /** 斤量（出馬表の表示用） */
  readonly weightsKg: readonly number[];
}

interface HighQualityHorseFrame {
  readonly image: CanvasImageSource;
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly referenceHeight: number;
  readonly groundLiftSourcePx: number;
  /** ★胴体の基準点と接地までの高さ（元画像 px）。配置を外接矩形に依存させない（perspective-draw 参照） */
  readonly bodyAnchorSourcePx?: { readonly x: number; readonly y: number };
  readonly bodyLiftSourcePx?: number;
  /** ★接地影用シルエット（source と同じ大きさ・黒＋α・軽くぼかし） */
  readonly shadow?: { readonly image: CanvasImageSource; readonly width: number; readonly height: number } | undefined;
  readonly overlay?: {
    readonly image: CanvasImageSource;
    readonly width: number;
    readonly height: number;
    readonly offsetXSourcePx: number;
    readonly offsetYSourcePx: number;
  } | undefined;
}

/**
 * ★**既定の台本は `v5`。** 旧 v4 との差は 2 ショットだけです。
 *   台本表と URL の読み方は `@star/render` 側に 1 つだけ置いてあります（二重管理しない）。
 *   `/race?cinematography=v4` で旧映像へ即座に戻せます。
 */
const scriptFromSearch = broadcastV2ScriptFromSearch;
/**
 * ★**台本 v6 で `frameContenders` を使わないカット**（`broadcast-v2-scene.ts` の注記）。
 *   ⚠️ ★`side-drive` の枠取りは**残します**。あれは「詰まれば寄る」ための仕掛けで、
 *      実測 34〜41% を出しているのはその働きです。外すのは**引くための** `finish-line` だけ。
 */
const CUT_SCRIPT_NO_FRAME_SHOTS = ['finish-line'] as const;
/**
 * ★**勝馬が通過してから、決勝線のカメラを何秒保持するか**（レース時間・秒）
 *   ★実測（seed 99）で 1〜5 着は **2.7 馬身 ≒ 6.5m ≒ 0.42 秒**に収まります。
 *   ★1.0 秒あれば、上位の入線をすべて見せてから寄りへ移れます。
 */
const GOAL_HOLD_SEC = 1.0;

/**
 * ★**このデモ画面の着差の見せ方（γ）**（2026-08-25・オーナー決定）
 *
 * 【なぜ 1.3 か】
 *   オーナー要望「直線で 4〜5 頭のせめぎ合いをゴールまで見せたい」に対し、
 *   ★**カメラでは満たせません**（描画側は着順・馬の位置を読むだけ・憲法3）。
 *   実測（40 レース）では **ゴール時点で 4 頭以上が 2 馬身以内 = 0%**、
 *   1 着-2 着の差の中央値は **3.1 馬身**。★**在るものしか映せない**ので、
 *   スコア→タイム写像の**形**（総差を保存したまま内訳だけ変える γ）を入れました。
 *
 *   実測（200〜1000 レース・γ 別）:
 *     γ 1.0（現行）  1着-2着 2.61 馬身 / 4 頭が 5 馬身内 32% / 画面内 2.0 頭 / 重なり 無し
 *     ★γ 1.3        1着-2着 1.47 馬身 / 4 頭が 5 馬身内 55% / 画面内 3.0 頭 / 重なり 無し
 *     γ 1.6         1着-2着 0.82 馬身 / 4 頭が 5 馬身内 70% / 画面内 6.0 頭 / ★重なり 有り
 *   ★1.6 は頭数が増える代わりに**先頭 2 頭が重なって馬番が隠れ**、追走 4 頭が
 *     左下の COURSE 表示の裏に入ります。→ **1.3 を採用**（重なりを作らずに頭数が増える側）。
 *
 * 【★なぜエンジンの既定（`DEFAULT_RACE_BALANCE`）を変えないのか】
 *   ⚠️ 走破タイムは `race_entries.finish_time` に**保存**されます（再計算ではありません）。
 *      既定を動かすと**過去の記録と新しい記録で写像が混在**し、
 *      ★**Provably Fair の再現検証**（正典 §8.6）で第三者が `server_seed` から再計算したとき
 *      **着順は一致するのに走破タイムが一致しません**。
 *   ★新旧混在の扱いは未決（正典 §8.6 に関わる・レビュー側の判断待ち）なので、
 *     **この便ではデモ画面の既定だけ**を 1.3 にします。サーバー確定経路（`settle.ts`）は
 *     `DEFAULT_RACE_BALANCE`（γ=1.0）のままです。
 *
 * ⚠️ ★着順には効きません。写像は r について単調なので、γ を変えても着順は同じです
 *    （1000 レース × γ 1.3 / 1.6 で**着順列の不一致 0 レース**を実測済み）。
 * ⚠️ ★総差（1 着-最下位）は γ によらず同一です（定義から不変・V-17② に触れていません）。
 */
const DEMO_CONTEST_GAMMA = 1.3;

/**
 * ★**着差の見せ方（γ）を URL で切り替える**（P4 のデモ画面限定）
 *
 *   `/race?contest=1.0` で**エンジン既定（＝従来の見え方）**、`?contest=1.6` で更に詰まります。
 *   指定なし・不正値は `DEMO_CONTEST_GAMMA` へ落とします
 *   （`cinematography` と同じ作法・R-27: 既定は 1 か所から出す）。
 *
 * ⚠️ ★**本番のサーバー確定経路には入りません**（憲法3）。ここはデモが自分で組むレースだけです。
 */
function contestGammaFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get('contest');
  const g = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(g) && g >= 1 && g <= 3 ? g : DEMO_CONTEST_GAMMA;
}

/** 勝負服・ゼッケンの位置（外接矩形に対する比率）。コマ集合ごとに騎手の姿勢が違うので切り替える */
interface SilksLayout {
  readonly cropX: number; readonly cropW: number; readonly cropH: number;
  readonly helmet: readonly [number, number, number];            // nx0, nx1, ny1
  readonly jacket: readonly [number, number, number, number];    // nx0, nx1, ny0, ny1
  readonly saddlecloth: readonly [number, number, number, number];
  readonly number: readonly [number, number];
}
/** 騎手が低く伏せる走行コマ（side-v6 など） */
const SILKS_LAYOUT_CROUCH: SilksLayout = {
  cropX: 0.24, cropW: 0.44, cropH: 0.60,
  helmet: [0.30, 0.72, 0.23], jacket: [0.31, 0.59, 0.08, 0.39], saddlecloth: [0.27, 0.59, 0.34, 0.58], number: [0.47, 0.49],
};
/** 騎手なしの馬（horse-only）: 鞍布の検出窓だけ広く取る（白い騎手のズボンが無いので誤検出しない） */
const SILKS_LAYOUT_HORSE_ONLY: SilksLayout = {
  cropX: 0.2, cropW: 0.6, cropH: 0.9,
  helmet: [0, 0, -1], jacket: [0, 0, 1, 0], saddlecloth: [0.25, 0.70, 0.10, 0.75], number: [0.47, 0.5],
};
/** 斜め後ろ（diag-rear-v3 合成）: 騎手は上中央、鞍布は騎手の脚の両脇に見える。ゼッケンは描かない（後ろ向き） */
const SILKS_LAYOUT_REAR: SilksLayout = {
  cropX: 0.1, cropW: 0.8, cropH: 0.6,
  helmet: [0.25, 0.75, 0.10], jacket: [0.15, 0.85, 0.06, 0.24], saddlecloth: [0.1, 0.9, 0.34, 0.5], number: [-1, -1],
};
/** 斜め前（diag-front-v3 一体）: 騎手は上中央、鞍布は騎手の脚の下に少し見える。ゼッケンは胸前に */
const SILKS_LAYOUT_FRONT: SilksLayout = {
  cropX: 0.1, cropW: 0.8, cropH: 0.6,
  helmet: [0.25, 0.75, 0.10], jacket: [0.15, 0.85, 0.06, 0.26], saddlecloth: [0.05, 0.95, 0.30, 0.48], number: [-1, -1],
};
/** 騎手が鐙に立って腕を挙げる勝馬コマ（winner-v2）: 矩形が縦に長く、馬体は下 6 割 */
const SILKS_LAYOUT_WINNER: SilksLayout = {
  cropX: 0.30, cropW: 0.52, cropH: 0.72,
  helmet: [0.52, 0.76, 0.17], jacket: [0.48, 0.72, 0.12, 0.40], saddlecloth: [0.36, 0.60, 0.48, 0.66], number: [0.47, 0.57],
};

function silksOverlays(
  image: FrameImage, source: HighQualityHorseFrame['source'], colors: readonly string[],
  layout: SilksLayout = SILKS_LAYOUT_CROUCH,
): readonly NonNullable<HighQualityHorseFrame['overlay']>[] {
  const x0 = Math.round(source.x + source.width * layout.cropX);
  const y0 = Math.round(source.y);
  const width = Math.round(source.width * layout.cropW);
  const height = Math.round(source.height * layout.cropH);
  const scratch = document.createElement('canvas'); scratch.width = imgW(image); scratch.height = imgH(image);
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  if (scratchCtx === null) return [];
  scratchCtx.drawImage(image, 0, 0);
  const input = scratchCtx.getImageData(x0, y0, width, height).data;
  return colors.map((hex, colorIndex) => {
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (ctx === null) return { image: canvas, width, height, offsetXSourcePx: x0, offsetYSourcePx: y0 };
    const output = ctx.createImageData(width, height);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = input[index] ?? 0; const g = input[index + 1] ?? 0; const b = input[index + 2] ?? 0; const a = input[index + 3] ?? 0;
      const nx = (x + x0 - source.x) / source.width;
      const ny = (y + y0 - source.y) / source.height;
      const helmet = nx >= layout.helmet[0] && nx <= layout.helmet[1] && ny <= layout.helmet[2];
      const jacket = nx >= layout.jacket[0] && nx <= layout.jacket[1] && ny >= layout.jacket[2] && ny <= layout.jacket[3];
      const saddlecloth = nx >= layout.saddlecloth[0] && nx <= layout.saddlecloth[1]
        && ny >= layout.saddlecloth[2] && ny <= layout.saddlecloth[3];
      if (!helmet && !jacket && !saddlecloth) continue;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (a < 16 || spread > (helmet ? 62 : 34) || Math.max(r, g, b) < (helmet ? 42 : 72)) continue;
      /**
       * ★**肌は塗りません**（2026-08-21・オーナー評「騎手の肌の色が白いのがいる」）。
       *
       * ⚠️ 上の条件は「彩度が低く、暗すぎない」画素を勝負服とみなします。
       *    明るい肌（例 231/180/148・彩度差 83）は彩度で弾かれますが、
       *    ★**陰になった肌**（例 150/130/120・彩度差 30）は**条件を通ってしまいます。**
       *    首すじ・手の甲・頬がここに入り、淡い勝負服だと**白く塗り潰されます。**
       *
       *   素材の勝負服は**無彩色の灰／白**で作らせているので（生成プロンプトで指定）、
       *   窓の中に R>G>B の肌色相があれば、それは**肌です。**
       */
      if (isSkinTone(r, g, b)) continue;
      const luminance = (r + g + b) / (3 * 255);
      const shade = 0.30 + luminance * 0.78;
      output.data[index] = Math.min(255, red * shade);
      output.data[index + 1] = Math.min(255, green * shade);
      output.data[index + 2] = Math.min(255, blue * shade);
      output.data[index + 3] = Math.round(a * 0.94);
    }
    ctx.putImageData(output, 0, 0);
    if (layout.number[0] < 0) { ctx.putImageData(output, 0, 0); return { image: canvas, width, height, offsetXSourcePx: x0, offsetYSourcePx: y0 }; }
    const numberX = source.x + source.width * layout.number[0] - x0;
    const numberY = source.y + source.height * layout.number[1] - y0;
    ctx.font = `bold ${Math.max(42, Math.round(source.height * 0.068))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, source.height * 0.006);
    ctx.strokeStyle = 'rgba(0,0,0,0.78)'; ctx.strokeText(String(colorIndex + 1), numberX, numberY);
    ctx.fillStyle = '#fff'; ctx.fillText(String(colorIndex + 1), numberX, numberY);
    return { image: canvas, width, height, offsetXSourcePx: x0, offsetYSourcePx: y0 };
  });
}

/**
 * ★鞍布（白い長方形・剛体）の中心と幅（元画像 px）。配置の基準点と縮尺の補正に使う。
 *   胴体重心（上 55% の α 重心）は騎手の姿勢で動くが、鞍布は馬体に固定されているので最も安定。
 *   検出: レイアウトの鞍布窓の中で、明るく彩度の低い画素の外接矩形。見つからなければ重心にフォールバック。
 */
type FrameImage = HTMLImageElement | HTMLCanvasElement;

/**
 * ★縮小に備えて輪郭を立てる（2026-08-20・「写真では合格なのにレースで劣化する」の対策）
 *
 * 【何が起きていたか】
 *   素材は**馬の幅およそ 1400px** で作られ、画面では**およそ 400px** で描かれます。
 *   3.5 倍の縮小で、**筋肉の陰影・毛艶・たてがみの毛筋**が落ちます。
 *   ★それは「写真的に見える」ことの中身そのものなので、当て込むと平板になります。
 *
 *   ⚠️ 疑った2つは**どちらもシロ**でした（実測）:
 *     ・WebP 圧縮（q88）… 芝の上に合成して平均差 **1.02 / 255**。見た目に影響しない
 *     ・描画の縮小品質  … `imageSmoothingQuality = 'high'` は既に設定済み
 *
 * 【なぜ「縮小してから」ではなく「元解像度で」かけるのか】
 *   理想は**縮小後に**かけることですが、描画のたびに画素を触ることになり現実的ではありません。
 *   → **縮小率に見合う半径**（`sigma × 縮小率`）で**元解像度に一度だけ**かけ、
 *     縮小後に理想へ近づける形にします（実測で差は平均 3.67 / 255）。
 *
 * 【★境界を保護する理由 — これが無いと全馬が光ります】
 *   そのままかけると**輪郭に白い縁**が出ます（透明との境界にコントラストが立つため）。
 *   → **半透明の画素と、その隣接に半透明を持つ画素には触らない。**
 *     これで縁が消え、内側の質感だけが戻ります。
 */
const SHARPEN_SIGMA_DEFAULT = 2.8;   // ★表示 400px 側で sigma 0.8 相当（1400/400 ≒ 3.5 倍）
/**
 * ★強さ。**既定は 0（無効）**。
 *
 * 【なぜ無効にしたか】
 *   縮小で細部が落ちること自体は実測で確認できたが（原画と縮小後を並べれば明らか）、
 *   **実際のレース画面では、0.6 でも 1.4 でもオーナーが差を認められなかった**
 *   （2026-08-20・2回とも「どちらもほとんど変わらない」）。
 *   ★**切り出して並べれば見える差が、動いている画面では見えない。**
 *     見えない改善を既定に入れない。
 *
 * 【残してある理由】
 *   絵柄を写実寄りに作り直すと、落ちる細部が増えるため効きが変わりうる。
 *   `?sharpen=1.4` のように**その場で強さを変えて**再評価できる形で残す。
 *
 * ⚠️ 実装のとき、検証で使った強さ（強い係数）ではなく 0.6 を入れていた —
 *    **検証したものと違うものを実装していた。** 次に触るときは同じ強さを通すこと。
 */
const SHARPEN_AMOUNT_DEFAULT = 0;

function sharpenForDownscale(src: FrameImage, sigma: number, amount: number): FrameImage {
  if (sigma <= 0 || amount <= 0) return src;
  const w = imgW(src), h = imgH(src);
  if (w === 0 || h === 0) return src;

  const base = document.createElement('canvas');
  base.width = w; base.height = h;
  const bctx = base.getContext('2d', { willReadFrequently: true });
  if (bctx === null) return src;
  bctx.drawImage(src, 0, 0);

  const blurred = document.createElement('canvas');
  blurred.width = w; blurred.height = h;
  const lctx = blurred.getContext('2d', { willReadFrequently: true });
  if (lctx === null) return src;
  lctx.filter = `blur(${sigma}px)`;
  lctx.drawImage(src, 0, 0);

  const o = bctx.getImageData(0, 0, w, h);
  const b = lctx.getImageData(0, 0, w, h);
  const od = o.data, bd = b.data;
  const alphaAt = (x: number, y: number): number => od[(y * w + x) * 4 + 3] ?? 0;

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = (y * w + x) * 4;
      // ★境界を保護（上の注記）。ここを外すと輪郭に白い縁が出る
      if (od[i + 3] !== 255) continue;
      if (alphaAt(x - 1, y) !== 255 || alphaAt(x + 1, y) !== 255
        || alphaAt(x, y - 1) !== 255 || alphaAt(x, y + 1) !== 255) continue;
      for (let c = 0; c < 3; c += 1) {
        const v = (od[i + c] ?? 0) + amount * ((od[i + c] ?? 0) - (bd[i + c] ?? 0));
        od[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  bctx.putImageData(o, 0, 0);
  return base;
}
const imgW = (image: FrameImage): number => (image instanceof HTMLCanvasElement ? image.width : image.naturalWidth);
const imgH = (image: FrameImage): number => (image instanceof HTMLCanvasElement ? image.height : image.naturalHeight);

function saddleReference(
  image: FrameImage, bounds: HighQualityHorseFrame['source'], layout: SilksLayout,
): { x: number; y: number; width: number } | undefined {
  const scratch = document.createElement('canvas');
  scratch.width = imgW(image); scratch.height = imgH(image);
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return undefined;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  const [nx0, nx1, ny0, ny1] = layout.saddlecloth;
  const X0 = Math.floor(bounds.x + bounds.width * nx0), X1 = Math.ceil(bounds.x + bounds.width * nx1);
  const Y0 = Math.floor(bounds.y + bounds.height * ny0), Y1 = Math.ceil(bounds.y + bounds.height * ny1);
  let l = Infinity, t = Infinity, r = -1, b = -1, n = 0;
  for (let y = Y0; y < Y1; y += 1) for (let x = X0; x < X1; x += 1) {
    const k = (y * scratch.width + x) * 4;
    if (data[k + 3]! < 200) continue;
    const R = data[k]!, G = data[k + 1]!, B = data[k + 2]!;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 170 && mx - mn < 28) { n += 1; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  if (n < 400 || r < l) return undefined;
  return { x: (l + r) / 2, y: (t + b) / 2, width: r - l + 1 };
}

/**
 * ★馬（騎手なし）と騎手（単体）を合成して 1 コマにする。
 *   騎手素材は「参照コマ（例: pose01）の騎手をそのままの位置・大きさで描いたもの」なので、
 *   参照コマの鞍布中心 → 対象コマの鞍布中心 の差だけ平行移動して重ねれば、鞍の上に乗る。
 *   馬体は 8 コマとも承認済みの走り、騎手は 2 姿勢だけ → 騎手のガクつき（ユーザー指摘④）が構造的に消える。
 */
/**
 * ★騎手のランドマーク: ヘルメット上端（矩形の最上行）と、ブーツ下端・中心（指定領域内の黒画素の最下部）。
 *   参照コマ（一体）では「鞍布中心より下・鞍布の x 範囲」の黒画素がブーツ（鞍・鬣・脚を避ける）。
 *   騎手単体では矩形の下半分の黒画素がブーツ。ブーツは剛体なので位置合わせの基準に使える。
 */
function jockeyLandmarks(
  image: FrameImage, region: { x0: number; x1: number; y0: number; y1: number }, top: number,
): { top: number; bootBottom: number; bootX: number } | undefined {
  const w = imgW(image), h = imgH(image);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return undefined;
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let bottom = -1;
  const rows: number[][] = [];
  for (let y = Math.max(0, Math.floor(region.y0)); y < Math.min(h, region.y1); y += 1) {
    for (let x = Math.max(0, Math.floor(region.x0)); x < Math.min(w, region.x1); x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3]! < 200) continue;
      const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      if (lum > 52) continue;
      if (y > bottom) bottom = y;
      (rows[y] ??= []).push(x);
    }
  }
  if (bottom < 0) return undefined;
  // 最下 24 行の黒画素の x 平均 = ブーツの中心
  let sx = 0, n = 0;
  for (let y = bottom; y > bottom - 24 && y >= 0; y -= 1) for (const x of rows[y] ?? []) { sx += x; n += 1; }
  if (n === 0) return undefined;
  return { top, bootBottom: bottom, bootX: sx / n };
}

function composeHorseAndJockey(
  horse: HTMLImageElement, jockey: HTMLImageElement,
  gen: { top: number; bootBottom: number; bootX: number },
  ref: { top: number; bootBottom: number; bootX: number },
  horseSaddle: { x: number; y: number }, jockeyRefSaddle: { x: number; y: number },
): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = horse.naturalWidth; cv.height = horse.naturalHeight;
  const ctx = cv.getContext('2d');
  if (ctx === null) return cv;
  ctx.drawImage(horse, 0, 0);
  // ヘルメット上端→ブーツ下端の高さで縮尺、ブーツ下端中心を参照位置へ、さらに鞍布の差だけ平行移動
  const scale = (ref.bootBottom - ref.top) / Math.max(1, gen.bootBottom - gen.top);
  const dx = ref.bootX - gen.bootX * scale + (horseSaddle.x - jockeyRefSaddle.x);
  const dy = ref.bootBottom - gen.bootBottom * scale + (horseSaddle.y - jockeyRefSaddle.y);
  ctx.drawImage(jockey, dx, dy, jockey.naturalWidth * scale, jockey.naturalHeight * scale);
  return cv;
}

/**
 * ★胴体の重心（元画像 px）。外接矩形の上 55% にある不透明画素の α 重み付き重心（脚をほぼ除外）。
 *   鞍布が見つからないときのフォールバック。
 */
function bodyCentroid(image: FrameImage, bounds: HighQualityHorseFrame['source']): { x: number; y: number } {
  const scratch = document.createElement('canvas');
  scratch.width = imgW(image);
  scratch.height = imgH(image);
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.4 };
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  const cut = bounds.y + bounds.height * 0.55;
  let sx = 0, sy = 0, sw = 0;
  for (let y = bounds.y; y < cut; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const a = data[(y * scratch.width + x) * 4 + 3]!;
      if (a < 12) continue;
      sx += x * a; sy += y * a; sw += a;
    }
  }
  if (sw === 0) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.4 };
  return { x: sx / sw, y: sy / sw };
}

/**
 * ★接地影用のシルエットを焼く: 元コマの不透明部分を黒（α はそのまま）にし、少しぼかす。
 *   描画側（perspective-draw）はこれを地面へ潰して落とすだけ。毎フレームの色変換をしない。
 */
function bakeShadowSilhouette(image: FrameImage, bounds: HighQualityHorseFrame['source']): HighQualityHorseFrame['shadow'] {
  const cv = document.createElement('canvas');
  cv.width = bounds.width; cv.height = bounds.height;
  const ctx = cv.getContext('2d');
  if (ctx === null) return undefined;
  ctx.filter = 'blur(3px)';
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#07110a';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'source-over';
  return { image: cv, width: cv.width, height: cv.height };
}

function opaqueBounds(image: FrameImage): HighQualityHorseFrame['source'] {
  const scratch = document.createElement('canvas');
  scratch.width = imgW(image);
  scratch.height = imgH(image);
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return { x: 0, y: 0, width: imgW(image), height: imgH(image) };
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  let left = scratch.width, top = scratch.height, right = -1, bottom = -1;
  for (let y = 0; y < scratch.height; y += 1) {
    for (let x = 0; x < scratch.width; x += 1) {
      if (data[(y * scratch.width + x) * 4 + 3]! < 12) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: scratch.width, height: scratch.height };
  const pad = 2;
  const x = Math.max(0, left - pad); const y = Math.max(0, top - pad);
  return {
    x, y,
    width: Math.min(scratch.width, right + pad + 1) - x,
    height: Math.min(scratch.height, bottom + pad + 1) - y,
  };
}

function build(seed: number, ownGate: number, surface: Surface, trackCondition: TrackCondition, contestGamma: number): Built {
  const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4]!, condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `r${seed}-${surface}-${trackCondition}`, distance: DIST, surface,
    trackCondition, courseShape: 'oval' as const, baseWeightKg: 55,
  };
  /** ★比較用に着差の見せ方だけ差し替える（既定は `DEFAULT_RACE_BALANCE` のまま） */
  const balance = contestGamma === DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA
    ? DEFAULT_RACE_BALANCE
    : { ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: contestGamma };
  const result = resolveRace({ conditions, entrants, seed, balance });
  const { pace } = paceOf(entrants, balance);
  const boundaries = replayOf(result, (g) => entrants[g - 1]!.strategy, pace);
  if (!finalOrderMatches(result, boundaries)) throw new Error('映像の着順が確定着順と違います（D-059）');
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    // ★道中は脚質から生成する（Q-P4-38）。走破タイムからは作らない
    strategyOf: (g) => entrants[g - 1]!.strategy,
    // ★横位置はエンジンが引いたものを読むだけ（D-071）
    laneOf: (gate, metersLeft) => laneAt(gate, entrants.length, metersLeft, DIST, seed),
    pace,
    formationSeed: seed * 2654435761,
  });
  const settled = result.order.map((e) => Number(e.horseId));
  if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(settled)) {
    throw new Error('位置モデルの最終順が着順と違います（D-059）');
  }
  /**
   * ★**自馬のゲージ**（§12.6「自馬にのみ表示」・D-072）。
   *   ⚠️ ★**ここで式を作りません。** エンジンの `staminaGaugeOf` が出した状態を読むだけです。
   *      一度この層で近似を作って**符号が逆**になりました。
   *   ★乱数は注入します（憲法4）。`Math.random` は呼びません。
   */
  const own = entrants[ownGate - 1]!;
  const ownHorse = {
    iq: own.stats.iq, gt: own.stats.gt, st: own.stats.st,
    condition: own.condition, fatigue: own.fatigue,
  };
  const ownEntry = result.order.find((e) => Number(e.horseId) === ownGate)!;
  const gauge = staminaGaugeOf(
    staminaTrackOf(ownHorse, aiProxyPlan(ownHorse, deriveRng(seed, ownGate), DEFAULT_INTERVENTION_BALANCE), DIST, DEFAULT_INTERVENTION_BALANCE),
    boundaryTimesOf(ownEntry, DIST, ownGate, own.strategy, pace),
    DIST, own.strategy, pace,
  );
  const finishPos = new Map(result.order.map((e) => [Number(e.horseId), e.finishPosition]));
  const finishSec = new Map(result.order.map((e) => [Number(e.horseId), e.timeSec]));
  /**
   * ★**目標の表示時間から送り速さを逆算します**（`ratesForTarget`）。
   *
   * ⚠️ ★2026-08-21 まで、ここは `DEFAULT_PHASE_RATES`（道中 1.8 倍・勝負所と直線は等倍）の
   *    **固定値**でした。`targetDisplaySec` を**一度も通していません**。
   *    そのため 1600m は **80.3 秒**のままで、目標を 45 秒にしようが 30 秒にしようが
   *    ★**画面はまったく変わりませんでした。**
   *
   *    ★私の計測道具（`shot-race-at.mjs` / `verify-cut-timing.mjs`）は `ratesForTarget` を
   *      通していたので **29.9 秒**と出ており、**道具と画面が別の経路を測っていました。**
   *      オーナー指摘「不合格シーンは除外されていますが尺は 100 秒ありますよ？」で発覚。
   *      ★**道具が画面と同じ経路を通っているかを、毎回確かめること。**
   */
  const knots = knotsFor(boundaries, ownGate);
  const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));
  /**
   * ★見た目の速度テーブル。描画と同じ手順（時計 → 位置モデル → 走り抜け → V2 注視点）で
   *   0.05 秒ごとに注視点を求め、時間圧縮の倍率 rate と固定物体の重みから Δ を積分する。
   *   ★左右回りで注視点は変わらないので、ここは左回りの course で求める。
   */
  const winnerGate = settled[0]!;
  const course = ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn: 'left' });
  const STEP = 0.05;
  const totalSec = RACE_INTRO_RACE_START_SEC + warp.displaySec + POST_RACE_SEC;
  // ★ゴール前の展開: 先頭が残り 80m に達した瞬間の位置関係
  let finishStyle: BroadcastV2FinishStyle = 'solo';
  for (let sec = 0; sec <= warp.raceSecAt(warp.displaySec) + 1e-9; sec += 0.05) {
    const at = model.at(sec);
    const sortedM = at.map((h) => h.meters).sort((a, b) => b - a);
    if ((sortedM[0] ?? 0) >= DIST - 80) { finishStyle = broadcastV2FinishStyleOf(sortedM, HORSE_LENGTH_M); break; }
  }
  const samples: VisualScrollSample[] = [];
  const shotChanges: { displaySec: number; from: BroadcastV2ShotId; to: BroadcastV2ShotId }[] = [];
  let lastShot: BroadcastV2ShotId | undefined;
  for (let d = 0; d <= totalSec + 1e-9; d += STEP) {
    const raceD = Math.max(0, d - RACE_INTRO_RACE_START_SEC);
    const clampedD = Math.min(raceD, warp.displaySec);
    const sec = warp.raceSecAt(clampedD);
    const at = model.at(sec);
    const visual = withFinishRunOut(at, (g) => finishSec.get(g), sec, DIST, Math.max(0, raceD - warp.displaySec) * RUNOUT_SLOW);
    const winnerDone = (at.find((h) => h.gate === winnerGate)?.meters ?? 0) >= DIST - 1e-6;
    const scene = resolveBroadcastV2Scene(course, visual.map((h) => ({
      gate: h.gate, s: startShownMeters(h.meters, raceD), w: h.w ?? TRACK_WIDTH_M / 2, finished: h.meters >= DIST - 1e-6,
    })), { width: W, height: H }, winnerDone, {
      finishStyle, cornerCutM: CORNER_CUT_M_WEB, raceDisplaySec: d - RACE_INTRO_RACE_START_SEC,
      fourthCornerFront: FOURTH_CORNER_FRONT_WEB,
      script: scriptFromSearch(typeof window === 'undefined' ? '' : window.location.search),
    });
    const h = 0.05;
    const lo = Math.max(0, clampedD - h);
    const hi = Math.min(warp.displaySec, clampedD + h);
    const rate = raceD >= warp.displaySec || hi <= lo ? 1
      : (warp.raceSecAt(hi) - warp.raceSecAt(lo)) / (hi - lo);
    samples.push({
      displaySec: d, focusS: scene.focusS, rate: rate > 0 ? rate : 1,
      anchorWeight: broadcastV2AnchorWeight(course, scene.shot.id, scene.focusS),
    });
    if (lastShot !== undefined && lastShot !== scene.shot.id) shotChanges.push({ displaySec: d, from: lastShot, to: scene.shot.id });
    lastShot = scene.shot.id;
  }
  return {
    model,
    warp,
    pace,
    result: result.order.map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })),
    gauge, finishPos, finishSec,
    visualScroll: buildVisualScroll(samples),
    finishStyle,
    shotChanges,
    weightsKg: entrants.map((e) => e.weightKg),
  };
}

export default function RacePage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** ★実況の行（変化したときだけ積む） */
  const callRef = useRef<readonly (readonly CallPart[])[]>([]);
  /** 各行の発話開始秒（文字送り 20 文字/秒・callRef と同じ添字） */
  const callStartRef = useRef<readonly number[]>([]);
  /** 区間タグの文言と、それに変わった秒（スライドイン用） */
  const sectionTagRef = useRef<{ label: string; sinceSec: number }>({ label: '', sinceSec: -Infinity });
  const callKeyRef = useRef<string>('');
  /** ★何本目の発言か。自馬に触れる間隔に使う（乱数の代わり・憲法 4） */
  const callIndexRef = useRef(0);
  const callLastSecRef = useRef<number>(-Infinity);
  const artRef = useRef<{
    pal: unknown;
    raceTitle: HTMLImageElement;
    raceNarrator: HTMLImageElement;
    /**
     * ★口パク用の立ち絵（4 名 × 表情 3 × 口 2 ＝ 24 枚）。
     *   揃わなければ undefined で従来の 1 枚に落とす（読み込み失敗で演出を止めない）。
     */
    narratorSets?: Record<NarratorCast, NarratorSet<HTMLImageElement>>;
    startingGate: HTMLImageElement;
    raceBackstretch: HTMLImageElement;
    raceCornerExit: HTMLImageElement;
    raceFinish: HTMLImageElement;
    raceCornerRear: HTMLImageElement;
    raceCornerHigh: HTMLImageElement;
    sideHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    diagFrontHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    diagRearHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    highDiagHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    winnerHighQuality: readonly (readonly HighQualityHorseFrame[])[];
    /** ★勝馬の 8 コマ（未承認のうちは undefined → 走行 8 コマで代用） */
    winnerCycleHighQuality?: readonly (readonly HighQualityHorseFrame[])[];
    /** ★勝馬の後方寄り 8 コマ（あれば勝馬追従を後方〜横の寄りにする） */
    winnerRearHighQuality?: readonly (readonly HighQualityHorseFrame[])[];
    /** ★向正面ショット用のループ多層パララックス（`tools/split-parallax-layers.mjs` の出力） */
    parallaxBackstretch: ParallaxPlate<FrameImage>;
    /** ★コーナー・斜めショット用のテクスチャ付き透視ワールド素材（芝タイル・遠景パノラマ） */
    texturedWorld: TexturedWorldAssets<FrameImage>;
    /** ★承認水準（一体・高解像度）の方向別素材が揃っているか */
    directionalReady: { rear: boolean; front: boolean };
    /** ★正面の発馬機（扉閉／扉開・透過）と不透明範囲。無ければ undefined */
    gateFront?: {
      closed: HTMLImageElement; open: HTMLImageElement;
      closedSource: HighQualityHorseFrame['source']; openSource: HighQualityHorseFrame['source'];
    };
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  /** ★ディゾルブ用のオフスクリーン（前ショットを描く） */
  const dissolveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * ★順位表の行の位置（小数）。**順位そのものではありません。**
   *   毎コマ瞬時に並び替わると行が跳ぶので、表示時刻で補間して滑らかに動かします。
   */
  const standingsAnimRef = useRef<{ at: number; pos: Map<number, number> }>({ at: 0, pos: new Map() });
  const t0Ref = useRef(0);
  const dRef = useRef(0);

  const [seed, setSeed] = useState(42);
  /**
   * ★**`/race?seed=99` で seed を URL から選べるようにします**（2026-08-26・オーナー要求）
   *
   * 【なぜ要るか】
   *   ⚠️ ★デモ画面はずっと seed 42 で見られていました。実測（`tools/find-contest-seeds.mjs`）で
   *      ★seed 42 は**上位 5 頭が 19〜21m に伸びる「せめぎ合いの無い」展開**でした。
   *      ★どんなカメラを使っても、在らない競り合いは映せません。
   *   ★エンジンは seed で決定論なので、**せめぎ合いになる seed が実在します**
   *     （例: seed 99 = 上位 5 頭が 4.1 馬身・10 番手から差し切り・1-2 着差 0.15 馬身）。
   *   ★これはエンジンにも表示にも手を入れず、**見るレースを選ぶだけ**です。
   *
   * ⚠️ ★`useState` の初期値にしないのは、サーバー側描画と食い違うためです（hydration）。
   */
  useEffect(() => {
    const v = Number(new URLSearchParams(window.location.search).get('seed'));
    if (Number.isFinite(v) && v > 0) setSeed(Math.floor(v));
  }, []);

  /**

   * ★このレースの実況（1 レースに 1 人・オーナー指示 2026-08-22）。

   *   誰になるかは**シードから決定論**で決まるので、同じレースなら必ず同じ人が出ます。

   */

  const cast = narratorCastForRace(seed);
  const [ownGate, setOwnGate] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [surface, setSurface] = useState<Surface>('turf');
  const [trackCondition, setTrackCondition] = useState<TrackCondition>('good');
  const [turn, setTurn] = useState<'left' | 'right'>('left');
  /** ★既定は V2。`?renderer=legacy` のときだけ旧固定2D（引継ぎ書 §1-5） */
  const [renderer, setRenderer] = useState<RendererKind>('v2');
  /** ★発走前オーバーレイ「出馬表」（design/hud-ds/components/entry-board）。ゲート待機中に重ねる。`?entryBoard=1` でも開く */
  const [showEntryBoard, setShowEntryBoard] = useState(false);
  useEffect(() => {
    setRenderer(rendererFromSearch(window.location.search));
    setShowEntryBoard(new URLSearchParams(window.location.search).get('entryBoard') === '1');
  }, []);
  useEffect(() => {
    let cancelled = false;
    const boot = async (): Promise<void> => {
      const pal = await fetch(`/art/palette.json?v=${ASSET_VERSION}`).then((r) => r.json());
      /**
       * ★第3便のシート（8コマ × 枠色8行）を**カットごとに2枚**。
       *   ⚠️ 引きに寄りのシートを縮めて使うと **0.4倍**になり、輪郭が濁ります
       *      （契約 §5 で禁じている形）。★引き用は別に描き起こしたものです。
       */
      const loadRaw = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error(`スプライトを読み込めません: ${src}`));
          im.src = src;
        });
      /**
       * ★`.png` の代わりに `.webp`（`tools/build-art-webp.mjs` が生成・約 1/7 の大きさ）を先に読み、
       *   無ければ `.png` に落ちる。初回ロード約 145MB → 約 18MB。
       */
      const loadImg = (src: string): Promise<HTMLImageElement> => {
        const m = /^(.*)\.png(\?.*)?$/.exec(src);
        if (m === null) return loadRaw(src);
        return loadRaw(`${m[1]}.webp${m[2] ?? ''}`).catch(() => loadRaw(src));
      };
      /**
       * ⚠️ ★引き用（120px）の読み込みは**やめました**。
       *    透視投影では大きさが連続的に変わるので、**段階に分けられません**。
       *    → 高解像度の1枚を**滑らかに縮小**します（D-058 の廃止が前提）。
       */
      /**
       * ★**後ろ姿のシート**（追走カメラの主役）。
       * ⚠️ 真横のシートを後ろから見るカメラで使うと、
       *    ★**馬だけ横を向いた別物**になります。
       */
      /**
       * ★向正面のパララックス層。1枚絵を送るだけでは 400m で 137px しか動かず「その場走り」に見えた
       *   （実測 12px/秒・必要量の約 1/100）。層ごとにループさせ、馬群の進行距離で流す。
       */
      const parallaxManifest = await fetch(`/art/parallax/backstretch-side-v1/manifest.json?v=${ASSET_VERSION}`)
        .then((r) => r.json()) as {
          plateWidth: number; plateHeight: number;
          layers: { name: string; file: string; plateY0: number; plateY1: number; tileWidth: number; depthOffsetM: number }[];
          objects: {
            name: string; file: string; plateY0: number; anchorXRatio: number; worldS: number | 'finish'; depthOffsetM: number;
            zOrder?: 'behind' | 'front'; worldW?: number; anchorYRatio?: number; scale?: number;
          }[];
          world: {
            turf: { file: string; tileWidth: number; tileHeight: number; pxPerM: number };
            panorama: { file: string; tileWidth: number; height: number; horizonY: number };
            trees?: { file: string; tileWidth: number; height: number };
          };
        };
      /**
       * ★**空席のスタンドに観客を焼き込む**（設計 2-1・デザイナー依頼 D-1 の代替）
       *
       *   参考の引きのカット（67s / 69s）は馬が画面の 10% しかないのに成立します。
       *   成立させているのは**背景の情報量**で、その大半が**数千人の観客の粒**です。
       *   我々の `stand.png` / `world-panorama.png` は**一人もいない空席**でした。
       *
       * ⚠️ ★**起動時に 1 度だけ**焼きます。毎コマ数千個の点を描くと重すぎます。
       * ⚠️ ★監査道具（`tools/shot-race-at.mjs`）と**同じ関数・同じ既定値**で焼くこと。
       *    片方だけ満員にすると、道具がオーナーと別の画を出します（R-30）。
       */
      const bakeCrowd = (image: HTMLImageElement): FrameImage => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const cx = canvas.getContext('2d');
        if (cx === null) return image;
        cx.drawImage(image, 0, 0);
        try {
          const data = cx.getImageData(0, 0, canvas.width, canvas.height).data;
          // ★屋根の位置は素材から見つける（数字を手で書くと、素材差し替えで黙って屋根に人が乗る）
          const band = seatBandFromPixels(data, canvas.width, canvas.height);
          paintCrowd(cx, canvas.width, canvas.height,
            seatMaskFromPixels(data, canvas.width, canvas.height, band));
        } catch {
          return image;   // 画素を読めない環境（CORS 等）では元のまま
        }
        return canvas;
      };
      const parallaxRaw = await Promise.all(parallaxManifest.layers.map((layer) =>
        loadImg(`/art/parallax/backstretch-side-v1/${layer.file}?v=${ASSET_VERSION}`)));
      const parallaxImages: FrameImage[] = parallaxRaw.map((image, index) =>
        parallaxManifest.layers[index]?.name === 'stand' ? bakeCrowd(image) : image);
      const objectImages = await Promise.all(parallaxManifest.objects.map((object) =>
        loadImg(`/art/parallax/backstretch-side-v1/${object.file}?v=${ASSET_VERSION}`)));
      const [worldTurfImg, worldPanoImg, worldTreesImg] = await Promise.all([
        loadImg(`/art/parallax/backstretch-side-v1/${parallaxManifest.world.turf.file}?v=${ASSET_VERSION}`),
        loadImg(`/art/parallax/backstretch-side-v1/${parallaxManifest.world.panorama.file}?v=${ASSET_VERSION}`),
        parallaxManifest.world.trees !== undefined
          ? loadImg(`/art/parallax/backstretch-side-v1/${parallaxManifest.world.trees.file}?v=${ASSET_VERSION}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      // ★コース沿いの立体帯: 横追従用の層タイル（生垣・樹林・スタンド）をそのままテクスチャに使う
      const imgW = (image: FrameImage): number => (image instanceof HTMLCanvasElement ? image.width : image.naturalWidth);
      const imgH = (image: FrameImage): number => (image instanceof HTMLCanvasElement ? image.height : image.naturalHeight);
      const layerTexture = (name: string, pxPerM: number) => {
        const index = parallaxManifest.layers.findIndex((layer) => layer.name === name);
        const image = index >= 0 ? parallaxImages[index] : undefined;
        return image === undefined ? undefined : { image, width: imgW(image), height: imgH(image), pxPerM };
      };
      const hedgeTex = layerTexture('hedge', 60);
      const treesTex = worldTreesImg !== null
        ? { image: worldTreesImg, width: worldTreesImg.naturalWidth, height: worldTreesImg.naturalHeight, pxPerM: 20 }
        : layerTexture('trees', 20);
      const standTex = layerTexture('stand', 12);
      const texturedWorld: TexturedWorldAssets<FrameImage> = {
        turf: { image: worldTurfImg, width: worldTurfImg.naturalWidth, height: worldTurfImg.naturalHeight, pxPerM: parallaxManifest.world.turf.pxPerM },
        // ★遠景の帯も空席だった。同じ焼き込みを通す
        panorama: (() => {
          const baked = bakeCrowd(worldPanoImg);
          return { image: baked, width: imgW(baked), height: imgH(baked), horizonY: parallaxManifest.world.panorama.horizonY };
        })(),
        scenery: {
          ...(hedgeTex !== undefined ? { hedge: hedgeTex } : {}),
          ...(treesTex !== undefined ? { trees: treesTex } : {}),
          ...(standTex !== undefined ? { stand: standTex } : {}),
        },
      };
      const parallaxBackstretch: ParallaxPlate<FrameImage> = {
        plateWidth: parallaxManifest.plateWidth,
        plateHeight: parallaxManifest.plateHeight,
        layers: parallaxManifest.layers.map((layer, index) => ({
          image: parallaxImages[index]!,
          width: imgW(parallaxImages[index]!),
          height: imgH(parallaxImages[index]!),
          plateY0: layer.plateY0,
          plateY1: layer.plateY1,
          depthOffsetM: layer.depthOffsetM,
        })),
        // ★決勝線・審判塔は世界に固定（worldS='finish' → 距離）。発馬機の側面切り出しは正面ビルボードに置き換えたので除外
        objects: parallaxManifest.objects.filter((object) => !object.name.startsWith('start-')).map((object, index) => ({
          image: objectImages[index]!,
          width: objectImages[index]!.naturalWidth,
          height: objectImages[index]!.naturalHeight,
          plateY0: object.plateY0,
          anchorXRatio: object.anchorXRatio,
          worldS: object.worldS === 'finish' ? DIST : object.worldS,
          depthOffsetM: object.depthOffsetM,
          ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
          ...(object.worldW !== undefined ? { worldW: object.worldW } : {}),
          ...(object.anchorYRatio !== undefined ? { anchorYRatio: object.anchorYRatio } : {}),
          ...(object.scale !== undefined ? { scale: object.scale } : {}),
        })),
      };
      const loaded = await Promise.all([
        loadImg(`/art/race-title-spring-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-narrator-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/starting-gate-side-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-backstretch-side-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-corner-exit-side-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-finish-side-v2.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-corner-rear-v2.png?v=${ASSET_VERSION}`),
        loadImg(`/art/race-corner-high-v2.png?v=${ASSET_VERSION}`),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-side-v6-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-diag-front-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-diag-rear-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        ...Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/horse-jockey-high-diag-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)),
        loadImg(`/art/horse-jockey-winner-v1.png?v=${ASSET_VERSION}`),
      ]);
      if (cancelled) return;
      const [raceTitle, raceNarrator, startingGate, raceBackstretch, raceCornerExit, raceFinish,
        raceCornerRear, raceCornerHigh] = loaded;
      /**
       * ★実況の立ち絵（口パク用）。仕様 `design/hud-ds/components/narrator-cast`:
       *   表情 3（通常／熱／絶叫）× 口 2（閉／開）= 6 枚。
       *   ★**口パクは同一頭部で口だけ差し替え**（頭が動かないこと）。
       *     素材は `tools/slice-narrator.mjs` が、閉じた絵を土台に口の矩形だけを貼って作っています。
       *   揃わなければ従来の 1 枚に落とす（読み込み失敗で演出が止まらないように）。
       */
      const narratorSets = await (async () => {
        const exprs = ['normal', 'hot', 'shout'] as const;
        const casts = ['a', 'b', 'c', 'd'] as const;
        const loadCast = async (cast: typeof casts[number]) => {
          const pairs = await Promise.all(exprs.map(async (expr) => {
            const [closed, open] = await Promise.all([
              loadImg(`/art/narrator-${cast}-${expr}-closed.png?v=${ASSET_VERSION}`).catch(() => null),
              loadImg(`/art/narrator-${cast}-${expr}-open.png?v=${ASSET_VERSION}`).catch(() => null),
            ]);
            return closed === null || open === null ? undefined : { closed, open };
          }));
          const [normal, hot, shout] = pairs;
          return normal === undefined || hot === undefined || shout === undefined
            ? undefined : { normal, hot, shout };
        };
        const loaded = await Promise.all(casts.map(async (c) => [c, await loadCast(c)] as const));
        const ok = loaded.filter((e): e is readonly [typeof casts[number], NarratorSet<HTMLImageElement>] => e[1] !== undefined);
        return ok.length === casts.length
          ? Object.fromEntries(ok) as Record<typeof casts[number], NarratorSet<HTMLImageElement>>
          : undefined;
      })();
      /** ★枠色（`palette.json` が唯一の出どころ）。HUD と同じ引き方をする */
      const silksByGate = silksColorsFor(pal as Record<string, string>, FIELD);
      const buildFrames = (
        images: readonly FrameImage[],
        referenceHeightOverride?: number,
        silksLayout: SilksLayout = SILKS_LAYOUT_CROUCH,
        anchorsOverride?: readonly { x: number; y: number; width: number }[],
      ): readonly (readonly HighQualityHorseFrame[])[] => {
        const measured = images.map((image) => ({ image, source: opaqueBounds(image) }));
        const referenceHeight = referenceHeightOverride ?? Math.max(...measured.map((frame) => frame.source.height));
        const overlays = images.map((image, index) => silksOverlays(image, measured[index]!.source, silksByGate, silksLayout));
        /**
         * ★配置と縮尺の基準は鞍布（剛体）。
         *   - 基準点 = 鞍布中心（無ければ胴体重心）
         *   - 縮尺 = 鞍布幅の中央値との比で各コマを補正（±8% で頭打ち。騎手の脚で一部隠れるぶんの誤検出を抑える）
         *   - 接地高さ = そのコマの最下点（蹄）を地面に置き、空中局面だけ `HORSE_FLIGHT_LIFT_SOURCE_PX` 浮かせる
         */
        const refs = anchorsOverride ?? measured.map((frame) => saddleReference(frame.image, frame.source, silksLayout));
        const anchors = measured.map((frame, index) => refs[index] ?? bodyCentroid(frame.image, frame.source));
        const widths = refs.flatMap((ref) => (ref === undefined ? [] : [ref.width]));
        const medianWidth = widths.length === 0 ? 0 : [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)]!;
        const scaleFix = (index: number): number => {
          const ref = refs[index];
          if (ref === undefined || medianWidth <= 0) return 1;
          return Math.max(0.92, Math.min(1.08, ref.width / medianWidth));
        };
        const shadows = measured.map((frame) => bakeShadowSilhouette(frame.image, frame.source));
        /**
         * ★毛色は**枠ごとに 1 回だけ焼き込みます**（2026-08-21）。
         *   ⚠️ 毎コマ `ctx.filter` を掛ける形だと**素材全体**に掛かり、騎手の肌まで脱色されます。
         *   ⚠️ 同じ毛色は使い回します（12 枠に対し毛色は 5 種類）。焼き直すと読み込みが重くなります。
         */
        const bakedByCoat = new Map<CoatName, readonly FrameImage[]>();
        const bakedFor = (coat: CoatName): readonly FrameImage[] => {
          const hit = bakedByCoat.get(coat);
          if (hit !== undefined) return hit;
          const made = measured.map((frame) => bakeCoat(frame.image, coat));
          bakedByCoat.set(coat, made);
          return made;
        };
        return silksByGate.map((_, gateIndex) => {
          const baked = bakedFor(coatOf(gateIndex + 1));
          return measured.map((frame, frameIndex) => ({
          ...frame,
          image: baked[frameIndex] ?? frame.image,
          referenceHeight: referenceHeight * scaleFix(frameIndex),
          // ★基準画布（1536px）での値を、この素材の画布の高さで比例させる（上の注記）
          groundLiftSourcePx: (HORSE_GROUND_LIFTS[frameIndex] ?? 0) * (imgH(frame.image) / LIFT_REFERENCE_HEIGHT_PX),
          shadow: shadows[frameIndex],
          bodyAnchorSourcePx: anchors[frameIndex]!,
          bodyLiftSourcePx: (frame.source.y + frame.source.height - anchors[frameIndex]!.y)
            + flightLiftFor(frameIndex, images.length) * (imgH(frame.image) / LIFT_REFERENCE_HEIGHT_PX),
          overlay: overlays[frameIndex]?.[gateIndex],
          }));
        });
      };
      /**
       * ★勝馬の 8 コマ（騎手が立ってガッツポーズ・Codex 生成）。8 枚すべて揃ったときだけ使う。
       *   揃わない間は走行 8 コマで代用（`winnerCycleHighQuality` を undefined のまま）。
       */
      /**
       * ★走行 16 コマ: side-v6 の 8 姿勢の間に Codex 生成の中間姿勢 mid01..08 を挟む（01, mid01, 02, mid02, …）。
       *   8 枚揃わなければ 8 コマのまま。
       */
      const midImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-jockey-side-v6-mid${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const midsReady = midImages.every((image): image is HTMLImageElement => image !== null);
      const winnerCycleImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-jockey-winner-v2-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const winnerCycleReady = winnerCycleImages.every((image): image is HTMLImageElement => image !== null);
      /**
       * ★馬・騎手分離素材（Codex 生成）: 騎手なしの馬 8 コマ ＋ 騎手 2 姿勢（前傾 a/b・ガッツポーズ a/b）。
       *   全部揃ったときだけ合成コマを使い、揃わなければ従来の一体コマ。
       */
      const horseOnlyImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-only-side-v6-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const jockeyImages = await Promise.all(['jockey-crouch-a', 'jockey-crouch-b', 'jockey-celebrate-a', 'jockey-celebrate-b']
        .map((name) => loadImg(`/art/${name}.png?v=${ASSET_VERSION}`).catch(() => null)));
      /**
       * ★2026-08-18 オーナー判定: 馬・騎手の分離合成は「馬の形・大きさがアンバランス」「勝馬の騎手が破綻」で不採用。
       *   合格していた一体素材（side-v6 8 コマ・winner-v2 8 コマ）へ戻す。素材は残すが使わない。
       */
      const USE_SEPARATED_COMPOSITE = false;
      const separatedReady = USE_SEPARATED_COMPOSITE
        && horseOnlyImages.every((image): image is HTMLImageElement => image !== null)
        && jockeyImages.every((image): image is HTMLImageElement => image !== null);
      const composeCycle = (
        jockeys: readonly [HTMLImageElement, HTMLImageElement],
        refFrames: readonly [HTMLImageElement, HTMLImageElement],   // 騎手 a/b の元になった一体コマ
        refPoses: readonly [number, number],                          // その馬姿勢（1〜8）
        refLayout: SilksLayout,                                        // 参照コマの鞍布検出レイアウト
      ): FrameImage[] | undefined => {
        if (!separatedReady) return undefined;
        const horses = horseOnlyImages as HTMLImageElement[];
        const saddles = horses.map((image) => saddleReference(image, opaqueBounds(image), SILKS_LAYOUT_HORSE_ONLY));
        if (saddles.some((saddle) => saddle === undefined)) return undefined;
        // 参照コマ: 鞍布（一体コマ用レイアウトで検出）の中心より下・x 範囲内の黒画素＝ブーツ
        const refMarks = [0, 1].map((k) => {
          const refImage = refFrames[k]!;
          const b = opaqueBounds(refImage);
          const cloth = saddleReference(refImage, b, refLayout);
          if (cloth === undefined) return undefined;
          return jockeyLandmarks(refImage, { x0: cloth.x - cloth.width * 0.55, x1: cloth.x + cloth.width * 0.55, y0: cloth.y, y1: cloth.y + cloth.width * 0.7 }, b.y);
        });
        const genMarks = jockeys.map((jockey) => {
          const b = opaqueBounds(jockey);
          return jockeyLandmarks(jockey, { x0: b.x, x1: b.x + b.width, y0: b.y + b.height * 0.5, y1: b.y + b.height }, b.y);
        });
        if (refMarks.some((m) => m === undefined) || genMarks.some((m) => m === undefined)) return undefined;
        return horses.map((horse, index) => {
          const k = index >= 4 ? 1 : 0;
          return composeHorseAndJockey(horse, jockeys[k]!, genMarks[k]!, refMarks[k]!, saddles[index]!, saddles[refPoses[k]! - 1]!);
        });
      };
      /**
       * ★斜め後ろ（v3・高解像度）: 騎手なし 8 コマ ＋ 後方視点の前傾騎手 1 枚。騎手は pose04 の座標で描かれているので、
       *   各コマの鞍布中心の差だけ移動して合成。揃わなければ従来の低解像度 diag-rear-v2。
       */
      const rearHorseImages = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        loadImg(`/art/horse-only-diag-rear-v3-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
      const rearJockey = await loadImg(`/art/jockey-crouch-rear.png?v=${ASSET_VERSION}`).catch(() => null);
      let composedRear: { frames: FrameImage[]; anchors: { x: number; y: number; width: number }[] } | undefined;
      if (USE_SEPARATED_COMPOSITE && rearJockey !== null && rearHorseImages.every((image): image is HTMLImageElement => image !== null)) {
        const saddles = rearHorseImages.map((image) => saddleReference(image, opaqueBounds(image), SILKS_LAYOUT_HORSE_ONLY));
        const ref = saddles[3];
        if (ref !== undefined && saddles.every((saddle) => saddle !== undefined)) {
          composedRear = {
            frames: rearHorseImages.map((horse, index) => {
              const cv = document.createElement('canvas'); cv.width = horse.naturalWidth; cv.height = horse.naturalHeight;
              const ctx = cv.getContext('2d');
              if (ctx !== null) {
                ctx.drawImage(horse, 0, 0);
                ctx.drawImage(rearJockey, Math.round(saddles[index]!.x - ref.x), Math.round(saddles[index]!.y - ref.y));
              }
              return cv;
            }),
            anchors: saddles.map((saddle) => saddle!),
          };
        }
      }
      const sideRefs = loaded.slice(8, 16);
      const composedRace = composeCycle(
        [jockeyImages[0]!, jockeyImages[1]!] as [HTMLImageElement, HTMLImageElement],
        [sideRefs[0]!, sideRefs[4]!], [1, 5], SILKS_LAYOUT_CROUCH);
      /**
       * ★勝馬のガッツポーズは**1 姿勢・1 基準に固定**します（2026-08-22）。
       *
       * ⚠️ ★以前は 2 姿勢を 4 コマごとに切り替えていました（`index >= 4 ? 1 : 0`）。
       *    実測すると中身の大きさが
       *      celebrate-a 355×791（面積 90,361） ／ celebrate-b 278×657（面積 49,306）
       *    と違い、★**4 コマ目で騎手が縦 17%・面積 45% 縮みます。**
       *    オーナー評「喜び方が不自然　かくかくしている」はこれです。
       *
       * ⚠️ ★縮尺の正規化（`composeHorseAndJockey`）は「兜の上端→ブーツ下端」で合わせますが、
       *    **腕を上げた姿勢では上端が鞭の先**になるため、この基準が成り立ちません。
       *    2 姿勢で鞭の上がり方が違えば、そのまま大きさの差になります。
       *
       * ★ガッツポーズは**腕を上げたまま**が自然なので、姿勢を替える必要がありません。
       *   1 枚に固定し、基準コマも 1 つに揃えて、大きさが跳ばないようにします。
       */
      const composedWinner = winnerCycleReady ? composeCycle(
        [jockeyImages[2]!, jockeyImages[2]!] as [HTMLImageElement, HTMLImageElement],
        [winnerCycleImages[0] as HTMLImageElement, winnerCycleImages[0] as HTMLImageElement], [1, 1], SILKS_LAYOUT_WINNER) : undefined;
      /**
       * ★方向別の一体素材（勝馬 8 コマと同じ方式で Codex 生成・騎手込み・1024×1536）。
       *   diag-rear-v4 / diag-front-v3 が 8 枚揃ったときだけ採用。揃わない方向は真横素材で代用（低解像度 v2 は使わない）。
       */
      /**
       * ★縮小に備えた輪郭立ては、読み込み時に一度だけかける（`sharpenForDownscale` の注記）。
       *   `?sharpen=0` で無効、`?sharpen=<数値>` で半径を変えられる（効き具合を見比べるため）。
       */
      const sharpenParam = new URLSearchParams(window.location.search).get('sharpen');
      // ★`?sharpen=0` で無効、`?sharpen=<数値>` で**強さ**を変える（半径は固定）。
      //   強さのほうを触れるようにしたのは、実測でここが効き目を決めていたため。
      const sharpenAmount = sharpenParam === null ? SHARPEN_AMOUNT_DEFAULT
        : Number.isFinite(Number(sharpenParam)) ? Math.max(0, Number(sharpenParam)) : SHARPEN_AMOUNT_DEFAULT;
      const sharpenSigma = sharpenAmount > 0 ? SHARPEN_SIGMA_DEFAULT : 0;

      const loadSet = async (prefix: string): Promise<FrameImage[] | undefined> => {
        const images = await Promise.all(Array.from({ length: 8 }, (_, i) =>
          loadImg(`/art/${prefix}-pose${String(i + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`).catch(() => null)));
        if (!images.every((image): image is HTMLImageElement => image !== null)) return undefined;
        return images.map((image) => sharpenForDownscale(image, sharpenSigma, sharpenAmount));
      };
      /**
       * ★背後は v5（8 コマを 1 枚のシートで生成 → 切り出して胴体基準で整列）。
       *
       *   v4 は 1 コマずつ生成したもので、**5 つの素材のうちいちばん悪い**数値でした
       *   （接地点のばらつき 11.6%。合格済みは winner-v2 4.6% / side-v7 9.6%）。
       *   ★オーナー評「**背後からの馬はまともに走っていない**」— 計測も同じことを言っています。
       *   シートで作り直して **11.6% → 8.0%**。
       */
      const rearV4 = await loadSet('horse-jockey-diag-rear-v5')
        ?? await loadSet('horse-jockey-diag-rear-v4');
      const winnerRear = await loadSet('horse-jockey-winner-rear-v1');
      // ★絵柄の候補を本番の画面に差し込んで見るための差し替え（P4・案 B の比較用）
      //
      //   白地や緑地に大きく置いた絵が良く見えても、**実際は縮小され、芝と柵と観客席の上に重なり、
      //   勝負服を色替えされ、斜め俯瞰の遠近の中に置かれます**。当て込むと別物になるので、
      //   ここで差し替えて**本番の条件で**見比べられるようにします。
      //
      //   使い方: /race?horse=side-c1-cg
      //   ⚠️ 候補は 1 コマしか無いので 8 枚とも同じ絵です。**走りは判断できません**（絵柄だけ）。
      const horseOverride = new URLSearchParams(window.location.search).get('horse');
      const sideSetName = horseOverride !== null && /^[a-z0-9-]+$/.test(horseOverride)
        ? `horse-jockey-${horseOverride}`
        : 'horse-jockey-side-v7';
      const sideV7 = await loadSet(sideSetName) ?? await loadSet('horse-jockey-side-v7');
      const [gateClosed, gateOpen] = await Promise.all([
        loadImg(`/art/starting-gate-front-v1.png?v=${ASSET_VERSION}`).catch(() => null),
        loadImg(`/art/starting-gate-front-open-v1.png?v=${ASSET_VERSION}`).catch(() => null),
      ]);
      const frontV3 = await loadSet('horse-jockey-diag-front-v3');
      // ★俯瞰は v2（271×724 の低解像度・一度も作り直していない）のままで、
      //   オーナー評「ここで一気にクオリティが下がる」の当のカットだった（2026-08-20）。
      //   真横 v7 を参照に作り直した v3 が揃えばそれを使う。
      // ★v3（1 コマずつ生成）は 1 枚ずつは合格だったが、**動かすとガクガクして走って見えなかった**
      //   （オーナー確認・2026-08-20）。カメラ角度と体型がコマごとに流れていたため。
      //   → v4 は **8 コマを 1 枚のシートで一度に生成**し、切り出して胴体基準で揃えたもの。
      //      接地点のばらつき 22.0% → 9.9%（合格済みは 4.6〜9.6%）。
      const highDiagV3 = await loadSet('horse-jockey-high-diag-v4')
        ?? await loadSet('horse-jockey-high-diag-v3');
      // ★真横は v7（一貫性を持たせて作り直した 8 コマ）が揃えばそれを、無ければ承認済み v6
      const sidePoses: readonly FrameImage[] = composedRace ?? sideV7 ?? loaded.slice(8, 16);
      /**
       * ★16 コマ（中間コマ入り）は「ウサギ跳ね」と評価されたため既定は 8 コマ。
       *   中間コマは脚位置の計測で「両隣の真の中間」と確認できたものだけ後で戻す。
       */
      const USE_MID_FRAMES = false;
      const sideCycle: readonly FrameImage[] = midsReady && USE_MID_FRAMES
        ? sidePoses.flatMap((pose, index) => [pose, midImages[index]!])
        : sidePoses;
      const sideHighQuality = buildFrames(sideCycle);
      const diagFrontHighQuality = frontV3 !== undefined
        ? buildFrames(frontV3, undefined, SILKS_LAYOUT_FRONT)
        : buildFrames(loaded.slice(16, 24));
      const diagRearHighQuality = rearV4 !== undefined
        ? buildFrames(rearV4, undefined, SILKS_LAYOUT_REAR)
        : composedRear !== undefined
          ? buildFrames(composedRear.frames, undefined, SILKS_LAYOUT_REAR, composedRear.anchors)
          : buildFrames(loaded.slice(24, 32));
      const highDiagHighQuality = highDiagV3 !== undefined
        ? buildFrames(highDiagV3, undefined, SILKS_LAYOUT_REAR)
        : buildFrames(loaded.slice(32, 40));
      const winnerHighQuality = buildFrames(loaded.slice(40, 41));
      artRef.current = {
        pal, raceTitle: raceTitle!, raceNarrator: raceNarrator!, startingGate: startingGate!,
        ...(narratorSets !== undefined ? { narratorSets } : {}),
        raceBackstretch: raceBackstretch!, raceCornerExit: raceCornerExit!, raceFinish: raceFinish!,
        raceCornerRear: raceCornerRear!, raceCornerHigh: raceCornerHigh!,
        sideHighQuality, diagFrontHighQuality, diagRearHighQuality, highDiagHighQuality, winnerHighQuality,
        /**
         * ★勝馬コマは騎手が腕を挙げるぶん外接矩形が縦に長い。矩形高さを基準にすると馬体が 2〜3 割縮むので、
         *   馬体の大きさ（矩形幅の中央値の比）で side-v6 の基準高さに合わせる。
         */
        texturedWorld,
        directionalReady: { rear: rearV4 !== undefined, front: frontV3 !== undefined },
        ...(winnerRear !== undefined ? { winnerRearHighQuality: buildFrames(winnerRear, undefined, SILKS_LAYOUT_REAR) } : {}),
        ...(gateClosed !== null && gateOpen !== null ? { gateFront: {
          closed: gateClosed, open: gateOpen,
          closedSource: opaqueBounds(gateClosed), openSource: opaqueBounds(gateOpen),
        } } : {}),
        ...(composedWinner !== undefined ? {
          // ★合成勝馬: 馬体は側面走り 8 コマそのもの（伸縮なし）、騎手はガッツポーズ 2 姿勢
          winnerCycleHighQuality: buildFrames(composedWinner, undefined, SILKS_LAYOUT_WINNER),
        } : winnerCycleReady ? {
          winnerCycleHighQuality: buildFrames(winnerCycleImages, (() => {
            const median = (values: number[]): number => { const v = [...values].sort((x, y) => x - y); return v[Math.floor(v.length / 2)] ?? 1; };
            const sideRef = sideHighQuality[0]![0]!.referenceHeight;
            const sideWidth = median(sideHighQuality[0]!.map((frame) => frame.source.width));
            const winnerWidth = median(winnerCycleImages.map((image) => opaqueBounds(image).width));
            return sideRef * (winnerWidth / sideWidth);
          })(), SILKS_LAYOUT_WINNER),
        } : {}),
        parallaxBackstretch,
      };
      setReady(true);
    };
    boot().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { setBuilt(build(seed, ownGate, surface, trackCondition, contestGammaFromSearch(typeof window === 'undefined' ? '' : window.location.search))); setErr(null); } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    dRef.current = 0;
    callRef.current = [];
    callStartRef.current = [];
    callKeyRef.current = '';
    callLastSecRef.current = -Infinity;
    sectionTagRef.current = { label: '', sinceSec: -Infinity };
    setClock(0);
  }, [seed, ownGate, surface, trackCondition, turn]);

  const render = useCallback((d: number) => {
    const cv = canvasRef.current;
    const art = artRef.current;
    if (cv === null || art === null || built === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;

    const intro = raceIntroAt(d);
    const vp = { width: W, height: H };
    const FONT = (px: number, bold?: boolean): string =>
      `${bold === true ? 'bold ' : ''}${px}px system-ui, sans-serif`;
    const conditionLabel: Record<TrackCondition, string> = {
      good: '良', yielding: '稍重', soft: '重', bad: '不良',
    };
    if (intro.stage === 'flyover' && renderer === 'v2') {
      /**
       * ★空撮フライオーバー（アーケード参考映像 31 秒）: コースの上を斜めに飛ぶカメラで透視ワールドだけを描く（馬なし）。
       *   時刻 d の関数（決定論）。終わりでタイトルへ暗転で渡す。
       */
      const course = ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn });
      const t = Math.max(0, Math.min(1, d / RACE_INTRO_FLYOVER_SEC));
      const ease = t * t * (3 - 2 * t);
      const eyeS = -140 + ease * 620;                // 発走の手前上空から向正面の上空へ
      const eye = posOf(course, eyeS, -60 + ease * 20);
      const target = posOf(course, eyeS + 260, TRACK_WIDTH_M / 2);
      drawTexturedWorld(ctx, course, {
        eye: { x: eye.x, y: eye.y, z: 62 - ease * 14 },
        target: { x: target.x, y: target.y, z: 0 },
        fovY: (34 * Math.PI) / 180, width: W, height: H,
      }, art.texturedWorld);
      // 冒頭のフェードインと終わりのフェードアウト
      const fade = t < 0.15 ? 1 - t / 0.15 : t > 0.85 ? (t - 0.85) / 0.15 : 0;
      if (fade > 0) { ctx.globalAlpha = fade; ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      drawRendererBadge(ctx, renderer, 'flyover');
      return;
    }
    if (intro.stage === 'title' || intro.stage === 'flyover') {
      drawRaceTitleCard(ctx, art.pal as Record<string, string>, vp, FONT, {
        venue: RACE_META.venue, raceName: RACE_META.raceName, raceNo: RACE_META.raceNo,
        distanceMeter: DIST, surfaceLabel: surface === 'turf' ? '芝' : 'ダート',
        weatherLabel: '晴', conditionLabel: conditionLabel[trackCondition],
        turnLabel: turn === 'left' ? '左' : '右',
        fieldSize: FIELD,
        own: {
          gate: ownGate, role: frameRoleOf(ownGate, FIELD),
          name: HORSE_NAMES[ownGate - 1] ?? `スター${ownGate}`, jockey: JOCKEY_NAMES[ownGate - 1] ?? 'STAR騎手',
        },
      }, d, { image: art.raceTitle, width: art.raceTitle.width, height: art.raceTitle.height });
      drawRendererBadge(ctx, renderer, 'title');
      return;
    }
    /**
     * ★V2 はゲート待機〜発走〜追走を**同じ透視カメラの一続き**で描く（ユーザー指摘①: カット無し）。
     *   発馬機は世界固定の物体（`start-gate`）として馬の手前に描き、発走後は左へ流れ去る。
     *   旧固定2D（legacy）だけが従来のプレート＋振り付けの発走を使う。
     */
    const v2StartHold = renderer === 'v2' && (intro.stage === 'gate-hold' || intro.stage === 'gate-release');
    if (renderer !== 'v2' && (intro.stage === 'gate-hold' || intro.stage === 'gate-release')) {
      drawStartingGate(ctx, art.pal as Record<string, string>, vp, FONT,
        undefined, 0, SHEET_V2, FIELD, intro.releaseProgress, frameRoleOf,
        { image: art.startingGate, width: art.startingGate.width, height: art.startingGate.height },
        art.sideHighQuality[0], art.sideHighQuality,
        { image: art.raceNarrator, width: art.raceNarrator.width, height: art.raceNarrator.height });
      drawRendererBadge(ctx, renderer, intro.stage);
      return;
    }

    const raceD = intro.raceDisplaySec;

    const sec = built.warp.raceSecAt(raceD);
    const at = built.model.at(sec);
    const sorted = [...at].sort((a, b) => b.meters - a.meters)
      .map((h) => ({ gate: h.gate, s: h.meters, stamina: h.staminaRatio }));
    const lead = sorted[0]!.s;
    const own = at.find((h) => h.gate === ownGate);
    const metersLeft = DIST - (own === undefined ? lead : own.meters);

    /**
     * ★**透視投影で描きます**（据えたカメラ）。
     *
     * ⚠️ ★これまでの斜め俯瞰は**平行投影**でした。`w` に係数を掛けて縦にずらすだけなので、
     *    **奥も手前も同じ太さの帯**になり、板を並べた絵にしか見えませんでした。
     *    参考（2D の中継画）は**透視投影**で、ラチが収束し、
     *    反対側の走路とスタンドまで見えています。
     *
     * ⚠️ ★**描き方はこの画面に持ちません。** `@star/render` が唯一の出どころで、
     *    動画の道具と**同じ関数**を呼びます。
     */
    /**
     * ★**馬群の後ろから、走路に沿って見ます**（参考の主役の画）。
     *
     * ⚠️ ★最初は走路の**横**に据えました。**丸ごと外していました。**
     *    参考は3枚とも馬群の後ろから見ており、★**空もスタンドも写っていません**。
     */
    const allFinishedNow = at.every((h) => h.meters >= DIST - 1e-6);
    const courseSection = raceCourseSectionAt(lead, DIST, allFinishedNow);
    const shot = raceShotAt({
      distanceMeter: DIST,
      leaderMeters: lead,
      displaySec: raceD,
      displayDurationSec: built.warp.displaySec,
      phase: phaseOf(DIST - lead),
      allFinished: allFinishedNow,
    });
    const visualAt = withFinishRunOut(at, (gate) => built.finishSec.get(gate), sec, DIST, Math.max(0, raceD - built.warp.displaySec) * RUNOUT_SLOW);
    const visualLead = Math.max(...visualAt.map((h) => h.meters));
    const winnerGate = built.result[0]!.gate;
    /**
     * ★**確定着順（馬番 → 着）**。最後の直線の攻防（表示専用）の役どころに使います。
     *   ⚠️ ★その瞬間の見た目の順位ではありません。見た目から決めると演出が自分に反応して発振します。
     */
    const finishPlaceByGate = new Map(built.result.map((row) => [row.gate, row.place]));
    const search = typeof window === 'undefined' ? '' : window.location.search;
    /**
     * ★**台本 v6（最後の直線をカットで割る）を選んでいるか**（`/race?cinematography=v6`）
     *
     *   ⚠️ ★v6 では**表示位置の演出を使いません。** 馬はエンジンが決めた位置のまま走ります。
     *   ★理由は `SCRIPT_V6` の注記のとおりで、演出は「1 カットで大きさと頭数を両立させる」ための
     *     代償でした（見かけの速度が **+13.3% / −14.8%** ずれる）。カットで割れば要りません。
     */
    const cutScript = scriptFromSearch(search) === CUT_RACE_SCRIPT;
    /** ★`/race?climax=off` で表示演出を切る（新旧比較用・指示書 §8-B）。★v6 は常に切る */
    const climaxDisabled = cutScript || search.includes('climax=off');
    /**
     * ★**主役群の馬番**（確定着順の上位 `CLIMAX_LEAD_COUNT` 頭）。
     *   ★演出の役どころにも、直線のカメラの「収める相手」にも、同じこの集合を使います。
     *   ⚠️ ★レース中ずっと変わらない集合です（確定着順から決めるため）。
     *      だから「順位が入れ替わって集合ごと入れ替わり、画角が跳ぶ」ことが起きません。
     */
    const climaxLeadGates = built.result
      .filter((row) => row.place >= 1 && row.place <= CLIMAX_LEAD_COUNT)
      .map((row) => row.gate);
    /** ★発走イージング（描画のみ・全馬同じ係数）。★全馬に同じ量なので前後関係は変わりません */
    const easedAt0 = visualAt.map((horse) => ({ ...horse, meters: startShownMeters(horse.meters, raceD) }));
    /**
     * ★**最後の直線の攻防（表示専用）**（指示書 §4・`climax-choreography.ts`）
     *
     *   ⚠️ ★**着順・確定タイム・着差ラベル・払戻・DB の値には触れません。**
     *      ここが変えるのは「その瞬間、画面のどこに描くか」だけです。
     *   ★残り 60m でオフセットは完全に 0 に戻るので、**ゴールは確定着順・確定着差**です。
     *   ★役どころは `built.result` の**確定着順**から決めます（見た目の順位からではありません）。
     *
     *   ⚠️ ★**ここで作った位置は、順位表 HUD・馬名プレート・実況にも渡します。**
     *      ★以前は HUD だけがエンジンの真の位置で並んでいたため、実測（4 seed・
     *      `tools/audit-climax-contest.mjs` ⑥）で
     *      ★**「絵では 4 番が先頭なのに順位表では 10 番が先頭」が 1.2〜3.8 秒**、
     *      上位 5 頭の並びの食い違いが **7.5〜10.9 秒**ありました。
     *      ★絵と数字が食い違うのは、どちらか一方が間違っているより悪い状態です。
     *
     *   比較用: `/race?climax=off` で素通し。
     */
    const easedAt = ((): typeof easedAt0 => {
      const posed = climaxDisplayPositions(
        easedAt0.map((h) => ({
          gate: h.gate, s: h.meters, finishPosition: finishPlaceByGate.get(h.gate) ?? 99,
        })),
        { seed, distanceM: DIST, disabled: climaxDisabled },
      );
      return easedAt0.map((h, i) => ({ ...h, meters: posed[i]!.s }));
    })();
    const winnerFinishedNow = (at.find((horse) => horse.gate === winnerGate)?.meters ?? 0) >= DIST - 1e-6;
    const winnerFinishSec = built.finishSec.get(winnerGate);
    const winnerAfterSec = winnerFinishSec === undefined ? 0 : Math.max(0, sec - winnerFinishSec);
    /**
     * ★**ゴールの通過を見せてから勝馬の寄りへ移る**（2026-08-26・オーナー指摘）
     *
     * 【★何が起きていたか】
     *   ⚠️ ★`winner-follow` は**勝馬が決勝線を通過した瞬間**に切り替わっていました。
     *      ★そのため「他の馬がゴール板を通過する画」が**1 コマも存在しません**でした。
     *      ★オーナー評「ゴール通過カメラを見せずに、いきなり馬 1 頭が 1 着になっている」。
     *   ★実際の中継は、決勝線のカメラを保持して**続く馬が入線するのを見せてから**寄ります。
     *
     * ⚠️ ★台本 v6 のときだけ保持します。**v5 の挙動は 1 ビットも変えません。**
     */
    const goalHeld = cutScript && winnerFinishedNow && winnerAfterSec < GOAL_HOLD_SEC;
    const winnerShotNow = winnerFinishedNow && !goalHeld;
    const contenders = visualAt.filter((h) => visualLead - h.meters <= HORSE_LENGTH_M * 2);
    const pack = visualAt.filter((h) => visualLead - h.meters <= 40);
    const focusHorses = focusForRaceShot(shot, {
      all: visualAt, pack, contenders,
      leader: visualAt.filter((h) => h.meters === visualLead),
      winner: visualAt.filter((h) => h.gate === winnerGate),
    });
    const packS = focusHorses.reduce((sum, h) => sum + h.meters, 0) / Math.max(1, focusHorses.length);
    const cornerSection = courseSection === 'first-corner' || courseSection === 'second-corner'
      || courseSection === 'third-corner' || courseSection === 'fourth-corner';
    // ★既定は V2（引継ぎ書 §1-5）。旧固定2Dは `?renderer=legacy` のときだけ
    let v2ShotId: string | undefined;
    /** ★V2 の区間名はショット選択と同じ区間定義から（`broadcastV2SectionLabel`）。旧 `raceCourseSectionAt` とは別定義 */
    let v2SectionLabel: string | undefined;
    /** ★ミニマップ用: 注視点と描画に使った馬の位置（描画と同じ値） */
    let v2Minimap: { focusS: number; horses: { gate: number; s: number; w: number; own: boolean }[] } | undefined;
    /**
     * ★自馬マーカー（設計 1-6）用: 自馬の**頭**の画面位置。
     *   ⚠️ ここで求めるのは、**馬を描いたのと同じカメラ**で投影した点でなければなりません。
     *      別に計算すると、寄ったカットでピンが馬から離れます。
     */
    let v2OwnHead: { x: number; y: number } | undefined;
    /**
     * ★このカットで馬が画面高の何割を占めるか。
     *   順位表を**寄りのカットでだけ薄くする**のに使います（オーナー指摘「馬が大きくなったので
     *   順位表が邪魔」）。★カット名で分岐しません — 画角を変えたら意味が変わるので、
     *   **実際の大きさ**から決めます。
     */
    let v2HorseRatio = 0;
    if (renderer === 'v2') {
      const course = ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn });
      const scene = resolveBroadcastV2Scene(course, easedAt.map((horse) => ({
        gate: horse.gate,
        s: horse.meters,
        w: horse.w ?? TRACK_WIDTH_M / 2,
        finished: horse.meters >= DIST - 1e-6,
      })), { width: W, height: H }, winnerShotNow, {
        finishStyle: built.finishStyle, cornerCutM: CORNER_CUT_M_WEB,
        raceDisplaySec: d - RACE_INTRO_RACE_START_SEC,
        fourthCornerFront: FOURTH_CORNER_FRONT_WEB,
        script: scriptFromSearch(typeof window === 'undefined' ? '' : window.location.search),
        /**
         * ★勝馬追従は**後方をやめ、真横にします**（2026-08-21・オーナー判定）。
         *
         *   後方視点の勝馬追従は 8/20 と 8/21 の**2 回とも不合格**でした
         *   （「馬が跳ねているし、騎手もガクガクしている」）。
         *   ★後方・俯瞰は 12 カット全数判定で **5 戦 5 敗**。後ろから見ると脚の伸び縮みが見えず、
         *     尻の上下だけが残るためで、素材を作り直しても直りません。
         *   ⚠️ 後方の素材（`winnerRearHighQuality`）は**読み込んだまま残します** —
         *      裁定が変わったときに戻せるように。使うかどうかはここだけで決めます。
         */
        winnerRear: false,
        /**
         * ★**主役群の馬番**（確定着順の上位 5 頭・指示書 §4-4）
         *
         *   ⚠️ ★これが無いと、直線のカメラは「先頭から 16m 以内の**全馬**」を収めようとして
         *      ★主役 5 頭の間に挟まった着外の馬まで入れるために引き、
         *      ★**主役 5 頭が画面幅の 2〜4 割**まで縮みます（§4-4 の要求は 60〜75%）。
         *   ⚠️ ★渡すのは馬番だけです。着順にも馬の位置にも触れません（憲法3）。
         */
        leadGates: climaxLeadGates,
        /** ★`/race?climax=off` は**カメラ側の直しも**切ります（§8-B の「修正前」の側） */
        climaxCameraDisabled: climaxDisabled,
        /**
         * ★**v6 のゴール板は「引く」枠取りを使いません**（`noContenderFrameShots` の注記）。
         *   ⚠️ ★`finish-line` の `frameContenders` は v5 が直線を 1 カットで通すための仕掛けです。
         *      v6 は割っているので、付いたままだと**同じ場面で馬が 25.6% → 11.8% に縮みます**。
         */
        ...(cutScript ? { noContenderFrameShots: CUT_SCRIPT_NO_FRAME_SHOTS } : {}),
      });
      v2ShotId = scene.shot.id;
      v2SectionLabel = broadcastV2SectionLabel(course, visualLead, scene.shot.id);
      v2Minimap = {
        focusS: scene.focusS,
        horses: easedAt.map((horse) => ({ gate: horse.gate, s: horse.meters, w: horse.w ?? TRACK_WIDTH_M / 2, own: horse.gate === ownGate })),
      };
      {
        const basis = cameraBasis(scene.camera);
        const focusGround = posOf(course, Math.max(0, scene.focusS), scene.focusW);
        const focusPoint = project(scene.camera, basis, { x: focusGround.x, y: focusGround.y, z: 0 });
        if (focusPoint.depth > 2) v2HorseRatio = (HORSE_HEIGHT_M * focusPoint.pxPerM) / H;
      }
      {
        // ★自馬の頭（設計 1-6）。馬と**同じ `scene.camera`** で投影する
        const ownVisual = easedAt.find((horse) => horse.gate === ownGate);
        if (ownVisual !== undefined) {
          const basis = cameraBasis(scene.camera);
          const ground = posOf(course, Math.max(0, ownVisual.meters), ownVisual.w ?? TRACK_WIDTH_M / 2);
          const headPoint = project(scene.camera, basis, { x: ground.x, y: ground.y, z: HORSE_HEIGHT_M });
          if (headPoint.depth > 2) v2OwnHead = { x: headPoint.x, y: headPoint.y };
        }
      }
      const library = (frames: readonly (readonly HighQualityHorseFrame[])[]) => ({
        sheet: frames[0]![0]!.image,
        sheetWidth: frames[0]![0]!.source.width,
        spec: {
          frames: 1,
          cellH: frames[0]![0]!.referenceHeight,
          anchorXRatio: 0.5,
          anchorYRatio: 1,
        },
        frameImagesByGate: frames,
      });
      const libraries: BroadcastV2FrameLibraries<CanvasImageSource> = {
        'side-v6': library(art.sideHighQuality),
        'diag-front-v2': library(art.diagFrontHighQuality),
        'diag-rear-v2': library(art.diagRearHighQuality),
        'high-diag-v2': library(art.highDiagHighQuality),
        /**
         * ★勝馬追従: 1 枚絵 `winner-v1` は脚が動かず「絵だけになって背景が動く」（ユーザー指摘⑥）。
         *   勝馬の 8 コマ（騎手が立ってガッツポーズ）が承認されるまでは走行 8 コマで脚を動かす。
         */
        /**
         * ★勝馬の絵。**ゴールしてすぐには切り替えません**（`WINNER_CELEBRATE_DELAY_SEC`）。
         *   `WINNER_POSE` が `'run'` の間はずっと走行の絵のままです（上の注記）。
         */
        'winner-v1': library((() => {
          if (scene.shot.id === 'winner-follow-rear' && art.winnerRearHighQuality !== undefined) {
            return art.winnerRearHighQuality;
          }
          const celebrating = WINNER_POSE === 'celebrate' && winnerAfterSec >= WINNER_CELEBRATE_DELAY_SEC;
          return (celebrating ? art.winnerCycleHighQuality : undefined) ?? art.sideHighQuality;
        })()),
      };
      const plate = scene.shot.id === 'finish-line' || scene.shot.id === 'winner-follow' ? art.raceFinish
        : scene.shot.id === 'homestretch-side' ? art.raceCornerExit
          : scene.shot.id === 'third-corner-rear' ? art.raceCornerRear
            : scene.shot.id === 'first-corner-front' || scene.shot.id === 'second-corner-high'
              || scene.shot.id === 'fourth-corner-high' ? art.raceCornerHigh
              : art.raceBackstretch;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      /**
       * ★脚の周期は「時間」ではなく「進んだ距離」から。
       *   旧: `raceD * 12`（全馬 1.5 完歩/秒で一定・速度と無関係）。
       *   → 1完歩 ≈ 7m（競走速度 16m/s で約 2.3 完歩/秒）。速い馬ほど脚が速く回り、失速も脚に出る。
       *   位相の個体差 `gate * 2.96` は据え置き。
       */
      /**
       * ★見た目の周期。実馬は 1 完歩 ≈7m（2.3 完歩/秒）だが、画面では跳ねて見える（ユーザー指摘「ウサギ」）。
       *   合格に近いと評価されたゴール後の走り（≈1.6〜1.8 完歩/秒）に合わせ 9m とする。
       */
      const STRIDE_M = BROADCAST_STRIDE_M;
      /**
       * ★見た目の進行距離 = 真の位置 + Δ（`visual-scroll.ts`）。時間圧縮を打ち消し、
       *   背景の流れと脚の周期を常に実馬の速さにする。ゴール前は Δ=0（決勝線と馬が一致）。
       */
      const visualDelta = built.visualScroll.deltaAt(d);
      const metersByGate = new Map(easedAt.map((horse) => [horse.gate, horse.meters]));
      /**
       * ★被写体ブラー用の速度（m/s・設計 1-2）は **レース時計での実走速**を使います。
       *
       * 【★ここで 1 度間違えました（2026-08-22）】
       *   最初は**表示時計**で位置を微分しました。表示時計は時間圧縮がかかっているので
       *   （D-062: 道中は早送り）、★**道中で 125m/s、直線で 41m/s** という値が出て、
       *   尾が馬 1 頭ぶんより長くなり**馬が判別できなくなりました**。
       *   ⚠️ 型も検査も通ります。**絵を見るまで分かりませんでした。**
       *
       * ★`visual-scroll.ts` の定義そのものが「**見た目の速度＝真の走速**」なので、
       *   圧縮を Δ で打ち消して微分するのは遠回りで、しかも Δ を持たない道具
       *   （`tools/shot-race-at.mjs`）とは**同じ値になりません**（R-30）。
       *   → **レース時計で微分する。** 画面でも道具でも同じ 1 つの量になります。
       *
       * ⚠️ `Date.now()` は使いません。レース時刻 `sec` を少し進めて差を取るだけです（憲法 4）。
       */
      const nowMetersByGate = new Map(at.map((horse) => [horse.gate, horse.meters]));
      const aheadMetersByGate = new Map(
        built.model.at(sec + BLUR_PROBE_RACE_SEC).map((horse) => [horse.gate, horse.meters]),
      );
      const speedMpsOf = (gate: number): number => {
        if (raceD <= 0) return 0;      // ゲート待機中は動いていない
        const now = nowMetersByGate.get(gate);
        const next = aheadMetersByGate.get(gate);
        if (now === undefined || next === undefined) return 0;
        return Math.max(0, (next - now) / BLUR_PROBE_RACE_SEC);
      };
      /**
       * ★発走直後 0.7 秒だけ、減衰する小さなカメラ揺れ（世界だけ・HUD は揺らさない）。
       *   時刻 d の関数なので決定論（憲法4）。実況カメラが開扉の衝撃で震える感じを出す。
       */
      const shakeT = raceD > 0 && raceD < 0.7 ? raceD / 0.7 : -1;
      if (shakeT >= 0) {
        const amp = 5 * (1 - shakeT) * (1 - shakeT);
        ctx.save();
        ctx.translate(Math.sin(raceD * 61) * amp, Math.cos(raceD * 47) * amp * 0.6);
      }
      /**
       * ★カット切替（`shotChanges` は build 時に決定論で求めてある）。
       *
       * ⚠️ ★以前は**どの切替でも 0.45 秒のディゾルブ**を掛けていました。
       *    まったく違う画角どうしを重ねるので、**12 頭が二重写し**になり、
       *    ★オーナー評「**カメラワークの切り替え時がごちゃごちゃする**」。
       *
       * ★実際の中継は、**画角が変わるところは切り替え（ハードカット）**です。
       *   ディゾルブは「同じ向きのまま寄る／引く」ときにだけ使います。
       *   → **視点の系統（真横／斜め前／斜め上）が変わる切替は重ねない。**
       *
       * ★台本 v4 は 前→前→横→前→横→前→横 なので、**ほとんどがハードカット**になります。
       *   （閃光で入るカットは従来どおり閃光。`FLASH_INTO`）
       */
      const DISSOLVE_SEC = 0.28;
      const sameFamily = (a: BroadcastV2ShotId, b: BroadcastV2ShotId): boolean =>
        broadcastV2ShotById(a).view === broadcastV2ShotById(b).view;
      const change = built.shotChanges.find((c) => c.displaySec <= d && d - c.displaySec < DISSOLVE_SEC
        && c.to === scene.shot.id
        && (FLASH_INTO.has(c.to) || sameFamily(c.from, c.to))
        /** ★このカットへは必ず切り替え（指示書 §5-5・`hardCutIn`） */
        && broadcastV2ShotById(c.to).hardCutIn !== true);
      const drawScene = (target: CanvasRenderingContext2D, sceneToDraw: typeof scene): void => drawBroadcastV2Scene(target, course, sceneToDraw, {
        palette: art.pal as Record<string, string>,
        libraries,
        fieldSize: FIELD,
        directionalSets: art.directionalReady,
        // ★ゲート待機中（raceD=0）は脚を体の下に畳んだ支持局面 pose04（index 3）で静止させる
        frameOf: (gate) => raceD <= 0 ? 3
          : Math.floor((((metersByGate.get(gate) ?? 0) + visualDelta) / STRIDE_M) * 8 + gate * 2.96) % 8,
        // ★位相（0〜1）: 8 コマ・16 コマどちらの素材でも同じ周期で回る。待機中は pose04 の位相
        phaseOf: (gate) => raceD <= 0 ? 3.5 / 8
          : ((((metersByGate.get(gate) ?? 0) + visualDelta) / STRIDE_M) + gate * 0.37) % 1,
        frameRoleOf,
        surface,
        condition: trackCondition,
        kickupColor: surface === 'dirt' ? '#796047' : '#738b43',
        /**
         * ★コーナー専用カット（3 秒程度）の 1 枚絵は、カットの進行に合わせてパン＋軽いズーム。
         *   旧 `(focusS % 400)/400` は 400m で 137px しか動かず静止に見えた。
         */
        backgroundPlate: plate === undefined ? undefined : {
          image: plate,
          width: plate.naturalWidth,
          height: plate.naturalHeight,
          progress: scene.cutProgress,
          zoom: 1.14 + 0.08 * scene.cutProgress,
        },
        /**
         * ★横追従の全ショット（発走追従・向正面・直線・ゴール前・勝馬追従）をループ多層パララックスにする。
         *   コーナー（3角後方・4角俯瞰）は別構図なので従来プレートのまま（次段で対処）。
         *   縦の枠取り: 望遠カメラで蹄が y≈375〜470 に来るので、芝の帯（プレート 503–762）が
         *   その範囲を含むよう anchor を 1.0（窓を下端まで）にする。
         */
        parallaxPlate: sceneToDraw.shot.view === 'side'
          ? { plate: art.parallaxBackstretch, zoom: 1.14, verticalAnchor: 1.0, scrollM: sceneToDraw.focusS + visualDelta }
          : undefined,
        // ★横視点以外（コーナー後方・俯瞰・斜め前）はテクスチャ付き透視ワールド（背景が実際に動く）
        texturedWorld: sceneToDraw.shot.view === 'side' ? undefined : art.texturedWorld,
        /**
         * ★被写体ブラー（参考映像 1.4・設計 1-2）。露光 `MOTION_BLUR_EXPOSURE_SEC` の間に
         *   進んだ距離だけ、進行方向の後ろへ尾を引く。寄りのカットほど px が伸びる（px/m に比例）。
         */
        // ★既定は切ってあります（理由は `MOTION_BLUR_ENABLED` の注記）
        motionBlur: MOTION_BLUR_ENABLED
          ? { exposureSec: MOTION_BLUR_EXPOSURE_SEC, samples: MOTION_BLUR_SAMPLES, speedMpsOf }
          : undefined,
        // ★ハロン棒の数字（設計 1-7）。書体はこの画面のものを使う
        poleFont: FONT,
        /**
         * ★正面の発馬機ビルボード（走路 s=1.6・w 0.5〜15.3）。
         *   待機中は扉閉を**馬の手前**に、開扉後は扉開を**馬の後ろ**に。発走 60m を過ぎたら描かない。
         *
         * ★2026-08-21 に素材を作り直しました。
         *   旧素材は中身が 1523×576 で、`widthM: 14.8` で置くと **高さ 5.60m** ——
         *   実物（およそ 3.4m）の **1.65 倍**でした。そのため**馬の頭（2.5m）が扉の板の真ん中**に来て、
         *   板の下からはみ出した脚だけが見える状態でした
         *   （★オーナー評「**ゲートに馬や騎手がなく足しかない**」）。
         *   新素材は **3.15m**、かつ**扉の上が抜けている**ので、頭と騎手が房越しに見えます。
         *   ⚠️ 縦横比は絵を差し替えるたびに黙って変わります。**`tools/verify-world-billboards.mjs` で留めています。**
         */
        worldBillboards: art.gateFront !== undefined && visualLead < 90 ? [{
          image: raceD <= 0 ? art.gateFront.closed : art.gateFront.open,
          width: (raceD <= 0 ? art.gateFront.closed : art.gateFront.open).naturalWidth,
          height: (raceD <= 0 ? art.gateFront.closed : art.gateFront.open).naturalHeight,
          source: raceD <= 0 ? art.gateFront.closedSource : art.gateFront.openSource,
          worldS: 1.6, worldW: 0.5, widthM: 14.8,
          zOrder: raceD <= 0 ? 'front' : 'behind',
        } satisfies WorldBillboard<HTMLImageElement>] : undefined,
      });
      drawScene(ctx, scene);
      if (change !== undefined && FLASH_INTO.has(change.to)) {
        // ★閃光トランジション（アーケード参考映像 74 秒）: 白 → 0.3 秒で消える
        const t = (d - change.displaySec) / 0.3;
        if (t < 1) {
          ctx.globalAlpha = Math.max(0, 1 - t) * 0.95;
          ctx.fillStyle = '#fff8ea';
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }
      } else if (change !== undefined) {
        const off = dissolveCanvasRef.current ?? (dissolveCanvasRef.current = document.createElement('canvas'));
        if (off.width !== W || off.height !== H) { off.width = W; off.height = H; }
        const offCtx = off.getContext('2d');
        if (offCtx !== null) {
          const prevScene = resolveBroadcastV2Scene(course, easedAt.map((horse) => ({
            gate: horse.gate, s: horse.meters, w: horse.w ?? TRACK_WIDTH_M / 2, finished: horse.meters >= DIST - 1e-6,
          })), { width: W, height: H }, winnerShotNow, {
            finishStyle: built.finishStyle, cornerCutM: CORNER_CUT_M_WEB,
            raceDisplaySec: d - RACE_INTRO_RACE_START_SEC, forceShotId: change.from,
            fourthCornerFront: FOURTH_CORNER_FRONT_WEB,
            script: scriptFromSearch(typeof window === 'undefined' ? '' : window.location.search),
            // ★本体と同じ設定にすること（食い違うと、重ねる直前のコマだけ別の素材になる）
            winnerRear: false,
          });
          offCtx.clearRect(0, 0, W, H);
          drawScene(offCtx, prevScene);
          const t = (d - change.displaySec) / DISSOLVE_SEC;
          ctx.globalAlpha = Math.max(0, 1 - t * t);
          ctx.drawImage(off, 0, 0);
          ctx.globalAlpha = 1;
        }
      }
      if (shakeT >= 0) ctx.restore();
    } else {
    const background = courseSection === 'finish' || courseSection === 'winner' ? art.raceFinish
      : cornerSection ? art.raceCornerExit : art.raceBackstretch;
    const horsesToDraw = shot.family === 'winner'
      ? visualAt.filter((h) => h.gate === winnerGate)
      : visualAt;
    const isClose = shot.family === 'winner';
    // 発走カメラ終了時の密集3列から通常追走配置へ、約7秒かけて連続移行する。
    const formationRaw = Math.max(0, Math.min(1, (raceD - (RACE_INTRO_END_SEC - RACE_INTRO_RACE_START_SEC)) / 7));
    const formation = formationRaw * formationRaw * (3 - 2 * formationRaw);
    const mix = (from: number, to: number): number => from + (to - from) * formation;
    const normalGround = isClose ? [470, 515, 560] as const
      : cornerSection ? [390, 440, 494] as const
        : courseSection === 'straight' || courseSection === 'finish'
          ? [450, 505, 562] as const : [455, 505, 555] as const;
    const normalHeight = isClose ? [235, 270, 305] as const
      : cornerSection ? [128, 150, 174] as const
        : courseSection === 'straight' || courseSection === 'finish'
          ? [190, 220, 252] as const : [175, 205, 235] as const;
    const normalOffset = isClose ? [-55, 0, 55] as const
      : cornerSection ? [-125, 0, 125] as const : [-70, 0, 70] as const;
    const cameraCenter = isClose ? 650 : cornerSection ? 820
      : courseSection === 'straight' || courseSection === 'finish' ? 850 : 940;
    const pxPerMeter = isClose ? 18 : cornerSection ? 7.5
      : courseSection === 'straight' || courseSection === 'finish' ? 15 : 12;
    const minimumGap = isClose ? 190 : cornerSection ? 105
      : courseSection === 'straight' || courseSection === 'finish' ? 155 : 150;
    const layouts = fixed2DPackLayout(horsesToDraw.map((horse) => ({
      gate: horse.gate, meters: horse.meters, laneM: horse.w ?? TRACK_WIDTH_M / 2,
    })), {
      cameraMeters: packS,
      centerX: mix(820, cameraCenter),
      pxPerMeter: mix(9, pxPerMeter), trackWidthM: TRACK_WIDTH_M,
      groundY: [mix(452, normalGround[0]), mix(482, normalGround[1]), mix(512, normalGround[2])],
      displayReferenceHeight: [mix(146, normalHeight[0]), mix(160, normalHeight[1]), mix(174, normalHeight[2])],
      bandXOffsetPx: [mix(-24, normalOffset[0]), 0, mix(24, normalOffset[2])],
      minVisibleGapPx: mix(72, minimumGap),
    });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    drawFixed2DSideScene(ctx, { width: W, height: H }, {
      image: background, width: background.naturalWidth, height: background.naturalHeight,
    }, layouts.map((horse) => ({
      frame: art.sideHighQuality[horse.gate - 1]![Math.floor(raceD * 12 + horse.gate * 2.96) % 8]!,
      x: horse.x, groundY: horse.groundY, displayReferenceHeight: horse.displayReferenceHeight,
    })), {
      travelPx: raceD * (courseSection === 'straight' || courseSection === 'finish' ? 178 : cornerSection ? 108 : 138),
      mode: courseSection === 'straight' ? 'straight'
        : courseSection === 'finish' || courseSection === 'winner' ? 'finish'
          : cornerSection ? 'corner' : 'side',
    });
    }

    if (v2StartHold && showEntryBoard && intro.stage === 'gate-hold') {
      // ★出馬表オーバーレイ（カウントダウン中だけ）。開扉で自動的に閉じる
      drawEntryBoard(ctx, art.pal as Record<string, string>, vp, FONT,
        Array.from({ length: FIELD }, (_, i) => ({
          gate: i + 1, name: HORSE_NAMES[i] ?? `スター${i + 1}`, jockey: JOCKEY_NAMES[i] ?? 'STAR騎手',
          weightKg: built.weightsKg[i], isOwn: i + 1 === ownGate,
        })), {
          raceName: RACE_META.raceName, venue: RACE_META.venue, raceNo: RACE_META.raceNo,
          distanceMeter: DIST, surfaceLabel: surface === 'turf' ? '芝' : 'ダート', turnLabel: turn === 'left' ? '左' : '右',
          weatherLabel: '晴', conditionLabel: conditionLabel[trackCondition],
        }, frameRoleOf, {
          timeSec: d, sinceSec: d - RACE_INTRO_TITLE_END_SEC, secondsToStart: RACE_INTRO_RACE_START_SEC - d,
        });
      drawRendererBadge(ctx, renderer, `${intro.stage}/entry-board`);
      return;
    }
    if (v2StartHold) {
      // ★ゲート待機〜発走直後: 順位 HUD の代わりに発走の中継帯（「ゲートイン完了」→「スタートしました！」）
      const startLineAt = intro.stage === 'gate-release' ? RACE_INTRO_RACE_START_SEC : RACE_INTRO_TITLE_END_SEC + 0.3;
      const startText = intro.stage === 'gate-release' ? 'スタートしました！' : `${FIELD}頭、ゲートイン完了しました`;
      drawStartCallBand(ctx, art.pal as Record<string, string>, vp, FONT, FIELD, intro.stage === 'gate-release',
        // ★口は「文字がまだ増えている間」だけ動かす（喋っている間）
        narratorPortrait(art.raceNarrator, art.narratorSets?.[cast], {
          metersLeft: DIST, displaySec: d,
          speaking: typedCount(startText.length, d - startLineAt) < startText.length,
        }), {
          timeSec: d,
          lineStartSec: startLineAt,
          secondsToStart: RACE_INTRO_RACE_START_SEC - d,
          narratorName: NARRATOR_NAMES[cast],
          narratorRole: NARRATOR_ROLES[cast],
          sinceSec: d - RACE_INTRO_TITLE_END_SEC,
        });
      drawRendererBadge(ctx, renderer, `${intro.stage}/${v2ShotId ?? 'v2'}`);
      return;
    }
    const sectionLabel: Record<typeof courseSection, string> = {
      start: 'スタート後', 'first-corner': '第1コーナー', 'second-corner': '第2コーナー',
      backstretch: '向正面', 'third-corner': '第3コーナー', 'fourth-corner': '第4コーナー',
      straight: '最後の直線', finish: 'ゴール前', winner: 'レース確定',
    };
    {
      const label = v2SectionLabel ?? sectionLabel[courseSection];
      // 初回は即表示（静止画の監査でも見える）。以後は文言が変わった瞬間からスライドイン
      if (sectionTagRef.current.label !== label) sectionTagRef.current = { label, sinceSec: sectionTagRef.current.label === '' ? d - 1 : d };
      const hudSince = raceD - HUD_SETTLE_SEC;
      // ★ゴール後はライブ HUD（見出し・区間タグ・コース図）を落とす（motion-spec §6: ゴール〜2.4s は勝馬テロップのみ）
      if (!winnerFinishedNow) drawRaceHeadlineChip(ctx, FONT, {
        raceNo: RACE_META.raceNo, raceName: RACE_META.raceName,
        distanceLabel: `${surface === 'turf' ? '芝' : 'ダート'}${DIST}m`,
      }, { timeSec: d, sinceSec: hudSince });
      if (!winnerFinishedNow) drawCourseSectionTag(ctx, art.pal as Record<string, string>, FONT, label,
        { timeSec: d, sinceSec: Math.min(hudSince, d - sectionTagRef.current.sinceSec) });
    }
    /**
     * ★コース図ミニマップ（左上・区間タグの下）。カットが変わっても「今どこか」が繋がる（ユーザー指摘⑥）。
     *   描画に使った位置をそのまま点にする（順位計算はしない）。
     */
    if (v2Minimap !== undefined && !winnerFinishedNow) {
      drawCourseMinimap(ctx, ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn }), art.pal as Record<string, string>, FONT,
        v2Minimap.horses, v2Minimap.focusS, { x: 40, y: 321, width: 264, height: 209 },
        // ★コース図も HUD・馬体と同じ枠色から引く（3 か所で持たない）
        (gate) => (art.pal as Record<string, string>)[frameRoleOf(gate, FIELD)] ?? '#fff', {
          distanceLabel: `${surface === 'turf' ? '芝' : 'ダート'} ${DIST}m`,
          metersLeft: Math.max(0, DIST - Math.max(...at.map((h) => h.meters))),
          timeSec: d, sinceSec: raceD - HUD_SETTLE_SEC,
        });
    }
    drawRendererBadge(ctx, renderer, renderer === 'v2' ? v2ShotId ?? 'v2' : `legacy/${courseSection}`);

    /**
     * ★**UI は画面の座標系**（アートバイブル §9）。
     *   ⚠️ ★`cam` を一切使いません。使った瞬間、寄りの最中にゲージが動きます。
     *   ⚠️ ★**描き方はこの画面に持ちません** — 動画の道具と**同じ関数**を呼びます。
     */
    {
      // ★ゴールした瞬間からライブ HUD（順位・実況帯）を落とし、勝馬テロップだけにする（motion-spec §6）
      const hudRaw = raceHudVisibilityAt(raceD, built.warp.displaySec, allFinishedNow);
      const hud = winnerFinishedNow ? { ...hudRaw, gauge: false, standings: false, calls: false } : hudRaw;
      // ★ゲージはエンジンの staminaAt() を読むだけ（D-072）
      const g = staminaAt(built.gauge, Math.max(0, metersLeft));

      /**
       * ★ゴールした馬は**確定着順**で並べます。
       *   ⚠️ 画面上の距離で並べると、ゴール後は全馬が張り付いて★**着順が読めません**。
       */
      /**
       * ⚠️ ★**ゴールしたかどうかは「エンジンの真の位置」で見ます。**
       *    ★表示位置は発走イージングのぶん全馬が一律に後ろへずれている（`startShownMeters`）ので、
       *    表示位置で見ると**誰もゴールしていないこと**になります。
       */
      const trueMetersOf = new Map(at.map((h) => [h.gate, h.meters]));
      const finished = (h: { gate: number }): boolean => (trueMetersOf.get(h.gate) ?? 0) >= DIST - 1e-6;
      /**
       * ★**並べるのは「画面に描いた位置」です**（`easedAt`）。
       *
       *   ⚠️ ★以前はここが `at`＝**エンジンの真の位置**でした。最後の直線の攻防（表示専用）は
       *      **画面の前後関係**を変えるので、★**絵と順位表が食い違って**いました
       *      （実測・4 seed: 先頭の食い違い 1.2〜3.8 秒 / 上位 5 頭の並び 7.5〜10.9 秒）。
       *   ★ゴールした馬は**確定着順**で並べるので、★**決着した瞬間から表は正しい**ままです。
       *   ★残り 60m で表示オフセットは 0 なので、★ゴール前の着差表示も本来の値に戻っています。
       */
      const rank = [...easedAt].sort((p, q) => {
        if (finished(p) && finished(q)) {
          return (built.finishPos.get(p.gate) ?? 99) - (built.finishPos.get(q.gate) ?? 99);
        }
        if (finished(p) !== finished(q)) return finished(p) ? -1 : 1;
        return q.meters - p.meters;
      });
      const allIn = rank[0] !== undefined && finished(rank[0]);
      /**
       * ★順位表の**行が動く速さ**だけを滑らかにします（2026-08-21）。
       *
       *   ⚠️ ★**順位は変えません。** `rank` はエンジンの真の位置で並べたままです。
       *      ここで作るのは「行を今どこに描くか」だけ。
       *   ⚠️ ★`Date.now()` は使いません（憲法 4）。**表示時刻 `d` の差分**で進めます。
       *      撮影用シークで時刻が飛んだときは**補間せず即座に合わせます**。
       */
      {
        const anim = standingsAnimRef.current;
        const dt = d - anim.at;
        anim.at = d;
        const TAU = 0.12;                                  // 行が追いつく時定数（秒）
        const k = dt > 0 && dt < 0.5 ? 1 - Math.exp(-dt / TAU) : 1;
        rank.forEach((h, index) => {
          const cur = anim.pos.get(h.gate);
          anim.pos.set(h.gate, cur === undefined ? index : cur + (index - cur) * k);
        });
      }
      /**
       * ★**参考映像にあって我々に無かった HUD 3 点**（設計 1-4 / 1-5 / 1-6）
       *
       *   出す・出さないは順位表と同じ条件（`hud.standings`）に揃えます。
       *   ⚠️ 別々の条件にすると、ゴール後に**これだけが残る**という形で必ずずれます。
       */
      if (hud.standings) {
        // A: 隊列バー（最上部）。順位ではなく**先頭からの距離**で並べる
        drawFormationBar(ctx, art.pal as Record<string, string>, FONT,
          /** ★★隊列バーも**画面に描いた位置**で並べます（順位表・実況と同じ・食い違いを作らない） */
          easedAt.map((h) => ({ gate: h.gate, s: h.meters })), FIELD, frameRoleOf,
          { x: 40, y: 4, width: W - 80, ownGate, timeSec: d, sinceSec: raceD - HUD_SETTLE_SEC });

        // B: 馬名プレート（下部・固定枠）。自馬 ＋ 先頭 ＋ 2 番手
        const plateRows = referenceNamePlateRows(rank, ownGate, (gate) => HORSE_NAMES[gate - 1] ?? `スター${gate}`);
        /**
         * ★置き場所は**空いているところ**を明示的に渡します。
         *
         *   この画面の下半分は既に埋まっています:
         *     コース図      x 40〜304 / y 321〜530
         *     実況帯        y 574〜720（`drawCallBand`）
         *     ナレーター立ち絵  左下（実況帯の上にせり出す）
         *   ⚠️ ★最初は画面いっぱいに 3 等分したので、左端の枠が**立ち絵の裏**に潜りました
         *      （オーナー評「下のナレーターのあたりが崩れている」）。
         *   → **コース図の右**から画面右端までを 3 等分し、実況帯の**上**に置きます。
         */
        drawHorseNamePlates(ctx, art.pal as Record<string, string>, FONT, plateRows, FIELD, frameRoleOf, {
          viewport: { width: W, height: H },
          x0: 330, x1: W - 24, bottomY: H - 176,
          timeSec: d, sinceSec: raceD - HUD_SETTLE_SEC,
        });

        // C: 自馬マーカー（雫型のピン・頭上を追従）
        if (v2OwnHead !== undefined) {
          drawOwnHorseMarker(ctx, FONT, v2OwnHead, ownGate,
            { topLimitY: 40, viewport: { width: W, height: H }, timeSec: d, sinceSec: raceD - HUD_SETTLE_SEC });
        }
      }
      if (hud.standings) {
        /**
         * ★**寄りでは順位表を最大 25% 減光する。v5 の横追従でも可読性を保つ**
         *
         *   馬を参考と同じ大きさ（〜55%）にした結果、右上の順位表が**馬に被る**ようになりました。
         *   ⚠️ ★消してしまうと「今何番手か」が分からなくなるので、**薄くして残します**。
         *   ⚠️ ★段で切り替えると、カットの変わり目で**パッと明滅**します。なめらかに繋ぎます。
         *
         *   実測の画面比: 発走 24% ／ 4角正面 24% ／ ゴール 26% ／ 先頭争い 34%
         *                 ／ 勝負所 41% ／ 直線の寄り 53%
         *   → 28% までは通常、45% で最も薄く。
         *
         *   ⚠️ ★**減光は 0.6 でした（最も薄いとき 40%）。** 旧 v4 の直線は `homestretch-front` で
         *      画面比 24% 前後だったのでほとんど発動しませんでしたが、既定を `v5` に
         *      した結果、直線の横追従が 45% の閾値を超え、**いちばん馬が大きい瞬間に順位表が
         *      いちばん薄くなり、1〜5 着の馬名と着差が読めなくなりました**（進行 86〜88%）。
         *      → 0.25（最も薄いとき **75%**）へ弱めます。閾値・位置・大きさ・色・`HUD.glass` は
         *        変えません。控えめにする意図は残したまま、読める濃さで止めます。
         */
        const closeUp = Math.max(0, Math.min(1, (v2HorseRatio - 0.28) / (0.45 - 0.28)));
        const ease = closeUp * closeUp * (3 - 2 * closeUp);
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * (1 - 0.25 * ease);
        drawStandings(ctx, art.pal as Record<string, string>, vp, FONT, rank.map((h) => ({
          gate: h.gate,
          name: HORSE_NAMES[h.gate - 1] ?? `スター${h.gate}`,
          lengths: ((rank[0]?.meters ?? h.meters) - h.meters) / HORSE_LENGTH_M,
          timeSec: allIn ? built.finishSec.get(h.gate) : undefined,
          isOwn: h.gate === ownGate,
        })), FIELD, frameRoleOf, {
          animIndexOf: (gate: number) => standingsAnimRef.current.pos.get(gate),
          rightLabel: v2SectionLabel ?? sectionLabel[courseSection],
          timeSec: d, sinceSec: raceD - HUD_SETTLE_SEC,
        });
        ctx.globalAlpha = prevAlpha;
      }

      /**
       * ★**実況は「変化」を言う**（Q-P4-14 ①）。
       *   ⚠️ ★同じことを繰り返させません。**状態が変わったときだけ**足します
       *      （一度、機械的に足して**3行とも同じ文**になりました）。
       */
      /**
       * ★実況は**馬名で呼びます**（2026-08-22）。
       *
       * ⚠️ ★以前は「`${ownGate}番` は前と ◯ 馬身」と、**常に自馬の枠番**を語っていました。
       *    オーナー評「ナレーターの内容が 3 番の馬をずっと語っていますが、
       *    本来の競馬レースのナレーターは**馬の名前を実況中継する**はずです」。
       *
       * ★文の組み立ては `@star/render` の `raceCallAt`（純粋な関数）に置いています。
       *   ここは**状態を渡して受け取るだけ**です。
       */
      const phaseName = v2SectionLabel ?? sectionLabel[courseSection];
      const line = raceCallAt({
        /**
         * ★★実況も**画面に描いた位置**から組みます。
         *   ⚠️ ★ここが `at`（真の位置）のままだと、★**絵では 4 番が抜いているのに
         *      「先頭は 10 番」と実況する**ことになります（順位表と同じ食い違い）。
         */
        horses: easedAt.map((h) => ({
          gate: h.gate, name: HORSE_NAMES[h.gate - 1] ?? `スター${h.gate}`, meters: h.meters,
        })),
        distanceMeter: DIST,
        phaseLabel: phaseName,
        ownGate,
        lineIndex: callIndexRef.current,
        frameRoleOf: (gate: number) => frameRoleOf(gate, FIELD),
      });
      if (line !== undefined
        && hud.calls && shouldEmitRaceCall(callKeyRef.current, line.key, callLastSecRef.current, raceD)) {
        const say = withPhasePrefix(line, callKeyRef.current, phaseName).parts;
        callKeyRef.current = line.key;
        callLastSecRef.current = raceD;
        callIndexRef.current += 1;
        callRef.current = [...callRef.current, say as CallPart[]].slice(-3);
        callStartRef.current = [...callStartRef.current, d].slice(-3);
      }
      if (hud.calls) {
        drawCallBand(ctx, art.pal as Record<string, string>, vp, FONT, callRef.current,
          // ★口は最後の一言がまだ出そろっていない間だけ動かす
          narratorPortrait(art.raceNarrator, art.narratorSets?.[cast], {
            metersLeft: Math.max(0, DIST - Math.max(...at.map((h) => h.meters))),
            displaySec: d,
            speaking: (() => {
              const last = callRef.current[callRef.current.length - 1];
              const at0 = callStartRef.current[callStartRef.current.length - 1];
              return last !== undefined && at0 !== undefined && typedCount(last.length, d - at0) < last.length;
            })(),
          }), {
            timeSec: d, lineStartSec: callStartRef.current,
            narratorName: NARRATOR_NAMES[cast], narratorRole: NARRATOR_ROLES[cast],
            gauge: hud.gauge ? { left: g.left, initial: built.gauge.initial } : undefined,
            metersLeft: Math.max(0, DIST - Math.max(...at.map((h) => h.meters))),
            sinceSec: raceD - HUD_SETTLE_SEC,
          });
      }

      const afterRaceSec = Math.max(0, raceD - built.warp.displaySec);
      const resultsT = (afterRaceSec - WINNER_FOLLOW_SEC) / RESULTS_BOARD_SEC;
      if (resultsT >= 0) {
        // ★着順ボード（全頭）。勝馬追従の後、レースの締め
        drawResultsBoard(ctx, art.pal as Record<string, string>, vp, FONT,
          built.result.map((row) => ({
            place: row.place, gate: row.gate,
            horseName: HORSE_NAMES[row.gate - 1] ?? `スター${row.gate}`,
            jockeyName: JOCKEY_NAMES[row.gate - 1] ?? 'STAR騎手',
            timeSec: built.finishSec.get(row.gate), margin: row.margin, isOwn: row.gate === ownGate,
          })), FIELD, frameRoleOf,
          {
            raceName: RACE_META.raceName, venue: RACE_META.venue, raceNo: RACE_META.raceNo,
            distanceLabel: `${surface === 'turf' ? '芝' : 'ダート'}${DIST}m ${turn === 'left' ? '左' : '右'}`,
            conditionLabel: `晴 / ${conditionLabel[trackCondition]}`,
            winTimeSec: built.finishSec.get(winnerGate),
            secondsToNext: Math.max(0, RESULTS_BOARD_SEC - (afterRaceSec - WINNER_FOLLOW_SEC)),
          },
          Math.min(1, resultsT * 1.6), d);
      } else {
        if (winnerFinishedNow && winnerAfterSec < 3.4) {
          drawWinnerLowerThird(ctx, art.pal as Record<string, string>, vp, FONT,
            winnerGate, HORSE_NAMES[winnerGate - 1] ?? `スター${winnerGate}`,
            JOCKEY_NAMES[winnerGate - 1] ?? 'STAR騎手', built.finishSec.get(winnerGate),
            { role: frameRoleOf(winnerGate, FIELD), animSec: d, sinceSec: winnerAfterSec });
        }
        if (hud.result) {
          drawResultPanel(ctx, art.pal as Record<string, string>, vp, FONT,
            built.result, FIELD, frameRoleOf);
        }
      }
    }
  }, [built, ownGate, surface, trackCondition, turn, renderer, showEntryBoard]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    rendererBadgeHidden = params.get('badge') === '0';
    const auditSec = Number(params.get('auditSec'));
    if (Number.isFinite(auditSec) && auditSec >= 0) dRef.current = auditSec;
    render(dRef.current);
  }, [render, ready]);

  /**
   * ★撮影用のシーク（開発用）。
   *   `render(表示秒)` が時刻から画面を作るので、時刻を置き換えて描き直すだけでよい。
   *   ⚠️ シークしたら**再生は止める** — 動いたままだとすぐ現在時刻に戻ってしまう。
   */
  const totalDisplaySec = built === null ? 0
    : RACE_INTRO_RACE_START_SEC + built.warp.displaySec + POST_RACE_SEC;
  const seekTo = useCallback((sec: number): void => {
    if (built === null) return;
    const t = Math.max(0, Math.min(sec, RACE_INTRO_RACE_START_SEC + built.warp.displaySec + POST_RACE_SEC));
    setPlaying(false);
    dRef.current = t;
    setClock(Math.min(raceIntroAt(t).raceDisplaySec, built.warp.displaySec));
    render(t);
    setSeekPos(t);
  }, [built, render]);
  const seekBy = useCallback((delta: number): void => { seekTo(dRef.current + delta); }, [seekTo]);
  // ★スライダーの位置は `dRef`（ref）では追えないので、表示用の state を並走させる
  const [seekPos, setSeekPos] = useState(0);

  useEffect(() => {
    if (!playing || built === null) return;
    t0Ref.current = performance.now() - dRef.current * 1000;
    const loop = (): void => {
      const d = (performance.now() - t0Ref.current) / 1000;
      // ゴール後はランアウト→勝者紹介→正式着順まで5.2秒確保する。
      const totalDisplaySec = RACE_INTRO_RACE_START_SEC + built.warp.displaySec + POST_RACE_SEC;
      if (d >= totalDisplaySec) {
        dRef.current = totalDisplaySec;
        setClock(built.warp.displaySec);
        render(dRef.current);
        setPlaying(false);
        return;
      }
      dRef.current = d;
      setSeekPos(d);   // ★再生中もスライダーが追随する
      setClock(Math.min(raceIntroAt(d).raceDisplaySec, built.warp.displaySec));
      render(d);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, built, render]);

  return (
    <main style={{ background: '#14120f', color: '#efe9dc', padding: 14, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 8px' }}>
        レース
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★本番と同じエンジン → 境界時刻 → 位置モデル → {renderer === 'v2' ? 'Broadcast V2（透視カメラ中継）' : '旧固定2D描画（legacy）'}
        </span>
        <span style={{
          marginLeft: 12, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', borderRadius: 3,
          background: renderer === 'v2' ? '#c81e78' : '#505050', color: '#fff',
        }}>
          {renderer === 'v2' ? 'BROADCAST V2 ACTIVE' : 'LEGACY RENDERER'}
        </span>
      </h1>
      {err !== null && <p style={{ color: '#e06a4a', fontWeight: 'bold' }}>★{err}</p>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
        <button
          type="button" onClick={() => setPlaying((p) => !p)} disabled={!ready || built === null}
          style={{ padding: '8px 22px', fontSize: 15, fontWeight: 'bold', cursor: 'pointer', background: playing ? '#8a4030' : '#3a6a40', color: '#fff', border: 0 }}
        >
          {playing ? '停止' : '演出開始'}
        </button>
        <button
          type="button" onClick={() => {
            dRef.current = 0;
            callRef.current = [];
            callStartRef.current = [];
            callKeyRef.current = '';
            callLastSecRef.current = -Infinity;
            sectionTagRef.current = { label: '', sinceSec: -Infinity };
            setClock(0); setSeekPos(0); setPlaying(false); render(0);
          }}
          style={{ padding: '8px 14px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0 }}
        >
          最初から
        </button>
        <label>シード <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 70 }} /></label>
        <label>
          自馬{' '}
          <select value={ownGate} onChange={(e) => setOwnGate(Number(e.target.value))}>
            {Array.from({ length: FIELD }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g} 番</option>)}
          </select>
        </label>
        <label>
          走路{' '}
          <select value={surface} onChange={(e) => setSurface(e.target.value as Surface)}>
            <option value="turf">芝</option><option value="dirt">ダート</option>
          </select>
        </label>
        <label>
          馬場{' '}
          <select value={trackCondition} onChange={(e) => setTrackCondition(e.target.value as TrackCondition)}>
            <option value="good">良</option><option value="yielding">稍重</option>
            <option value="soft">重</option><option value="bad">不良</option>
          </select>
        </label>
        <label title="発走前のカウントダウン中に出馬表を重ねる">
          <input type="checkbox" checked={showEntryBoard} onChange={(e) => setShowEntryBoard(e.target.checked)} /> 出馬表
        </label>
        <label>
          回り{' '}
          <select value={turn} onChange={(e) => setTurn(e.target.value as 'left' | 'right')}>
            <option value="left">左回り</option><option value="right">右回り</option>
          </select>
        </label>
        {built !== null && <span style={{ fontSize: 13, opacity: 0.8 }}>{clock.toFixed(1)} / {built.warp.displaySec.toFixed(1)} 秒</span>}
      </div>

      {/*
        ★開発用のシーク（早送り・巻き戻し）— 2026-08-20
          場面を細かく見て撮るために付けた。**本番の画面には出さないこと。**
          演出は `render(表示秒)` が時刻から画面を作る形なので、時刻を動かすだけで任意の瞬間を出せる。
          ⚠️ 実況の文字送りなど**時刻とともに積み上がるもの**は、巻き戻すと途中から積み直しになる。
             見た目の確認には支障ないが、実況の行が飛ぶことがある（撮影用途のため許容）。
      */}
      {built !== null && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 0 8px', padding: '8px 10px', background: '#241f1a', border: '1px solid #4a453d' }}>
          <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap' }}>撮影用シーク</span>
          {[-1, -0.1].map((d) => (
            <button key={d} type="button" onClick={() => seekBy(d)}
              style={{ padding: '4px 10px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0, fontSize: 12 }}>
              {d}s
            </button>
          ))}
          <input
            type="range" min={0} max={totalDisplaySec} step={0.05} value={Math.min(seekPos, totalDisplaySec)}
            onChange={(e) => seekTo(Number(e.target.value))}
            style={{ flex: 1, minWidth: 240, accentColor: '#c8a24a' }}
          />
          {[0.1, 1].map((d) => (
            <button key={d} type="button" onClick={() => seekBy(d)}
              style={{ padding: '4px 10px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0, fontSize: 12 }}>
              +{d}s
            </button>
          ))}
          <span className="a-num" style={{ fontSize: 13, minWidth: 92, textAlign: 'right', color: '#e8dcc0' }}>
            {seekPos.toFixed(2)} / {totalDisplaySec.toFixed(1)}s
          </span>
        </div>
      )}

      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ width: '100%', maxWidth: W, border: '1px solid #4a453d', imageRendering: 'auto', background: '#111' }}
      />
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.8 }}>
        ★<b>着順はエンジンが決めたもの</b>です（開始時に D-059 のゲートを通しています）。<br />
        {renderer === 'v2'
          ? <>★Broadcast V2: コース座標 (s, w) を透視カメラで投影し、区間ごとに中継カメラを切り替えています（旧版は <code>?renderer=legacy</code>）。<br /></>
          : <>★旧固定2Dカメラの前景・中景・後景3帯で、距離差とレーンを表示しています（比較用 legacy）。<br /></>}
        ★横位置と距離ロスはレースエンジンが決めた値を読み、描画側では着順を変更しません。
      </p>
    </main>
  );
}
