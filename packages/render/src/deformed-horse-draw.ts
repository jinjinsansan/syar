/**
 * ★デフォルメ馬 — ★**描画アダプタ**（4 層分離の ★④）
 *
 * 【⚠️ ★差し替え点はここ「だけ」です】
 *   ★裁定 2 は ★**「透過画像パーツ」でも「コードネイティブなベクターパーツ」でもよい**としています。
 *   ★①②③は**どちらでも同一**で、★**この層の中身だけ**が入れ替わります。
 *   → ★ベクターで気に入らなければ、★このファイルを画像版に差し替えるだけです。
 *     ★リグ（②）と姿勢（③）の作業は 1 行も無駄になりません。
 *
 * 【★この層も Canvas を知りません】
 *   ★返すのは ★**図形の配列（数と役割名）**だけです。
 *   ⚠️ ★`getContext` も `document` も持ち込みません（`test/purity.test.ts` が機械で見ています）。
 *
 * 【★色】
 *   ★16 進を 1 つも持ちません。★**役割名だけ**を返し、
 *   ★実際の色は `palette.json` / `COAT_TRANSFORMS` が解決します（★裁定 7・唯一の色定義）。
 *
 * 【⚠️ ★Gate 0B の図形は「動きを見るため」のものです】
 *   ★造形の判定はここではしません（★Gate 1）。
 *   ★指示書 §2-2 が禁じる「色付き図形のまま企画者へ出す」ことはしません。
 */

import type { DeformedHorseContract, DeformedPaintRole } from './deformed-horse-parts.js';
import type { DeformedPose } from './deformed-horse-pose.js';

export interface DeformedPoint { readonly x: number; readonly y: number }

/** ★図形。★座標は [m]・★y は上が正（★画面座標への変換は描く側） */
export type DeformedShape =
  | { readonly kind: 'ellipse'; readonly x: number; readonly y: number; readonly rx: number; readonly ry: number; readonly angleRad: number; readonly fill: DeformedPaintRole; readonly outline: boolean }
  | { readonly kind: 'capsule'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly radius: number; readonly fill: DeformedPaintRole; readonly outline: boolean }
  | { readonly kind: 'polygon'; readonly points: readonly DeformedPoint[]; readonly fill: DeformedPaintRole; readonly outline: boolean };

export interface DeformedDrawOptions {
  /** ★進行方向。★`1` = x が増える向き（右へ）／`-1` = 左へ */
  readonly facing?: 1 | -1;
  /** ★奥のパーツを暗く落とすか（★手前と奥の区別） */
  readonly depthShading?: boolean;
}

function ellipse(x: number, y: number, rx: number, ry: number, angleRad: number, fill: DeformedPaintRole, outline = true): DeformedShape {
  return { kind: 'ellipse', x, y, rx, ry, angleRad, fill, outline };
}
function capsule(a: DeformedPoint, b: DeformedPoint, radius: number, fill: DeformedPaintRole, outline = true): DeformedShape {
  return { kind: 'capsule', x1: a.x, y1: a.y, x2: b.x, y2: b.y, radius, fill, outline };
}

/**
 * ★姿勢 → 図形の配列。★**並びがそのまま描画順**（先が奥）。
 *
 * ⚠️ ★左右反転はここで行いません。★`facing` を掛けた座標を返すだけです
 *    （★指示書 §3-2「左向きは右向きの機械反転で成立させてよい。ただし
 *      ★**ゼッケン文字は描画側で重ねる**」— 文字はこの層が持ちません）。
 */
