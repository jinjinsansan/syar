import type { Ctx2D, FontOf, Palette, SheetSpec, Viewport2D } from './oblique-draw.js';
import { drawVenueCrest, drawVenueScenery, titleSceneryBand, type TitleSceneryOptions } from './venue-scenery.js';
import {
  HUD, goldPlate, drawGoldEdge, fillSlant, strokeSlant, drawFrameBadge, drawLabel, drawSpacedText,
  riseAt, wipeAt, drawOnAir, typedCount, drawNarratorFrame, drawGoldChip,
} from './hud-kit.js';

/**
 * ★**発走前の時間割**（★2026-09-15・オーナー決定「★動画の通りにします」）
 *
 *   ★オーナーが競合のアーケード機を撮った動画の順番です（★相談書 `CONSULT_GAME_DESIGN_TWO_MODES_20260915.md` §1-14）:
 *     ★人気馬の紹介 → 格とレース名 → 出馬表（背景は競馬場）→ ゲート → 発走
 *
 *   ★ 0.0〜18.0  人気馬の紹介（★3 番人気 → 2 番人気 → 1 番人気・各 6 秒）
 *   ★18.0〜19.6  空撮（コースの上を飛ぶ・★紹介から格の紹介へのつなぎ）
 *   ★19.6〜22.2  格の紹介（「GRADE I」→ 大きな「G I」→ 白い閃光）
 *   ★22.2〜25.2  レース名のカード（★デザイナーのハンドオフ `components/title-card`）
 *   ★25.2〜31.2  出馬表（全画面・★背景は競馬場の透視ワールド）
 *   ★31.2〜32.4  ゲート待機（正面の発馬機・扉閉）
 *   ★32.4〜      発走（開扉）
 *
 * ⚠️ ★秒は ★**開発側の仮置き**です（★動画は紹介 1 頭 約 9 秒・格とレース名 約 15 秒・出馬表 約 8 秒）。★オーナーの目で決めます。
 * ⚠️ ★2026-09-13 の「★詰めましょう」（★7.8 → 4.4 秒）は、★今回のオーナー決定で ★**上書き**です（★R-7）。
 * ⚠️ ★開扉後の 2.2 秒（`RACE_INTRO_END_SEC - RACE_INTRO_RACE_START_SEC`）は ★**触っていません**。
 * ⚠️ ★発走の時刻は ★**この定数だけ**から引くこと（★画面・監査道具・検査が同じ値を読む・R-31）。
 */
/** ★人気馬の紹介 1 頭の秒 */
export const RACE_INTRO_PADDOCK_EACH_SEC = 6;
/** ★紹介する頭数（★1〜3 番人気） */
export const RACE_INTRO_PADDOCK_COUNT = 3;
export const RACE_INTRO_PADDOCK_END_SEC = RACE_INTRO_PADDOCK_EACH_SEC * RACE_INTRO_PADDOCK_COUNT;
/** ★空撮の始まり（＝紹介の終わり） */
export const RACE_INTRO_FLYOVER_START_SEC = RACE_INTRO_PADDOCK_END_SEC;
/** ★空撮の終わり（★名前は従来のまま・★意味は「空撮が終わる表示秒」） */
export const RACE_INTRO_FLYOVER_SEC = RACE_INTRO_FLYOVER_START_SEC + 1.6;
export const RACE_INTRO_GRADE_END_SEC = RACE_INTRO_FLYOVER_SEC + 2.6;
export const RACE_INTRO_TITLE_START_SEC = RACE_INTRO_GRADE_END_SEC;
export const RACE_INTRO_TITLE_END_SEC = RACE_INTRO_TITLE_START_SEC + 3;
export const RACE_INTRO_ENTRY_END_SEC = RACE_INTRO_TITLE_END_SEC + 6;
/** ★ゲート待機の始まり（＝出馬表の終わり） */
export const RACE_INTRO_GATE_HOLD_SEC = RACE_INTRO_ENTRY_END_SEC;
export const RACE_INTRO_RACE_START_SEC = RACE_INTRO_GATE_HOLD_SEC + 1.2;
// 参考映像は開扉後およそ2秒で次の追走カメラへ渡る。長い横滑りを禁止する。
export const RACE_INTRO_END_SEC = RACE_INTRO_RACE_START_SEC + 2.2;

export type RaceIntroStage = 'paddock' | 'flyover' | 'grade' | 'title' | 'entry' | 'gate-hold' | 'gate-release' | 'race';

export interface RaceIntroState {
  readonly stage: RaceIntroStage;
  readonly raceDisplaySec: number;
  readonly releaseProgress: number;
  /** ★その段に入ってからの秒 */
  readonly sinceSec: number;
  /** ★人気馬の紹介の何頭目か（★0 始まり・★`paddock` の段だけ） */
  readonly paddockIndex?: number | undefined;
}

export function raceIntroAt(displaySec: number): RaceIntroState {
  const d = Math.max(0, displaySec);
  const raceDisplaySec = Math.max(0, d - RACE_INTRO_RACE_START_SEC);
  const held = (stage: RaceIntroStage, from: number): RaceIntroState => ({ stage, raceDisplaySec: 0, releaseProgress: 0, sinceSec: d - from });
  if (d < RACE_INTRO_PADDOCK_END_SEC) {
    const paddockIndex = Math.min(RACE_INTRO_PADDOCK_COUNT - 1, Math.floor(d / RACE_INTRO_PADDOCK_EACH_SEC));
    return { ...held('paddock', paddockIndex * RACE_INTRO_PADDOCK_EACH_SEC), paddockIndex };
  }
  if (d < RACE_INTRO_FLYOVER_SEC) return held('flyover', RACE_INTRO_FLYOVER_START_SEC);
  if (d < RACE_INTRO_GRADE_END_SEC) return held('grade', RACE_INTRO_FLYOVER_SEC);
  if (d < RACE_INTRO_TITLE_END_SEC) return held('title', RACE_INTRO_TITLE_START_SEC);
  if (d < RACE_INTRO_ENTRY_END_SEC) return held('entry', RACE_INTRO_TITLE_END_SEC);
  if (d < RACE_INTRO_RACE_START_SEC) return held('gate-hold', RACE_INTRO_GATE_HOLD_SEC);
  if (d < RACE_INTRO_END_SEC) return {
    stage: 'gate-release', raceDisplaySec, sinceSec: raceDisplaySec,
    releaseProgress: Math.min(1, raceDisplaySec / (RACE_INTRO_END_SEC - RACE_INTRO_RACE_START_SEC)),
  };
  return { stage: 'race', raceDisplaySec, releaseProgress: 1, sinceSec: d - RACE_INTRO_END_SEC };
}

