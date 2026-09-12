import { drawCourseMinimap, type MinimapHorse } from './minimap.js';
import type { Course } from './course.js';
import type { Ctx2D, FontOf, Palette } from './oblique-draw.js';

/**
 * ★**カットイン**（★2026-09-11・★オーナー判定の 2 回目）
 *
 * 【★ここまでの経緯 — ★2 回作り直しています】
 *   ★1 回目 … ★カット 1 つ（★数秒）を ★**まるごと**隊列図／コース図へ置き換えた
 *            → ★オーナー評「★カットインの内容がダメです」
 *   ★2 回目 … ★境目で ★**ロゴが 0.42 秒**走るだけの「デザイン系」（★判定 A）
 *            → ★オーナー評「★カットインがあまりにもダサい。★今のカットインは使えません。
 *               ★クオリティを上げるカットインができないなら、★**意味のあるカットイン**に
 *               ★した方がいいと思います」
 *   ★3 回目（★これ）… ★**その瞬間に意味のある情報だけ**を出す。★毎回中身が違う。
 *            ★オーナー案「★いくつかのカットインの種類を作って、★レースのカットインを
 *            ★入れる度に毎回異なる意味のあるカットインにするのは？」
 *
 * 【★出す場所と中身】★場面に合う情報しか置きません。
 *   ★A ★発走直後       … ★**自馬カード**（★誰を応援するのか）
 *   ★B ★最初の位置取り  … ★**隊列図**（★「位置取り」はまさにその情報）
 *   ★C ★4 コーナー入り  … ★**脚質と現在位置**（★これから何が起きるかの予告）
 *   ★D ★コーナー→直線   … ★**残り距離と差**（★勝負がどれだけ僅差か）
 *   ★E ★直線の継ぎ目    … ★**出しません**（★佳境で画面をレースから離さない）
 *
 * 【★守ること】
 *   ⚠️ ★**カットの数・境界・尺は変えません**（★台帳「カット数は減らさない」）。
 *      ★置き換えるのは ★**カットの頭 1.2 秒**だけです。
 *   ⚠️ ★**レース時間は止めません。** ★戻ったときは、その時点のレース状態の画になります。
 *   ⚠️ ★**着順・走破時刻・台帳・サーバー側の判定に触れません。** ★描画だけです。
 *      ★出す数字は ★**画面が描くのに使っている値**をそのまま渡してもらいます（★着順から作らない）。
 *   ⚠️ ★背面は ★**不透明**にします（★不合格の走行を透かさない）。
 *
 * 【★どこに出すかは、ここ 1 か所で決めます】
 *   ★画面が個別に判定すると、★道具・検査・画面が別々の答えを持ちます（★R-30）。
 */

/** ★カットインの種類 */
export type RaceCutInKind = 'own-horse' | 'formation' | 'running-style' | 'to-straight';

export interface RaceCutIn {
  readonly kind: RaceCutInKind;
  /** ★上の帯に出す見出し（★一画面につき一情報・★これが「何の画面か」） */
  readonly label: string;
}

/**
 * ★カットインの尺（秒）。★道具はこの値を読むこと（★べた書きしない・R-31）。
 *
 * ⚠️ ★**1 枚 1.2 秒。** ★これは「一目で 1 つの事実が読める」下限として置いた値で、
 *    ★実測で決めたものではありません。★長すぎれば情報画面に戻り（★1 回目の失敗）、
 *    ★短すぎれば読めません（★2 回目の 0.42 秒は読ませる気が無い画でした）。
 */
export const RACE_CUTIN_SEC = 1.2;

/**
 * ★**コーナーの後のカットインの尺**（秒）。
 *
 * ★オーナー指示（★2026-09-12）「★コーナーの前からバージョンは 4 秒の尺があります。
 *   ★それを ★**2 秒**にして、★残り ★**2 秒**をデザイナーのハンドオフのカットインにしませんか？」
 * ⚠️ ★発走の 1 枚（★`RACE_CUTIN_AT_START`）は ★**1.2 秒のまま**です。
 *    ★指示はコーナーについてのものなので、★指示の無い所を一緒に動かしません。
 */
export const RACE_CUTIN_CORNER_SEC = 2.0;

/** ★発走直後に出すもの（★カットの境目ではなく、★レース開始からの経過で出す） */
export const RACE_CUTIN_AT_START: RaceCutIn = { kind: 'own-horse', label: 'あなたの馬' };

/**
 * ★**この切り替わりでカットインを出すか。**
 *
 * ⚠️ ★カットの ★**名前だけでは決められません**。★台本 v6 の `side-drive` は
 *    ★**2 回**出てきます（★序盤と、★4 角明け）。★出したいのは ★**4 角明けだけ**です。
 *    ★だから ★**どこから来たか**で見ます。
 * ⚠️ ★4 角のカットは 3 通りあります（`fourth-corner-front` / `-wide` / `-far`）。
 *    ★名前を 1 つだけ書くと、★撮り方を替えた日に出なくなります（★2026-09-11 に実際に起きました）。
 */
/**
 * ★**コーナーを見せているカットか。**
 *
 * ⚠️ ★`fourth-corner-` だけを見ていました（★2026-09-12 まで）。★**桜星賞の 4 角しか当たりません。**
 *    ★オーナー評「★様々なコースではコーナーがあちこちあるので、★やはりカットインは必要です」。
 *    ★1 角（`first-corner-front`）・2 角（`second-corner-high`）・3 角（`third-corner-rear`）でも
 *    ★同じ素材の弱さが出るので、★**どのコーナーのカットでも**当たるようにします。
 * ★名前を 1 つずつ並べません（★撮り方を替えた日に漏れます・★2026-09-11 に実際に起きました）。
 */
const isCornerShot = (id: string): boolean => id.includes('-corner-');

