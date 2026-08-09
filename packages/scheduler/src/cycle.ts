/**
 * 開催サイクル（正典 §10.2）— 純粋 TypeScript
 *
 * 【決定論（憲法 §1-4）】
 *   `Date.now()` を呼びません。**ゲーム内時刻の真実は Postgres の `now()` のみ**（§14）で、
 *   ワーカーやクライアントの時計は信用しません。ここは受け取った時刻に対する純関数です。
 *
 * 【なぜサイクル計算を切り出すのか】
 *   「今どのフェーズか」「次に何を作るべきか」をワーカーの制御フローに埋めると、
 *   **異常系（再起動・遅延・時計のずれ）をテストできません**。A-2「強制終了して再起動しても
 *   二重生成・二重払戻が起きない」は、この関数が**時刻だけから決まる**ことが前提になります。
 */

/** 1サイクル = 10分（D-007・§10.2） */
export const CYCLE_MS = 10 * 60 * 1000;

/**
 * §10.2 のタイムテーブル（サイクル先頭からの相対ミリ秒）。
 * ⚠️ 正典の表の写しです。順序が崩れると発売締切後に買えるなどの穴になるので、
 *    **単調増加であること自体を ★テストで押さえます**。
 */
export const PHASE_OFFSET_MS = {
  /** 前レース確定・払戻表示 */
  settle: 0,
  /** 次レース生成完了、出走表・オッズ公開 */
  publish: 30 * 1000,
  /** 発売開始 */
  salesOpen: 3 * 60 * 1000,
  /** 発売締切 */
  salesClose: 9 * 60 * 1000 + 30 * 1000,
  /** パドック・返し馬演出（発走まで） */
  parade: 9 * 60 * 1000 + 30 * 1000,
  /** 発走 */
  start: CYCLE_MS,
} as const;

export type Phase = 'settling' | 'publishing' | 'preSale' | 'onSale' | 'parade';

/** 生成は2レース先まで先行実行（§10.2・障害時バッファ） */
export const LOOKAHEAD_RACES = 2;

/**
 * ★確定できないレースを自動で開催中止にするまでの時間（正典 D-037）。
 *
 * 【★正典が危険なほうの失敗を指していませんでした】
 *   §10.2 は「**生成失敗時**は開催中止とし全ベットを EP で返還」と書いていましたが、
 *   **生成が失敗したならレースも馬券も存在せず、返還するものがありません**。
 *   危険なのは逆で、**レースが生成され、馬券が売れ、そのあと確定できない**場合です。
 *   そこに規定が無く、`bets` が pending のまま**永久に残る**状態でした。
 *
 *     G: 生成失敗 → 返還不要（馬券が存在しない）。欠落補完で自動的に埋まる
 *     S: 確定失敗 → **発走時刻 + 60分**で自動中止・EP 全額返還   ← これ
 *
 * 【なぜ60分か】
 *   6サイクル。配備・再起動・ヘルスチェック待ち（600秒）を吸収してなお十分で、
 *   かつ客を1時間以上 pending で拘束しません。
 *   ★「バグを直す配備が間に合う時間」ではなく
 *     **「間に合わなくても客の金が戻る時間」**として決めた値です。
 *
 * ⚠️ 較正定数ではありません（正典 D-037 の写し）。動かすと客の金が戻る条件が変わります。
 */
export const CANCEL_AFTER_START_MS = 60 * 60 * 1000;

/**
 * ★これより前に発走したのに確定していないレースは、開催中止にする（D-037）。
 *
 *   判定を**純関数に出す**理由は2つあります:
 *     1. SQL の中で `$1 - $2` を計算すると、Postgres が型を決められず
 *        "operator is not unique: unknown - unknown" で落ちます（実際に落ちました）
 *     2. ★定数を SQL の中に閉じ込めると、**変異試験で防御を確認できません**。
 *        登録簿に載せても落ちないテストは、防御していないのと同じです
 */
export function overdueBefore(nowMs: number): number {
  return nowMs - CANCEL_AFTER_START_MS;
}

/**
 * サイクル番号。**これが冪等性の鍵**（A-2）。
 *
 * ワーカーは「今何番目のサイクルか」だけを見て動き、
 * その番号のレースが既にあるかを確認してから作ります。
 * 再起動しても同じ時刻からは同じ番号が出るので、二重生成になりません。
 *
 * @param nowMs サーバー時刻（Postgres の now()）
 * @param epochMs 開催の起点。運用中に動かしてはいけない（動かすと番号が付け替わる）
 */
export function cycleIndexAt(nowMs: number, epochMs: number): number {
  return Math.floor((nowMs - epochMs) / CYCLE_MS);
}

/** そのサイクルの先頭時刻 */
export function cycleStartMs(index: number, epochMs: number): number {
  return epochMs + index * CYCLE_MS;
}

/** サイクル先頭からの経過ミリ秒（0 〜 CYCLE_MS-1） */
export function offsetInCycle(nowMs: number, epochMs: number): number {
  const raw = (nowMs - epochMs) % CYCLE_MS;
  // 起点より前でも負にしない（時計が巻き戻った場合に相を誤らせない）
  return raw < 0 ? raw + CYCLE_MS : raw;
}

/** 今どのフェーズか（§10.2） */
export function phaseAt(nowMs: number, epochMs: number): Phase {
  const t = offsetInCycle(nowMs, epochMs);
  if (t < PHASE_OFFSET_MS.publish) return 'settling';
  if (t < PHASE_OFFSET_MS.salesOpen) return 'publishing';
  if (t < PHASE_OFFSET_MS.salesClose) return 'onSale';
  return 'parade';
}

/**
 * 馬券を売ってよい時刻か（§10.2）。
 *
 * ⚠️ **境界は「締切ちょうどは売らない」**。等号の向きを間違えると
 *    締切と同時刻の注文が通り、発走後の購入に見える（R-2: 両側を押さえる）。
 */
export function isOnSale(nowMs: number, epochMs: number): boolean {
  const t = offsetInCycle(nowMs, epochMs);
  return t >= PHASE_OFFSET_MS.salesOpen && t < PHASE_OFFSET_MS.salesClose;
}

/**
 * このサイクルで**生成しておくべき**レースのサイクル番号（先行分を含む）。
 *
 * ★ここが「作るべきものの一覧」を返し、実際に作るかどうかは
 *   呼び出し側が「もう存在するか」を見て決めます。
 *   関数が「作る」まで担うと、存在確認を飛ばした実装ができてしまいます。
 */
export function racesToPrepare(nowMs: number, epochMs: number): number[] {
  const current = cycleIndexAt(nowMs, epochMs);
  const out: number[] = [];
  for (let i = 1; i <= LOOKAHEAD_RACES; i += 1) out.push(current + i);
  return out;
}

/**
 * 生成失敗時の扱い（§10.2）。
 *
 * ★**結果の事後差し替えは絶対にしない**（§8.6）。
 *   作れなかったラウンドは「開催中止」にして**全ベットを EP で返還**する。
 *   ここで「とりあえず似たレースを作って埋める」をやると、
 *   コミット済みのシードと出走表が食い違い Provably Fair が壊れる。
 */
export type CycleFailureAction = 'cancel_and_refund';

export const ON_GENERATION_FAILURE: CycleFailureAction = 'cancel_and_refund';
