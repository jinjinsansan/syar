/**
 * ★**斜め俯瞰でレースを1本、動画にする**（D-066・β）
 *
 * 【なぜ要るか】
 *   ⚠️ ★**静止画では分からないことがあります。**
 *      「レース演出の基礎」§9 に書いたとおり、数字と静止画が良くても
 *      動かすと**小間切れ**・**右端に消える**・**行進に見える**が出ます。
 *      実際、この案件でその3つを全部踏みました。
 *   → ★**絵を動かして、自分の目で見てから出します。**
 *
 * 【★合成データを使いません】
 *   本番のエンジン → 境界時刻 → 位置モデル（脚質から生成）→ 投影、を通します。
 *
 * 【★カットの切り替え】
 *   アートバイブル「カットの3系統」。実際の中継と同じく**ハードカット**です
 *   （ゆっくり寄るのは1つのカットの中でやることで、カット間ではやりません）。
 *
 * 実行: npx tsx tools/render-oblique-video.mjs [--distance 1600] [--seed 42] [--fps 24]
 */
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import {
  DEFAULT_RACE_BALANCE, DEFAULT_INTERVENTION_BALANCE as IB,
  resolveRace, paceOf, replayOf, finalOrderMatches, laneAt, laneAtStart, TRACK_WIDTH_M,
  aiProxyPlan, staminaTrackOf, staminaGaugeOf, staminaAt, boundaryTimesOf,
} from '@star/race-engine';
// ★乱数は注入する（憲法4）。`Math.random` は呼ばない
import { deriveRng } from '@star/sim-engine';
import {
  replayPositionModel, finalOrderOf, ovalCourse, obliqueProject, railPolyline,
  timeWarpFor, knotsFor, ratesForTarget, targetDisplaySec, frameRoleOf,
  // ★描き方は package が唯一の出どころ（この道具には持たない）
  drawObliqueWorld, drawGauge, drawStandings, drawCallBand, SHEET_V2, SHEET_FAR,
} from '@star/render';

/**
 * ★**日本語のフォントを登録します。**
 *
 * ⚠️ ★登録しないと、実況帯も順位表示も**すべて豆腐（□）**になります。
 *    実際になりました。★**絵を見なければ「文字を描いた」で終わっていました。**
 */
const JP_FONTS = [
  'C:/Windows/Fonts/NotoSansJP-VF.ttf',
  'C:/Windows/Fonts/meiryo.ttc',
  'C:/Windows/Fonts/YuGothR.ttc',
  'C:/Windows/Fonts/msgothic.ttc',
];
const jp = JP_FONTS.find((f) => existsSync(f));
if (jp === undefined) throw new Error('★日本語フォントが見つかりません（文字が豆腐になります）');
GlobalFonts.registerFromPath(jp, 'STARJP');
const FONT = (px, bold = false) => `${bold ? 'bold ' : ''}${px}px STARJP, sans-serif`;

const W = 1280, H = 720;
const OUT = path.resolve('out/video');
const WORK = path.join(OUT, 'frames');
const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const DIST = num('--distance', 1600);
const SEED = num('--seed', 42);
const FPS = num('--fps', 24);
const FIELD = 12;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const COURSE = ovalCourse(DIST);

/* ── ★本番と同じ経路 ─────────────────────────── */
const start = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const conditions = {
  raceId: `v${SEED}`, distance: DIST, surface: 'turf',
  trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
};
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('★D-059: 映像の着順が確定着順と違います');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: SEED * 2654435761,
  // ★横位置はエンジンが引いたものを読むだけ（D-071）
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, SEED),
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) {
  throw new Error('★D-059: 位置モデルの最終順が着順と違います');
}
const knots = knotsFor(boundaries, 1);
const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));

/**
 * ★**自馬**（§12.6 は「自馬にのみ表示」）。
 */
const OWN = 1 + (SEED % FIELD);
const ownEntrant = entrants[OWN - 1];
const ownEntry = result.order.find((e) => Number(e.horseId) === OWN);
/**
 * ★**ゲージはエンジンの内部状態を読むだけ**（D-072）。
 *   ⚠️ ★この層で式を作りません。一度作って**符号が逆**になりました
 *      （残り200m で 余力と着順の順位相関 −0.653 ＝ 勝つ馬ほどバテて見えていた）。
 */
