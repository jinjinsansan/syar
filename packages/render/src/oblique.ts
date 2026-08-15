/**
 * ★斜め俯瞰の投影（Layer A・純粋関数）
 *
 * 【なぜ要るか】
 *   ★真横（側面スクロール）は **内/外（D-065）を表示できません**。
 *     内/外は画面の奥行き方向にあり、真横からは見えないためです。
 *     ★**表示できない次元を「結果に効かせろ」と決めていた**状態でした。
 *   → レビュー側の裁定で **β（斜め俯瞰）** を採用。この層はその投影だけを持ちます。
 *
 * 【★この層の約束】
 *   **純粋関数**です。副作用も乱数も時刻もありません。**着順を決めません。**
 *   入力は `course.ts` の `posOf`（上から見た平面座標）だけです。
 *
 * 【★カメラは馬群と一緒に回ります】
 *   ⚠️ ワールドに固定したカメラでコーナーを撮ると、**馬の向きが変わる**ので
 *      **向きの数だけスプライトが要ります**（8方向×コマ数）。
 *   → ★**カメラを進行方向に合わせて回します**（中継のカメラがパンするのと同じ）。
 *     ・馬はいつも**同じ向き**（画面の右へ）に描ける = スプライトは1方向で足りる
 *     ・★**曲がるのは走路のほう**。コーナーではラチが画面の中で曲がって見えます
 *
 * 【★俯角】
 *   `depth` は「内外 1m が、進行方向 1m の何倍の画面距離になるか」です。
 *   ⚠️ **1.0 にすると真上（真俯瞰）**になり、**馬が馬に見えなくなります**（裁定）。
 *   `design/art/OBLIQUE_CONTRACT_20260815.md` の既定は **0.29**（≒ 俯角 17°）。
 */
import { posOf, type Course } from './course.js';

export interface ObliqueCamera {
  /** カメラが見ているコース上の位置 [m]（中心線上の距離） */
  readonly s: number;
  /** カメラが見ている内外 [m]（0 = 内ラチ） */
  readonly w: number;
  /** 進行方向 1m が画面で何 px か */
  readonly pxPerM: number;
  /**
   * ★内外方向の圧縮率（0 より大きく 1 以下）。
   *   1.0 = 真上から。★**小さいほど「横から」に近づきます。**
   */
  readonly depth: number;
  /** カメラ位置を画面のどこに置くか */
  readonly anchorX: number;
  readonly anchorY: number;
  /**
   * ★内側を画面の**上**にするか。
   *   コースの回り方向で内側の左右が変わるので、**呼び出し側では決めません**。
   */
  readonly innerUp?: boolean | undefined;
}

export interface ObliquePos {
  readonly x: number;
  readonly y: number;
  /**
   * ★カメラから見た進行方向のずれ [rad]。
   *   ⚠️ コーナーで前方の馬は**向きが違います**。0 に近いほどスプライトの向きと合います。
   *      **どこまで許すかは、絵ができてから決めます**（ここでは値を返すだけ）。
   */
  readonly headingOffset: number;
  /** カメラより前にいるか（＋が前） */
  readonly forwardM: number;
  /** カメラより外にいるか（＋が外） */
  readonly lateralM: number;
}

const TAU = Math.PI * 2;

/** −π 〜 π に畳む */
function wrap(a: number): number {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}

/**
 * ★コース上の (s, w) を、斜め俯瞰の画面座標にする。
 *
 * ★**コーナーの曲がりは、この関数から自然に出ます。**
 *   カメラ地点の進行方向を基準に回すので、円弧上の前後の点は
 *   `forward ≒ R·sin(Δ/R)` / `lateral ≒ ±R·(1−cos(Δ/R))` になり、
 *   **一定の `w` の線（＝ラチ）が画面の中で曲がります**。
 */
export function obliqueProject(course: Course, cam: ObliqueCamera, s: number, w: number): ObliquePos {
  const c = posOf(course, cam.s, cam.w);
  const ch = Math.cos(c.heading);
  const sh = Math.sin(c.heading);
  /** カメラ地点を原点に、進行方向を前・その左手を正にした横位置 */
  const lat = (px: number, py: number): number => -(px - c.x) * sh + (py - c.y) * ch;

  /**
   * ★**内側がどちらの手にあるかは、コースに聞きます。**
   *   ⚠️ 右回りと左回りで**内外の左右が入れ替わります**。
   *      決め打ちにしたら符号が逆になり、**外の馬が内より上**に出ました。
   */
  const innerRail = posOf(course, cam.s, 0);
  const outerRail = posOf(course, cam.s, course.widthM);
  const outward = lat(outerRail.x, outerRail.y) >= lat(innerRail.x, innerRail.y) ? 1 : -1;

  const p = posOf(course, s, w);
  const forwardM = (p.x - c.x) * ch + (p.y - c.y) * sh;
  const lateralM = lat(p.x, p.y) * outward;   // ★＋が外
  const up = cam.innerUp === false ? -1 : 1;
  return {
    x: cam.anchorX + forwardM * cam.pxPerM,
    y: cam.anchorY + lateralM * cam.pxPerM * cam.depth * up,
    headingOffset: wrap(p.heading - c.heading),
    forwardM,
    lateralM,
  };
}

/**
 * ★ラチ（`w` が一定の線）を、画面上の折れ線にする。
 *   ⚠️ **直線で引かないこと。** コーナーでは曲がるのが、この投影の要点です。
 */
export function railPolyline(
  course: Course,
  cam: ObliqueCamera,
  w: number,
  opts?: { readonly fromM?: number; readonly toM?: number; readonly stepM?: number },
): readonly { readonly x: number; readonly y: number }[] {
  const from = opts?.fromM ?? -60;
  const to = opts?.toM ?? 160;
  const step = opts?.stepM ?? 4;
  const out: { x: number; y: number }[] = [];
  for (let d = from; d <= to + 1e-9; d += step) {
    const s = Math.max(0, Math.min(course.distance, cam.s + d));
    const q = obliqueProject(course, cam, s, w);
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

/**
 * ★発走ゲートの房の位置。
 *
 * ★**真横では原理的に描けなかったもの**です（12房が前後に重なり、1頭しか見えない）。
 *   斜め俯瞰では**房が内外方向に並ぶ**ので、画面の y に散ります。
 */
export function gateStalls(
  course: Course,
  cam: ObliqueCamera,
  startS: number,
  stalls: number,
): readonly { readonly gate: number; readonly x: number; readonly y: number; readonly w: number }[] {
  const out: { gate: number; x: number; y: number; w: number }[] = [];
  // ★内ラチから 1m 空けて等間隔に並べる（実際の枠順も内から）
  const margin = 1;
  const span = Math.max(1, course.widthM - margin * 2);
  for (let i = 0; i < stalls; i++) {
    const w = margin + (span * (i + 0.5)) / stalls;
    const q = obliqueProject(course, cam, startS, w);
    out.push({ gate: i + 1, x: q.x, y: q.y, w });
  }
  return out;
}