export function raceCutInAt(
  fromId: string, toId: string,
  opts: {
    /**
     * ★**そのとき画面が出している区間名**（★`broadcastV2SectionLabel` の値）。
     * ⚠️ ★カメラの名前から「直線へ」と断定しないため、★**画面と同じ値**を受け取ります（★R-30）。
     *    ★1 角や 2 角を抜けた先は直線ではありません。
     */
    readonly sectionLabel?: string | undefined;
  } = {},
): RaceCutIn | undefined {
  /**
   * ⚠️ ★**コーナーへ「入る」ときは出しません**（★2026-09-12・★オーナー指示）。
   *    ★オーナーの組み立て「★コーナー演出（数秒）→ ★カットインで誤魔化す → ★真横カメラワークへ」。
   *    ★カットインは ★**コーナーの後**に来ます。★入口にも出すと、
   *    ★2 秒しかないコーナーの半分が覆われます。
   */
  /** ★**コーナーから出る**。★見出しは ★**実際にいる区間**から作ります */
  if (isCornerShot(fromId) && !isCornerShot(toId)) {
    const next = opts.sectionLabel;
    const label = next === undefined || next === '' || next.includes('直線') || next === 'ゴール前'
      ? '最後の直線へ' : `${next}へ`;
    return { kind: 'to-straight', label };
  }
  /**
   * ⚠️ ★**コーナー以外では出しません**（★2026-09-12・★オーナー指摘①②）。
   *
   *   ★オーナー評「★現在の隊列も ★**デザイナーのハンドオフ**であり、★カットイン用に作っているのに
   *   ★**カットイン場面ではないところに出している**のも間違っています」。
   *   ★カットインは ★**素材の質が足りていない場面（コーナー・発走の瞬間）を隠すため**のもので、
   *   ★カメラが切り替わるたびに出すものではありません。
   *   → ★`opening-side-lead` → `opening-formation` の「現在の隊列」は ★**取り下げました**。
   *     ★`opening-formation` は高い引きのカメラなので、★カットインが無くても絵は成立します。
   *   → ★直線の継ぎ目も出しません（★佳境で目を離させない）。
   */
  return undefined;
}

/**
 * ★**場面転換の合図（ワイプ）**（★2026-09-12・★オーナー指摘）
 *
 * 【★なぜ要るか — ★参考映像との比較で名指しされた唯一の差】
 *   ★オーナー評「★JRA の中継も、参考映像も、★カメラワークの切り替わりがあっても
 *   ★**ちゃんと 1 つのレースとして見えます**。★この開発サーバーは ★**切れる感覚**があります」。
 *
 *   ★`REPORT_P4_2D_EDIT_GRAMMAR_AUDIT_20260824.md` §19-5（★参考映像との突き合わせ）:
 *     ★「★**場面転換の合図がない。** ★参考は勝負どころで ★**ワイプ（1.4 秒）**を入れて
 *       ★画を切り替えます。★`/race` は ★**勝負どころ（直線）に転換の合図がありません**」
 *   ★2026-09-12 に測り直した結果、★尺の配り方・走行方向の反転・被写体の引き継ぎは
 *   ★参考と揃っていました。★**残っている差はこれだけ**です。
 *
 * 【⚠️ ★ここには 2 回別のものを試して 2 回とも外しています】
 *   ★ディゾルブ（重ね合わせ） … ★**12 頭が二重写し** → ★「切り替え時がごちゃごちゃする」→ 撤去
 *   ★ロゴのワイプ ………………… ★「★**ダサい**」→ 撤去
 *   ★カットイン ………………… ★直線には**意図的に入れていません**（★「佳境で目を離させない」）
 *
 * 【★ワイプとは何か — ★2 回作り損ねてから直しました】
 *   ⚠️ ★**ワイプは「2 つの絵を境目で分ける」ものです。**
 *      ★境目が横切り、★その向こう側には ★**新しいカメラの絵**が出ています。
 *      ★画面には ★**前のカットと次のカットが同時にあります**。
 *
 *   ★1 回目（★中央から左右へ開く板）… ★t=0 で ★**画面が全部まっ黒**になりました。
 *   ★2 回目（★黒い帯が通過）……… ★オーナー評「★**黒の物体が左から右に高速で動くもの**ですか？
 *                                 ★これがあなたの言うワイプですか？」→ ★**ワイプではありません**。
 *                                 ★1 枚の絵の上を板が通るだけで、★前後のカットを繋いでいません。
 *   ★3 回目（★これ）………………… ★**前のカットの絵と次のカットの絵を、境目で分けます。**
 *
 * ⚠️ ★**重ねません。** ★どの画素も ★**どちらか一方の絵**です（★二重写しは起きません）。
 *    ★過去に外したディゾルブは ★**混ぜて**いました。★そこが違います。
 * ⚠️ ★**ロゴを出しません**（★「ダサい」で外した形へ戻らない）。
 * ★戻し口は `?wipe=off`。
 */
export const RACE_WIPE_SEC = 0.35;

/**
 * ★**境目の横位置**（px）。★`undefined` なら出しません。
 *
 * ★画面の左端から右端へ動きます。★左は ★**前のカットの絵**、★右は ★**次のカットの絵**。
 * ⚠️ ★出どころはここ 1 か所です（★R-31）。★画面も検定もこれを読みます。
 */
export function raceWipeEdgeX(
  sinceSec: number, width: number, durationSec = RACE_WIPE_SEC,
): number | undefined {
  const dur = Math.max(0.01, durationSec);
  const t = sinceSec / dur;
  if (t < 0 || t >= 1) return undefined;
  return Math.round(width * ease(clamp01(t)));
}

/**
 * ★境目に引く細い線。★**絵は呼ぶ側が置きます**（★2 つの絵を分けるのは画面側の仕事）。
 *
 * ⚠️ ★線だけです。★**板で覆いません。** ★覆うとワイプではなく目隠しになります。
 */