const ownGauge = staminaGaugeOf(
  staminaTrackOf(
    {
      iq: ownEntrant.stats.iq, gt: ownEntrant.stats.gt, st: ownEntrant.stats.st,
      condition: ownEntrant.condition, fatigue: ownEntrant.fatigue,
    },
    aiProxyPlan(
      {
        iq: ownEntrant.stats.iq, gt: ownEntrant.stats.gt, st: ownEntrant.stats.st,
        condition: ownEntrant.condition, fatigue: ownEntrant.fatigue,
      },
      deriveRng(SEED, OWN), IB,
    ),
    DIST, IB,
  ),
  boundaryTimesOf(ownEntry, DIST, OWN, ownEntrant.strategy, pace),
  DIST, ownEntrant.strategy, pace,
);
const ownName = `${OWN}番`;
/** ★確定着順と走破タイム（★エンジンの結果そのもの。画面で作りません） */
const FINISH_POS = new Map(result.order.map((e) => [Number(e.horseId), e.finishPosition]));
const FINISH_SEC = new Map(result.order.map((e) => [Number(e.horseId), e.timeSec]));

/* ── 背景・走路（★`shot-cuts.mjs` と同じ描き方）─────────── */
/**
 * ⚠️ ★**走路・標識・ゲート・馬の描き方は、この道具にはありません。**
 *    `@star/render` の `oblique-draw` が**唯一の描き方**です。
 *    ★ここと Web の画面が別々に描いたら、必ず離れます
 *      （`jostle` 0.06/0.25 ／ 走路の幅 20m/25m ／ ゲートの房 13.8m/18m と同じ形）。
 */

/**
 * ⚠️ ★**UI の描き方もこの道具にはありません。**
 *    `@star/render` の `oblique-ui` が唯一の出どころです（Web の画面と同じ関数）。
 */

/**
 * ★**カットの切り替え**（アートバイブル「カットの3系統」）。
 *   ⚠️ 実際の中継は**ハードカット**です。ゆっくり寄るのは1つのカットの中でやります。
 *   ★切り替えの条件は「先頭の残り距離」— **時刻ではありません**
 *     （時間配分 D-062 で表示の時計は伸び縮みするので、時刻で切ると局面とずれます）。
 */
/**
 * ⚠️ ★**2D の参考を測って、全部の値を入れ替えました**（2026-08-16）。
 *
 *   ★実測（画の範囲 296×186 を機械で決めてから）:
 *     引き  馬 9〜11% ／ 走路の帯 33%
 *     寄り  馬 24%
 *   ★こちらは 5.0% と 14.1% で、**両方とも小さすぎました**。
 *
 *   走路の帯 33% ＝ 20m × pxPerM × depth ÷ 720 → **pxPerM × depth = 11.9**
 */
const CUTS = {
  wide: { label: '引き', far: true, horseW: 120, cam: { pxPerM: 22, depth: 0.54, anchorX: 470, anchorY: 500 } },
  close: { label: '寄り', horseW: 300, cam: { pxPerM: 46, depth: 0.36, anchorX: 380, anchorY: 560 } },
  goal: { label: 'ゴール', horseW: 190, cam: { pxPerM: 34, depth: 0.22, anchorX: 560, anchorY: 540 } },
};
function cutFor(metersLeft) {
  if (metersLeft <= 220) return CUTS.goal;
  if (metersLeft <= 800) return CUTS.close;
  return CUTS.wide;
}

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  /**
 * ★第3便のシート（8コマ × 枠色8行）。
 *   ⚠️ ★コマ数が 6 → 8 に変わっています。**シートの形も一緒に渡します**
 *      （渡さないと、黙って別のコマを切り出して描きます）。
 */
const imgNear = await loadImage(path.resolve('apps/web/public/art/horse-oblique-v2.png'));
/**
 * ★引き用は**別に描き起こした**シート（120px）。
 * ⚠️ 寄りの 300px を 0.4倍に縮めて描いていました。半端な比なので輪郭が濁ります
 *    — 契約 §5 で自分が禁じていた形を、自分でやっていました。
 */
