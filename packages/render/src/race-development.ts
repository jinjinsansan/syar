/**
 * ★**レースの展開を、エンジンの位置から決める**（★2026-09-12・★オーナー指示②）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★ほとんど真横カメラワークなので、★**レース演出の展開をエンジンと同期して**
 *   ★① 先行馬が逃げ切るレース演出 ★② 差し馬が差してくるレース演出
 *   ★③ 追い込み馬が追い込みしてくるレース演出 ★その他 JRA のレースを参考に
 *   ★競馬の熱いドラマを繰り広げる必要があります」。
 *
 * 【★何を作って、何を作らないか】
 *   ★ここが返すのは ★**「このレースはどう決まったか」という札**だけです。
 *   ★カメラはこの札を見て決めます（`broadcast-v2.ts`）。
 *   ⚠️ ★**位置・着順・着差・タイムには一切触れません**（★憲法 3・憲法 4）。
 *      ★`climax-choreography.ts` は ★表示位置をずらして ★ドラマを ★**作り**ますが、
 *      ★こちらは ★**エンジンが既に走らせた結果を読むだけ**です。★逆向きです。
 *
 * 【★測る地点】
 *   ★**最後の直線の入口**（＝残り `straightMetersLeft`）で、★勝ち馬が何番手にいたか。
 *   ⚠️ ★地点を変えると札が変わります。★「残り 600m」でも「4 コーナー」でもなく
 *      ★**画面が `homestretch` へ入る地点**に合わせています。★カメラの切り替えと
 *      ★同じ地点で判定しないと、★「差し馬を追う」と決めた時にはもう差し終わっています。
 */

/** ★展開の札 */
export type RaceDevelopment =
  /** ★逃げ切り: 直線入口で先頭、そのまま押し切った */
  | 'wire-to-wire'
  /** ★差し: 直線入口で 2〜4 番手から出た */
  | 'stalk'
  /** ★追い込み: 直線入口で 5 番手以下から出た */
  | 'closer';

/** ★展開の札と、★カメラが相手にする馬 */
export interface RaceDevelopmentInfo {
  readonly kind: RaceDevelopment;
  /** ★勝ち馬の馬番 */
  readonly winnerGate: number;
  /** ★直線入口での勝ち馬の順位（1 始まり） */
  readonly winnerRankAtStraight: number;
  /** ★直線入口での先頭の馬番。★逃げ切りなら `winnerGate` と同じ */
  readonly leaderAtStraightGate: number;
  /**
   * ★**勝ち馬が直線で抜いた頭数**。★`winnerRankAtStraight - 1`。
   *   ★0 なら逃げ切り。★大きいほど後ろから来た。
   */
  readonly passedCount: number;
}

/**
 * ★**差しと追い込みの境目**（★直線入口の順位）。
 * ⚠️ ★ここは ★**見せ方の境目**であって、★脚質（`nige`/`senko`/`sashi`/`oikomi`）ではありません。
 *    ★脚質が `oikomi` でも 2 番手から出たなら、★画面の作りは「差し」です。
 *    ★視聴者が見るのは ★**画面に何頭入るか**なので、★順位で切ります。
 */
export const CLOSER_MIN_RANK = 5;

/** ★1 つの時点の、★馬番と進んだ距離 */
export interface DevelopmentSample {
  readonly gate: number;
  readonly meters: number;
}

/**
 * ★**展開の札を決める**。
 *
 * @param atStraight ★最後の直線の入口での全馬の位置（★順不同でよい）
 * @param winnerGate ★確定着順の 1 着（★`result.order` から。★ここで勝者を決め直さない）
 *
 * ⚠️ ★`winnerGate` を「直線入口で先頭の馬」から推測しないこと。★それでは
 *    ★逃げ切り以外が永久に出ません（★判定が自分の答えを作ってしまう）。
 */
export function raceDevelopmentOf(
  atStraight: readonly DevelopmentSample[], winnerGate: number,
): RaceDevelopmentInfo {
  const sorted = [...atStraight].sort((a, b) => b.meters - a.meters);
  const rank = sorted.findIndex((h) => h.gate === winnerGate) + 1;
  /** ⚠️ ★勝ち馬が標本に居なければ ★**逃げ切り扱いにしません**。★狭い側（R-27）＝差し */
  const winnerRankAtStraight = rank > 0 ? rank : 2;
  const kind: RaceDevelopment = winnerRankAtStraight <= 1 ? 'wire-to-wire'
    : winnerRankAtStraight < CLOSER_MIN_RANK ? 'stalk' : 'closer';
  return {
    kind,
    winnerGate,
    winnerRankAtStraight,
    leaderAtStraightGate: sorted[0]?.gate ?? winnerGate,
    passedCount: winnerRankAtStraight - 1,
  };
}

/** ★画面と道具で同じ言葉を使う（★2 か所に別の訳語を置かない） */
export const RACE_DEVELOPMENT_LABEL: Readonly<Record<RaceDevelopment, string>> = {
  'wire-to-wire': '逃げ切り',
  stalk: '差し',
  closer: '追い込み',
};