/**
 * ★**人気の順位**（★単勝オッズの低い順・★同じオッズは馬番の若い順）。
 * ⚠️ ★オッズは ★**渡された値をそのまま**使います（★ここで勝率やオッズを作らない）。★本番はサーバーのオッズ、★デモは画面のデモの値。
 * ⚠️ ★人気は発走の前に分かる値なので、★ゴールより前に使っても D-098 に当たりません。
 */
export function popularityRanksOf(entries: readonly { readonly gate: number; readonly winOdds: number }[]): ReadonlyMap<number, number> {
  const sorted = [...entries].sort((a, b) => (a.winOdds - b.winOdds) || (a.gate - b.gate));
  return new Map(sorted.map((e, i) => [e.gate, i + 1]));
}

/**
 * ★**紹介する人気馬**（★紹介の順＝ ★`count` 番人気 → 1 番人気。★動画と同じく人気の低いほうから）。
 */
export function paddockPicksOf(
  entries: readonly { readonly gate: number; readonly winOdds: number }[], count = RACE_INTRO_PADDOCK_COUNT,
): readonly { readonly gate: number; readonly winOdds: number; readonly popularity: number }[] {
  const ranks = popularityRanksOf(entries);
  return entries
    .map((e) => ({ gate: e.gate, winOdds: e.winOdds, popularity: ranks.get(e.gate) ?? entries.length }))
    .filter((e) => e.popularity <= count)
    .sort((a, b) => b.popularity - a.popularity);
}

export interface PaddockIntroEntry {
  readonly gate: number;
  readonly name: string;
  readonly jockey: string;
  /** ★枠の色の役（`frameRoleOf`） */
  readonly frameRole: string;
  readonly oddsLabel: string;
  readonly popularity: number;
  /** ★紹介の何頭目か（★1 始まり）と全頭数 */
  readonly order: number;
  readonly total: number;
}

/** ★背景の絵を画面いっぱいに置く（★縦横比を保って切り抜く） */
function drawCover<TImage>(
  ctx: Ctx2D<TImage>, vp: Viewport2D, bg: { readonly image: TImage; readonly width: number; readonly height: number }, zoom: number, panX: number,
): void {
  const W = vp.width, H = vp.height;
  const targetRatio = W / H;
  const sourceRatio = bg.width / bg.height;
  const sw0 = sourceRatio > targetRatio ? bg.height * targetRatio : bg.width;
  const sh0 = sourceRatio > targetRatio ? bg.height : bg.width / targetRatio;
  const sw = sw0 / zoom, sh = sh0 / zoom;
  const sx = Math.max(0, Math.min(bg.width - sw, (bg.width - sw) * (0.5 + panX)));
  const sy = (bg.height - sh) * 0.5;
  ctx.drawImage(bg.image, sx, sy, sw, sh, 0, 0, W, H);
}

/**
 * ★**人気馬の紹介**（★パドック風・★1 頭ぶん）。
 *   ★背景の絵の上に ★自馬と同じコマ集合で馬を大きく歩かせ（★ゆっくりのコマ送り）、★下に枠番・馬名・騎手・単勝・「○番人気」の帯。
 * ⚠️ ★歩きのコマはまだ無いので、★走りのコマをゆっくり送ります（★開発側の仮置き・歩きの絵は別便）。
 * ⚠️ ★コマ送りも入り方も ★`sinceSec` だけで決まります（★憲法 4）。
 */
export function drawPaddockIntro<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  entry: PaddockIntroEntry, sinceSec: number,
  background?: { readonly image: TImage; readonly width: number; readonly height: number },
  frames?: readonly RaceIntroHorseFrame<TImage>[],
): void {
  const W = vp.width, H = vp.height;
  const each = RACE_INTRO_PADDOCK_EACH_SEC;
  const p = Math.max(0, Math.min(1, sinceSec / each));
  if (background !== undefined) drawCover(ctx, vp, background, 1.18, -0.18 + p * 0.36);
  else { ctx.fillStyle = '#0b1210'; ctx.fillRect(0, 0, W, H); }
  /** ★下を暗く（★帯を読みやすく・段で重ねる） */
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = `rgba(3,6,4,${(0.08 * (i + 1)).toFixed(3)})`;
    ctx.fillRect(0, H * (0.5 + i * 0.0625), W, H * 0.0625 + 1);
  }
  const base = ctx.globalAlpha;
  /** ★馬（★1 秒 7 コマ・★画面の中を少しずつ進む） */
  if (frames !== undefined && frames.length > 0) {
    const fr = frames[Math.floor(sinceSec * 7) % frames.length]!;
    const targetH = H * 0.5;
    const scale = targetH / fr.referenceHeight;
    const dw = fr.source.width * scale, dh = fr.source.height * scale;
    const cx = W * (0.36 + p * 0.22);
    const groundY = H * 0.74;
    ctx.fillStyle = 'rgba(3,8,4,0.34)';
    ctx.beginPath(); ctx.ellipse(cx, groundY - 4, dw * 0.3, Math.max(4, dh * 0.045), 0, 0, Math.PI * 2); ctx.fill();
    const dx = cx - dw / 2, dy = groundY - dh;
    ctx.drawImage(fr.image, fr.source.x, fr.source.y, fr.source.width, fr.source.height, dx, dy, dw, dh);
    if (fr.overlay !== undefined) {
      ctx.drawImage(fr.overlay.image, 0, 0, fr.overlay.width, fr.overlay.height,
        dx + (fr.overlay.offsetXSourcePx - fr.source.x) * scale, dy + (fr.overlay.offsetYSourcePx - fr.source.y) * scale,
        fr.overlay.width * scale, fr.overlay.height * scale);
    }
  }
  /** ★左上の見出し「出走馬紹介 1 / 3」 */
  const tag = riseAt(sinceSec, 0.1);
  ctx.globalAlpha = base * tag.alpha;
  fillSlant(ctx, 40, 36 + tag.dy, 300, 44, HUD.glass);
  ctx.fillStyle = HUD.goldHair; ctx.fillRect(40, 36 + tag.dy + 43, 300, 1);
  ctx.font = font(22, true); ctx.fillStyle = HUD.gold;
  ctx.fillText('出走馬紹介', 64, 36 + tag.dy + 30);
  ctx.font = font(16, true); ctx.fillStyle = HUD.paper70;
  ctx.textAlign = 'right'; ctx.fillText(`${entry.order} / ${entry.total}`, 320, 36 + tag.dy + 29); ctx.textAlign = 'left';
  /** ★下の帯（★枠番・馬名・騎手・単勝・人気） */
  const band = riseAt(sinceSec, 0.35);
  ctx.globalAlpha = base * band.alpha;
  const bx = 56, by = H - 196 + band.dy, bw = W - 112, bh = 132;
  fillSlant(ctx, bx, by, bw, bh, HUD.glass);
  drawGoldEdge(ctx as unknown as Ctx2D<unknown>, bx, by, bw * wipeAt(sinceSec, 0.45, 0.6), sinceSec);
  drawFrameBadge(ctx as unknown as Ctx2D<unknown>, pal, font, entry.frameRole, String(entry.gate), bx + 36, by + 30, 70, 56, 36);
  ctx.font = font(54, true); ctx.fillStyle = HUD.paper;
  ctx.fillText(entry.name, bx + 130, by + 74);
  ctx.font = font(20, true); ctx.fillStyle = HUD.paper70;
  ctx.fillText(`騎手　${entry.jockey}`, bx + 134, by + 110);
  /** ★単勝（★金プレート） */
  drawLabel(ctx as unknown as Ctx2D<unknown>, font, '単勝', bx + bw - 300, by + 46, HUD.paper70);
  ctx.font = font(46, true);
  const ow = ctx.measureText(entry.oddsLabel).width;
  ctx.fillStyle = goldPlate(ctx as unknown as Ctx2D<unknown>, bx + bw - 300, ow, sinceSec) as string;
  ctx.fillText(entry.oddsLabel, bx + bw - 300, by + 98);
  /** ★「○番人気」の丸 */
  const mx = bx + bw - 92, my = by + bh / 2, mr = 58;
  ctx.fillStyle = HUD.gold; ctx.beginPath(); ctx.ellipse(mx, my, mr, mr, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#12301f'; ctx.beginPath(); ctx.ellipse(mx, my, mr - 6, mr - 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = font(40, true); ctx.fillStyle = HUD.paper; ctx.fillText(String(entry.popularity), mx, my + 8);
  ctx.font = font(15, true); ctx.fillStyle = HUD.gold; ctx.fillText('番人気', mx, my + 34);
  ctx.textAlign = 'left';
  ctx.globalAlpha = base;
  /** ★入りと抜け（★0.35 秒の暗転） */
  const fade = Math.max(0, 1 - sinceSec / 0.35, 1 - (each - sinceSec) / 0.35);
  if (fade > 0) { ctx.globalAlpha = base * Math.min(1, fade); ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = base; }
}

