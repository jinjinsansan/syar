/**
 * ★**最後の直線の「攻防」を、表示位置だけで作る**（指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §4）
 *
 * 【★これは何で、何ではないか】
 *   ★**これはリプレイの映像文法です。レースの結果ではありません。**
 *     着順・確定タイム・着差ラベル・払戻・人気・DB に保存する値には**一切触れません**。
 *     ここが返すのは「**その瞬間、画面のどこに描くか**」だけです。
 *
 *   ⚠️ ★**エンジンの確定経路に入れてはいけません。** 呼ぶのは描画側だけです
 *      （`apps/web/src/app/race/page.tsx` と、同じ絵を測る道具）。
 *
 * 【なぜ要るか】
 *   オーナー要求は「直線で上位 4〜5 頭が並び、**進出・差し・差し返し・脱落が読める**」。
 *   ⚠️ ★カメラを引いて 4〜5 頭を画面に入れることは、この要求では**ありません**（指示書 §4-1）。
 *      要求は**前後関係が時間とともに変わること**です。
 *
 *   ★実測（`tools/audit-finish-contest.mjs`）では、ゴール時点で 4 頭以上が 2 馬身以内に
 *     収まるのは **40 本中 0 本**でした。★**在るものだけを映す方針では、この要求は満たせません。**
 *     指示書 §1 でその前提が**撤回**され、表示専用の演出が許可されました。
 *
 * 【★守っていること】
 *   ・残り `RELEASE_M`（60m）で**オフセットは完全に 0**。以後はエンジンの位置そのもの
 *     → ★ゴールの着順・着差は**演出の有無で 1 ビットも変わりません**
 *   ・先頭馬（その瞬間いちばん前にいる馬）は**動かしません**（`gap = 0` なので圧縮量が 0）
 *     → カメラの注視点と決勝線の通過は素直なまま
 *   ・`Date.now()` / `Math.random()` を使いません。seed と馬番と残り距離だけで決まります（憲法4）
 *   ・区間の継ぎ目はすべて**滑らかな関数**でつなぎます（1 コマの跳びを作らない）
 *   ・自馬を優遇しません。**確定着順で上位 5 頭に入った馬だけ**が主役群です
 */

/** ★主役群の頭数（指示書 §4-2「上位 5 頭」） */
export const CLIMAX_LEAD_COUNT = 5;
/**
 * ★**演出が始まる残り距離（m）**。ここより手前は完全に素通し。
 *
 * 【★320m から始めていたときの実害】
 *   ⚠️ ★実測（`tools/audit-climax-release.mjs`）で、残り 282〜290m の馬が
 *      ★**本来の 1.15〜1.33 倍**の速さに見えていました（＝ 15.6m/s が 20.8m/s に見える）。
 *      ★「進出」ではなく**早送り**の絵です。
 *   ★理由は戻し側とまったく同じで、掛ける距離 L に対して傾きが 1.5/L になるためです。
 *     12m を 60m（320→260）で掛ける → 0.30 ＝ **+30%**   ← 実測と一致
 *     12m を 140m（400→260）で掛ける → 0.13 ＝ **+13%**
 *
 * ⚠️ ★指示書 §4-2 の表は「320〜260m で主役群を集める」です。★**集め終わる地点（260m）は
 *    表のとおり**にして、★**掛け始めだけを 400m へ前倒し**しました（§10-10 に逸脱として記載）。
 *    ★400m はまだ `homestretch-side` のカットの中で、4 角のカットには掛かりません。
 */