export function drawRaceWipeEdge<TImage>(
  ctx: Ctx2D<TImage>,
  opts: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly x: number;
  },
): void {
  const { width: W, height: H } = opts.viewport;
  if (opts.x <= 0 || opts.x >= W) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  /** ★金の細い線（★カットインと同じ意匠）。★内側に暗い影を 1 本置いて、境目を読ませる */
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(Math.max(0, opts.x - 3), 0, 3, H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(opts.x, 0, 2, H);
  ctx.globalAlpha = prevAlpha;
}

/** ★背面の色。★不透明であることがこの画面の要件です（★走行を透かさない） */
const BACKDROP = '#0d1218';
const BAND = '#16202a';
const GOLD = '#c9a227';
const PAPER = '#eef2f6';
const PAPER70 = 'rgba(238,242,246,0.70)';

/** ★共通の枠に渡すもの（★4 種すべて同じ） */
export interface RaceCutInFrame {
  readonly viewport: { readonly width: number; readonly height: number };
  /** ★この画が出てからの秒 */
  readonly sinceSec: number;
  /** ★全体の尺（秒）。★これを超えたら呼ぶ側が出すのをやめる */
  readonly durationSec: number;
  /** ★上の帯の見出し（★`RaceCutIn.label`） */
  readonly label: string;
  /** ★左上の小さな見出し（★例「11R 桜星賞」） */
  readonly raceLabel: string;
  /** ★右上（★例 630） */
  readonly metersLeft: number;
}

const ease = (x: number): number => x * x * (3 - 2 * x);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * ★**共通の枠を描き、中身を置く矩形を返す。**
 *
 * ★入り／抜けは ★**中央から左右へ開く拭き**です。
 * ⚠️ ★`Ctx2D` には `save` / `restore` / `clip` がありません（★両方の環境に無い）。
 *    ★だから切り抜きではなく、★**塗る矩形の幅**で拭きを作ります。
 *
 * @returns ★中身を置く矩形。★拭きの途中は `undefined`（★中身をまだ描かない）
 */
export function drawRaceCutInFrame<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceCutInFrame,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined {
  const { width: W, height: H } = f.viewport;
  const t = clamp01(f.sinceSec / Math.max(0.01, f.durationSec));
  /** ★入り 16% / 抜け 16%。★間は出し切り */
  const IN = 0.16, OUT = 0.16;
  const p = t < IN ? ease(t / IN) : t > 1 - OUT ? ease(clamp01((1 - t) / OUT)) : 1;
  if (p <= 0.001) return undefined;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  /** ★① 地。★中央から左右へ開く（★不透明） */
  const gw = Math.round(W * p);
  const gx = Math.round((W - gw) / 2);
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(gx, 0, gw, H);
  /** ★拭きの先端に金の細い線。★動いているのが分かる */
  ctx.fillStyle = GOLD;
  ctx.fillRect(gx, 0, 2, H);
  ctx.fillRect(gx + gw - 2, 0, 2, H);

  /** ★中身は出し切ってから。★拭きの途中に文字が出ると読めません */
  const show = clamp01((p - 0.86) / 0.14);
  if (show <= 0.01) { ctx.globalAlpha = prevAlpha; return undefined; }

  /** ★② 上の帯 */
  const bandH = Math.round(H * 0.12);
  ctx.globalAlpha = show;
  ctx.fillStyle = BAND;
  ctx.fillRect(0, 0, W, bandH);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, bandH - 2, W, 2);

  /** ★見出しの札（★金地に暗字）。★「何の画面か」を 1 つだけ */
  const labelSize = Math.round(H * 0.042);
  ctx.font = font(labelSize, true);
  const lw = ctx.measureText(f.label).width;
  const chipX = Math.round(W * 0.5 - (lw + 40) / 2);
  const chipY = Math.round(bandH * 0.22);
  const chipH = Math.round(bandH * 0.58);
  ctx.fillStyle = GOLD;
  ctx.fillRect(chipX, chipY, Math.round(lw + 40), chipH);
  ctx.fillStyle = '#14181a';
  ctx.textAlign = 'center';
  ctx.fillText(f.label, Math.round(W * 0.5), chipY + Math.round(chipH * 0.74));

  /** ★左: どのレースか ／ ★右: 残り */
  ctx.textAlign = 'left';
  ctx.font = font(Math.round(H * 0.028), true);
  ctx.fillStyle = PAPER70;
  ctx.fillText(f.raceLabel, Math.round(W * 0.03), Math.round(bandH * 0.62));
  /**
   * ⚠️ ★**「残り」と数字の間は、★文字幅を測って空けます**（★2026-09-11）。
   *    ★固定の 62px にしたら、★数字が 3 桁のとき ★**「残590m」と重なりました**（★実測）。
   */
  ctx.textAlign = 'right';
  const leftText = `${Math.max(0, Math.round(f.metersLeft))}m`;
  ctx.font = font(Math.round(H * 0.040), true);
  const leftW = ctx.measureText(leftText).width;
  ctx.fillStyle = GOLD;
  ctx.fillText(leftText, Math.round(W * 0.97), Math.round(bandH * 0.64));
  ctx.fillStyle = PAPER70;
  ctx.font = font(Math.round(H * 0.024), true);
  ctx.fillText('残り', Math.round(W * 0.97 - leftW - 10), Math.round(bandH * 0.62));
  ctx.textAlign = 'left';
  ctx.globalAlpha = prevAlpha;

  /**
   * ⚠️ ★下の 2 割強は ★**実況の帯**が乗ります（★HUD はこの後に描かれます）。
   *    ★中身をそこへ伸ばすと隠れます。
   */
  return {
    x: Math.round(W * 0.06), y: bandH + Math.round(H * 0.04),
    width: Math.round(W * 0.88), height: Math.round(H * 0.53),
  };
}

/** ★中身が出るまでの濃さ（★枠と同じ計算・★中身側でも使う） */
function contentAlpha(f: RaceCutInFrame): number {
  const t = clamp01(f.sinceSec / Math.max(0.01, f.durationSec));
  const IN = 0.16, OUT = 0.16;
  const p = t < IN ? ease(t / IN) : t > 1 - OUT ? ease(clamp01((1 - t) / OUT)) : 1;
  return clamp01((p - 0.86) / 0.14);
}

/**
 * ★**その色の上で読める字の色**を返す（★2026-09-11）。
 *
 * ⚠️ ★字を ★**暗い色に決め打ち**していたので、★枠色が黒・青の馬は
 *    ★**番号が読めませんでした**（★実測・★隊列図で 1 頭が黒い点になっていた）。
 * ★`#rgb` / `#rrggbb` を読みます。★読めない書式（`rgba(...)` など）は
 *    ★**明るい字**に倒します（★この画面の地が暗いので、そちらが安全側・R-27）。
 */
