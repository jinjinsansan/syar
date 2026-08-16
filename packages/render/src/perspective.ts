/**
 * ★**透視投影**（据えたカメラから競馬場を見る）
 *
 * 【なぜ要るか】
 *   ⚠️ これまでの `obliqueProject` は**平行投影**でした。
 *      `w`（内外）に `depth` を掛けて縦にずらすだけなので、
 *      ★**奥も手前も同じ太さの帯**になり、板を並べた絵にしか見えませんでした。
 *   ★参考（2D の中継画）は**透視投影**です。ラチが遠近で収束し、
 *     反対側の走路とスタンドまで見えています。
 *
 * 【★なぜ背景を生成画に頼らないか】
 *   生成した絵は**カメラの諸元が分かりません**。分からないと
 *   ★**馬を走路の上に置けません**（数十cm ずれただけで宙に浮きます）。
 *   → ★**同じ投影で背景も馬も描きます。** そうすれば構造上ずれません。
 *     質感（芝目・観客）は、その上に載せます。
 *
 * 【★カメラは動きません】
 *   据えたカメラの前を馬群が通り抜けます（Q-P4-46 案C の裁定）。
 *   ⚠️ カメラを馬群と一緒に回すと、走路が水平のまま流れて
 *      **ランニングマシンに見えます**（裁定の言葉）。
 */

/** 世界座標（メートル）。★コースの平面が z=0、z は上向き */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PerspectiveCamera {
  /** カメラの位置（m） */
  readonly eye: Vec3;
  /** 見ている点（m） */
  readonly target: Vec3;
  /** 縦の画角（ラジアン） */
  readonly fovY: number;
  /** 画面の大きさ（px） */
  readonly width: number;
  readonly height: number;
}

export interface Projected {
  readonly x: number;
  readonly y: number;
  /** ★カメラからの距離（m）。負ならカメラの後ろ＝映りません */
  readonly depth: number;
  /** ★1m が画面で何 px か（この深さで）。スプライトの大きさはこれで決まります */
  readonly pxPerM: number;
}

interface Basis {
  readonly fwd: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly focal: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * ★カメラの基底。**毎回作り直すと重い**ので、1コマにつき1回作って使い回します。
 */
export function cameraBasis(cam: PerspectiveCamera): Basis {
  const fwd = norm(sub(cam.target, cam.eye));
  /**
   * ⚠️ ★真上・真下を向くと `up` と平行になり、基底が壊れます。
   *    競馬の画でそこまで見下ろすことは無いので、**起きたら止めます**
   *    （黙って変な絵を出すより、落ちたほうが安全です）。
   */
  const worldUp: Vec3 = { x: 0, y: 0, z: 1 };
  if (Math.abs(dot(fwd, worldUp)) > 0.995) {
    throw new Error('★カメラがほぼ真下（または真上）を向いています。基底が作れません');
  }
  const right = norm(cross(fwd, worldUp));
  const up = cross(right, fwd);
  const focal = (cam.height / 2) / Math.tan(cam.fovY / 2);
  return { fwd, right, up, focal };
}

/**
 * ★世界の点を画面に落とす。
 *
 *   ⚠️ `depth <= 0` は**カメラの後ろ**です。描かないでください
 *      （そのまま割ると、★**背後のものが画面の反対側に出ます**）。
 */
export function project(cam: PerspectiveCamera, basis: Basis, p: Vec3): Projected {
  const d = sub(p, cam.eye);
  const depth = dot(d, basis.fwd);
  const rx = dot(d, basis.right);
  const ry = dot(d, basis.up);
  const inv = depth === 0 ? 0 : basis.focal / depth;
  return {
    x: cam.width / 2 + rx * inv,
    y: cam.height / 2 - ry * inv,
    depth,
    pxPerM: inv,
  };
}

/**
 * ★**地平線の画面 y**。
 *   無限遠（水平方向）の点が来る高さです。空とスタンドの境目をここから決めます。
 *   ⚠️ 手で決めると、★**帯がスタンドを覆い隠します**（前に実際に起きました）。
 */
export function horizonY(cam: PerspectiveCamera, basis: Basis): number {
  // 進行方向の水平成分だけを見た無限遠
  const flat = norm({ x: basis.fwd.x, y: basis.fwd.y, z: 0 });
  const ry = dot(flat, basis.up);
  const depth = dot(flat, basis.fwd);
  return cam.height / 2 - (depth === 0 ? 0 : (ry / depth) * basis.focal);
}