/**
 * ★**格の紹介**（★「GRADE I」→ 大きな「G I」→ 白い閃光）。
 * ⚠️ ★英字は ★`GRADE_LOOKS` の `roman` を渡すこと（★格の表を 2 か所に持たない）。
 */
export function drawGradeIntro<TImage>(
  ctx: Ctx2D<TImage>, vp: Viewport2D, font: FontOf, grade: { readonly roman: string }, sinceSec: number, durSec: number,
): void {
  const W = vp.width, H = vp.height;
  const u = ctx as unknown as Ctx2D<unknown>;
  ctx.fillStyle = '#06101c'; ctx.fillRect(0, 0, W, H);
  const base = ctx.globalAlpha;
  /** ★放射の光（★ゆっくり回る） */
  const cx = W / 2, cy = H * 0.46, R = Math.hypot(W, H);
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2 + sinceSec * 0.25;
    ctx.globalAlpha = base * (i % 2 === 0 ? 0.1 : 0.05);
    ctx.fillStyle = HUD.gold;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - 0.05) * R, cy + Math.sin(a - 0.05) * R);
    ctx.lineTo(cx + Math.cos(a + 0.05) * R, cy + Math.sin(a + 0.05) * R);
    ctx.closePath(); ctx.fill();
  }
  /** ★「GRADE I」（★左下・最初に出る） */
  const lead = riseAt(sinceSec, 0);
  ctx.globalAlpha = base * lead.alpha;
  ctx.font = font(34, true); ctx.fillStyle = HUD.paper;
  drawSpacedText(u, `GRADE ${grade.roman}`, 72, H - 88 + lead.dy, 34 * 0.3);
  /** ★大きな「G I」（★大きく出てから収まる） */
  const k = Math.max(0, Math.min(1, (sinceSec - 0.45) / 0.5));
  const e = 1 - Math.pow(1 - k, 3);
  if (k > 0) {
    const px = Math.round(260 * (1.6 - 0.6 * e));
    ctx.globalAlpha = base * e;
    ctx.font = font(px, true);
    ctx.textAlign = 'center';
    const text = `G${grade.roman}`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(text, cx + 8, cy + px * 0.36 + 8);
    ctx.fillStyle = goldPlate(u, cx - tw / 2, tw, sinceSec) as string;
    ctx.fillText(text, cx, cy + px * 0.36);
    ctx.textAlign = 'left';
  }
  /** ★白い閃光（★最後の 0.35 秒でレース名のカードへ） */
  const flash = Math.max(0, Math.min(1, (sinceSec - (durSec - 0.35)) / 0.35));
  if (flash > 0) { ctx.globalAlpha = base * flash * 0.9; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = base;
}

export interface RaceIntroMeta {
  readonly venue: string;
  readonly raceName: string;
  readonly raceNo: string;
  readonly distanceMeter: number;
  readonly surfaceLabel: string;
  readonly weatherLabel: string;
  readonly conditionLabel: string;
  readonly turnLabel: string;
  /** 発走時刻の表記（例 "15:40"）。無ければ出さない */
  readonly startTimeLabel?: string | undefined;
  /** 頭数（右上の「12 HORSES」）。無ければ出さない */
  readonly fieldSize?: number | undefined;
  /**
   * ★**格と馬場の英字**（★2026-09-15・例「GRADE I ・ TURF」）。
   * ⚠️ ★以前は全鞍 ★「GRADE I ・ TURF CHAMPIONSHIP」の直書きで、★G3 のダート戦にも出ていました。★省くと従来の文言
   */
  readonly gradeLabel?: string | undefined;
  /** ★条件のチップ（★例「3歳」「牝馬限定」「三冠 第1戦」）。★格の英字の右に並べる */
  readonly chips?: readonly string[] | undefined;
  /** ★**競馬場の紹介 1 行**（★例「左回り　1周2200m・直線620m　10場でいちばん長い直線」）。★省くと出さない */
  readonly venueFeature?: string | undefined;
  /** 自馬（右下の「あなたの馬」パネル）。無ければ出さない */
  readonly own?: {
    readonly gate: number; readonly role: string; readonly name: string; readonly jockey: string;
    readonly oddsLabel?: string | undefined;
  } | undefined;
}

export interface StartHorseVisual {
  readonly progress: number;
  readonly centerX: number;
  readonly groundY: number;
  readonly displayReferenceHeight: number;
  readonly frame: number;
}

