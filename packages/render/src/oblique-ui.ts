/**
 * ★**画面の座標系の UI**（ゲージ・順位・実況帯）— アートバイブル §9
 *
 * 【★守ること】
 *   ⚠️ ★**カメラの倍率も中心も一切使いません。** ここに `cam` を持ち込んだ瞬間、
 *      寄りの最中にゲージが動きます。**カメラが情報を隠せなくなる**のが §9 の狙いです。
 *
 * 【★ゲージについて（D-070 / D-072）】
 *   ⚠️ ★**この層で式を作りません。** エンジンの `staminaAt()` が出した
 *      **残量と減り方**を受け取って描くだけです。
 *      ★一度この層で近似を作って**符号が逆**になりました
 *        （残り200m で 余力と着順の順位相関 −0.653 ＝ **勝つ馬ほどバテて見えていた**）。
 *   ★`emptyAtMeter`（いつ尽きるか）は**受け取りません**。予言はさせません。
 */

import type { Ctx2D, FontOf, Palette, Viewport2D } from './oblique-draw.js';
import { inkOn } from './oblique-draw.js';

/** 実況の1行。★**馬名（馬番）だけ色を変える**（全部色を付けると主語が分からない） */
export interface CallPart {
  readonly text: string;
  /** 枠色の役割名。省略すると地の色 */
  readonly role?: string | undefined;
}

/**
 * ★**自馬のスタミナゲージ**（§12.6「自馬にのみ表示」）。
 *
 * @param left  ★エンジンの `staminaAt().left`（0 で止めた値）
 * @param initial ★発走時の残量（`StaminaGauge.initial`）
 * @param drainPerMeter ★エンジンの `staminaAt().drainPerMeter`
 */
export function drawGauge(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  label: string, left: number, initial: number, drainPerMeter: number,
): void {
  const ratio = Math.max(0, Math.min(1, left / Math.max(1e-6, initial)));
  const x = 40, y = vp.height - 70, w = 300, h = 18;
  ctx.fillStyle = 'rgba(16,20,16,0.72)';
  ctx.fillRect(x - 8, y - 26, w + 16, h + 42);
  ctx.fillStyle = pal['paper-0'] ?? '#fff';
  ctx.font = font(14, true);
  ctx.fillText(label, x, y - 10);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  /**
   * ★**色は「残量」ではなく「状態」で変える。**
   *   ⚠️ 数字だけだと、押す瞬間に読み取れません（C-6）。
   */
  ctx.fillStyle = ratio > 0.5
    ? (pal['frame-6'] ?? '#1a5')
    : ratio > 0.2 ? (pal['frame-5'] ?? '#fd2') : (pal['frame-3'] ?? '#d22');
  ctx.fillRect(x, y, Math.round(w * ratio), h);
  ctx.strokeStyle = pal['paper-0'] ?? '#fff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h); ctx.closePath();
  ctx.stroke();
  /**
   * ★**減り方**（D-070 の②）。
   *   ⚠️ ★「いつ尽きるか」は出しません（出すと状態ではなく**予言**になります）。
   *      **いまどれだけ速く減っているか**だけを、目盛りの本数で見せます。
   */
  const bars = Math.max(1, Math.min(5, Math.round((drainPerMeter * 100) / 1.2)));
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < bars ? (pal['paper-0'] ?? '#fff') : 'rgba(255,255,255,0.22)';
    ctx.fillRect(x + w + 8 + i * 7, y + h - 4 - i * 3, 5, 4 + i * 3);
  }
  ctx.fillStyle = pal['paper-0'] ?? '#fff';
  ctx.font = font(11);
  ctx.fillText('減り方', x + w + 8, y - 4);
}

/** 順位表示の1行 */
export interface StandingRow {
  readonly gate: number;
  /** 先頭との差（馬身）。★ゴール後は使いません */
  readonly lengths: number;
  /** ★ゴール後に出す走破タイム（秒）。無ければ差を出します */
  readonly timeSec?: number | undefined;
  readonly isOwn: boolean;
}

/**
 * ★順位表示。★色は枠、数字は個体（D-060）。
 *
 * ⚠️ ★**ゴールした馬は「確定着順」で渡してください。**
 *    画面上の距離で並べると、★**ゴール後は全馬が同じ位置に張り付き、
 *    「0.0 馬身」だらけで着順が読めません**（実際にそうなりました）。
 */
export function drawStandings(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  rows: readonly StandingRow[], fieldSize: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
): void {
  const shown = rows.slice(0, 5);
  const x = vp.width - 190, y = 24;
  ctx.fillStyle = 'rgba(16,20,16,0.72)';
  ctx.fillRect(x - 10, y - 18, 190, 5 * 22 + 16);
  shown.forEach((r, i) => {
    const yy = y + i * 22;
    ctx.fillStyle = pal['paper-0'] ?? '#fff';
    ctx.font = font(13, true);
    ctx.fillText(String(i + 1), x, yy);
    const role = frameRoleOf(r.gate, fieldSize);
    ctx.fillStyle = pal[role] ?? pal['paper-0'] ?? '#fff';
    ctx.fillRect(x + 18, yy - 11, 22, 14);
    ctx.fillStyle = inkOn(pal, role);
    ctx.font = font(11, true);
    ctx.textAlign = 'center';
    ctx.fillText(String(r.gate), x + 29, yy);
    ctx.textAlign = 'left';
    // ★自馬に印（自分がどこにいるか分からないと C-6 が成り立たない）
    if (r.isOwn) {
      ctx.fillStyle = pal['paper-0'] ?? '#fff';
      ctx.font = font(12, true);
      ctx.fillText('★', x + 46, yy);
    }
    ctx.fillStyle = pal['paper-0'] ?? '#fff';
    ctx.font = font(11);
    const text = r.timeSec !== undefined
      ? `${r.timeSec.toFixed(1)} 秒`
      : i === 0 ? '' : `${r.lengths.toFixed(1)} 馬身`;
    ctx.fillText(text, x + 66, yy);
  });
}

/**
 * ★**実況の帯**（裁定 Q-P4-14 ①「実況は『位置』ではなく『変化』を言う」）。
 *
 *   ⚠️ ★**下から積みます。** 新しい行が下に出て、古い行が上に流れます。
 *   ⚠️ ★**同じことを繰り返し言わせないでください。** 呼ぶ側で
 *      「状態が変わったときだけ足す」ようにします。一度、0.5秒ごとに機械的に足して
 *      ★**3行とも同じ文**になりました。
 */
export function drawCallBand(
  ctx: Ctx2D<never>, pal: Palette, vp: Viewport2D, font: FontOf,
  lines: readonly (readonly CallPart[])[],
): void {
  const x = 40, bottom = vp.height - 118;
  const shown = lines.slice(-3);
  shown.forEach((ln, i) => {
    const yy = bottom - (shown.length - 1 - i) * 22;
    const alpha = 0.35 + 0.25 * i;
    ctx.fillStyle = `rgba(16,20,16,${alpha.toFixed(2)})`;
    ctx.fillRect(x - 8, yy - 15, 520, 20);
    let cx = x;
    for (const part of ln) {
      ctx.fillStyle = part.role === undefined
        ? (pal['paper-0'] ?? '#fff') : (pal[part.role] ?? pal['paper-0'] ?? '#fff');
      ctx.font = font(14, part.role !== undefined);
      ctx.fillText(part.text, cx, yy);
      cx += ctx.measureText(part.text).width;
    }
  });
}