function readableOn(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (m === null) return PAPER;
  const hex = m[1]!;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  /** ★人の目の感度で重みを付けた明るさ（0〜255） */
  return 0.299 * r + 0.587 * g + 0.114 * b >= 140 ? '#14181a' : PAPER;
}

/** ★枠の色を塗って番号を書く小さな札（★勝負服の枠色と同じものを渡してもらう） */
function gatePlate<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf,
  x: number, y: number, size: number, gate: number, color: string, own: boolean,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  if (own) {
    ctx.strokeStyle = '#f5d56d'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + size, y); ctx.lineTo(x + size, y + size);
    ctx.lineTo(x, y + size); ctx.closePath(); ctx.stroke();
  }
  ctx.fillStyle = readableOn(color);
  ctx.font = font(Math.round(size * 0.62), true);
  ctx.textAlign = 'center';
  ctx.fillText(String(gate), x + size / 2, y + Math.round(size * 0.74));
  ctx.textAlign = 'left';
}

/* ───────────────────────── ★A 自馬カード ───────────────────────── */

export interface OwnHorseCutInOptions<TImage> {
  readonly gate: number;
  readonly horseName: string;
  readonly jockeyName: string;
  /** ★脚質（★「逃げ」「先行」「差し」「追い込み」）。★エンジンが持っている値を渡すこと */
  readonly strategyLabel: string;
  readonly frameColor: string;
  /** ★いま何番手か。★**画面が描いている位置から**数えたものを渡すこと（★着順から作らない） */
  readonly order: number;
  readonly fieldSize: number;
  /**
   * ★走っている絵（★**レース中と同じコマ集合**。★ここで別の絵を用意しない）。
   * ⚠️ ★勝負服は ★`overlay` に分かれています。★これを描き忘れると ★**服の無い馬**が出ます。
   */
  readonly portrait?: {
    readonly image: TImage;
    readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly overlay?: {
      readonly image: TImage; readonly width: number; readonly height: number;
      readonly offsetXSourcePx: number; readonly offsetYSourcePx: number;
    } | undefined;
  } | undefined;
}

/**
 * ★**A 自馬カード**（★発走直後）。
 *   ★レースが始まる瞬間、★見る人が知りたいのは ★**「自分の馬はどれか」**です。
 */
