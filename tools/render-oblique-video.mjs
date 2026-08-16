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
  timeWarpFor, knotsFor, ratesForTarget, targetDisplaySec, frameRoleOf, gateStalls,
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
 * ★内馬場のいちばん奥。
 *
 * ⚠️ ★−26m 固定にしたら、寄りのカット（16.6px/m）で**内馬場だけで 431px**になり、
 *    **画面の上半分が空虚**になりました。参考では内馬場は細い帯です。
 * → ★**画面に対する割合**で決めます（走路の外に、走路のおよそ 1.2 倍ぶん）。
 */
function infieldW(cam) {
  return -Math.max(8, Math.min(26, (H * 0.30) / (cam.pxPerM * cam.depth)));
}

function sky(ctx, horizonY) {
  for (let y = 0; y < horizonY; y++) {
    const t = y / Math.max(1, horizonY - 1);
    ctx.fillStyle = pal[t < 0.34 ? 'sky-0' : t < 0.67 ? 'sky-1' : 'sky-2'];
    ctx.fillRect(0, y, W, 1);
  }
  ctx.fillStyle = pal['stand-1']; ctx.fillRect(0, horizonY, W, 58);
  ctx.fillStyle = pal['stand-0']; ctx.fillRect(0, horizonY, W, 6);
  for (let x = 0; x < W; x += 3) {
    for (let y = horizonY + 10; y < horizonY + 50; y += 3) {
      ctx.fillStyle = ((x * 3 + y * 5) % 11) < 5 ? pal['crowd-0'] : pal['crowd-2'];
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.fillStyle = pal['hedge-1']; ctx.fillRect(0, horizonY + 58, W, 30);
  ctx.fillStyle = pal['turf-0']; ctx.fillRect(0, horizonY + 88, W, H - horizonY - 88);
}

function bandBetween(ctx, cam, w0, w1, role) {
  const poly = (w) => railPolyline(COURSE, cam, w, { fromM: -180, toM: 420, stepM: 5 });
  const a2 = poly(w0);
  const b2 = poly(w1);
  ctx.beginPath();
  a2.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  for (let i = b2.length - 1; i >= 0; i--) ctx.lineTo(b2[i].x, b2[i].y);
  ctx.closePath();
  ctx.fillStyle = pal[role];
  ctx.fill();
}

function lineAt(ctx, cam, w, thick, role) {
  const line = railPolyline(COURSE, cam, w, { fromM: -180, toM: 420, stepM: 5 });
  ctx.beginPath();
  line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = pal[role];
  ctx.lineWidth = thick;
  ctx.stroke();
}

function track(ctx, cam) {
  const WIDTH = COURSE.widthM;
  const IN_W = infieldW(cam);
  const DIRT = Math.max(IN_W + 2, -12);
  bandBetween(ctx, cam, IN_W, DIRT, 'turf-1');
  lineAt(ctx, cam, DIRT, 3, 'rail-1');
  bandBetween(ctx, cam, DIRT, -1, 'dirt-2');
  lineAt(ctx, cam, -1, 2, 'dirt-3');
  bandBetween(ctx, cam, 0, WIDTH, 'turf-3');
  /**
   * ★**芝の刈り目**。⚠️ 内外に平行な帯だと、**進んでも景色が動きません**
   *    （＝走っている感じが出ない）。★実際の芝目は**走路を斜めに横切ります**。
   *   → 進行方向にも刻んで、**市松に近い斜めの縞**にします。
   */
  /**
   * ★1本ぶんの長さは**画面での見え方**から決めます。
   *   ⚠️ 25m 固定にしたら、ゴールのカット（22px/m）で **1マス 550px** になり、
   *      画面に1〜2マスしか入らず**縞に見えませんでした**。
   *   → 画面上で 70px 前後になる長さにします。
   */
  const STRIPE_M = Math.max(6, Math.round(70 / cam.pxPerM));
  /**
   * ⚠️ ★内外にも刻んだら**市松模様**になりました。芝目は市松ではありません。
   * → ★**進行方向だけ**で刻みます（走路を端から端まで横切る帯）。
   *   斜めに見えるのは**投影の結果**であって、斜めに描くのではありません。
   */
  const first = Math.floor((cam.s - 220) / (STRIPE_M * 2)) * (STRIPE_M * 2);
  for (let m = first; m < cam.s + 480; m += STRIPE_M * 2) {
    const a = obliqueProject(COURSE, cam, m, 0);
    const b = obliqueProject(COURSE, cam, m + STRIPE_M, 0);
    const c = obliqueProject(COURSE, cam, m + STRIPE_M, WIDTH);
    const d = obliqueProject(COURSE, cam, m, WIDTH);
    if (Math.max(a.x, b.x, c.x, d.x) < -60 || Math.min(a.x, b.x, c.x, d.x) > W + 60) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = pal['turf-2'];
    ctx.fill();
  }
  bandBetween(ctx, cam, WIDTH, WIDTH + 30, 'turf-4');
  lineAt(ctx, cam, 0, 4, 'rail-0');
  lineAt(ctx, cam, WIDTH, 6, 'rail-1');
}

/**
 * ★**決勝線とハロン棒**。
 *   ⚠️ これが無いと「あとどれだけか」が画面から分かりません
 *      （オーナーの指摘「ゴール前が一番盛り上がるはずなのに全くわからない」）。
 */
function marks(ctx, cam) {
  const seg = (s, w0, w1, color, thick) => {
    const a = obliqueProject(COURSE, cam, s, w0);
    const b = obliqueProject(COURSE, cam, s, w1);
    if (Math.max(a.x, b.x) < -50 || Math.min(a.x, b.x) > W + 50) return;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.stroke();
  };
  // ★ハロン棒（200m ごと）
  for (let m = 200; m < DIST; m += 200) {
    const p = obliqueProject(COURSE, cam, m, -2);
    if (p.x < -40 || p.x > W + 40) continue;
    ctx.fillStyle = pal['paper-0'];
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 18, 4, 18);
    ctx.fillStyle = pal['ink-0'];
    ctx.font = FONT(12, true);
    ctx.textAlign = 'center';
    ctx.fillText(String(DIST - m), Math.round(p.x), Math.round(p.y) - 22);
    ctx.textAlign = 'left';
  }
  // ★決勝線
  seg(DIST, 0, COURSE.widthM, pal['paper-0'], 5);
}

/**
 * ★**発走ゲート**（オーナーの指摘「枠入りではなく**ゲート入り**にすべき」）。
 *
 * ⚠️ ★房の位置は**エンジンの `laneAtStart` から**取ります。
 *    自前に並べると、★**描いたゲートの外に馬が立ちます**（実際に 18m と 13.8m で離れていました）。
 */
function gate(ctx, cam) {
  const stalls = gateStalls(COURSE, cam, 0, FIELD,
    (g) => laneAtStart(g, FIELD, TRACK_WIDTH_M));
  const first = stalls[0], last = stalls[stalls.length - 1];
  if (first === undefined || last === undefined) return;
  if (Math.max(first.x, last.x) < -140 || Math.min(first.x, last.x) > W + 140) return;

  /**
   * ★**房は「箱」です。** 色帯ではありません。
   *   ⚠️ 最初は色の帯を縦に積んだだけで、★**ゲートに見えませんでした。**
   *
   * ★寸法は実物から: 房の長さ **4.0m**・高さ **2.6m**・仕切りの厚み 0.1m。
   *   ⚠️ ここも**投影で置きます**。画面座標で組み立てると、コーナーで走路から浮きます。
   */
  const LEN_M = 4.0, TOP_M = 2.6;
  const px = cam.pxPerM;
  const top = TOP_M * px;                    // ★高さは「縦方向」なので depth を掛けない
  const at = (sM, wM) => obliqueProject(COURSE, cam, sM, wM);

  for (const st of stalls) {
    const back = at(-LEN_M, st.w);           // 房の後ろ（馬が入る側）
    const front = at(0, st.w);               // 房の前（開く側）
    // 仕切り（面）— ★奥の房から手前の房の順に描かれる（stalls は内→外）
    ctx.fillStyle = pal['rail-1'];
    ctx.beginPath();
    ctx.moveTo(back.x, back.y);
    ctx.lineTo(front.x, front.y);
    ctx.lineTo(front.x, front.y - top);
    ctx.lineTo(back.x, back.y - top);
    ctx.closePath();
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    // 前後の柱
    ctx.fillStyle = pal['rail-0'];
    ctx.fillRect(Math.round(back.x) - 1, Math.round(back.y - top), 2, Math.round(top));
    ctx.fillRect(Math.round(front.x) - 1, Math.round(front.y - top), 2, Math.round(top));
    // 上の桁
    ctx.beginPath();
    ctx.moveTo(back.x, back.y - top);
    ctx.lineTo(front.x, front.y - top);
    ctx.strokeStyle = pal['rail-0'];
    ctx.lineWidth = 2;
    ctx.stroke();
    /**
     * ★房の番号（枠色＋馬番）。⚠️ 黒枠に黒文字だと読めないので、明るさで文字色を選ぶ。
     */
    const bw = Math.max(12, Math.round(px * 1.1));
    const bh = Math.max(9, Math.round(bw * 0.62));
    const bx = Math.round((back.x + front.x) / 2 - bw / 2);
    const by = Math.round((back.y + front.y) / 2 - top - bh - 2);
    const role = frameRoleOf(st.gate, FIELD);
    ctx.fillStyle = pal[role] ?? pal['paper-0'];
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = inkOn(role);
    ctx.font = FONT(Math.max(8, Math.round(bh * 0.8)), true);
    ctx.textAlign = 'center';
    ctx.fillText(String(st.gate), bx + bw / 2, by + bh - 2);
    ctx.textAlign = 'left';
  }
}



/**
 * ★**枠色の上に置く文字の色**。
 *
 * ⚠️ ★黒枠（`#191919`）の上に黒い文字を描いて、**馬番が読めませんでした。**
 *    D-060 は「★色は枠、**数字は個体**」なので、
 *    ★**数字が読めないと個体が識別できません**（V-16 の前提が壊れます）。
 */
function inkOn(role) {
  const hex = pal[role] ?? '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  // ★人の目の感度で明るさを見る
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? pal['paper-0'] : pal['ink-0'];
}

/* ── ★UI（画面の座標系）─────────────────────────
 *
 * ⚠️ ★**カメラの倍率も中心も使いません。** アートバイブル §9 の制約です。
 *    ここに `cam` を持ち込んだ瞬間、寄りの最中にゲージが動きます。
 * ------------------------------------------------------------------ */

/**
 * ★**自馬のスタミナゲージ**（§12.6「自馬にのみ表示」）。
 *   ★出すのは D-070 の「状態」＝**残量と減り方**。`emptyAtMeter` ではありません。
 */
function gauge(ctx, metersLeft) {
  const g = staminaAt(ownGauge, metersLeft);
  const ratio = Math.max(0, Math.min(1, g.left / Math.max(1e-6, ownGauge.initial)));
  const x = 40, y = H - 70, w = 300, h = 18;
  ctx.fillStyle = 'rgba(16,20,16,0.72)';
  ctx.fillRect(x - 8, y - 26, w + 16, h + 42);
  ctx.fillStyle = pal['paper-0'];
  ctx.font = FONT(14, true);
  ctx.fillText(`${ownName}（自分の馬）`, x, y - 10);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  /**
   * ★**色は「残量」ではなく「状態」で変える。**
   *   ⚠️ 数字だけだと、押す瞬間に読み取れません（C-6）。
   */
  // 緑 → 黄 → 赤（★色の意味は「余力があるか」）
  ctx.fillStyle = ratio > 0.5 ? pal['frame-6'] : ratio > 0.2 ? pal['frame-5'] : pal['frame-3'];
  ctx.fillRect(x, y, Math.round(w * ratio), h);
  ctx.strokeStyle = pal['paper-0']; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  /**
   * ★**減り方**（D-070 の②）。1m あたりの消費を「この先どれだけ保つか」ではなく
   *   ⚠️ **いまどれだけ速く減っているか**として、目盛りの動きで見せます。
   *   ★「いつ尽きるか」は出しません（出すと予言になります）。
   */
  const drainPer100m = g.drainPerMeter * 100;
  const bars = Math.max(1, Math.min(5, Math.round(drainPer100m / 1.2)));
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < bars ? pal['paper-0'] : 'rgba(255,255,255,0.22)';
    ctx.fillRect(x + w + 8 + i * 7, y + h - 4 - i * 3, 5, 4 + i * 3);
  }
  ctx.fillStyle = pal['paper-0'];
  ctx.font = FONT(11);
  ctx.fillText('減り方', x + w + 8, y - 4);
}

