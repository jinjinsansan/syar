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
  /**
   * ★**コーナーごとの半径 [m]**（★`[1角, 2角, 3角, 4角]`・★2026-08-31・段階①「器」）。
   *
   * ⚠️ ★**省くと従来どおり**（1 周と直線から 4 本とも同じ半径を導く）。★省いたときの値は
   *    ★**2026-08-31 以前と 1 ビットも変わりません**（`lane-geometry.test.ts` が固定）。
   *
   * ★**なぜ要るか**: ★いまの模型は ★**コーナー 4 本が同一半径の楕円**しか作れません。
   *   ★10 場を作っても違うのは「大きさ」だけでした（`tools/_terrain.mjs`）。
   *   ★スパイラルカーブ・下りの 3〜4 角といった**型**は、★半径を独立に持てないと出せません。
   *
   * ⚠️ ★**1 周との整合を要求します**（★黙って辻褄を合わせません・R-27）:
   *      `lapM === homeStretchM * 2 + (π/2) * Σ半径`
   *    ★コーナーは 90 度なので、★半径を決めると長さも決まります。★食い違えば**投げます**。
   *    → ★数を作るときは `ovalSpecFromCornerRadii()` を使ってください。
   *
   * ⚠️ ★**勾配（段階②）はここに入れません**（正典 **D-092**）。
   */
  readonly cornerRadiiM?: readonly [number, number, number, number];
}

/**
 * ★**コーナーごとの半径から走路の形を作る**（★`lapM` を導出します）。
 *   ★`cornerRadiiM` を手で書くときは**必ずこれを通すこと** — ★1 周を手計算しないため。
 */
export function ovalSpecFromCornerRadii(
  homeStretchM: number, cornerRadiiM: readonly [number, number, number, number], widthM: number,
): OvalSpec {
  for (const r of cornerRadiiM) {
    if (!(r > 0)) throw new Error(`コーナーの半径は正の数であること: ${JSON.stringify(cornerRadiiM)}`);
  }
  const lapM = homeStretchM * 2 + (Math.PI / 2) * cornerRadiiM.reduce((a, b) => a + b, 0);
  return { lapM, homeStretchM, widthM, cornerRadiiM };
}

/**
 * ★**走路の 4 つのコーナー**（★`[1角, 2角, 3角, 4角]` の半径と長さ）。
 *
 * ⚠️ ★`@star/render` の `course.ts` に**同じ規則**があります（★あちらは依存ゼロなので引けません・§14）。
 *    ★`packages/race-engine/test/lane-geometry.test.ts` が **44 通り**で突き合わせます（R-33）。
 */
