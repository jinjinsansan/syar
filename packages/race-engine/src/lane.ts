/**
 * ★横位置 `w` と距離ロス（D-071 / D-065）— **エンジンが引きます**
 *
 * 【なぜエンジンか】レビュー側裁定 2026-08-16:
 *   > `w` は着順に効く（D-065）以上、★**レースの結果の一部**であり、描画層が引くのは責務が逆。
 *   > ★**2か所で引けば必ず離れる**（jostle が判定0.06／製品0.25 で離れていたのと同じ形）。
 *   > ★**Provably Fair の観点でも、結果に効くものはシードから結果を作る鎖の中に無ければならない。**
 *
 * 【★脚質から作らない】D-069:
 *   脚質から作ると `w` も**出走表から予測でき**、V-16 ① が成立しません。
 *   → ★**シードから引き、レース中に段階的に開く**（＝「外を回された」）。
 *
 * 【★この層の約束】
 *   純粋関数です。`Math.random()` は呼びません。
 */

/** ★走路の幅 [m]。⚠️ `ovalCourse` の既定と**必ず同じ値**であること */
export const TRACK_WIDTH_M = 20;
/** ★落ち着き先（ラチ沿い）。どの馬もここを取りにいく */
export const RAIL_W = 2.2;
/** ★枠順の位置から落ち着くまでの距離 [m] */
export const SETTLE_M = 250;
/** 1馬身 [m] */
export const HORSE_LENGTH_M = 2.4;

/* ── ★コースの幾何（`ovalCourse` と同じ組み立て）───────────────
 *
 * ⚠️ ★`@star/render` の `ovalCourse` と**同じ規則**でなければいけません。
 *    描画層に依存できない（層の向きが逆）ので**ここに持ちます**が、
 *    ★**離れないよう、検査で `laneExtraMeters` と突き合わせます。**
 */
export interface OvalSpec {
  readonly lapM: number;
  readonly homeStretchM: number;
  readonly widthM: number;
}
export const DEFAULT_OVAL: OvalSpec = { lapM: 2000, homeStretchM: 400, widthM: TRACK_WIDTH_M };

interface Seg { readonly corner: boolean; readonly length: number; readonly radius: number }

/**
 * ★**発走から最初のコーナーまでの直線**（引き込み線）。
 *
 * ⚠️ ★**コーナーの途中から発走させると、外枠が発走直後に大きく外を回ります。** 実測:
 *      直線発走   1200m 枠とロスの相関 0.117 ／ 2400m 0.196
 *      ★コーナー発走 1600m ★0.437 ／ 2000m ★0.539
 *      → V-18 ①（枠順と着順の相関 ≤ 0.10）を超えます。
 *
 * ★**実際の競馬場が「コーナーの途中から発走させない」理由がこれ**です。
 *   発走から最初のコーナーまでに、★**隊列が落ち着くだけの直線**を置きます
 *   （だから `SETTLE_M` と同じ長さです）。
 */
export const RUN_UP_M = SETTLE_M;

/**
 * ★**発走から最初のコーナーまで、`RUN_UP_M` の直線を必ず確保する。**
 *
 * ⚠️ ★「先頭がコーナーのときだけ」では足りませんでした。実測:
 *      1200m は**発走が直線だが、最初のコーナーまで 200m しかない**
 *      （隊列が落ち着くのに `SETTLE_M = 250m` 要る）。
 *      → 外枠が**まだ外にいるままコーナーに入り**、枠順と着順の相関が
 *        0.072 → ★0.121 に上がりました（許容 0.10 を超える）。
 * → ★**足りないぶんだけ、次のコーナーの先頭側を直線に置き換えます。**
 */
function withRunUp(segs: readonly Seg[]): readonly Seg[] {
  const out: Seg[] = [];
  let straight = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (!seg.corner) { straight += seg.length; out.push(seg); continue; }
    const need = RUN_UP_M - straight;
    if (need <= 1e-9) { out.push(...segs.slice(i)); break; }
    const take = Math.min(seg.length, need);
    out.push({ corner: false, length: take, radius: 0 });
    straight += take;
    const rest = seg.length - take;
    if (rest > 1e-9) { out.push({ ...seg, length: rest }); out.push(...segs.slice(i + 1)); break; }
  }
  return out.length > 0 ? out : segs;
}

/** ★ゴールから逆向きに積み、反転する（`ovalCourse` と同じ） */
export function ovalSegments(distance: number, spec: OvalSpec = DEFAULT_OVAL): readonly Seg[] {
  const bendTotal = spec.lapM - spec.homeStretchM * 2;
  const radius = bendTotal / (2 * Math.PI);
  const cornerLen = bendTotal / 4;
  const ring: readonly Seg[] = [
    { corner: false, length: spec.homeStretchM, radius: 0 },
    { corner: true, length: cornerLen, radius },
    { corner: true, length: cornerLen, radius },
    { corner: false, length: spec.homeStretchM, radius: 0 },
    { corner: true, length: cornerLen, radius },
    { corner: true, length: cornerLen, radius },
  ];
  const backward: Seg[] = [];
  let left = distance;
  let i = 0;
  while (left > 1e-9) {
    const seg = ring[i % ring.length]!;
    const take = Math.min(seg.length, left);
    backward.push({ ...seg, length: take });
    left -= take;
    i += 1;
  }
  return withRunUp([...backward].reverse());
}

/**
 * ★**総旋回角**（そのレースでコーナーを何ラジアン曲がるか）。
 *   距離が伸びるほどコーナーが増えるので、これも増えます。
 */