/**
 * ★順位表示（上位5頭）。★色は枠、数字は個体（D-060）
 *
 * ⚠️ ★**ゴールした馬は「確定着順」で並べます。**
 *    一度、画面上の距離だけで並べたら、★**ゴール後は全馬が 1600m に張り付き、
 *    順位表示が「0.0 馬身」だらけで着順が読めませんでした。**
 *    ★一番知りたいところで、画面が何も言っていませんでした。
 */
function standings(ctx, at) {
  const sorted = [...at].sort((a, b) => {
    const fa = FINISH_POS.get(a.gate), fb = FINISH_POS.get(b.gate);
    const da = a.meters >= DIST - 1e-6, db = b.meters >= DIST - 1e-6;
    // ★ゴールした馬が先。その中は確定着順
    if (da && db) return (fa ?? 99) - (fb ?? 99);
    if (da !== db) return da ? -1 : 1;
    return b.meters - a.meters;
  }).slice(0, 5);
  const settled = sorted[0] !== undefined && sorted[0].meters >= DIST - 1e-6;
  const x = W - 190, y = 24;
  ctx.fillStyle = 'rgba(16,20,16,0.72)';
  ctx.fillRect(x - 10, y - 18, 190, 5 * 22 + 16);
  sorted.forEach((h, i) => {
    const yy = y + i * 22;
    ctx.fillStyle = pal['paper-0'];
    ctx.font = FONT(13, true);
    ctx.fillText(`${i + 1}`, x, yy);
    const role = frameRoleOf(h.gate, FIELD);
    ctx.fillStyle = pal[role] ?? pal['paper-0'];
    ctx.fillRect(x + 18, yy - 11, 22, 14);
    ctx.fillStyle = inkOn(role);
    ctx.font = FONT(11, true);
    ctx.textAlign = 'center';
    ctx.fillText(String(h.gate), x + 29, yy);
    ctx.textAlign = 'left';
    // ★自馬だけ印を付ける（自分がどこにいるか分からないと C-6 が成り立たない）
    if (h.gate === OWN) {
      ctx.fillStyle = pal['paper-0'];
      ctx.font = FONT(12, true);
      ctx.fillText('★', x + 46, yy);
    }
    /**
     * ★先頭との差（馬身）。★順位の数字ではなく**差**（Q-P4-14 ①）。
     *   ⚠️ ★ゴール後は差が 0 になるので、**走破タイム**に切り替えます。
     */
    ctx.fillStyle = pal['paper-0'];
    ctx.font = FONT(11);
    if (settled) {
      const t = FINISH_SEC.get(h.gate);
      ctx.fillText(t === undefined ? '' : `${t.toFixed(1)} 秒`, x + 66, yy);
    } else {
      const gap = (sorted[0].meters - h.meters) / 2.4;
      ctx.fillText(i === 0 ? '' : `${gap.toFixed(1)} 馬身`, x + 66, yy);
    }
  });
}