export function ovalCornerPlan(spec: OvalSpec): {
  readonly radii: readonly [number, number, number, number];
  readonly lengths: readonly [number, number, number, number];
} {
  const quarter = Math.PI / 2;
  if (spec.cornerRadiiM === undefined) {
    const bendTotal = spec.lapM - spec.homeStretchM * 2;
    const radius = bendTotal / (2 * Math.PI);
    const len = bendTotal / 4;
    return { radii: [radius, radius, radius, radius], lengths: [len, len, len, len] };
  }
  const radii = spec.cornerRadiiM;
  const derived = spec.homeStretchM * 2 + quarter * radii.reduce((a, b) => a + b, 0);
  if (Math.abs(derived - spec.lapM) > 1e-6 * Math.max(1, spec.lapM)) {
    throw new Error(
      `1 周とコーナーの半径が食い違っています: lapM=${spec.lapM} / 半径から導くと ${derived.toFixed(6)}`
      + '（★ovalSpecFromCornerRadii() で作ってください）',
    );
  }
  return { radii, lengths: [quarter * radii[0], quarter * radii[1], quarter * radii[2], quarter * radii[3]] };
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
  /**
   * ⚠️ ★**ゴールから逆向き**に積みます。★だから並びは 直線 → 4角 → 3角 → 向正面 → 2角 → 1角 です
   *    （`ovalCornerPlan` は `[1角, 2角, 3角, 4角]` の順なので、★ここで**添字を逆に読みます**）。
   */
  const plan = ovalCornerPlan(spec);
  const c = (i: number): Seg => ({ corner: true, length: plan.lengths[i]!, radius: plan.radii[i]! });
  const ring: readonly Seg[] = [
    { corner: false, length: spec.homeStretchM, radius: 0 },
    c(3),   // ★4角
    c(2),   // ★3角
    { corner: false, length: spec.homeStretchM, radius: 0 },
    c(1),   // ★2角
    c(0),   // ★1角
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
/**
 * ★シード由来の広がりが**出はじめる**進行率。発走直後は枠の広がりが残っているので、
 *   そこに重ねない。0.03 ＝ 1600m で 48m 地点。
 */
export const REVEAL_START_RUN = 0.03;
/**
 * ★シード由来の広がりが**出そろう**進行率。**この値が本番の唯一の値**です。
 *
 *   1.0 ＝ 2026-08-21 以前の挙動（ゴール直前でようやく出そろう）。実測すると
 *   **中盤（発走 180m〜900m）の 12 頭の横の広がりが 1.1〜3.4m** しかなく、
 *   走路 20m のうち数 m に固まって見えていました（★オーナー評「ぴょんぴょん跳ねているだけ」）。
 *   合格した 2 区間は発走直後 11.3m（枠の広がりの名残）と直線 9.2m（swing）です。
 *
 *   ★値は `npx tsx tools/sweep-lane-reveal.mjs` の掃引で決めること。
 *     **先に値を決めて後から正当化しない**（レビュー側裁定 2026-08-21）。
 */
/**
 * ★**この値は差し戻しません**（★2026-08-28 に是正。裁定 `REVIEW_LANE_GATES_VERDICT_20260821.md` §6）。
 *
 * ⚠️ ★以前ここには「**帯を出たら 0.35 / 0.50 / 0.70 に落とすか 1.0 へ戻す**」と書いてありました。
 *    ★**同じ日に出た裁定がそれを否定しています**:
 *
 *      > **V-17 が外れても、それは 0.18 を否定する理由になりません。写像を直せば済みます。**
 *
 *    ★つまり 0.18 が差し戻される筋は**裁定上すでに閉じて**おり、
 *    帯を出た場合は**写像（`TIME_GAP_SHAPE_GAMMA` / D-064）で吸収**します。
 *
 * ⚠️ ★**コメントが裁定より悲観的なまま残っているのは事故のもと**です（R-25 と同型）。
 *    将来のセッションがこれを読んで 0.18 を差し戻すと、
 *    ★**そのとき組んだカメラ設計ごと崩れます**（この値は「中盤の広がり 2.13m→8.19m」を作っており、
 *    序盤の画角の前提そのものです）。→ 裁定 `REVIEW_P4_CUT_SEAM_VERDICT_20260827.md` §3 の指示で是正。
 *
 * 【測定の状態】掃引（下見）では 枠×ロス相関 0.013→0.011（悪化なし）／中盤の広がり 2.13m→8.19m。
 *   距離ロスのばらつきが +74% 増えるため V-4・V-17 は動きます。
 *   ★**縮小条件での V-17 測定は P4 クローズの全量実行に含めます**（この変更専用の実行は不要・裁定 §3）。
 *
 * ⚠️ 【★2026-08-31・この値の役割が変わりました】
 *   ★上の説明は ★**`LANE_MODEL` が入る前のもの**です。★いまこの値が決めているのは
 *   ★**通り道まわりの揺らぎ（`wobbleM`）の出方だけ**で、★**中盤の広がりは `LANE_MODEL.homeSpreadM` が作ります。**
 *
 *   ⚠️ ★**そして「2.13m→8.19m」は、苦情を直していませんでした。** ★実測すると、
 *   ★reveal を 1.00 / 0.50 / 0.30 / 0.18 と振っても ★**内ラチに重なる頭数は 6.2 頭のまま**で、
 *   ★動いていたのは「最外 − 最内」という**指標だけ**でした（`tools/_clumpreveal.mjs`）。
 *   ★あの指標は「隊列の広がり」ではなく ★**「いちばん外を回った 1 頭までの距離」**だったためです。
 *   → ★オーナー評（2026-08-31）「★**正しくないです　こんな競馬は在りません**」。
 *   → ★**直したのは `LANE_MODEL` のほう**です。★この値は差し戻しの対象ではありません。
 */
export const LANE_REVEAL_FULL_RUN = 0.18;

/**
 * ★**走る場所の作り方**（★比較用・2026-08-31）。
 *
 * ★`homeSpreadM` … ★通り道が散る幅 [m]。★内ほど混むよう `u²` で偏らせます
 *   （★実際の競馬でも内が混み、外はまばら）。
 * ★`wobbleM`     … ★通り道の**両側**への揺らぎ [m]。★片側だけに伸びないこと。
 *
 * ★**本番は下の `LANE_MODEL`（＝ `LANE_MODELS.b`）です**（★2026-08-31 にオーナーが実画面で選択）。
 *   ★`laneAt` / `laneExtraM` に渡さなければそれが使われます。
 */
export interface LaneModel {
  readonly homeSpreadM: number;
  readonly wobbleM: number;
  /**
   * ★**旧形を使う**（★全馬が `RAIL_W` を目指し、★`Math.max(0, …)` で外へしか振れない）。
   * ⚠️ ★**本番では使いません。** ★比較（`?lane=old`）と変異試験のためだけに残します。
   * ★この形は実測で 12 頭中 6.2 頭が `RAIL_W` に小数以下まで同じ位置に積みます。
   */
  readonly legacy?: boolean;
}

/** ★候補（`tools/_lanecand.mjs` の B / C / D）。★`?lane=` で実画面に出して選びました */
export const LANE_MODELS: Readonly<Record<string, LaneModel>> = {
  b: { homeSpreadM: 7.0, wobbleM: 0.9 },
  c: { homeSpreadM: 10.0, wobbleM: 0.9 },
  d: { homeSpreadM: 4.5, wobbleM: 0.7 },
};

/**
 * ★**本番の走る場所の作り方**（★2026-08-31・オーナーが実画面で B を選択）。
 *
 * ⚠️ ★**これは着順に効きます**（憲法 3・D-065 / D-071）。★レビュー側の裁定対象です。
 *
 * 【★なぜ変えたか】★オーナー評（2026-08-31）:
 *   > ★**正しくないです　こんな競馬は在りません**
 *
 *   ★旧の形は `home = RAIL_W`（★全馬が同じ場所を目指す）＋ `Math.max(0, …)`（★外へしか振れない）で、
 *   ★実測 ★**12 頭中 6.2 頭が `RAIL_W` に小数以下まで同じ位置**に積まれ、
 *   ★2〜3 頭だけが **9〜13 頭分外**を回っていました。
 *
 * ⚠️ 【★2026-08-21 の直しは、この苦情に触れていませんでした】
 *   ★あのとき動かしたのは `LANE_REVEAL_FULL_RUN`（1.0 → 0.18）で、
 *   ★見ていた指標は「最外 − 最内」でした。★実測すると reveal を 1.00/0.50/0.30/0.18 と振っても
 *   ★**重なりは 6.2 頭のまま**で、★指標だけが 3.95m → 9.78m に動いていました（R-16 の家族）。
 *   → ★**指標が「隊列の広がり」ではなく「いちばん外を回った 1 頭までの距離」だった**ためです。
 *
 * 【★選び方】★`tools/_lanecand.mjs` で 4 案を 200 シード × 中盤 6 地点で測り、
 *   ★`?lane=b|c|d` で**実画面のコマ**をオーナーに見ていただいて決めました（R-30）。
 *   ★実測（中盤の平均）: ★重なり 5.14 頭 → **0 頭** ／ 最外 9.0 → **5.2 頭分**
 *   ★枠順との相関は +0.0056 → −0.0055（★どちらも許容 0.10 の内側・枠順ゲーム化しない）
 */
export const LANE_MODEL: LaneModel = LANE_MODELS.b!;

/**
 * ★**旧形**（★全馬が `RAIL_W` を目指し、★外へしか振れない）。
 * ⚠️ ★**本番では使いません。** ★比較と変異試験のためだけに残します
 *   （`?lane=old` で実画面に出せます）。
 */
export const LANE_MODEL_LEGACY: LaneModel = { homeSpreadM: 0, wobbleM: 0, legacy: true };

export function laneAt(
  gate: number, fieldSize: number, metersLeft: number, distanceMeter: number,
  seed: number, widthM = TRACK_WIDTH_M,
  /**
   * ★**掃引の道具からだけ渡します。** 本番は既定値（`LANE_REVEAL_FULL_RUN`）のみ。
   *   ここを呼び出し側ごとに変えると**同じレースが別の結果になります**（憲法 4・決定論）。
   */
  revealFullRun: number = LANE_REVEAL_FULL_RUN,
  /**
   * ★**走路の形**（1周・直線）。★`swingScale` が「距離で割り戻す」ために要ります。
   *
   * ⚠️ ★**2026-08-30 以前、ここは `DEFAULT_OVAL` 固定でした。**
   *    ★`swingScale` は spec を引数に取る設計なのに、★`laneAt` の署名に spec が無く、
   *    ★`laneExtraM(spec)` が **venue の走路で積分するのに、積分される `w` は 1周2000m 前提**
   *    という形になっていました。★競馬場ごとのずれは実測 **0.872〜1.490 倍**
   *    （`tools/_lanespecgap.mjs`）。→ ★`swingScale` が担うはずの「距離によらずおおむね一定」が
   *    ★**競馬場ごとに効いていませんでした**（天河 2000m 7.10 馬身 / 2500m 13.00 馬身）。
   *
   * ★**既定は `DEFAULT_OVAL`** なので、★spec を渡さない呼び出しは**いままでと 1 ビットも変わりません**
   *   （`race.ts` も `page.tsx` も渡していません）。★競馬場ごとの形を通すのは B案 ②。
   */
  spec: OvalSpec = DEFAULT_OVAL,
  /**
   * ★**走る場所の作り方**（★2026-08-31・比較のための切替口。★既定は現行のまま）。
   *
   * ⚠️ ★オーナー評（2026-08-31）:「★**正しくないです　こんな競馬は在りません**」。
   *    ★実測すると、★**12 頭中およそ 6 頭が `RAIL_W` に小数以下まで同じ位置**で重なり、
   *    ★2〜3 頭だけが **9〜13 頭分外**を回っていました。★下の `Math.max(0, …)` が原因です
   *    （★swing は 0 以上にしかならないので、★drift が負の馬は必ず `RAIL_W` ちょうどに積まれる）。
   *
   * ⚠️ ★**2026-08-21 の直し（reveal 1.0 → 0.18）はここに触れていません。**
   *    ★実測: reveal を 1.00 / 0.50 / 0.30 / 0.18 と振っても、
   *    ★**重なりは 6.2 頭のまま**で、「最外 − 最内」だけが 3.95m → 9.78m に動いていました。
   *    ★**指標だけを動かした**形です（R-16 の家族）。
   *
   * ★`undefined` = 現行（★本番の既定）。★値を渡すと「各馬が自分の通り道を持つ」形になります。
   *   ⚠️ ★通り道は**シードから引き、枠に依存させません**（D-069 / D-073）。
   * ★選定は `tools/_lanecand.mjs` と実画面のコマで行い、★決まるまで既定は変えません。
   */
  laneModel: LaneModel = LANE_MODEL,
): number {
  return laneAtWithSwing(gate, fieldSize, metersLeft, distanceMeter, seed, widthM, revealFullRun, laneModel,
    swingScale(distanceMeter, { ...spec, widthM }));
}

/**
 * ★**`laneAt` の本体**（★ES 便 ES-2・2026-09-15・回答 `REVIEW_QUESTIONS_ENGINE_LANE_SPEED_ANSWER_20260915.md` §Q-2）。
 *
 * ★`swingScale` は ★**距離と走路の形だけ**で決まり、★刻みごとに変わりません。★以前は刻みごとに 2 回、
 *   ★そのたびに区間を 2 回作り直していました（★1 レースで数万回・★D-071 の後の遅さの本体）。
 *   → ★呼び出し側が 1 回計算して `swing` として渡します。
 * ⚠️ ★**`laneAt` と `laneExtraM` はこの関数だけを通します**（★式を 2 か所に書かない・R-30）。
 * ⚠️ ★**掛ける順番は変えていません。** ★`swingScale(...)` の呼び出しを、★同じ値の変数 `swing` に置き換えただけです
 *    （★`wobbleM * swing` を先に掛けて持つ等は ★順番が変わるので不可・回答 §Q-2 条件 3）。
 */
function laneAtWithSwing(
  gate: number, fieldSize: number, metersLeft: number, distanceMeter: number,
  seed: number, widthM: number, revealFullRun: number, laneModel: LaneModel,
  /** ★`swingScale(distanceMeter, spec)`（★1 レース 1 回） */
  swing: number,
): number {
  return laneAtOnHorse(laneHorseOf(gate, fieldSize, seed, widthM, laneModel, swing),
    metersLeft, distanceMeter, widthM, revealFullRun, laneModel, swing);
}

/**
 * ★**馬ごとに一定の値**（★ES 便 ES-3・2026-09-15・回答 §Q-2「1 頭 1 回」）。
 *   ★発走時の位置・落ち着き先・外への振れ・位相は ★**枠・頭数・シード・幅・走り方・swing だけ**で決まり、★刻みを引数に取りません。
 *   ★以前は刻みごとに作り直していました（★`laneAtStart` と `stream` 3 本・★1 頭で数百回）。
 * ⚠️ ★式は ★元の `laneAt` の本体から ★**そのまま移した**だけです（★`home` の掛ける順番も同じ・§Q-2 条件 3）。
 */
export interface LaneHorseConst {
  readonly start: number;
  readonly home: number;
  readonly drift: number;
  readonly phase: number;
}

function laneHorseOf(
  gate: number, fieldSize: number, seed: number, widthM: number, laneModel: LaneModel, swing: number,
): LaneHorseConst {
  const start = laneAtStart(gate, fieldSize, widthM);
  const home = laneModel.legacy === true
    ? RAIL_W
    : RAIL_W + laneModel.homeSpreadM
      * (() => { const u = stream(seed, gate, 0x51ed2701); return u * u; })()
      * swing;
  /** ★外を回されるか、内が空くか。シードから引き、進むほど開く */
  const drift = (stream(seed, gate, 0x1b873593) - 0.5) * 2;
  const phase = stream(seed, gate, 0x2f5c1d3b) * Math.PI * 2;
  return { start, home, drift, phase };
}

/**
 * ★**刻みごとの計算だけ**（★ES-3）。★馬ごとの値は `laneHorseOf`、★1 レースの値は `swing` で受け取ります。
 * ⚠️ ★`laneAt`（`laneAtWithSwing`）と `laneExtraM`（`laneExtraMOnPlan`）は ★**この関数だけ**を通します（★R-30）。
 */
function laneAtOnHorse(
  horse: LaneHorseConst, metersLeft: number, distanceMeter: number,
  widthM: number, revealFullRun: number, laneModel: LaneModel, swing: number,
): number {
  const { start, home, drift, phase } = horse;
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
  /**
   * ⚠️ ★`laneModel` を渡したときだけ、★**馬ごとに違う通り道**になります。
   *    ★`u²` で内寄りに偏らせます（★内が混み、外はまばら）。★枠には依存させません。
   */
  /**
   * ⚠️ ★**通り道の幅も距離で割り戻します**（`swingScale`）。
   *    ★割り戻さないと、★**コーナーが多い長距離ほど距離ロスが積み上がります**。
   *    ★実測（割り戻さない場合）: 1200m 7.3 馬身 / 1600m 8.1 / ★1★2000m 12.4 / ★2400m 15.7
   *    → ★V-18 ②（4〜12 馬身）を長距離で超えました。
   *    ★根拠は `swingScale` の註記と同じです — ★騎手はロスを避けようとするので、
   *    ★**長い距離ほど早く内に入れます**。
   * ★**1600m は基準距離なので 1.0** — ★オーナーが実画面で選んだ絵は変わりません。
   */
  const base = start + (home - start) * settled;

  const wave = Math.sin(phase + run * Math.PI * 3) * 0.3;
  /**
   * ★**シード由来の広がりが、どこで出そろうか**（`revealFullRun` で調整）。
   *
   *   ⚠️ ★**`base` / `SETTLE_M` は触りません。** 触ると「枠の広がり」を中盤まで
   *      引き延ばすことになり、上のコメントが記録しているとおり
   *      **枠順で決まるゲーム**（偏り 35.5 馬身／枠を 5% 残しただけで相関 0.127）に戻ります。
   *      動かしてよいのは**枠に対して単調でない一様乱数から作った `swing`** の出方だけです
   *      （レビュー側裁定 2026-08-21）。
   */
  const revealRun = Math.max(0, Math.min(1, (run - REVEAL_START_RUN) / Math.max(1e-6, revealFullRun - REVEAL_START_RUN)));
  const reveal = revealRun * revealRun * (3 - 2 * revealRun);
  /**
   * ⚠️ ★`Math.max(0, …)` が「重なり」の原因です（★swing は 0 以上にしかならない）。
   *    ★`laneModel` を渡した場合は ★**通り道の両側へ揺らす**ので、ここを通りません。
   */
  if (laneModel.legacy !== true) {
    const wob = Math.sin(phase + run * Math.PI * 3) * laneModel.wobbleM
      * reveal * swing;
    return Math.max(0.8, Math.min(widthM - 0.8, base + wob));
  }
  /** ★旧形の外への振れ（★ES-2 で引数 `swing` と名前がぶつかるので改名しただけ・★計算は同じ） */
  const legacySwing = Math.max(0, drift * 0.85 + wave) * reveal * (widthM * 0.62)
    * swing;

  return Math.max(0.8, Math.min(widthM - 0.8, base + legacySwing));
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
  /** ★掃引の道具からだけ渡します（`laneAt` と同じ理由）。本番は既定値のみ */
  revealFullRun: number = LANE_REVEAL_FULL_RUN,
  /** ★走る場所の作り方。★既定は本番の `LANE_MODEL`（`laneAt` と同じ） */
  laneModel: LaneModel = LANE_MODEL,
): number {
  return laneExtraMOnPlan(lanePlanOf(distance, spec), gate, fieldSize, seed, stepM, revealFullRun, laneModel);
}

/**
 * ★**1 レースで一定の値**（★区間と `swingScale`・★ES 便 ES-2・2026-09-15）。
 *   ★どちらも ★距離と走路の形だけで決まるので、★`resolveRace` は 1 レース 1 回だけ作り、★馬ごとに使い回します。
 * ⚠️ ★**走路の形を必ず含めて作ること**（★距離だけで作ると ★場の違いが消える・回答 §Q-3 変異 ①）。
 */
export interface LaneRacePlan {
  readonly distance: number;
  readonly spec: OvalSpec;
  readonly segs: ReturnType<typeof ovalSegments>;
  /** ★`swingScale(distance, spec)` */
  readonly swing: number;
  /**
   * ★**同じ和の分解の 1 レース分**（★既定の `stepM`・`revealFullRun`・`laneModel` で作ったもの・★ES-5）。
   *   ★省いた `plan`（★検査で手組みしたもの等）や、★既定でない引数で呼んだときは ★その場で作ります。
   */
  readonly sum?: LaneSumPlan;
}

export function lanePlanOf(distance: number, spec: OvalSpec = DEFAULT_OVAL): LaneRacePlan {
  const base = { distance, spec, segs: ovalSegments(distance, spec), swing: swingScale(distance, spec) };
  const sum = laneSumPlanOf(base, 10, LANE_REVEAL_FULL_RUN, LANE_MODEL);
  return sum === undefined ? base : { ...base, sum };
}

/**
 * ★**同じ和の分解**（★ES 便 ES-5・2026-09-16・回答 `REVIEW_ENGINE_LANE_SPEED_ES3_ANSWER_20260916.md` §2・§4）。
 *
 * ★コーナーの刻み `k` について `c_k = len_k ÷ R_k`・`θ_k = 3π·run_k`・`r_k = reveal_k` とすると、
 *   ★**端の clamp が掛からず、どの刻みでも隊列が落ち着いている（`settled = 1`）とき**:
 *
 *     laneExtraM = Σ_k (home + sin(φ + θ_k)·wobbleM·r_k·S − centre) · c_k
 *                = (home − centre) · ΣC  +  wobbleM · S · ( sin φ · A  +  cos φ · B )
 *
 *     ★1 レース 1 回:  ΣC = Σ c_k   A = Σ cos θ_k · r_k · c_k   B = Σ sin θ_k · r_k · c_k
 *     ★1 頭 1 回:      home（`laneHorseOf`）・φ
 *
 * ★刻みは 10m のまま・★**同じ和を並べ替えただけ**で、近似ではありません。★違いは浮動小数の足す順番による丸めだけです
 *   （★オーナー承認 F-1・2026-09-16: ★「丸めの差だけ（≤ 1×10⁻⁹ m・着順は完全一致）」）。
 * ⚠️ ★**前提が 1 つでも崩れたら、ループ（`laneExtraMOnPlanLoop`）で計算します**（★R-27: 分からないときは安全な側へ）:
 *    ① ★legacy の走り方 ② ★コーナーの刻みで `ranM < SETTLE_M`（★引き込み線 P-1 が無い形）③ ★その馬が端で止められうる
 * ⚠️ ★`run`・`reveal` は ★`laneAtOnHorse` と**同じ式・同じ順番**で作ります（★`metersLeft = distance − s` を経由する）。
 */
export interface LaneSumPlan {
  readonly stepM: number;
  readonly revealFullRun: number;
  readonly laneModel: LaneModel;
  /** ★Σ c_k */
  readonly sumC: number;
  /** ★Σ cos θ_k · r_k · c_k */
  readonly sumA: number;
  /** ★Σ sin θ_k · r_k · c_k */
  readonly sumB: number;
  /** ★コーナーの刻みでの `reveal` の最大（★端の判定に使う） */
  readonly maxReveal: number;
}

/** ★分解の 1 レース分。★前提 ①② が崩れる形なら `undefined`（＝ループへ） */
export function laneSumPlanOf(
  plan: Pick<LaneRacePlan, 'distance' | 'segs'>, stepM: number, revealFullRun: number, laneModel: LaneModel,
): LaneSumPlan | undefined {
  if (laneModel.legacy === true) return undefined;
  const { distance, segs } = plan;
  let sumC = 0;
  let sumA = 0;
  let sumB = 0;
  let maxReveal = 0;
  let acc = 0;
  for (const seg of segs) {
    if (seg.corner && seg.radius > 0) {
      for (let o = 0; o < seg.length; o += stepM) {
        const len = Math.min(stepM, seg.length - o);
        const s = acc + o + len / 2;
        /** ★ここから `laneAtOnHorse` と同じ式 */
        const metersLeft = distance - s;
        const ranM = Math.max(0, distance - metersLeft);
        const run = Math.max(0, Math.min(1, ranM / Math.max(1, distance)));
        const settle = Math.max(0, Math.min(1, ranM / SETTLE_M));
        /** ★前提 P-1: ★コーナーの刻みでは隊列が落ち着き切っていること */
        if (settle !== 1) return undefined;
        const revealRun = Math.max(0, Math.min(1, (run - REVEAL_START_RUN) / Math.max(1e-6, revealFullRun - REVEAL_START_RUN)));
        const reveal = revealRun * revealRun * (3 - 2 * revealRun);
        const theta = run * Math.PI * 3;
        const c = len / seg.radius;
        sumC += c;
        sumA += Math.cos(theta) * reveal * c;
        sumB += Math.sin(theta) * reveal * c;
        if (reveal > maxReveal) maxReveal = reveal;
      }
    }
    acc += seg.length;
  }
  return { stepM, revealFullRun, laneModel, sumC, sumA, sumB, maxReveal };
}

/**
 * ★**その馬を分解の式で計算してよいか**（★純粋関数・★状態を持たない・★検査はこれで経路を見ます）。
 *   ★端の判定は ★`|sin| ≤ 1` として保守的に: `home ∓ wobbleM·S·maxReveal` が ★`(0.8, widthM − 0.8)` の内側。
 */
export function laneExtraPathOf(
  plan: LaneRacePlan, gate: number, fieldSize: number, seed: number,
  stepM = 10,
  revealFullRun: number = LANE_REVEAL_FULL_RUN,
  laneModel: LaneModel = LANE_MODEL,
): 'sum' | 'loop' {
  return laneSumHorseOf(plan, gate, fieldSize, seed, stepM, revealFullRun, laneModel) === undefined ? 'loop' : 'sum';
}

function sumPlanFor(plan: LaneRacePlan, stepM: number, revealFullRun: number, laneModel: LaneModel): LaneSumPlan | undefined {
  const pre = plan.sum;
  if (pre !== undefined && pre.stepM === stepM && pre.revealFullRun === revealFullRun && pre.laneModel === laneModel) return pre;
  return laneSumPlanOf(plan, stepM, revealFullRun, laneModel);
}

function laneSumHorseOf(
  plan: LaneRacePlan, gate: number, fieldSize: number, seed: number,
  stepM: number, revealFullRun: number, laneModel: LaneModel,
): { readonly sum: LaneSumPlan; readonly horse: LaneHorseConst } | undefined {
  const sum = sumPlanFor(plan, stepM, revealFullRun, laneModel);
  if (sum === undefined) return undefined;
  const horse = laneHorseOf(gate, fieldSize, seed, plan.spec.widthM, laneModel, plan.swing);
  const reach = laneModel.wobbleM * plan.swing * sum.maxReveal;
  if (!(horse.home - reach > 0.8 && horse.home + reach < plan.spec.widthM - 0.8)) return undefined;
  return { sum, horse };
}

/**
 * ★`laneExtraM` の本体（★1 レース 1 回の値 `plan` を受け取る）。
 *   ★前提が成り立つ馬は分解の式、★成り立たない馬はループ（★ES-5）。
 */
export function laneExtraMOnPlan(
  plan: LaneRacePlan, gate: number, fieldSize: number, seed: number,
  stepM = 10,
  revealFullRun: number = LANE_REVEAL_FULL_RUN,
  laneModel: LaneModel = LANE_MODEL,
): number {
  const fast = laneSumHorseOf(plan, gate, fieldSize, seed, stepM, revealFullRun, laneModel);
  if (fast === undefined) return laneExtraMOnPlanLoop(plan, gate, fieldSize, seed, stepM, revealFullRun, laneModel);
  const { sum, horse } = fast;
  const centre = plan.spec.widthM / 2;
  return (horse.home - centre) * sum.sumC
    + laneModel.wobbleM * plan.swing * (Math.sin(horse.phase) * sum.sumA + Math.cos(horse.phase) * sum.sumB);
}

/**
 * ★**ループの経路**（★ES-3 の刻みの計算・★`884019c` と 1 ビットも同じ）。
 *   ★分解の式の**比較の基準**と、★前提が崩れたときの**縮退先**です。★式を書き換えないこと。
 */
export function laneExtraMOnPlanLoop(
  plan: LaneRacePlan, gate: number, fieldSize: number, seed: number,
  stepM = 10,
  revealFullRun: number = LANE_REVEAL_FULL_RUN,
  laneModel: LaneModel = LANE_MODEL,
): number {
  const { distance, spec, segs, swing } = plan;
  /** ★馬ごとに一定の値（★1 頭 1 回・★ES 便 ES-3） */
  const horse = laneHorseOf(gate, fieldSize, seed, spec.widthM, laneModel, swing);
  const centre = spec.widthM / 2;
  let extra = 0;
  let acc = 0;
  for (const seg of segs) {
    if (seg.corner && seg.radius > 0) {
      for (let o = 0; o < seg.length; o += stepM) {
        const len = Math.min(stepM, seg.length - o);
        const s = acc + o + len / 2;
        /**
         * ⚠️ ★**`spec` を最後まで渡します。** ★渡さないと、★venue の走路で積分するのに
         *    ★`w` だけ 1周2000m 前提、という形に戻ります（★2026-08-30 まで実際にそうでした）。
         *    ★いまは `spec` から作った `swing`（`plan`）を渡します（★ES-2）。
         */
        const w = laneAtOnHorse(horse, distance - s, distance, spec.widthM, revealFullRun, laneModel, swing);
        extra += (w - centre) * (len / seg.radius);
      }
    }
    acc += seg.length;
  }
  return extra;
}