const imgFar = await loadImage(path.resolve('apps/web/public/art/horse-oblique-far.png'));

  const total = Math.ceil(warp.displaySec * FPS);
  console.log(`★${DIST}m・${FIELD}頭・シード ${SEED}`);
  console.log(`  表示 ${warp.displaySec.toFixed(1)}秒 × ${FPS}fps = ${total} 枚\n`);

  let prevCut = '';
  const cuts = [];
  const lines = [];
  const lastSay = { key: '' };
  for (let i = 0; i <= total; i += 1) {
    const dispSec = i / FPS;
    const sec = warp.raceSecAt(dispSec);
    const at = model.at(sec);
    const lead = Math.max(...at.map((h) => h.meters));
    const cut = cutFor(DIST - lead);
    if (cut.label !== prevCut) { cuts.push(`${cut.label}@${dispSec.toFixed(1)}s`); prevCut = cut.label; }

    // ★カメラは**馬群の中心**に（1頭に付けると馬群が画面の隅に寄る）
    const centre = at.reduce((s, h) => s + h.meters, 0) / at.length;
    /**
     * ★**内外もカメラが追います。**
     *
     * ⚠️ ★走路の中心（w=10m）を見ていたら、**馬群が走路の上端に貼りつき、
     *    画面の下3分の2が空**になりました（実際にそう写りました）。
     *    馬はラチを取りにいくので、★**走路の真ん中は走りません。**
     * → 見るのは**馬群の内外の中心**です。
     */
    const wCentre = at.reduce((s, h) => s + (h.w ?? COURSE.widthM / 2), 0) / at.length;
    const cam = { ...cut.cam, s: Math.max(1, Math.min(DIST - 1, centre)), w: wCentre };

    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawObliqueWorld(ctx, {
      course: COURSE, cam, pal, viewport: { width: W, height: H }, distanceMeter: DIST,
      horses: at.map((h) => ({ gate: h.gate, meters: h.meters, w: h.w ?? COURSE.widthM / 2 })),
      fieldSize: FIELD, horseWidthPx: cut.horseW,
      sheet: cut.far === true ? imgFar : imgNear,
      sheetWidth: (cut.far === true ? imgFar : imgNear).width,
      /**
       * ★脚は**表示の時間**で回します（D-062 の教訓）。
       *   ⚠️ 距離で回すと、道中を速く送ったときに**脚も速く回り**、小走りに見えます。
       *   ★競走馬は毎秒およそ2歩。6コマ1完歩なので **毎秒12コマ**。
       */
      frameOf: (g) => Math.floor(dispSec * 16 + g * 0.37 * 8) % 8,
      sheet_: cut.far === true ? SHEET_FAR : SHEET_V2,
      modeOf: (h) => (h.meters >= DIST ? 'celebrate' : (DIST - h.meters) <= 400 ? 'drive' : 'cruise'),
      ridePhase: dispSec * 2,
      gateWOf: (g) => laneAtStart(g, FIELD, TRACK_WIDTH_M),
      frameRoleOf, font: FONT,
    });
    /**
     * ★**実況は「変化」を言う**（裁定 Q-P4-14 ①）。
     *   ⚠️ ★順位の数字は言いません。言うのは
     *      ① 前との差 ② それが詰まっているか ③ 局面 の3つだけです。
     */
    const ordered = [...at].sort((a, b) => b.meters - a.meters);
    const ownIdx = ordered.findIndex((h) => h.gate === OWN);
    const ownM = ordered[ownIdx]?.meters ?? 0;
    const aheadM = ownIdx > 0 ? ordered[ownIdx - 1].meters : undefined;
    const before = model.at(Math.max(0, sec - 0.5));
    const ownBefore = before.find((h) => h.gate === OWN)?.meters ?? ownM;
    const aheadGate = ownIdx > 0 ? ordered[ownIdx - 1].gate : undefined;
    const aheadBefore = aheadGate === undefined ? undefined
      : before.find((h) => h.gate === aheadGate)?.meters;
    const gapNow = aheadM === undefined ? 0 : aheadM - ownM;
    const gapBefore = (aheadM === undefined || aheadBefore === undefined) ? 0 : aheadBefore - ownBefore;
    const closing = gapBefore - gapNow;   // ＋なら詰めている
    const metersLeftOwn = DIST - ownM;
    const say = [];
    if (aheadM === undefined) {
      say.push({ text: `${OWN}番`, role: frameRoleOf(OWN, FIELD) }, { text: ' が先頭。' });
    } else {
      say.push({ text: `${OWN}番`, role: frameRoleOf(OWN, FIELD) });
      const lengths = gapNow / 2.4;
      if (lengths < 0.3) {
        // ⚠️ ★「0.0 馬身、離されています」と言っていました。**並んでいるのに。**
        say.push({ text: ' は前と並んでいます' });
      } else {
        say.push({ text: ` は前と ${lengths.toFixed(1)} 馬身` });
        say.push({ text: closing > 0.15 ? '、詰めています' : closing < -0.15 ? '、離されています' : 'の差' });
      }
    }
    const phase = metersLeftOwn <= 400 ? '直線' : metersLeftOwn <= 800 ? '勝負所' : '道中';
    if (phase !== '道中') say.push({ text: `　★${phase}` });
    /**
     * ⚠️ ★**同じことを繰り返し言わせません。**
     *    一度、0.5秒ごとに機械的に行を足したら、
     *    ★**3行とも「7番 は前と 0.6 馬身、離されています」**になりました。
     *    実況は**変化を言うもの**なので（Q-P4-14 ①）、
     *    ★**状態が変わったときだけ**足します。
     */
    const closeState = gapNow / 2.4 < 0.3 ? '並' : closing > 0.15 ? '詰' : closing < -0.15 ? '離' : '同';
    const rank = ownIdx + 1;
    const key = `${phase}/${closeState}/${rank}`;
    if (key !== lastSay.key && i > 0) {
      lines.push(say);
      lastSay.key = key;
    }

    // ★UI は最後に（馬の上に載る）。★カメラを一切使いません
    {
      const vp = { width: W, height: H };
      // ★ゲージはエンジンの staminaAt() を読むだけ（D-072）
      const g = staminaAt(ownGauge, Math.max(0, metersLeftOwn));
      drawGauge(ctx, pal, vp, FONT, `${ownName}（自分の馬）`, g.left, ownGauge.initial, g.drainPerMeter);
      /**
       * ★ゴールした馬は**確定着順**で並べる（D-059 の結果そのもの）。
       *   ⚠️ 画面上の距離で並べると、ゴール後は全馬が張り付いて着順が読めません。
       */
      const settled = ordered[0] !== undefined && ordered[0].meters >= DIST - 1e-6;
      const rank = [...at].sort((a, b) => {
        const da = a.meters >= DIST - 1e-6, db = b.meters >= DIST - 1e-6;
        if (da && db) return (FINISH_POS.get(a.gate) ?? 99) - (FINISH_POS.get(b.gate) ?? 99);
        if (da !== db) return da ? -1 : 1;
        return b.meters - a.meters;
      });
      drawStandings(ctx, pal, vp, FONT, rank.map((h) => ({
        gate: h.gate,
        lengths: ((rank[0]?.meters ?? h.meters) - h.meters) / 2.4,
        timeSec: settled ? FINISH_SEC.get(h.gate) : undefined,
        isOwn: h.gate === OWN,
      })), FIELD, frameRoleOf);
      drawCallBand(ctx, pal, vp, FONT, lines);
    }
    writeFileSync(path.join(WORK, `f${String(i).padStart(4, '0')}.png`), cv.toBuffer('image/png'));
  }

  console.log(`  カットの切り替え: ${cuts.join(' → ')}`);
  const mp4 = path.join(OUT, `race-${DIST}-${SEED}.mp4`);
  execFileSync(ffmpeg, [
    '-y', '-framerate', String(FPS), '-i', path.join(WORK, 'f%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4,
  ], { stdio: 'pipe' });
  console.log(`\n★${mp4}`);
  console.log('⚠️ ★騎手の別コマ（手を上げる姿勢）はシートに無いので、鞭と上体の揺れだけです（第3便で依頼）。');
}
main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