/**
 * ★**実況の帯**（裁定 Q-P4-14 ①「実況は『位置』ではなく『変化』を言う」）。
 *
 *   ⚠️ ★**下から積みます。** 新しい行が下に出て、古い行が上に流れます。
 *   ★馬名（＝馬番）だけ色を変えます。全部色を付けると、どれが主語か分かりません。
 */
function callBand(ctx, lines) {
  const x = 40, bottom = H - 118;
  ctx.font = FONT(14);
  lines.slice(-3).forEach((ln, i, arr) => {
    const yy = bottom - (arr.length - 1 - i) * 22;
    const alpha = 0.35 + 0.25 * i;
    ctx.fillStyle = `rgba(16,20,16,${alpha.toFixed(2)})`;
    ctx.fillRect(x - 8, yy - 15, 520, 20);
    let cx = x;
    for (const part of ln) {
      ctx.fillStyle = part.role === undefined ? pal['paper-0'] : (pal[part.role] ?? pal['paper-0']);
      ctx.font = FONT(14, part.role !== undefined);
      ctx.fillText(part.text, cx, yy);
      cx += ctx.measureText(part.text).width;
    }
  });
}

/* ── 馬 ─────────────────────────────────── */
const CELL_H = 120;
/**
 * ★**騎手の動き**（オーナーの指摘「騎手も手をあげたり馬を叩いたりして喜ぶのが競馬レース」）。
 *
 * ⚠️ ★スプライトに騎手の別コマがありません（シート契約は8コマの脚だけ）。
 *    → ★**姿勢を作らず、上下の揺れと鞭だけ**にします。
 *      **無い絵を描いたことにしません。** 別コマは第3便（デザイナー）で頼みます。
 *
 *   drive   … 直線で追う（★上体の上下を大きく・鞭を振る）
 *   celebrate … ゴール後（★手綱から手を離して上げる代わりに、鞭を高く上げる）
 */