export function drawOwnHorseCutIn<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceCutInFrame, o: OwnHorseCutInOptions<TImage>,
): void {
  const box = drawRaceCutInFrame(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = contentAlpha(f);

  /** ★左に枠の札、★右に名前。★絵があれば下に走らせる */
  const plate = Math.round(H * 0.11);
  const left = box.x + Math.round(box.width * 0.04);
  const top = box.y + Math.round(box.height * 0.06);
  gatePlate(ctx, font, left, top, plate, o.gate, o.frameColor, true);

  const nameX = left + plate + Math.round(H * 0.035);
  ctx.fillStyle = PAPER;
  ctx.font = font(Math.round(H * 0.082), true);
  ctx.fillText(o.horseName, nameX, top + Math.round(plate * 0.78));

  ctx.fillStyle = PAPER70;
  ctx.font = font(Math.round(H * 0.030), true);
  ctx.fillText(`騎手　${o.jockeyName}`, nameX, top + plate + Math.round(H * 0.045));

  /** ★脚質と現在位置。★2 つだけ */
  const rowY = top + plate + Math.round(H * 0.115);
  ctx.fillStyle = GOLD;
  ctx.font = font(Math.round(H * 0.026), true);
  ctx.fillText('脚質', left, rowY);
  ctx.fillStyle = PAPER;
  ctx.font = font(Math.round(H * 0.046), true);
  ctx.fillText(o.strategyLabel, left, rowY + Math.round(H * 0.052));

  const col2 = left + Math.round(box.width * 0.30);
  ctx.fillStyle = GOLD;
  ctx.font = font(Math.round(H * 0.026), true);
  ctx.fillText('現在', col2, rowY);
  ctx.fillStyle = PAPER;
  ctx.font = font(Math.round(H * 0.046), true);
  const orderText = `${o.order}番手`;
  ctx.fillText(orderText, col2, rowY + Math.round(H * 0.052));
  const ow = ctx.measureText(orderText).width;
  ctx.fillStyle = PAPER70;
  ctx.font = font(Math.round(H * 0.026), true);
  ctx.fillText(`／ ${o.fieldSize}頭`, col2 + ow + 10, rowY + Math.round(H * 0.052));

  /**
   * ★走っている絵。★**レース中と同じコマ**を渡してもらいます。
   * ⚠️ ★`Ctx2D.drawImage` は ★**9 引数のみ**（★切り出し込み）です。
   */
  if (o.portrait !== undefined) {
    const src = o.portrait.source;
    const dh = Math.round(box.height * 0.82);
    const dw = Math.round((src.width / Math.max(1, src.height)) * dh);
    const dx = box.x + box.width - dw + Math.round(box.width * 0.02);
    const dy = box.y + box.height - dh;
    const scale = dh / Math.max(1, src.height);
    ctx.drawImage(o.portrait.image, src.x, src.y, src.width, src.height, dx, dy, dw, dh);
    const ov = o.portrait.overlay;
    if (ov !== undefined) {
      ctx.drawImage(ov.image, 0, 0, ov.width, ov.height,
        dx + (ov.offsetXSourcePx - src.x) * scale, dy + (ov.offsetYSourcePx - src.y) * scale,
        ov.width * scale, ov.height * scale);
    }
  }
  ctx.globalAlpha = prev;
}

/* ───────────────────────── ★B 隊列図 ───────────────────────── */

export interface FormationCutInOptions {
  /** 描画に使っている現在位置。順位や着順から組み直さない。 */
  readonly horses: readonly MinimapHorse[];
  readonly frameColorOf: (gate: number) => string;
}

/**
 * ★**B 隊列図**（★最初の位置取り）。
 *   ★前後は ★**実際の進行距離**、★上下は ★**実際の走路内位置**。★ここで着順や進路を作りません。
 */
export function drawFormationCutIn<TImage>(
  ctx: Ctx2D<TImage>, pal: Palette, font: FontOf, f: RaceCutInFrame, o: FormationCutInOptions,
): void {
  const box = drawRaceCutInFrame(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = contentAlpha(f);

  /** ★走路の帯 */
  ctx.fillStyle = pal['turf-2'] ?? '#263c31';
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.fillStyle = '#d9ded2';
  ctx.fillRect(box.x, box.y, box.width, 2);
  ctx.fillRect(box.x, box.y + box.height - 2, box.width, 2);
  ctx.fillStyle = 'rgba(238,242,246,0.16)';
  for (const r of [0.25, 0.5, 0.75]) {
    ctx.fillRect(Math.round(box.x + box.width * r), box.y, 1, box.height);
  }

  const lead = Math.max(...o.horses.map((h) => h.s), 0);
  const tail = Math.min(...o.horses.map((h) => h.s), lead);
  const span = Math.max(12, lead - tail);
  /**
   * ★**上下は「実際に使っている走路の幅」に合わせます**（★2026-09-11）。
   *
   * ⚠️ ★走路の全幅（20m）で割っていたので、★12 頭が w 4〜12m に固まる序盤は
   *    ★**盤の上 4 割にしか馬が乗らず**、★下 6 割が空いていました（★実測）。
   * ★軸の意味は変わりません（★上＝内ラチ寄り、★下＝外）。★**倍率だけ**を寄せます。
   * ★最低 6m は残します（★2 頭がぴったり並んだ瞬間に上下へ吹き飛ばさないため）。
   */
  const laneLo = Math.min(...o.horses.map((h) => h.w));
  const laneHi = Math.max(...o.horses.map((h) => h.w));
  const laneMid = (laneLo + laneHi) / 2;
  const laneSpan = Math.max(6, laneHi - laneLo + 2);
  const radius = Math.max(13, Math.round(H * 0.030));
  for (const horse of o.horses) {
    const x = box.x + box.width * (0.08 + 0.84 * ((horse.s - tail) / span));
    const lane = clamp01((horse.w - (laneMid - laneSpan / 2)) / laneSpan);
    const y = box.y + box.height * (0.14 + 0.72 * lane);
    const fill = o.frameColorOf(horse.gate);
    ctx.beginPath(); ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    /**
     * ⚠️ ★**縁は明るい色**にします（★2026-09-11）。★暗い枠色（黒・青）の馬は
     *    ★暗い地の上で ★**丸ごと消えて**いました（★実測・★1 頭が黒い点になっていた）。
     */
    ctx.strokeStyle = horse.own === true ? '#f5d56d' : 'rgba(238,242,246,0.85)';
    ctx.lineWidth = horse.own === true ? 4 : 2; ctx.stroke();
    ctx.fillStyle = readableOn(fill);
    ctx.font = font(Math.round(radius * 1.05), true);
    ctx.textAlign = 'center';
    ctx.fillText(String(horse.gate), x, y + Math.round(radius * 0.35));
  }
  /** ★軸の意味を書く。★上下も書かないと「内か外か」が読めません */
  ctx.fillStyle = PAPER70;
  ctx.font = font(Math.round(H * 0.026), true);
  ctx.fillText('内', box.x + 8, box.y - Math.round(H * 0.014));
  ctx.fillText('外', box.x + 8, box.y + box.height + Math.round(H * 0.045));
  ctx.textAlign = 'right';
  ctx.fillText('前方 →', box.x + box.width - 8, box.y + box.height + Math.round(H * 0.045));
  ctx.textAlign = 'left';
  ctx.globalAlpha = prev;
}

/* ───────────────────────── ★C 脚質と現在位置 ───────────────────────── */

export interface RunningStyleRow {
  readonly gate: number;
  readonly horseName: string;
  readonly strategyLabel: string;
  /** ★いま何番手か（★画面が描いている位置から数えたもの） */
  readonly order: number;
  readonly frameColor: string;
  readonly own: boolean;
}

/**
 * ★**C 脚質と現在位置**（★4 コーナー入り）。
 *   ★ここから何が起きるかの ★**予告**です。★差し・追い込みの馬を先に名指ししておくと、
 *   ★直線でその馬が上がってきたときに ★**何が起きたのかが分かります**。
 *
 * ⚠️ ★**予想ではありません。** ★脚質はエンジンが持っている値、★順位は画面が描いている位置です。
 *    ★「この馬が来る」とは 1 文字も書きません。
 */
export function drawRunningStyleCutIn<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceCutInFrame, rows: readonly RunningStyleRow[],
): void {
  const box = drawRaceCutInFrame(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = contentAlpha(f);

  const shown = rows.slice(0, 4);
  if (shown.length === 0) {
    ctx.fillStyle = PAPER70;
    ctx.font = font(Math.round(H * 0.040), true);
    ctx.textAlign = 'center';
    ctx.fillText('後方から動く馬はいません', Math.round(f.viewport.width / 2), box.y + Math.round(box.height * 0.5));
    ctx.textAlign = 'left';
    ctx.globalAlpha = prev;
    return;
  }
  const rowH = Math.round(box.height / Math.max(1, shown.length));
  const plate = Math.round(rowH * 0.62);
  shown.forEach((r, i) => {
    const y = box.y + i * rowH;
    /** ★行の地。★自馬だけ少し明るく */
    ctx.fillStyle = r.own ? 'rgba(245,213,109,0.14)' : 'rgba(238,242,246,0.05)';
    ctx.fillRect(box.x, y + 2, box.width, rowH - 6);
    gatePlate(ctx, font, box.x + 10, y + Math.round((rowH - plate) / 2), plate, r.gate, r.frameColor, r.own);
    ctx.fillStyle = PAPER;
    ctx.font = font(Math.round(rowH * 0.42), true);
    ctx.fillText(r.horseName, box.x + 10 + plate + 18, y + Math.round(rowH * 0.62));
    /** ★右に脚質、★その左に現在位置 */
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.font = font(Math.round(rowH * 0.40), true);
    ctx.fillText(r.strategyLabel, box.x + box.width - 14, y + Math.round(rowH * 0.62));
    ctx.fillStyle = PAPER70;
    ctx.font = font(Math.round(rowH * 0.30), true);
    ctx.fillText(`${r.order}番手`, box.x + box.width - Math.round(box.width * 0.16), y + Math.round(rowH * 0.62));
    ctx.textAlign = 'left';
  });
  ctx.globalAlpha = prev;
}

/* ───────────────────────── ★D 残り距離と差 ───────────────────────── */

export interface ToStraightCutInOptions {
  /** ★馬の位置。★**描画に使っている値をそのまま**渡すこと（★着順から作らない） */
  readonly horses: readonly MinimapHorse[];
  /** ★注視点（m） */
  readonly focusS: number;
  readonly frameColorOf: (gate: number) => string;
  readonly distanceLabel: string;
  readonly metersLeft: number;
  /** ★光沢の時刻（秒） */
  readonly timeSec: number;
  readonly ownGate: number;
  readonly ownOrder: number;
  /**
   * ★先頭との差（★**馬身**）。★順位表（`drawStandings`）が出しているのと ★**同じ単位・同じ値**。
   * ⚠️ ★秒に直さないこと。★画面の 2 か所が違う単位で同じ差を語ると、★見る人は数えられません。
   */
  readonly ownGapLengths: number;
  readonly fieldSize: number;
}

/**
 * ★**D 残り距離と差**（★コーナーから直線へ出るところ）。
 *   ★直線に入る瞬間、★勝負が ★**どれだけ僅差か**を一度だけ示します。
 *   ★図は ★**既存の `drawCourseMinimap`** を大きな枠で呼びます
 *   （★同じ図を 2 か所で描くと、片方だけ直って離れます・★D-052）。
 */
export function drawToStraightCutIn<TImage>(
  ctx: Ctx2D<TImage>, course: Course, pal: Palette, font: FontOf,
  f: RaceCutInFrame, o: ToStraightCutInOptions,
): void {
  const box = drawRaceCutInFrame(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height, W = f.viewport.width;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = contentAlpha(f);

  /** ★左にコース図 */
  const mapW = Math.round(box.width * 0.46);
  drawCourseMinimap(ctx, course, pal, font, o.horses, o.focusS,
    { x: box.x, y: box.y, width: mapW, height: box.height }, o.frameColorOf, {
      distanceLabel: o.distanceLabel,
      metersLeft: o.metersLeft,
      timeSec: o.timeSec,
      sinceSec: f.sinceSec,
    });

  /** ★右に「自馬がいま何番手で、先頭とどれだけ差があるか」 */
  const rx = box.x + mapW + Math.round(box.width * 0.06);
  let y = box.y + Math.round(box.height * 0.20);
  ctx.fillStyle = GOLD;
  ctx.font = font(Math.round(H * 0.026), true);
  ctx.fillText('あなたの馬', rx, y);
  y += Math.round(H * 0.070);
  ctx.fillStyle = PAPER;
  ctx.font = font(Math.round(H * 0.070), true);
  const orderText = `${o.ownOrder}番手`;
  ctx.fillText(orderText, rx, y);
  const ow = ctx.measureText(orderText).width;
  ctx.fillStyle = PAPER70;
  ctx.font = font(Math.round(H * 0.028), true);
  ctx.fillText(`／ ${o.fieldSize}頭`, rx + ow + 12, y);

  y += Math.round(H * 0.075);
  ctx.fillStyle = GOLD;
  ctx.font = font(Math.round(H * 0.026), true);
  ctx.fillText('先頭との差', rx, y);
  y += Math.round(H * 0.070);
  ctx.fillStyle = PAPER;
  ctx.font = font(Math.round(H * 0.070), true);
  /** ⚠️ ★先頭なら「差」ではありません。★0 秒と書かず、★先頭と書きます */
  ctx.fillText(o.ownOrder <= 1 ? '先頭' : `${o.ownGapLengths.toFixed(1)}馬身`, rx, y);
  void W;
  ctx.globalAlpha = prev;
}

/* ═══════════════════════ ★C 案 — 下三分の一テロップ ═══════════════════════ */

/**
 * ★**カットインを「全画面の挿入」から「下三分の一のテロップ」へ**
 * （★2026-09-11・★デザイナーのハンドオフ `design_handoff_race_telop`）
 *
 * 【★なぜ変えるか — ★デザイナーの指摘がそのまま正しい】
 *   ★この案件は「★**カットが切り替わった瞬間に別のレースに見える**」と長く戦ってきました。
 *   ★ところが従来のカットインは ★**1.2 秒 × 4 回、画面全体を覆って中身に切り替える**構造で、
 *   ★**カットイン自身が新しい継ぎ目を持ち込んで**いました。
 *   ★オーナー評「★カットインや真横カメラワークでも切り替わりの時に繋がっていかない」は、
 *   ★半分はこれが原因です。
 *
 * 【★C 案】
 *   ★レース映像は ★**一切止めず、隠しません**。★画面下部の高さ 104px の帯だけが
 *   ★下から滑り出て、★1.0 秒保持し、★下へ戻ります。
 *   ★帯は既存の実況の帯（y560〜720）とは ★**別の場所**なので、同時に出ても重なりません。
 *
 * ⚠️ ★**元の要求「背景は不透明」からの変更です。** ★帯の中は 94% で不透明ですが、
 *    ★画面の 86% は常に映像が見えています（★オーナー確認事項・★README に明記）。
 * ⚠️ ★従来の全画面版は ★**消していません**。★`?cutin=full` で戻せます（★見比べの道）。
 */

/** ★テロップの尺（秒）。★入り 0.1 ／ 保持 1.0 ／ 抜け 0.1 */
export const RACE_TELOP_SEC = 1.2;
const TELOP_IN_SEC = 0.1;
const TELOP_OUT_SEC = 0.1;

/** ★帯・札の寸法（★1280×720 基準の比。★別の画布でも同じ割合で置く） */
const TELOP = {
  bandY: 432 / 720,
  bandH: 104 / 720,
  tabY: 402 / 720,
  tabH: 30 / 720,
  tabW: 230 / 1280,
  padX: 60 / 1280,
  /** ★台形タブの右辺の切り（下辺がここまで縮む） */
  tabSlant: 0.08,
} as const;

const TELOP_BAND = '#16202a';
/**
 * ★帯の濃さ。
 *
 * ★ハンドオフの指定どおり ★**0.94**。★読みやすさを優先した値です。
 *
 * ⚠️ ★一度 0.80 へ下げ、★**戻しました**（★2026-09-11）。
 *    ★オーナー評「★後ろが半透明になるはず」を、★私が ★**帯そのものが透ける**と読み違えました。
 *    ★意味は ★**帯の外（画面の 86%）でレース映像が見え続ける**ことで、★それは 0.94 でも成立します。
 *    ★オーナーはデザイナーの UI を ★**すでに合格**にしており、★動かす理由はありませんでした。
 * ⚠️ ★**合格済みの指定値を、確認せずに動かさないこと。** ★見比べは `?telop=0.8` でできます。
 */
export const RACE_TELOP_BAND_ALPHA_DEFAULT = 0.94;
const TELOP_OWN = '#f5d56d';

export interface RaceTelopFrame {
  readonly viewport: { readonly width: number; readonly height: number };
  /** ★帯の濃さ（★未指定は `RACE_TELOP_BAND_ALPHA_DEFAULT`） */
  readonly bandAlpha?: number | undefined;
  /** ★この画が出てからの秒 */
  readonly sinceSec: number;
  /** ★全体の尺（秒） */
  readonly durationSec: number;
  /** ★タブに出す見出し（★`RaceCutIn.label`） */
  readonly label: string;
}

/** ★出入りの位置（0 = 画面の外・1 = 出し切り）。★入り抜けは ease-out */
function telopSlide(f: RaceTelopFrame): number {
  const t = Math.max(0, f.sinceSec);
  const d = Math.max(0.01, f.durationSec);
  if (t >= d) return 0;
  const easeOut = (x: number): number => 1 - (1 - x) * (1 - x);
  if (t < TELOP_IN_SEC) return easeOut(clamp01(t / TELOP_IN_SEC));
  if (t > d - TELOP_OUT_SEC) return easeOut(clamp01((d - t) / TELOP_OUT_SEC));
  return 1;
}

/** ★字送りを入れて 1 字ずつ置く（★`ctx.letterSpacing` は片方の環境に無い・★R-30） */
function spacedText<TImage>(
  ctx: Ctx2D<TImage>, text: string, x: number, y: number, em: number,
): void {
  if (em <= 0) { ctx.fillText(text, x, y); return; }
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 14);
  const gap = size * em;
  let cx = x;
  for (const ch of [...text]) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + gap;
  }
}

/**
 * ★**テロップの帯とタブを描き、中身を置く矩形を返す。**
 *
 * ⚠️ ★**世界の描画には一切触れません。** ★呼ぶ側は今までどおり毎コマ世界を描き、
 *    ★そのあとにこれを重ねるだけです。
 * @returns ★中身を置く矩形。★出ていないときは `undefined`
 */
export function drawRaceTelopBand<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceTelopFrame,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined {
  const { width: W, height: H } = f.viewport;
  const slide = telopSlide(f);
  if (slide <= 0.001) return undefined;

  const bandH = Math.round(H * TELOP.bandH);
  const restY = Math.round(H * TELOP.bandY);
  /** ★画面の外（下）から滑り出る。★`globalAlpha` は使いません（★指定どおり） */
  const bandY = Math.round(restY + (H - restY) * (1 - slide));
  const prev = ctx.globalAlpha;

  /** ★① 帯 */
  ctx.globalAlpha = prev * (f.bandAlpha ?? RACE_TELOP_BAND_ALPHA_DEFAULT);
  ctx.fillStyle = TELOP_BAND;
  ctx.fillRect(0, bandY, W, bandH);
  ctx.globalAlpha = prev;
  /** ★上辺に金のヘアライン（★2px・帯の内側） */
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, bandY, W, 2);

  /** ★② 台形のタブ（★右辺だけ斜めに切る＝ロワーサードの作り） */
  const tabH = Math.round(H * TELOP.tabH);
  const tabW = Math.round(W * TELOP.tabW);
  const tabX = Math.round(W * TELOP.padX);
  const tabY = bandY - tabH;
  const slantPx = Math.round(tabW * TELOP.tabSlant);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(tabX, tabY);
  ctx.lineTo(tabX + tabW, tabY);
  ctx.lineTo(tabX + tabW - slantPx, tabY + tabH);
  ctx.lineTo(tabX, tabY + tabH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#14181a';
  ctx.font = font(Math.round(H * (15 / 720)), true);
  ctx.textAlign = 'left';
  spacedText(ctx, f.label, tabX + Math.round(tabW * 0.10), tabY + Math.round(tabH * 0.70), 0.06);

  return { x: tabX, y: bandY, width: W - tabX * 2, height: bandH };
}

/** ★枠の色を塗って番号を書く札（★テロップ用・★内側に金の縁） */
function telopGatePlate<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, x: number, y: number, size: number,
  gate: number, color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  /** ★内側の金の縁（★3px） */
  ctx.fillStyle = TELOP_OWN;
  ctx.fillRect(x, y, size, 3); ctx.fillRect(x, y + size - 3, size, 3);
  ctx.fillRect(x, y, 3, size); ctx.fillRect(x + size - 3, y, 3, size);
  ctx.fillStyle = readableOn(color);
  ctx.font = font(Math.round(size * 0.49), true);
  ctx.textAlign = 'center';
  ctx.fillText(String(gate), x + size / 2, y + Math.round(size * 0.66));
  ctx.textAlign = 'left';
}