/** 発走ショット専用。順位計算には触れず、反応差と画面上の奥行きだけを作る。 */
export function startHorseVisualAt(gate: number, releaseProgress: number, frames: number): StartHorseVisual {
  // 参考映像では全頭が約0.2秒以内に反応する。差を広げすぎて順番に湧かせない。
  const gateLag = ((gate * 7) % 11) * 0.008;
  const local = Math.max(0, Math.min(1, (releaseProgress - gateLag) / Math.max(0.01, 1 - gateLag)));
  // 最初の0.6秒で一馬身以上を抜ける発馬専用の強い初速。
  const acceleration = 1 - Math.pow(1 - local, 2.35);
  // 発馬直後は進路を扇形に広げず、参考映像同様3列の密集馬群を保つ。
  const lane = (gate * 7 + Math.floor((gate - 1) / 4)) % 3;
  const laneY = [452, 482, 512][lane] ?? 482;
  const stallDepth = (gate - 1) / 11;
  const heldCenterX = 238 + stallDepth * 205;
  const heldGroundY = 382 + stallDepth * 52;
  const heldHeight = 82 + stallDepth * 34;
  const speedFactor = 0.86 + ((gate * 13) % 9) * 0.035;
  const earlyBreak = (((gate * 17) % 7) - 3) * 15 * Math.sin(local * Math.PI);
  return {
    progress: local,
    centerX: heldCenterX + acceleration * (1040 - heldCenterX) * speedFactor + earlyBreak,
    groundY: heldGroundY + (laneY - heldGroundY) * acceleration,
    displayReferenceHeight: heldHeight
      + (([146, 160, 174][lane] ?? 160) - heldHeight) * acceleration,
    frame: local <= 0 ? Math.min(2, Math.max(0, frames - 1))
      : Math.max(0, Math.floor((local * frames * 2.3 + gate * 0.73) % Math.max(1, frames))),
  };
}

/**
 * ★**イントロで自馬を 1 頭出す**ための素材（2026-08-28・オーナー要望）。
 *
 *   > 最初の桜星賞のイントロでデモで構わないので馬を１頭出してください（自分の馬）
 *
 * ★レース中と**同じコマ集合**を渡します。★ここで別の絵を用意しません（同じ馬に見えないため）。
 * ⚠️ ★`overlay` は勝負服の色替え。★渡さないと全頭が同じ灰色の服になります。
 */
export interface RaceIntroHorseFrame<TImage> {
  readonly image: TImage;
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly referenceHeight: number;
  readonly overlay?: {
    readonly image: TImage; readonly width: number; readonly height: number;
    readonly offsetXSourcePx: number; readonly offsetYSourcePx: number;
  } | undefined;
}