export function deformedHorseShapes(
  pose: DeformedPose,
  contract: DeformedHorseContract,
  options: DeformedDrawOptions = {},
): readonly DeformedShape[] {
  const f = options.facing ?? 1;
  const shade = options.depthShading !== false;
  const far: DeformedPaintRole = shade ? 'coatShade' : 'coat';

  const p = (pt: DeformedPoint): DeformedPoint => ({ x: pt.x * f, y: pt.y });
  const out: DeformedShape[] = [];

  /** ★接地影。★**先に敷く**（`dfe144b` と同じ考え方） */
  out.push(ellipse(0, 0.01, (contract.shadow.widthM / 2) * pose.parts.shadow.scaleX, contract.shadow.heightM / 2, 0, 'shadow', false));

  const legShapes = (which: 'hindFar' | 'hindNear' | 'foreFar' | 'foreNear', role: DeformedPaintRole): void => {
    const solved = pose.legs[which];
    const bones = contract.legs[which];
    const thick = which.startsWith('fore') ? 0.075 : 0.085;
    out.push(capsule(p(solved.hip), p(solved.knee), thick, role));
    out.push(capsule(p(solved.knee), p(solved.hoof), thick * 0.78, role));
    out.push(ellipse(solved.hoof.x * f, solved.hoof.y + contract.hoof.heightM / 2, contract.hoof.widthM / 2, contract.hoof.heightM / 2, 0, 'hoof'));
    void bones;
  };

  /** ★奥の脚 */
  legShapes('hindFar', far);
  legShapes('foreFar', far);

  /** ★尾（★速さでほぼ水平に流れる・★根元が太く先が細い） */
  const tail = pose.parts.tail;
  const tailAt = (t: number): DeformedPoint => ({
    x: tail.x + contract.tail.lengthM * t * Math.cos(tail.angleRad),
    y: tail.y + contract.tail.lengthM * t * Math.sin(tail.angleRad),
  });
  out.push(capsule(p(tailAt(0)), p(tailAt(0.55)), 0.055, 'mane'));
  out.push(capsule(p(tailAt(0.5)), p(tailAt(1)), 0.032, 'mane'));

  const torso = pose.torso;
  const tc = Math.cos(torso.angleRad);
  const ts = Math.sin(torso.angleRad);
  /** ★胴体のピボットを中心に回した先 */
  const onTorso = (lx: number, ly: number): DeformedPoint =>
    ({ x: torso.x + lx * tc - ly * ts, y: torso.y + lx * ts + ly * tc });

  /**
   * ★**胴体** — ★長く薄い楕円に、★尻と胸のふくらみを足します。
   * ⚠️ ★1 度目は楕円 1 つだけで、★**背線が丸く盛り上がって犬になりました**。
   *    ★参考映像の馬は ★**背線がほぼまっすぐで、尻だけが丸い**形です。
   */
  const halfL = (contract.torso.lengthM / 2) * torso.scaleX;
  const halfH = (contract.torso.heightM / 2) * torso.scaleY;
  /** ★尻（★高く丸い） */
  const rump = onTorso(-halfL * 0.62, halfH * 0.16);
  out.push(ellipse(rump.x * f, rump.y, halfH * 0.86, halfH * 1.02, torso.angleRad * f, 'coat'));
  /** ★胸（★前は少し細い） */
  const chest = onTorso(halfL * 0.56, -halfH * 0.06);
  out.push(ellipse(chest.x * f, chest.y, halfH * 0.80, halfH * 0.90, torso.angleRad * f, 'coat'));
  /** ★腹（★上へ引き上がる＝薄い） */
  out.push(ellipse(torso.x * f, torso.y, halfL, halfH, torso.angleRad * f, 'coat'));

  /**
   * ★**首** — ★根元が太く、頭へ細くなる四辺形。
   * ⚠️ ★1 度目は太さ一定のカプセルで、★**筒が刺さっているように見えました**。
   */
  const neck = pose.parts.neck;
  const head = pose.parts.head;
  const nx = head.x - neck.x;
  const ny = head.y - neck.y;
  const nlen = Math.hypot(nx, ny) || 1;
  /** ★首に直交する向き */
  const px = -ny / nlen;
  const py = nx / nlen;
  const rootHalf = contract.neck.thicknessM / 2;
  const tipHalf = rootHalf * 0.52;
  out.push({
    kind: 'polygon',
    points: [
      p({ x: neck.x + px * rootHalf, y: neck.y + py * rootHalf }),
      p({ x: head.x + px * tipHalf, y: head.y + py * tipHalf }),
      p({ x: head.x - px * tipHalf, y: head.y - py * tipHalf }),
      p({ x: neck.x - px * rootHalf, y: neck.y - py * rootHalf }),
    ],
    fill: 'coat',
    outline: true,
  });

  /** ★たてがみ（★首の上側に沿って流れる） */
  const maneRoot = { x: neck.x + px * rootHalf * 0.9, y: neck.y + py * rootHalf * 0.9 };
  const maneTip = { x: head.x + px * tipHalf * 1.2, y: head.y + py * tipHalf * 1.2 };
  const swing = pose.parts.mane.angleRad - pose.parts.neck.angleRad;
  out.push(capsule(
    p(maneRoot),
    p({ x: maneTip.x - 0.06 * Math.cos(swing), y: maneTip.y + 0.05 }),
    0.055, 'mane',
  ));

  /** ★頭のまわりは、★**頭のピボットを基準**に置きます（★首の角度に付いて回る） */
  const hc = Math.cos(head.angleRad);
  const hs = Math.sin(head.angleRad);
  const onHead = (lx: number, ly: number): DeformedPoint =>
    ({ x: head.x + lx * hc - ly * hs, y: head.y + lx * hs + ly * hc });

  /** ★耳（★奥側。★小さく尖って前を向く） */
  const hl = contract.head.lengthM;
  const hh = contract.head.heightM;
  out.push(capsule(p(onHead(-hl * 0.28, hh * 0.34)), p(onHead(-hl * 0.30, hh * 0.34 + 0.11)), 0.026, far));

  /**
   * ★**頭** — ★長い楔。⚠️ ★1 度目は 0.50 × 0.39 の**ほぼ丸**で、★犬の顔でした。
   *   ★参考映像の頭は ★**長さが深さの約 2 倍**、★鼻筋がまっすぐ前へ落ちます。
   */
  out.push({
    kind: 'polygon',
    points: [
      p(onHead(-hl * 0.46, hh * 0.30)),
      p(onHead(hl * 0.30, hh * 0.16)),
      p(onHead(hl * 0.50, -hh * 0.14)),
      p(onHead(hl * 0.34, -hh * 0.40)),
      p(onHead(-hl * 0.40, -hh * 0.34)),
    ],
    fill: 'coat',
    outline: true,
  });
  /** ★鼻先 */
  out.push(ellipse(onHead(hl * 0.42, -hh * 0.24).x * f, onHead(hl * 0.42, -hh * 0.24).y, hl * 0.10, hh * 0.17, head.angleRad * f, 'muzzle'));
  /** ★目（★表情は読めるが、人間的にしすぎない・指示書 §2-3） */
  const eye = onHead(-hl * 0.16, hh * 0.10);
  out.push(ellipse(eye.x * f, eye.y, hh * 0.14, hh * 0.16, 0, 'eye', false));
  /** ★手前の耳 */
  out.push(capsule(p(onHead(-hl * 0.20, hh * 0.34)), p(onHead(-hl * 0.20, hh * 0.34 + 0.12)), 0.026, 'coat'));

  /**
   * ★**騎手** — ⚠️ ★**前へ深く伏せます**（★1 度目は直立で、★棒が刺さって見えました）。
   *   ★参考映像の騎手は ★**上体がほぼ水平**、★頭が馬の首の横まで前に出て、★尻が後ろ上へ残ります。
   *   ★腰は鞍に直付けのままなので、★「浮かない」は保たれます。
   */
  const jt = pose.parts.jockeyTorso;
  const jh = pose.parts.jockeyHead;
  const seat = { x: jt.x, y: jt.y };
  const shoulder = { x: jt.x + (jh.x - jt.x) * 0.78, y: jt.y + (jh.y - jt.y) * 0.78 };
  /** ★奥の脚（★鐙で強く畳む） */
  out.push(capsule(p(seat), p({ x: seat.x + 0.10, y: seat.y - contract.jockey.legLengthM }), 0.055, 'boot'));
  /** ★上体（★尻から肩へ・★前上がりに寝ている） */
  out.push(capsule(p(seat), p(shoulder), 0.115, 'silk'));
  /** ★腕（★肩から手綱へ・★前下がり） */
  out.push(capsule(p(shoulder), p({ x: shoulder.x + contract.jockey.armLengthM, y: shoulder.y - 0.16 }), 0.048, 'silk'));
  /** ★兜 */
  out.push(ellipse(jh.x * f, jh.y, contract.jockey.headRadiusM, contract.jockey.headRadiusM * 0.92, 0, 'cap'));
  /** ★手前の脚 */
  out.push(capsule(p(seat), p({ x: seat.x + 0.04, y: seat.y - contract.jockey.legLengthM }), 0.055, 'boot'));

  /** ★手前の脚（★いちばん上） */
  legShapes('hindNear', 'coat');
  legShapes('foreNear', 'coat');

  return out;
}