/** ★A 自馬 — ★枠札 ＋ 馬名（主役）＋ 脚質・番手を 1 行 */
export function drawOwnHorseTelop<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceTelopFrame,
  o: { readonly gate: number; readonly horseName: string; readonly strategyLabel: string;
    readonly frameColor: string; readonly order: number; readonly fieldSize: number },
): void {
  const box = drawRaceTelopBand(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height;
  const plate = Math.round(H * (72 / 720));
  const px = box.x;
  const py = box.y + Math.round((box.height - plate) / 2);
  telopGatePlate(ctx, font, px, py, plate, o.gate, o.frameColor);

  const midY = box.y + Math.round(box.height * 0.66);
  let x = px + plate + Math.round(H * (38 / 720));
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER;
  ctx.font = font(Math.round(H * (52 / 720)), true);
  ctx.fillText(o.horseName, x, midY);
  x += ctx.measureText(o.horseName).width + Math.round(H * (26 / 720));
  ctx.fillStyle = GOLD;
  ctx.font = font(Math.round(H * (26 / 720)), true);
  ctx.fillText(o.strategyLabel, x, midY);
  x += ctx.measureText(o.strategyLabel).width + Math.round(H * (14 / 720));
  ctx.fillStyle = PAPER70;
  ctx.fillText(`${o.order}番手／${o.fieldSize}頭`, x, midY);
}

/**
 * ★B 隊列 — ★**横 1 本の位置バー**（★2D の散布図はやめました）。
 *   ★デザイナー評「★ビリヤードの玉に見えるという指摘は、この形式ではそもそも起きません」。
 */
export function drawFormationTelop<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceTelopFrame,
  o: { readonly horses: readonly MinimapHorse[]; readonly ownGate: number; readonly ownOrder: number },
): void {
  const box = drawRaceTelopBand(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height;
  const labelY = box.y + Math.round(box.height * 0.34);
  ctx.font = font(Math.round(H * (14 / 720)), true);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER70;
  ctx.fillText('後方', box.x, labelY);
  ctx.textAlign = 'right';
  ctx.fillText('先頭', box.x + box.width, labelY);
  ctx.textAlign = 'center';
  ctx.fillStyle = TELOP_OWN;
  ctx.fillText(`あなた＝${o.ownOrder}番手`, box.x + box.width / 2, labelY);
  ctx.textAlign = 'left';

  /** ★バー */
  const barH = Math.round(H * (16 / 720));
  const barY = box.y + Math.round(box.height * 0.52);
  ctx.fillStyle = 'rgba(238,242,246,0.18)';
  ctx.fillRect(box.x, barY, box.width, barH);

  const tail = Math.min(...o.horses.map((h) => h.s));
  const lead = Math.max(...o.horses.map((h) => h.s));
  const span = Math.max(1, lead - tail);
  for (const h of o.horses) {
    const own = h.gate === o.ownGate;
    const cx = box.x + box.width * ((h.s - tail) / span);
    const r = (own ? barH * 0.69 : barH * 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, barY + barH / 2, r, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = own ? TELOP_OWN : 'rgba(238,242,246,0.60)';
    ctx.fill();
  }
}

/**
 * ★C ここから動く馬 — ★**最大 2 頭**（★帯の高さの限界・★デザイナーの確認事項）。
 * ⚠️ ★元は 4 頭でした。★帯に収まらないので 2 頭に絞っています。
 */
export function drawRunningStyleTelop<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceTelopFrame, rows: readonly RunningStyleRow[],
): void {
  const box = drawRaceTelopBand(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height;
  const midY = box.y + Math.round(box.height * 0.66);
  ctx.textAlign = 'left';
  const shown = rows.slice(0, 2);
  if (shown.length === 0) {
    ctx.fillStyle = PAPER70;
    ctx.font = font(Math.round(H * (30 / 720)), true);
    ctx.fillText('後方から動く馬はいません', box.x, midY);
    return;
  }
  let x = box.x;
  shown.forEach((r, i) => {
    const nameSize = i === 0 ? 40 : 30;
    const styleSize = i === 0 ? 26 : 20;
    ctx.fillStyle = i === 0 ? PAPER : PAPER70;
    ctx.font = font(Math.round(H * (nameSize / 720)), true);
    ctx.fillText(r.horseName, x, midY);
    x += ctx.measureText(r.horseName).width + Math.round(H * (i === 0 ? 14 : 10) / 720);
    ctx.fillStyle = GOLD;
    ctx.font = font(Math.round(H * (styleSize / 720)), true);
    ctx.fillText(r.strategyLabel, x, midY);
    x += ctx.measureText(r.strategyLabel).width;
    if (i === 0 && shown.length > 1) {
      ctx.fillStyle = PAPER70;
      ctx.font = font(Math.round(H * (22 / 720)), true);
      const sep = '　・　';
      ctx.fillText(sep, x, midY);
      x += ctx.measureText(sep).width;
    }
  });
}

/**
 * ★D 最後の直線へ — ★番手と差を数字 2 つの 1 行に。
 * ⚠️ ★コース図は ★**乗せません**。★帯の高さ（104px）では読めないためです（★デザイナー判断）。
 */
export function drawToStraightTelop<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf, f: RaceTelopFrame,
  o: { readonly gate: number; readonly frameColor: string;
    readonly ownOrder: number; readonly ownGapLengths: number },
): void {
  const box = drawRaceTelopBand(ctx, font, f);
  if (box === undefined) return;
  const H = f.viewport.height;
  const plate = Math.round(H * (72 / 720));
  const py = box.y + Math.round((box.height - plate) / 2);
  telopGatePlate(ctx, font, box.x, py, plate, o.gate, o.frameColor);

  const midY = box.y + Math.round(box.height * 0.66);
  let x = box.x + plate + Math.round(H * (38 / 720));
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER;
  ctx.font = font(Math.round(H * (48 / 720)), true);
  const orderText = `${o.ownOrder}番手`;
  ctx.fillText(orderText, x, midY);
  x += ctx.measureText(orderText).width + Math.round(H * (16 / 720));
  ctx.fillStyle = PAPER70;
  ctx.font = font(Math.round(H * (22 / 720)), true);
  ctx.fillText('先頭との差', x, midY);
  x += ctx.measureText('先頭との差').width + Math.round(H * (16 / 720));
  ctx.fillStyle = GOLD;
  ctx.font = font(Math.round(H * (48 / 720)), true);
  /** ⚠️ ★先頭なら「差」ではありません */
  ctx.fillText(o.ownOrder <= 1 ? '先頭' : `${o.ownGapLengths.toFixed(1)}馬身`, x, midY);
}