export function drawRaceTitleCard<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  meta: RaceIntroMeta, displaySec: number,
  background?: { readonly image: TImage; readonly width: number; readonly height: number },
  /** ★自馬の走りコマ（`sideHighQuality` の自馬ぶん）。省略すると従来どおり馬は出ません */
  ownHorse?: readonly RaceIntroHorseFrame<TImage>[],
  /**
   * ★**場の景色と紋・季節と時間帯の色**（★2026-09-15・計画書 V-13 / V-15）。
   * ⚠️ ★省けば 1 命令も変わりません。★`kind: 'default'` で色も空なら、★省いたときと同じ命令列です（★検査で固定）。
   */
  scenery?: TitleSceneryOptions,
): void {
  /**
   * ★本線（design/hud-ds/components/title-card）: 出るのは displaySec 3.0–5.6（空撮のあと）。前後 0.35 秒でフェード。
   *   背景は映像のまま、左 44% に暗幕 → 78% へ 0。板 left-40 top150 w820（斜度 -9°・上下辺のみ金ヘアライン）。
   *   レース名 96px 金プレート（0.7s 左からワイプ）／金の下線 5×520／距離 64px＋「m 芝・左」26px／条件 20px／格 12px 金
   */
  const local = displaySec - RACE_INTRO_TITLE_START_SEC;
  const fade = Math.min(1, local / 0.35, (RACE_INTRO_TITLE_END_SEC - RACE_INTRO_TITLE_START_SEC - local) / 0.35);
  const W = vp.width, H = vp.height;
  if (background !== undefined) {
    const sourceRatio = background.width / background.height;
    const targetRatio = W / H;
    const sw = sourceRatio > targetRatio ? background.height * targetRatio : background.width;
    const sh = sourceRatio > targetRatio ? background.height : background.width / targetRatio;
    const sx = (background.width - sw) * 0.5;
    const sy = (background.height - sh) * 0.5;
    ctx.drawImage(background.image, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#0b1210'; ctx.fillRect(0, 0, W, H);
  }
  /** ★場の遠景と、★季節・時間帯の色（★背景絵の上・暗幕の前＝★文字には掛からない） */
  if (scenery !== undefined) {
    const u = ctx as unknown as Ctx2D<unknown>;
    drawVenueScenery(u, scenery.kind, titleSceneryBand(vp), { timeSec: displaySec, night: scenery.night });
    for (const tint of scenery.tints) {
      if (!(tint.alpha > 0)) continue;
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * tint.alpha; ctx.fillStyle = tint.color; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = prevA;
    }
  }
  // 暗幕: x0–44% は rgba(3,6,4,.86)、78% へ向けて 0（グラデーションが無い環境では段で近似）
  if (typeof ctx.createLinearGradient === 'function') {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(3,6,4,.86)'); g.addColorStop(0.44, 'rgba(3,6,4,.86)'); g.addColorStop(0.78, 'rgba(3,6,4,0)'); g.addColorStop(1, 'rgba(3,6,4,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = 'rgba(3,6,4,.86)'; ctx.fillRect(0, 0, W * 0.44, H);
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = `rgba(3,6,4,${(0.86 * (1 - (i + 0.5) / 8)).toFixed(3)})`;
      ctx.fillRect(W * (0.44 + (0.34 * i) / 8), 0, W * 0.34 / 8 + 1, H);
    }
  }
  const baseAlpha = ctx.globalAlpha;
  const rise = riseAt(local, 0, 0.55);
  ctx.globalAlpha = baseAlpha * Math.max(0, fade) * rise.alpha;
  const t = displaySec;
  // 板 left-40 top150 w820（斜度 -9°）。高さは中身なり（≒ 388）。★場の紹介 1 行があるときは 1 行ぶん伸ばす
  const px = -40, py = 150 + rise.dy, pw = 820, ph = meta.venueFeature === undefined ? 388 : 424;
  fillSlant(ctx, px, py, pw, ph, HUD.glass);
  ctx.fillStyle = HUD.goldHair;
  const k = HUD.skew * ph * 0.5;
  ctx.fillRect(px + k, py, pw, 1); ctx.fillRect(px - k, py + ph - 1, pw, 1);
  const ix = 90;                       // 板の内側 x90+
  let y = py + 34;
  drawLabel(ctx, font, `${meta.venue}　${meta.raceNo}`, ix, y + 12, HUD.paper70);
  y += 12 + 10;
  // レース名 96px 金プレート（ワイプ 0.7s）
  ctx.font = font(96, true);
  const nw = ctx.measureText(meta.raceName).width;
  const wipe = wipeAt(local, 0, 0.7);
  const shown = Math.max(0, Math.min(meta.raceName.length, Math.round(meta.raceName.length * wipe)));
  ctx.fillStyle = goldPlate(ctx, ix, nw, t);
  ctx.fillText(meta.raceName.slice(0, shown), ix, y + 96 * 0.86);
  y += 96 + 18;
  // 金の下線 高5 幅520（0.2s 遅れて 0.6s でワイプ）
  ctx.fillStyle = goldPlate(ctx, ix, 520, t);
  ctx.fillRect(ix, y, Math.round(520 * wipeAt(local, 0.2, 0.6)), 5);
  y += 5 + 26;
  // 距離 64px ＋「m　芝・左」26px を下端揃え
  ctx.font = font(64, true); ctx.fillStyle = HUD.paper;
  const dText = String(meta.distanceMeter);
  ctx.fillText(dText, ix, y + 58);
  const dw = ctx.measureText(dText).width;
  ctx.font = font(26, true);
  ctx.fillText(`m　${meta.surfaceLabel}・${meta.turnLabel}`, ix + dw + 30, y + 58 - 8);
  y += 64 + 22;
  // 条件 20px 3 項目・間隔 28px
  ctx.font = font(20, true); ctx.fillStyle = 'rgba(246,242,231,.9)';
  let cx = ix;
  const items = [`天候　${meta.weatherLabel}`, `馬場　${meta.conditionLabel}`];
  if (meta.startTimeLabel !== undefined) items.push(`発走　${meta.startTimeLabel}`);
  for (const item of items) { ctx.fillText(item, cx, y + 18); cx += ctx.measureText(item).width + 28; }
  y += 20 + 34;
  // 格 12px 字間 .34em 金
  ctx.font = font(12, true); ctx.fillStyle = HUD.gold;
  const gradeText = meta.gradeLabel ?? 'GRADE I ・ TURF CHAMPIONSHIP';
  drawSpacedText(ctx, gradeText, ix, y + 12, 12 * 0.34);
  /** ★条件のチップ（★格の英字の右に、金の細枠で並べる・2026-09-15） */
  if (meta.chips !== undefined && meta.chips.length > 0) {
    ctx.font = font(12, true);
    let chipX = ix + ctx.measureText(gradeText).width + gradeText.length * 12 * 0.34 + 18;
    for (const chip of meta.chips) {
      ctx.font = font(14, true);
      const cw = ctx.measureText(chip).width + 16;
      ctx.fillStyle = 'rgba(201,162,39,.18)'; ctx.fillRect(chipX, y - 4, cw, 22);
      ctx.fillStyle = HUD.goldHair; ctx.fillRect(chipX, y + 17, cw, 1);
      ctx.fillStyle = HUD.paper; ctx.fillText(chip, chipX + 8, y + 12);
      chipX += cw + 8;
    }
  }
  /** ★競馬場の紹介 1 行（★2026-09-15）。★板はこの 1 行ぶん伸ばしてある（`ph`） */
  if (meta.venueFeature !== undefined) {
    ctx.font = font(18, true); ctx.fillStyle = 'rgba(246,242,231,.9)';
    ctx.fillText(meta.venueFeature, ix, y + 12 + 32);
  }
  // 頭数バッジ 右上 x1244 基準
  if (meta.fieldSize !== undefined) {
    ctx.font = font(12, true);
    const label = `${meta.fieldSize} HORSES`;
    const lw = label.length * 12 * 0.18 + ctx.measureText(label).width;
    const bw = lw + 32, bh = 26;
    fillSlant(ctx, W - 36 - bw, 36, bw, bh, HUD.glass);
    strokeSlant(ctx, W - 36 - bw, 36, bw, bh, HUD.goldHair);
    drawLabel(ctx, font, label, W - 36 - bw + 16, 36 + 17, HUD.gold);
  }
  /** ★場の紋（★右上・頭数バッジの下・2026-09-15・計画書 V-15） */
  if (scenery?.crest !== undefined) {
    drawVenueCrest(ctx as unknown as Ctx2D<unknown>, scenery.kind, W - 36 - 40, 36 + 26 + 18 + 40, 80, scenery.crest);
  }
  // 自馬パネル 右下 右端 x1244・下端 y676（w296）／0.5s 遅れてライズ
  if (meta.own !== undefined) {
    const own = meta.own;
    const orise = riseAt(local, 0.5);
    ctx.globalAlpha = baseAlpha * Math.max(0, fade) * orise.alpha;
    const ow = 296, oh = 122;
    const ox = W - 36 - ow, oyy = H - 44 - oh + orise.dy;
    ctx.fillStyle = HUD.glass; ctx.fillRect(ox, oyy, ow, oh);
    ctx.strokeStyle = HUD.goldHair; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox + 0.5, oyy + 0.5); ctx.lineTo(ox + ow - 0.5, oyy + 0.5); ctx.lineTo(ox + ow - 0.5, oyy + oh - 0.5); ctx.lineTo(ox + 0.5, oyy + oh - 0.5); ctx.closePath(); ctx.stroke();
    drawGoldEdge(ctx, ox, oyy, ow, t);
    drawLabel(ctx, font, 'あなたの馬', ox + 14, oyy + 4 + 10 + 12, HUD.gold);
    drawLabel(ctx, font, 'MY HORSE', ox + ow - 14, oyy + 4 + 10 + 12, 'rgba(246,242,231,.42)', 'right');
    drawFrameBadge(ctx, pal, font, own.role, String(own.gate), ox + 14, oyy + 38, 40, 32, 22);
    ctx.font = font(26, true); ctx.fillStyle = HUD.paper;
    ctx.fillText(own.name, ox + 14 + 40 + 12, oyy + 38 + 25);
    ctx.font = font(15, true); ctx.fillStyle = 'rgba(246,242,231,.85)';
    ctx.fillText(`騎手　${own.jockey}`, ox + 14, oyy + oh - 14);
    if (own.oddsLabel !== undefined) {
      drawLabel(ctx, font, '単勝', ox + ow - 14, oyy + 38 + 30, HUD.paper70, 'right');
      ctx.textAlign = 'right'; ctx.font = font(34, true);
      const tw = ctx.measureText(own.oddsLabel).width;
      ctx.fillStyle = goldPlate(ctx, ox + ow - 14 - tw, tw, t);
      ctx.fillText(own.oddsLabel, ox + ow - 14, oyy + oh - 12);
      ctx.textAlign = 'left';
    }

    /**
     * ★**自馬を 1 頭、パネルの上に立たせます**（2026-08-28・オーナー要望）。
     *
     * ⚠️ ★レース中と**同じコマ集合**を使います。ここで別の絵を用意しません。
     * ⚠️ ★コマ送りは `displaySec` だけで決まります（`Date.now()` を使わない・憲法4）。
     *    ★同じシード・同じ秒なら必ず同じ絵になります。
     * ★暗幕は左 44%〜78% なので、★右側のこの位置は背景が見えたままです。板と重なりません。
     */
    if (ownHorse !== undefined && ownHorse.length > 0) {
      const hrise = riseAt(local, 0.7);
      ctx.globalAlpha = baseAlpha * Math.max(0, fade) * hrise.alpha;
      /** ★1 秒に 11 コマ。走りの周期は素材のコマ数で決まる */
      const idx = Math.max(0, Math.floor(Math.max(0, local) * 11)) % ownHorse.length;
      const fr = ownHorse[idx]!;
      /**
       * ⚠️ ★**0.42 → 0.34 に縮めました**（★2026-09-11・オーナー指摘）。
       *    > ★最初の画面の自分馬が左がはみ出ている　サイズをもう少し小さく
       */
      const targetH = H * 0.34;
      const scale = targetH / fr.referenceHeight;
      const dw = fr.source.width * scale, dh = fr.source.height * scale;
      /**
       * ★**題字の板に食い込ませません**（★2026-09-11・オーナー指摘「左がはみ出ている」）。
       *   ★板は `px` 〜 `px + pw`（★斜度ぶん `k` が張り出す）。★そこから 18px 空けます。
       * ⚠️ ★右も見ます。★左に入らないぶん右へ押すと、★今度は ★**鼻先が画面外**へ出ます
       *    （★元の `-76` はそのための逃がしでした）。★どちらにも収まらなければ帯の中央に置きます。
       */
      const bandL = px + pw + Math.abs(k) + 18;
      const bandR = W - 10;
      const preferredCx = ox + ow / 2 - 76;
      const cx = dw >= bandR - bandL
        ? (bandL + bandR) / 2
        : Math.min(Math.max(preferredCx, bandL + dw / 2), bandR - dw / 2);
      /** ★パネルの少し上に接地させる */
      const groundY = oyy - 18 + hrise.dy;
      const dx = cx - dw / 2, dy = groundY - dh;
      /** ★接地影。無いと宙に浮いて見えます */
      ctx.fillStyle = 'rgba(3,8,4,0.34)';
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 4, dw * 0.30, Math.max(4, dh * 0.045), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(fr.image, fr.source.x, fr.source.y, fr.source.width, fr.source.height, dx, dy, dw, dh);
      if (fr.overlay !== undefined) {
        const oxp = dx + (fr.overlay.offsetXSourcePx - fr.source.x) * scale;
        const oyp = dy + (fr.overlay.offsetYSourcePx - fr.source.y) * scale;
        ctx.drawImage(fr.overlay.image, 0, 0, fr.overlay.width, fr.overlay.height,
          oxp, oyp, fr.overlay.width * scale, fr.overlay.height * scale);
      }
    }
  }
  ctx.globalAlpha = baseAlpha;
}