function totalTurn(distance: number, spec: OvalSpec): number {
  let t = 0;
  for (const seg of ovalSegments(distance, spec)) {
    if (seg.corner && seg.radius > 0) t += seg.length / seg.radius;
  }
  return t;
}

/** ★基準の距離。ここでの旋回角を 1 とする（★外に出さない — 較正値ではなく基準点） */
const TURN_REF_M = 1600;

/**
 * ★**外へ膨らむ量を、距離で割り戻します。**
 *
 * ⚠️ 割り戻さないと、★**長距離ほど距離ロスが積み上がります**。実測:
 *      1200m 5.1馬身 / 1600m 10.2 / ★2000m 13.2 / ★2400m 13.1
 *      → **V-18 ②（4〜12馬身）を超えます。**
 *
 * ★**根拠は「通すため」ではありません。** 騎手はロスを避けようとするので、
 *   **長い距離ほど早く内に入れます**。★**外を回される総量は距離によらずおおむね一定**、
 *   というのが実際の競馬の姿です。
 */
function swingScale(distance: number, spec: OvalSpec): number {
  const t = totalTurn(distance, spec);
  if (t <= 0) return 1;
  return totalTurn(TURN_REF_M, spec) / t;
}

/** 決定的な 0〜1（★`Math.random()` を呼ばない） */
function stream(seed: number, gate: number, salt: number): number {
  let h = (seed ^ Math.imul(gate, 0x9e3779b1) ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

/** ★1房の幅 [m]。実際のゲートは 1頭あたり 1m 強 */
export const STALL_W_M = 1.15;

/**
 * ★枠順から決まる発走時の横位置（出走表で分かる部分）。
 *
 * ⚠️ ★**ゲートは走路の幅いっぱいではありません。**
 *    12頭なら 14m 程度で、**内側に寄せて置かれます**。
 *    幅いっぱい（1〜19m）に広げていたため、外枠が発走直後に
 *    ★**大きく外を回ることになり、枠順と着順の相関が上がっていました**
 *    （2000m は**ちょうど1周で発走が1角の途中**なので、最初の 250m が丸ごとコーナー）。
 */
export function laneAtStart(gate: number, fieldSize: number, widthM = TRACK_WIDTH_M): number {
  const span = Math.min(widthM - 2, fieldSize * STALL_W_M);
  const t = fieldSize <= 1 ? 0.5 : (gate - 0.5) / fieldSize;
  return 1 + t * span;
}

/**
 * ★**残り距離 `metersLeft` のときの横位置 `w`**（0 = 内ラチ）。
 *
 * ⚠️ ★**脚質を受け取りません**（D-069）。受け取ると出走表から予測できてしまいます。
 */
export function laneAt(
  gate: number, fieldSize: number, metersLeft: number, distanceMeter: number,
  seed: number, widthM = TRACK_WIDTH_M,
): number {
  const start = laneAtStart(gate, fieldSize, widthM);
  const ranM = Math.max(0, distanceMeter - metersLeft);
  const run = Math.max(0, Math.min(1, ranM / Math.max(1, distanceMeter)));

  /**
   * ★**発走後、みんな内へ寄ります。** ラチ沿いが最短なので、どの馬も取りにいく。
   *   ⚠️ 枠の位置に居続ける形にしたら、実測で
   *      ★**枠による偏り 35.5馬身＝枠順で決まるゲーム**になりました。
   */
  const settle = Math.max(0, Math.min(1, ranM / SETTLE_M));
  const settled = settle * settle * (3 - 2 * settle);
  /**
   * ★**落ち着き先は枠に依存させません。**
   *   ⚠️ 枠の 5% を残していたとき、外枠は**レース中ずっと 0.6m 外**を回り、
   *      1200m で **枠とロスの相関 0.127**（差は 2.5m ＝ 約1馬身しかないのに、
   *      ★**向きが揃っているので相関は出ます**）。
   *   ★どの馬もラチを取りにいきます。**取れるかどうかを決めるのはレース（シード）**であって、
   *     枠ではありません。
   */
  const home = RAIL_W;
  const base = start + (home - start) * settled;

  /** ★外を回されるか、内が空くか。シードから引き、進むほど開く */
  const drift = (stream(seed, gate, 0x1b873593) - 0.5) * 2;
  const phase = stream(seed, gate, 0x2f5c1d3b) * Math.PI * 2;
  const wave = Math.sin(phase + run * Math.PI * 3) * 0.3;
  const reveal = run * run * (3 - 2 * run);
  const swing = Math.max(0, drift * 0.85 + wave) * reveal * (widthM * 0.62)
    * swingScale(distanceMeter, { ...DEFAULT_OVAL, widthM });

  return Math.max(0.8, Math.min(widthM - 0.8, base + swing));
}

/**
 * ★**その馬が余計に走る距離 [m]**。
 *
 *   コーナーだけで `(w − 中心) × Δθ` を積みます（Δθ = 弧長 ÷ 半径）。
 *   ★内を通れば負（＝短く走る）、外を回れば正。
 */
export function laneExtraM(
  gate: number, fieldSize: number, distance: number, seed: number, spec: OvalSpec = DEFAULT_OVAL,
  stepM = 10,
): number {
  const segs = ovalSegments(distance, spec);
  const centre = spec.widthM / 2;
  let extra = 0;
  let acc = 0;
  for (const seg of segs) {
    if (seg.corner && seg.radius > 0) {
      for (let o = 0; o < seg.length; o += stepM) {
        const len = Math.min(stepM, seg.length - o);
        const s = acc + o + len / 2;
        const w = laneAt(gate, fieldSize, distance - s, distance, seed, spec.widthM);
        extra += (w - centre) * (len / seg.radius);
      }
    }
    acc += seg.length;
  }
  return extra;
}