function drawHorse(ctx, img, x, y, frame, gate, widthPx, mode = 'cruise', phaseT = 0) {
  const cw = img.width / 6;
  const sc = widthPx / cw;
  const hh = Math.round(CELL_H * sc);
  const row = Math.max(0, Math.min(7, Number(frameRoleOf(gate, FIELD).slice(6)) - 1));
  ctx.fillStyle = 'rgba(20,30,18,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, widthPx * 0.20, widthPx * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  /**
   * ★追っているときは**上体が大きく上下**します。
   *   ⚠️ 走りそのものを変えません（脚は同じコマ）。**乗り方だけ**です。
   */
  const bob = mode === 'cruise' ? 0 : Math.sin(phaseT * Math.PI * 2) * (widthPx * 0.025);
  ctx.drawImage(img, frame * cw, row * CELL_H, cw, CELL_H,
    Math.round(x - 52 * sc), Math.round(y - 116 * sc - bob), widthPx, hh);
  /**
   * ⚠️ ★鞭は**寄りのカットだけ**にします。
   *    96px で描いたら、★**馬の上に棒が1本浮いている**だけに見えました。
   */
  if (mode !== 'cruise' && widthPx >= 140) {
    // ★鞭。追うときは後ろで振り、ゴール後は高く上げる
    const up = mode === 'celebrate' ? 1 : Math.max(0, Math.sin(phaseT * Math.PI * 2));
    const wx = Math.round(x - widthPx * 0.10);
    const wy = Math.round(y - hh * 0.78 - bob);
    ctx.strokeStyle = pal['ink-0'];
    ctx.lineWidth = Math.max(1, Math.round(widthPx / 60));
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx - widthPx * 0.10, wy - widthPx * (0.06 + 0.16 * up));
    ctx.stroke();
  }
  const col = pal[frameRoleOf(gate, FIELD)] ?? pal['paper-0'];
  /**
   * ⚠️ ★**寄り（300px）でゼッケンが 51px になり、馬より目立ちました。**
   *    参考では寄りのとき番号はほぼ見えず、**勝負服の色**で見分けています。
   * → ★上限を付けます。番号は「読めればよい」もので、主役ではありません。
   */
  const bw = Math.max(14, Math.min(30, Math.round(widthPx * 0.17)));
  const bh = Math.max(10, Math.round(bw * 0.72));
  const bx = Math.round(x + widthPx * 0.02);
  const by = Math.round(y - hh * 0.5);
  ctx.fillStyle = pal['paper-0'];
  ctx.fillRect(bx - bw / 2, by, bw, bh);
  ctx.fillStyle = col;
  ctx.fillRect(bx - bw / 2, by, bw, Math.max(3, bh * 0.22));
  ctx.fillStyle = pal['ink-0'];
  ctx.font = FONT(Math.max(8, Math.round(bh * 0.72)), true);
  ctx.textAlign = 'center';
  ctx.fillText(String(gate), bx, by + bh - Math.max(2, bh * 0.18));
  ctx.textAlign = 'left';
}

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
  wide: { label: '引き', horseW: 120, cam: { pxPerM: 22, depth: 0.54, anchorX: 470, anchorY: 500 } },
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
  const img = await loadImage(path.resolve('apps/web/public/art/horse-oblique.png'));

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
    const farY = obliqueProject(COURSE, cam, cam.s, infieldW(cam)).y;
    sky(ctx, Math.max(60, Math.round(farY - 88)));
    track(ctx, cam);
    marks(ctx, cam);
    // ★ゲートは馬より先（＝馬の後ろ）に描く。出た馬が手前に来る
    gate(ctx, cam);

    const drawn = at.map((h) => {
      const p = obliqueProject(COURSE, cam, Math.max(0, Math.min(DIST, h.meters)), h.w ?? COURSE.widthM / 2);
      return { ...h, ...p };
    }).sort((a, b) => a.y - b.y);   // ★奥（上）から描く＝手前の馬が奥を隠す
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

    for (const h of drawn) {
      /**
       * ★脚は**表示の時間**で回します（D-062 の教訓）。
       *   ⚠️ 距離で回すと、道中を速く送ったときに**脚も速く回り**、小走りに見えます。
       *   ★競走馬は毎秒およそ2歩。6コマ1完歩なので **毎秒12コマ**。
       */
      const frame = Math.floor(dispSec * 12 + h.gate * 0.37 * 6) % 6;
      const left = DIST - h.meters;
      const mode = h.meters >= DIST ? 'celebrate' : left <= 400 ? 'drive' : 'cruise';
      drawHorse(ctx, img, h.x, h.y, frame, h.gate, cut.horseW, mode, dispSec * 2 + h.gate * 0.37);
    }
    // ★UI は最後に（馬の上に載る）。★カメラを一切使いません
    gauge(ctx, Math.max(0, metersLeftOwn));
    standings(ctx, at);
    callBand(ctx, lines);
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