/**
 * ★ゲート待機〜発走の中継帯（本線 = design/hud-ds/components/start-band）。V2 の統合発走でも同じ帯を使う。
 *   帯 y616 h104（斜度 -9°・上縁 金4px）／ナレーター x36 y548 150×172（レース中と同一座標）／
 *   「まもなく発走」金チップ＋ON AIR＋音声レベル／実況 28px を 20 文字/秒で左から／右にカウントダウン 64px 金プレート。
 *   開扉では文言だけ差し替え、帯は動かさない。開扉の瞬間の白フラッシュは呼ぶ側。
 */
export function drawStartCallBand<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  fieldSize: number, released: boolean,
  narrator?: { readonly image: TImage; readonly width: number; readonly height: number },
  opts: {
    readonly timeSec?: number | undefined;
    /** この文言を出し始めた秒（文字送り用）。省略で全文 */
    readonly lineStartSec?: number | undefined;
    /** 発走までの秒。0 以下・省略で出さない（開扉後は消す） */
    readonly secondsToStart?: number | undefined;
    readonly narratorName?: string | undefined;
    /** ★話者の役職（実況／解説／進行／現地）。省略すると「実況」 */
    readonly narratorRole?: string | undefined;
    readonly sinceSec?: number | undefined;
  } = {},
): void {
  void pal;
  const t = opts.timeSec ?? 0;
  const W = vp.width, H = vp.height;
  const rise = riseAt(opts.sinceSec ?? 1, 0, 0.5);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * rise.alpha;
  const oy = rise.dy;
  fillSlant(ctx, -40, H - 104 + oy, W + 91, 104, HUD.glass);
  drawGoldEdge(ctx, 0, H - 104 + oy, W, t);
  // ★役職は担当に合わせる（解説の人が「実況」と出ないように）
  drawNarratorFrame(ctx, font, 36, H - 172 + oy, narrator,
    opts.narratorRole ?? '実況', opts.narratorName ?? '実況アナ');
  const text = released ? 'スタートしました！' : `${fieldSize}頭、ゲートイン完了しました`;
  const shown = opts.lineStartSec === undefined ? text.length : typedCount(text.length, t - opts.lineStartSec);
  // まもなく発走チップ x206 y632 h26 ＋ ON AIR
  const chipW = drawGoldChip(ctx, font, released ? '発走' : 'まもなく発走', 206, H - 88 + oy, 26, 16, 14, 16 * 0.06);
  drawOnAir(ctx, font, 206 + chipW + 14, H - 88 + 2 + oy, t, shown < text.length);
  // 実況 x206 y668 28px/40（先頭の頭数は 36px 金）
  ctx.textAlign = 'left';
  let cx = 206;
  const numLen = released ? 0 : String(fieldSize).length;
  const head = text.slice(0, Math.min(numLen, shown));
  if (head.length > 0) {
    ctx.font = font(36, true); ctx.fillStyle = HUD.gold;
    ctx.fillText(head, cx, H - 52 + 30 + oy);
    cx += ctx.measureText(head).width;
  }
  const rest = text.slice(numLen, shown);
  if (rest.length > 0) {
    ctx.font = font(28, true); ctx.fillStyle = HUD.paper;
    ctx.fillText(rest, cx, H - 52 + 30 + oy);
  }
  // カウントダウン 右端 x1244 基準 w150／ラベル 12px／数字 64px 金プレート（1.0s の 2 ステップ点滅・残り 5 秒以下は 0.5s）
  if (opts.secondsToStart !== undefined && opts.secondsToStart > 0 && !released) {
    const secs = Math.ceil(opts.secondsToStart);
    const right = W - 36;
    drawLabel(ctx, font, '発走まで', right, H - 94 + 12 + oy, HUD.paper70, 'right');
    const m = Math.floor(secs / 60), s = secs % 60;
    const label = `${m}:${s < 10 ? '0' : ''}${s}`;
    const period = secs <= 5 ? 0.5 : 1.0;
    const blink = Math.floor(t / period) % 2 === 0 ? 1 : 0.62;
    ctx.globalAlpha = baseAlpha * rise.alpha * blink;
    ctx.textAlign = 'right'; ctx.font = font(64, true);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = goldPlate(ctx, right - tw, tw, t);
    ctx.fillText(label, right, H - 94 + 16 + 54 + oy);
    ctx.textAlign = 'left';
  }
  ctx.globalAlpha = baseAlpha;
}

