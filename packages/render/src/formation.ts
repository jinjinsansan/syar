/**
 * ★隊列の生成（Layer A・純粋関数）— **道中を「結果」ではなく「脚質」から作る**
 *
 * 【なぜ要るか — レビュー側裁定 2026-08-15（Q-P4-38）】
 *   > 漏洩の正体は「**道中の順位＝最終着順**」なので、乱数で順位を動かす以外に隠す手がなかった。
 *   > どの振幅でも両立しないのは当然で、**同じつまみで反対向きのことをさせていた**。
 *   ```
 *   いま:  位置(t) = f(走破タイム, 脚質, ペース)   ← ★逆算できる＝漏れる
 *   是正:  位置(t) = g(脚質, ペース, t) → 終盤にかけて真の着順へ収束
 *   ```
 *
 *   ★これで3つ同時に片付きます:
 *     ① 漏れない … 序盤の位置は**脚質しか語らず**、脚質は出走表に既にある
 *     ② 読める  … 乱数の揺れと違い `1-1-1-1` や `12-12-8-3` という**競馬の形**になる
 *     ③ V-16 ④ … 序盤は出走表と同等・終盤は真の順位 → ★**AUC が上がるのが既定**になる
 *
 *   ★**D-062（時間配分）・D-063（jostle）・そして今回 — 回避策が3つとも、
 *     根の修正で不要になっています**（レビュー側の言葉）。
 *
 * 【★この層の約束】
 *   純粋関数です。副作用も乱数も時刻もありません。**着順を決めません。**
 */

/**
 * ★走路の幅 [m]。`ovalCourse` の既定と揃えます。
 *   ⚠️ 2か所で持つと必ず離れるので、**ここが1か所**です。
 */
export const TRACK_WIDTH_M = 25;

/** ⚠️ `@star/sim-engine` に依存しないよう、ここで定義します（`sim-engine` と同じ並び） */
export type FormStrategy = 'nige' | 'senko' | 'sashi' | 'oikomi';
export type FormPace = 'slow' | 'middle' | 'high';

/**
 * ★脚質ごとの**隊列内の位置**（0 = 先頭寄り／1 = 後方寄り）。
 *
 *   ⚠️ ここに走破タイムは一切入りません。★**これが「漏れない」ということです。**
 */
const SLOT: Record<FormStrategy, number> = {
  nige: 0.06,
  senko: 0.30,
  sashi: 0.66,
  oikomi: 0.90,
};

/** 決定的な小さいばらつき（同じ脚質が重ならないように）。★`Math.random()` は呼びません */
function stream(seed: number, gate: number): number {
  let h = (seed ^ (gate * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

/**
 * ★馬ごとの隊列スロット（0〜1）。**レース中ずっと変わりません。**
 *   → 通過順位が `1-1-1-1` のように**揃います**（実際の競馬の形）。
 */
export function slotOf(strategy: FormStrategy, gate: number, seed: number): number {
  const jitter = (stream(seed, gate) - 0.5) * 0.12;
  return Math.max(0.02, Math.min(0.98, SLOT[strategy] + jitter));
}

/** ペースで隊列の伸び方が変わる（速いと縦長・遅いと詰まる） */
const PACE_MUL: Record<FormPace, number> = { slow: 0.78, middle: 1, high: 1.25 };

/**
 * ★**隊列の広がり [m]**（先頭から最後方まで）。
 *   道中は 24m（＝10馬身。中継の解説「10馬身くらいで一団」）、
 *   勝負所から徐々に伸びます。
 */
export function packSpreadM(metersLeft: number, pace: FormPace = 'middle'): number {
  const t = Math.max(0, Math.min(1, (800 - metersLeft) / 800));
  const spread = 24 + t * t * 26;   // 24m → 50m
  return spread * PACE_MUL[pace];
}

/**
 * ★**収束の重み**（1 = 脚質だけ／0 = 真の位置だけ）。
 *
 *   ⚠️ ★**ゴールでは必ず 0** でなければいけません（D-059: 着順は厳密に一致）。
 *      残り 200m で 0 になるようにし、そこから先は**そのまま真実**です。
 */
export function convergeAt(metersLeft: number): number {
  const t = Math.max(0, Math.min(1, (metersLeft - CONVERGE_END_M) / (CONVERGE_START_M - CONVERGE_END_M)));
  return t * t * (3 - 2 * t);
}

/**
 * ★**収束が始まる残り距離**。
 *
 *   ⚠️ 最初は**勝負所の入口（残り800m）**から始めました。すると
 *      ★**その瞬間はまだ純粋な隊列**なので、V-16 ② を「勝負所以降」で測ると
 *      **入口の1点だけで落ちます**（実測 800m で 0.680 対 0.732）。
 *
 *   → ★**3角（残り1000m）から**にしました。**これは通すための調整ではありません**:
 *     オーナー指示にも「★**3角 いよいよ仕掛ける騎手が動き始める**」とあり、
 *     実際の競馬でも**仕掛けは勝負所の入口より前から**始まります。
 */
export const CONVERGE_START_M = 1000;
/** ★ここから先は**真実そのもの**（D-059: 着順は厳密に一致） */
export const CONVERGE_END_M = 200;

/**
 * ★★**横位置 `w` は、この層では作りません**（D-071・2026-08-16）
 *
 *   > `w` は着順に効く（D-065）以上、★**レースの結果の一部**であり、描画層が引くのは責務が逆。
 *   > ★**2か所で引けば必ず離れる。**
 *   > ★**Provably Fair の観点でも、結果に効くものはシードから結果を作る鎖の中に無ければならない。**
 *
 * → ★**`@star/race-engine` の `laneAt` が引きます。** この層は `laneOf` で**受け取るだけ**です。
 *   ⚠️ ここに `w` の生成器を戻してはいけません。
 */