export const CLIMAX_ENTER_M = 400;
/** ★演出が最大になる残り距離（m） */
export const CLIMAX_FULL_M = 260;
/**
 * ★**「寄せ」を戻し始める残り距離（m）**
 *
 * 【★100m から戻していたときの実害】
 *   ⚠️ ★実測（`tools/audit-climax-release.mjs`・4 seed）で、残り 78〜81m の馬が
 *      ★**本来の速さの 0.545〜0.632 倍（＝ −37〜−45%）**にしか見えていませんでした。
 *      ★競走馬が最後の 80m で 4 割減速して見えるのは「脱落」ではなく**故障**の絵です。
 *
 * 【★なぜそうなるか（式で決まっています）】
 *   オフセットは `env(残り) × 生の量` です。`env` を長さ L で 0 へ落とすとき、
 *   その傾きは最大 **1.5 / L**（smoothstep の性質）。見かけの速度のずれは
 *   ★**（生の量）× 1.5 / L** になります。
 *     生の量 12m・L = 40m → 0.45  ＝ **−45%**   ← 実測と一致
 *     生の量 12m・L = 160m → 0.11 ＝ **−11%**
 *   ★つまり「戻す距離を長く取る」以外に、この絵を直す方法はありません。
 *
 * ★L = 160m（220m → 60m）を採りました。0 になる地点（60m）は動かしていません
 *   （指示書 §1「残り 40〜60m までに 0 へ戻す」）。
 */
export const CLIMAX_RELEASE_START_M = 220;
/** ★★ここでオフセットは 0。以後はエンジンの位置そのもの */
export const CLIMAX_RELEASE_M = 60;
/** ★先頭との差をどれだけ詰めて見せるか（0 = 素通し / 1 = 完全に横一線） */
export const CLIMAX_COMPRESS = 0.55;
/** ★「寄せ」で 1 頭に加えてよい上限（m）。青天井にしない */
export const CLIMAX_MAX_OFFSET_M = 12;
/**
 * ★**役どころの波だけは、もっと後まで効かせます**（指示書 §4-2 の 180〜100m の行）
 *
 *   ⚠️ ★「寄せ」と「役どころの波」を同じ `env` で切ると、
 *      ★**差し・差し返しが残り 150m あたりで消えてしまいます**（要求は 180〜100m）。
 *   ★波の大きさは高々 `ROLES` の `amp`（≈3.7m）なので、
 *     40m で戻しても見かけのずれは 3.7 × 1.5 / 40 ＝ **14%** に収まります。
 *     ★12m の「寄せ」と違って、こちらは短く戻しても絵が壊れません。
 */
export const CLIMAX_SURGE_RELEASE_START_M = 100;