export function drawStartingGate<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, vp: Viewport2D, font: FontOf,
  sheet: TImage | undefined, sheetWidth: number, spec: SheetSpec,
  fieldSize: number, releaseProgress: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  background?: { readonly image: TImage; readonly width: number; readonly height: number },
  frameImages?: readonly {
    readonly image: TImage;
    readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly referenceHeight: number;
    readonly overlay?: {
      readonly image: TImage; readonly width: number; readonly height: number;
      readonly offsetXSourcePx: number; readonly offsetYSourcePx: number;
    } | undefined;
  }[],
  frameImagesByGate?: readonly (readonly {
    readonly image: TImage;
    readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly referenceHeight: number;
    readonly overlay?: {
      readonly image: TImage; readonly width: number; readonly height: number;
      readonly offsetXSourcePx: number; readonly offsetYSourcePx: number;
    } | undefined;
  }[])[],
  narrator?: { readonly image: TImage; readonly width: number; readonly height: number },
): void {
  if (background !== undefined) {
    const camera = Math.max(0, Math.min(1, releaseProgress));
    const bgW = vp.width + camera * 170;
    const bgH = vp.height + camera * 38;
    const bgX = -camera * 135;
    const bgY = -camera * 12;
    const gateExitX = bgX + bgW * 0.405;
    ctx.drawImage(background.image, 0, 0, background.width, background.height, bgX, bgY, bgW, bgH);
    const cw = sheetWidth / spec.frames;
    // 背景の発馬口から、遠・中・近の3帯を保ったまま右へ抜ける。
    const orderedGates = Array.from({ length: fieldSize }, (_, index) => index + 1)
      .sort((a, b) => ((a - 1) % 3) - ((b - 1) % 3) || b - a);
    // 待機から発走まで同じ12頭を描き、座標だけを連続して進める。
    for (const gate of orderedGates) {
      const role = frameRoleOf(gate, fieldSize);
      const row = Math.max(0, Math.min(7, Number(role.slice(6)) - 1));
      const visual = startHorseVisualAt(gate, releaseProgress, spec.frames);
      const { centerX, groundY, displayReferenceHeight, frame } = visual;
      const gateFrames = frameImagesByGate?.[gate - 1];
      const hi = gateFrames?.[frame % Math.max(1, gateFrames.length)]
        ?? frameImages?.[frame % Math.max(1, frameImages.length)];
      if (hi !== undefined) {
        const scale = displayReferenceHeight / hi.referenceHeight;
        const height = hi.source.height * scale; const width = hi.source.width * scale;
        const dx = centerX - width * 0.5; const dy = groundY - height;
        // 馬体に密着する接地影。奥の馬ほど細く薄くする。
        if (visual.progress > 0 && centerX > gateExitX + width * 0.24) {
          ctx.fillStyle = `rgba(3,8,4,${0.20 + displayReferenceHeight / 900})`;
          ctx.beginPath(); ctx.ellipse(centerX - width * 0.02, groundY - 4,
            width * 0.34, Math.max(5, height * 0.055), 0, 0, Math.PI * 2); ctx.fill();
        }
        // 後肢の着地周期にだけ小さな芝片を出し、横滑り感を消す。
        if (visual.progress > 0.08 && centerX > gateExitX && (frame + gate) % 3 === 0) {
          ctx.fillStyle = 'rgba(118,143,64,0.62)';
          for (let particle = 0; particle < 4; particle += 1) {
            const px = dx - 5 - particle * 7 - (gate % 3) * 3;
            const py = groundY - 5 - ((particle * 7 + gate) % 13);
            ctx.fillRect(px, py, 5 - particle * 0.6, 3);
          }
        }
        ctx.drawImage(hi.image, hi.source.x, hi.source.y, hi.source.width, hi.source.height,
          dx, dy, width, height);
        if (hi.overlay !== undefined) {
          const overlayX = dx + (hi.overlay.offsetXSourcePx - hi.source.x) * scale;
          const overlayY = dy + (hi.overlay.offsetYSourcePx - hi.source.y) * scale;
          ctx.drawImage(hi.overlay.image, 0, 0, hi.overlay.width, hi.overlay.height,
            overlayX, overlayY, hi.overlay.width * scale, hi.overlay.height * scale);
        }
      } else if (sheet !== undefined) {
        ctx.drawImage(sheet, frame * cw, row * spec.cellH, cw, spec.cellH,
          centerX - 76, groundY - 108, 152, 108);
      }
    }
    // 馬と同じ連続座標の上へ発馬機の前景フレームを再描画する。
    // 全面を矩形で覆わず、金属材だけを描くため、房内では隠れ、出口後は切れない。
    const sx = bgW / vp.width, sy = bgH / vp.height;
    const cageLeft = bgX + 142 * sx, cageRight = bgX + 486 * sx;
    const cageTopLeft = bgY + 253 * sy, cageTopRight = bgY + 233 * sy;
    const cageBottomLeft = bgY + 447 * sy, cageBottomRight = bgY + 424 * sy;
    ctx.strokeStyle = 'rgba(178,190,185,0.92)'; ctx.lineWidth = 3;
    for (let rail = 0; rail <= 12; rail += 1) {
      const u = rail / 12;
      const x = cageLeft + (cageRight - cageLeft) * u;
      const top = cageTopLeft + (cageTopRight - cageTopLeft) * u;
      const bottom = cageBottomLeft + (cageBottomRight - cageBottomLeft) * u;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(111,128,121,0.88)'; ctx.lineWidth = 2;
    for (let cross = 1; cross < 4; cross += 1) {
      const u = cross / 4;
      ctx.beginPath();
      ctx.moveTo(cageLeft, cageTopLeft + (cageBottomLeft - cageTopLeft) * u);
      ctx.lineTo(cageRight, cageTopRight + (cageBottomRight - cageTopRight) * u);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(205,213,208,0.92)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cageLeft, cageTopLeft); ctx.lineTo(cageRight, cageTopRight); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cageLeft, cageBottomLeft); ctx.lineTo(cageRight, cageBottomRight); ctx.stroke();
    drawStartCallBand(ctx, pal, vp, font, fieldSize, releaseProgress > 0, narrator);
    return;
  }
  if (sheet === undefined) return;
  // 参考の発馬ショットと同じく、固定された横カメラで走路を真横から見る。
  ctx.fillStyle = '#081019'; ctx.fillRect(0, 0, vp.width, 248);
  ctx.fillStyle = '#101b20'; ctx.fillRect(0, 120, vp.width, 128);
  for (let i = 0; i < 24; i += 1) {
    ctx.fillStyle = i % 4 === 0 ? '#9c8b4b' : '#344249';
    ctx.fillRect(18 + i * 58, 173 + (i % 3) * 7, 20, 3);
  }
  ctx.fillStyle = '#172d20'; ctx.fillRect(0, 248, vp.width, 92);
  ctx.fillStyle = '#d7ddd8'; ctx.fillRect(0, 302, vp.width, 5);
  ctx.fillStyle = '#596760'; ctx.fillRect(0, 313, vp.width, 8);
  ctx.fillStyle = pal['turf-4'] ?? '#315b31'; ctx.fillRect(0, 340, vp.width, vp.height - 340);
  for (let y = 372; y < vp.height; y += 38) {
    ctx.fillStyle = y % 76 === 0 ? 'rgba(230,240,220,0.035)' : 'rgba(8,20,8,0.04)';
    ctx.fillRect(0, y, vp.width, 18);
  }
  ctx.fillStyle = '#e9ece8'; ctx.fillRect(132, 179, 8, 159);
  ctx.fillStyle = '#b73838'; ctx.fillRect(132, 213, 8, 23);
  ctx.fillStyle = '#e9ece8'; ctx.beginPath(); ctx.ellipse(136, 172, 27, 27, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a52d30'; ctx.font = font(18, true); ctx.textAlign = 'center'; ctx.fillText('16', 136, 178);

  const gateLeft = 390, gateRight = 706, gateTop = 230, gateBottom = 510;
  ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.beginPath();
  ctx.ellipse(565, gateBottom + 24, 230, 35, 0, 0, Math.PI * 2); ctx.fill();

  // 馬は発馬機の背後に描き、右端の開口から横方向へ飛び出させる。
  const cw = sheetWidth / spec.frames;
  for (let i = fieldSize - 1; i >= 0; i -= 1) {
    const gate = i + 1;
    const role = frameRoleOf(gate, fieldSize);
    const row = Math.max(0, Math.min(7, Number(role.slice(6)) - 1));
    const delay = (gate % 5) * 0.035;
    const run = Math.max(0, Math.min(1, (releaseProgress - delay) / Math.max(0.01, 1 - delay)));
    const x = 570 + run * (510 + (gate % 4) * 18);
    const y = 355 + (gate % 6) * 13 - Math.floor(gate / 6) * 5;
    const frame = Math.min(spec.frames - 1, Math.floor(run * spec.frames));
    ctx.drawImage(sheet, frame * cw, row * spec.cellH, cw, spec.cellH, x, y, 158, 112);
  }

  // 側面から見た発馬機。枠を列挙せず、長い筐体が奥へ伸びる形にする。
  ctx.fillStyle = 'rgba(25,34,39,0.92)'; ctx.beginPath();
  ctx.moveTo(gateLeft, gateTop + 35); ctx.lineTo(gateRight, gateTop);
  ctx.lineTo(gateRight, gateBottom - 18); ctx.lineTo(gateLeft, gateBottom); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#718086'; ctx.lineWidth = 7; ctx.beginPath();
  ctx.moveTo(gateLeft, gateTop + 35); ctx.lineTo(gateRight, gateTop); ctx.lineTo(gateRight, gateBottom - 18);
  ctx.lineTo(gateLeft, gateBottom); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(163,178,180,0.62)'; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const u = i / 7; const x = gateLeft + (gateRight - gateLeft) * u;
    const top = gateTop + 35 * (1 - u); const bottom = gateBottom - 18 * u;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  for (let i = 1; i < 5; i += 1) {
    const u = i / 5; ctx.beginPath();
    ctx.moveTo(gateLeft, gateTop + 35 + (gateBottom - gateTop - 35) * u);
    ctx.lineTo(gateRight, gateTop + (gateBottom - gateTop - 18) * u); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(gateLeft + 8, gateTop + 45); ctx.lineTo(gateRight - 8, gateBottom - 25);
  ctx.moveTo(gateRight - 8, gateTop + 10); ctx.lineTo(gateLeft + 8, gateBottom - 10); ctx.stroke();

  // 上部の立体看板。
  ctx.fillStyle = '#344249'; ctx.beginPath();
  ctx.moveTo(438, 205); ctx.lineTo(684, 181); ctx.lineTo(708, 211); ctx.lineTo(458, 237); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#151f24'; ctx.beginPath();
  ctx.moveTo(466, 164); ctx.lineTo(650, 147); ctx.lineTo(680, 178); ctx.lineTo(491, 197); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d7ddda'; ctx.font = font(17, true); ctx.textAlign = 'center';
  ctx.fillText('STAR RACING', 563, 184);

  // 右端の前扉だけが見える角度。開放時は上下へ逃がし、馬の進路を空ける。
  const door = (1 - releaseProgress) * 76;
  ctx.strokeStyle = '#b7c3c2'; ctx.lineWidth = 5; ctx.beginPath();
  ctx.moveTo(gateRight, gateTop + 12 - (76 - door)); ctx.lineTo(gateRight + door, gateTop + 88);
  ctx.moveTo(gateRight, gateBottom - 28 + (76 - door)); ctx.lineTo(gateRight + door, gateBottom - 105);
  ctx.stroke();
  ctx.fillStyle = '#111719'; ctx.fillRect(gateLeft - 8, gateBottom, gateRight - gateLeft + 28, 14);
  for (const wx of [gateLeft + 24, gateRight - 18]) {
    ctx.fillStyle = '#0c1012'; ctx.beginPath(); ctx.ellipse(wx, gateBottom + 17, 19, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#69767a'; ctx.beginPath(); ctx.ellipse(wx, gateBottom + 17, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'left';
  if (releaseProgress <= 0) {
    ctx.fillStyle = 'rgba(10,12,11,0.82)'; ctx.fillRect(38, vp.height - 96, 390, 54);
    ctx.fillStyle = pal['paper-0'] ?? '#fff'; ctx.font = font(23, true);
    ctx.fillText(`${fieldSize}頭、ゲートイン完了`, 58, vp.height - 61);
  }
}