/** 3 次の滑らかな段（両端で傾きが 0 なので、継ぎ目で跳ばない） */
function smoothstep(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * ★**演出の効き具合**（0〜1）。残り距離だけで決まります。
 *
 * @param releaseStartM 戻し始める残り距離。既定は「寄せ」用（`CLIMAX_RELEASE_START_M`）
 *
 *   残り 320m より手前 … 0（素通し）
 *   320 → 260m         … 0 → 1（主役群を寄せ始める）
 *   260 → 戻し始め     … 1（攻防）
 *   戻し始め → 60m     … 1 → 0（本来の位置へ戻す）
 *   ★60m 以下          … 0（★確定着順・確定着差でゴール）
 */
export function climaxEnvelope(
  remainingM: number, releaseStartM: number = CLIMAX_RELEASE_START_M,
): number {
  if (!Number.isFinite(remainingM)) return 0;
  if (remainingM >= CLIMAX_ENTER_M) return 0;
  if (remainingM >= CLIMAX_FULL_M) {
    /**
     * ★立ち上がりの間も、戻しが先に始まっていることがあります（寄せは 220m から戻すため）。
     *   ★両方を掛け合わせて、★**継ぎ目を作らない**ようにします。
     */
    return smoothstep((CLIMAX_ENTER_M - remainingM) / (CLIMAX_ENTER_M - CLIMAX_FULL_M))
      * releaseFactor(remainingM, releaseStartM);
  }
  return releaseFactor(remainingM, releaseStartM);
}

/** ★戻しの部分だけ（1 → 0） */
function releaseFactor(remainingM: number, releaseStartM: number): number {
  if (remainingM >= releaseStartM) return 1;
  if (remainingM >= CLIMAX_RELEASE_M) {
    return smoothstep((remainingM - CLIMAX_RELEASE_M) / (releaseStartM - CLIMAX_RELEASE_M));
  }
  return 0;
}

/**
 * ★**山型の波**（中心 `centerM`・幅 `widthM`）。両端で値も傾きも 0 になります。
 *   これを足し引きして「進出」「脱落」「差し返し」を作ります。
 */
function bump(remainingM: number, centerM: number, widthM: number): number {
  const d = Math.abs(remainingM - centerM);
  if (d >= widthM) return 0;
  const c = Math.cos((Math.PI * d) / (2 * widthM));
  return c * c;
}

/** ★seed と馬番から決まる 0〜1（★乱数ではありません・憲法4） */
function hash01(seed: number, gate: number, salt: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(gate | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * ★**確定着順ごとの役どころ**（指示書 §4-2 の表）
 *
 *   ⚠️ ★役は**確定着順から**決めます。その瞬間の見た目の順位からは決めません。
 *      見た目から決めると、演出が自分自身に反応して発振します。
 *
 *   | 着 | 役 | いつ | 何をする |
 *   |---|---|---|---|
 *   | 1 | ★差し返し | 残り 210m あたりで一度**下げて**、100m で戻す | 抜かれてから抜き返す |
 *   | 2 | 進出して並ぶ | 残り 175m で最大 | 一度先頭に並ぶ |
 *   | 3 | 差してくる | 残り 140m で最大 | 遅れて上がる |
 *   | 4 | 並んで脱落 | 残り 235m で最大 | 上がってから沈む |
 *   | 5 | 早めに進出して脱落 | 残り 265m で最大 | いちばん早く動いて先に沈む |
 */
const ROLES: readonly { readonly centerM: number; readonly widthM: number; readonly amp: number }[] = [
  { centerM: 120, widthM: 90, amp: 2.4 },    // 1 着: ★いちばん遅く上がる（差し切り・差し返し）
  { centerM: 175, widthM: 100, amp: 2.8 },   // 2 着: 先に進出して一度先頭に並ぶ
  { centerM: 140, widthM: 90, amp: 3.2 },    // 3 着: 遅れて差してくる
  { centerM: 235, widthM: 85, amp: 2.2 },    // 4 着: 早めに並んで脱落
  { centerM: 265, widthM: 80, amp: 1.8 },    // 5 着: いちばん早く動いて脱落
];

/** ★振れ幅のばらつきの上振れ（`jitterA` の上限）。★下の `hash01` の使い方と対で決まります */
const SURGE_JITTER_MAX = 1.15;
/**
 * ★**「役どころの波」で 1 頭に加わりうる最大（m）**。
 *   ⚠️ ★数字を直接書かず `ROLES` から出します（R-30・二重管理を作らない）。
 *   ★「寄せ」の上限 `CLIMAX_MAX_OFFSET_M` とは別枠です。合計の上限は両者の和になります。
 */
export const CLIMAX_MAX_SURGE_M = ROLES.reduce((m, r) => Math.max(m, r.amp), 0) * SURGE_JITTER_MAX;

/**
 * ★**その瞬間いちばん前にいる馬は動かしません。**
 *
 * 【なぜか】
 *   ⚠️ 場面解決（`resolveBroadcastV2Scene`）は**表示位置の最大値**でカットとカメラを決めます。
 *      先頭を動かすと、★**演出の有無でカットの境目がずれます**（実測で最大 1.6m ≒ 0.06 秒）。
 *      演出は「どこに描くか」だけであるべきで、**編集の時刻を動かしてはいけません**。
 *
 * 【どうやるか】
 *   先頭からの差が 0 のとき 0、`LEAD_FREE_M` 以上で 1 になる**滑らかな重み**を波に掛けます。
 *   ★先頭が入れ替わるときも、両方の差が 0 を滑らかに通るので跳びません。
 *
 * ★これで「差し返し」は**後ろの馬が抜き、抜き返される**形で作られます。
 *   先頭を下げるのではなく、後続を上げ下げして同じ絵を作ります。
 */
const LEAD_FREE_M = 2.0;

export interface ClimaxHorse {
  readonly gate: number;
  /** ★エンジンが決めた本来の位置（m） */
  readonly s: number;
  /** ★確定着順（1 が勝馬）。★その瞬間の見た目の順位ではありません */
  readonly finishPosition: number;
}

export interface ClimaxOptions {
  /** そのレースの seed（★同じ seed なら毎回同じ絵になる） */
  readonly seed: number;
  /** コースの距離（m） */
  readonly distanceM: number;
  /** ★演出を切る（比較用）。既定は false */
  readonly disabled?: boolean;
}

/**
 * ★**表示用の位置を返す**。入力の配列と同じ順・同じ長さで、`s` だけを差し替えます。
 *
 * ⚠️ ★**入力の配列は変更しません**（新しい配列を返します）。
 * ⚠️ ★上位 5 頭以外は**まったく動かしません**（オフセット 0）。
 */
export function climaxDisplayPositions(
  horses: readonly ClimaxHorse[],
  options: ClimaxOptions,
): readonly { readonly gate: number; readonly s: number; readonly offsetM: number }[] {
  const plain = horses.map((h) => ({ gate: h.gate, s: h.s, offsetM: 0 }));
  if (options.disabled === true || horses.length === 0) return plain;

  /**
   * ★**残り距離は「その瞬間の先頭馬」で測ります。**
   *   ⚠️ 馬ごとの残りで測ると、馬によって演出の位相がずれて「並ぶ」場面が作れません。
   */
  const leadS = horses.reduce((m, h) => (h.s > m ? h.s : m), horses[0]!.s);
  const remainingM = options.distanceM - leadS;
  /**
   * ★**「寄せ」と「役どころの波」で、戻し始める距離を分けます**（`CLIMAX_SURGE_RELEASE_START_M` の注記）。
   *   ★寄せは量が大きい（最大 12m）ので**長く**戻す。波は小さい（≈3.7m）ので**遅くまで効かせる**。
   */
  const envCompress = climaxEnvelope(remainingM);
  const envSurge = climaxEnvelope(remainingM, CLIMAX_SURGE_RELEASE_START_M);
  if (envCompress <= 0 && envSurge <= 0) return plain;

  return horses.map((h) => {
    const rank = h.finishPosition;
    if (!(rank >= 1 && rank <= CLIMAX_LEAD_COUNT)) return { gate: h.gate, s: h.s, offsetM: 0 };
    const role = ROLES[rank - 1]!;
    /**
     * ★**先頭との差を詰める**（主役群を 1 つの画に収める）。
     *   ★先頭自身は gap = 0 なので**動きません**。
     */
    const gap = Math.max(0, leadS - h.s);
    /**
     * ⚠️ ★**上限は「効き具合を掛ける前」に掛けます。**
     *    掛けたあとに切ると、★戻している間ずっと上限に張り付き、
     *    そこから**一気に**落ちることになります（＝見かけの減速がかえって強くなる）。
     */
    const compress = Math.min(CLIMAX_MAX_OFFSET_M, gap * CLIMAX_COMPRESS);
    /**
     * ★**役どころの波**。seed と馬番で中心と大きさを少しずらすので、
     *   ★毎レース同じ振り付けにはなりません（それでも同じ seed なら完全に同じ）。
     */
    const jitterC = (hash01(options.seed, h.gate, 1) - 0.5) * 30;   // ±15m
    const jitterA = 1 + (hash01(options.seed, h.gate, 2) - 0.5) * (SURGE_JITTER_MAX - 1) * 2;  // ±15%
    /** ★先頭にいる馬ほど波を効かせない（上の `LEAD_FREE_M` の注記） */
    const leadFree = smoothstep(gap / LEAD_FREE_M);
    const surge = role.amp * jitterA * leadFree * bump(remainingM, role.centerM + jitterC, role.widthM);
    /** ★それぞれ自分の効き具合で掛けます（寄せは長く戻し、波は遅くまで効かせる） */
    const offsetM = envCompress * compress + envSurge * surge;
    return { gate: h.gate, s: h.s + offsetM, offsetM };
  });
}
