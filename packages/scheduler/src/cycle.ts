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

/**
 * ★1 サイクル = **6 分**（★**D-007 再改訂**・2026-09-18・§10.2）
 *
 * 【★経緯】★①10 分（1 日 144R・2026-08-04）→ ★②**3 分（480R）は母数が足りず撤回**
 *   （★1 日 480R には現役 6,999 頭が要り、母数 4,389 頭では届かなかった・CF-1）→ ★③**6 分（240R）**。
 *
 * 🔴 ★**要る頭数をここに書きません**（★2026-09-20・裁定 Q1）。
 *   ★ここには「★6 分なら要る頭数 **3,500** で余力 889 頭」と書いてありました。
 *   ✔ ★**その 3,500 は「キャリア 24 戦」のときの数**です。★`CC-1 ③`（2026-09-19・オーナー承認）で
 *     ★**40 戦**になったのに、★**書き留めた数だけが取り残されていました**（★`D-053` / `NM-1` の形）。
 *   → ★★**`pool-size.ts` の `requiredActivePool()` から毎回 導きます。**
 *     ★そうすれば `CAREER_RACE_LIMIT` や `CYCLE_MS` が動いた日に、★黙って追随します。
 *
 * ★**目的はレース密度を上げること**で、
 *   ★**積み上げる実時間は変えません** — ★1 ゲーム内週 4 時間・現役 90 週 ＝ 15 日・1 日 6 週は**不変**
 *   （★`CYCLES_PER_WEEK` を 24 → 80 にして吸収します・`week.ts`）。
 *
 * ★**所要の裏付け**（AL-6・`REPORT_AL6_ODDS_COST_20260918.md`）: ★オッズ計算は本番機で
 *   ★**1 レース 70〜98 秒** → ★1 日 480R で **9.3〜13.1 時間 ＝ 使用率 39〜54%**。
 * ⚠️ ★**換算は換算です。最終確認は配備後の周の実測**（R-28）。
 */
export const CYCLE_MS = 6 * 60 * 1000;

/**
 * §10.2 のタイムテーブル（サイクル先頭からの相対ミリ秒）。
 * ⚠️ 正典の表の写しです。順序が崩れると発売締切後に買えるなどの穴になるので、
 *    **単調増加であること自体を ★テストで押さえます**。
 *
 * ★**2026-09-18・D-007 再改訂 ① の表です**（★10 分: 0/0:30/3:00/9:30/10:00 → 3 分案 → ★**6 分**）。
 *   ★**発売は 4 分**（`salesOpen` 1:00 → `salesClose` 5:00）。
 *   ★生成は `LOOKAHEAD_RACES = 2` のままなので **12 分の余裕**があります（★本数は変えません）。
 */
export const PHASE_OFFSET_MS = {
  /** 前レース確定・払戻表示 */
  settle: 0,
  /** 次レース生成完了、出走表・オッズ公開 */
  publish: 30 * 1000,
  /** 発売開始 */
  salesOpen: 60 * 1000,
  /** 発売締切 */
  salesClose: 5 * 60 * 1000,
  /** パドック・返し馬演出（発走まで） */
  parade: 5 * 60 * 1000,
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
 *   ★**10 サイクル**（★2026-09-18・D-007 再改訂 ⑤・AL-10。★10 分なら 6・3 分なら 20・★6 分なら 10）。
 *   ⚠️ ★**60 分という時間そのものは変わりません** — ★これは「客の金が戻るまでの時間」で書かれた値で、
 *      ★サイクルの長さが変わっても**縮めも延ばしもしません**。★変わったのは**何周ぶんか**の数え方だけです。
 *   配備・再起動・ヘルスチェック待ち（600秒）を吸収してなお十分で、
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
 * ★**枠を先に告知しておくサイクル数**（★**D-117**・2026-09-19・裁定 `REVIEW_D117_SHAPE_VERDICT_20260919.md`）。
 *
 * 【🔴 ★なぜ 2 段に割るのか — ★時間が足りませんでした】
 *   ★D-117 の形は ★**登録（締切）→ 抽選 → 生成 → publish → 発走**。
 *   ★ところが ★**登録する相手のレースの行は、生成のときに初めて作られて**いました。
 *   ✔ ★測りました: ★締切（`cycleStart + publish` ＝ 0:30）から発売開始（1:00）までは ★**30 秒**。
 *     ★オッズは ★**1 レース 70〜98 秒**（★本番機換算・AL-6）／★160 秒（★開発機）。
 *   → ★★**「重い」ではなく「入らない」**。★順序を入れ替えるだけでは成立しません。
 *
 * 【★どう解くか】★**行を 2 段に割ります**
 *   ★① **announce**（★ここ・`ANNOUNCE_AHEAD_RACES` 先）… ★枠・条件・締切だけ。★出走馬もオッズも無い
 *   ★② **fill**（★`LOOKAHEAD_RACES` 先）… ★プレイヤー馬 ＋ NPC の充填 ＋ オッズ ＋ 公開
 *
 * ★窓（登録できる長さ）＝ `(ANNOUNCE_AHEAD_RACES - LOOKAHEAD_RACES)` サイクル ＝ ★**12 分**（6 分 × 2）。
 * ★fill の持ち時間 ＝ 締切から発売開始まで ＝ ★**2 サイクル ＋ 1 分 ＝ 13 分**（★98 秒に対し 8 倍）。
 *
 * ⚠️ ★**窓の長さは物理の制約ではありません** — ★番組表は純関数なので、★どこまで先でも作れます。
 *    ★12 分は ★**当座の既定**で、★重賞を狙って出せるようにするなら延ばします（★DS-5・オーナー判断）。
 */
export const ANNOUNCE_AHEAD_RACES = 4;

/**
 * ★**`racesToAnnounce` はここにはありません** — ★`announce-window.ts` に移りました
 * （★**DS-5 ②**・2026-09-19）。
 *
 * ★格ごとに窓の長さが変わったので、★`gradeOf`（`programme.ts`）が要ります。
 * ★`programme.ts` はこのファイルを読んでいるので、★逆向きに読むと循環します。
 * ⚠️ ★**ここに写しを置かないこと**（D-052）。★窓の長さを持つのは `ANNOUNCE_AHEAD_BY_GRADE` だけです。
 */

/**
 * ★**登録の締切**（★**D-117**・2026-09-19）。
 *
 * ★**fill が始められるいちばん早い瞬間**です — ★`racesToPrepare` が
 * ★そのレースを返し始めるサイクルの開始時刻（★`cycleStart(N - LOOKAHEAD_RACES)`）。
 *
 * 🔴 ★**`publish` ではありません**（★ED-1・`0041` の当座の形）。
 *   ★`publish` のままだと ★**締切の後にオッズを計算する時間が 30 秒**しかなく、
 *   ★D-117 の目的（★**オッズが自馬を含む**）が達成できません。
 * ⚠️ ★**この 1 か所だけが締切を決めます**（★SQL にも画面にも時間の式を書かない・D-052・D-103 ④）。
 */
export function entryDeadlineMs(cycleIndex: number, epochMs: number): number {
  return cycleStartMs(cycleIndex - LOOKAHEAD_RACES, epochMs);
}

/**
 * ★**1 周で組成してよいレースの本数**（★**D-117** **DS-9**・2026-09-19）。
 *
 * 【★なぜ上限が要るか】
 *   ★平常時は ★**1 周に 1 本**が締切を越えます（★`racesToPrepare` が 1 本ずつ進むため）。
 *   ★ところが停止・再起動のあとは ★**溜まった全部**が「締切を過ぎた」状態で並びます。
 *   ★上限が無いと、★1 周の中で何本も組成して ★**サイクルのロックを握ったまま**時間を使い、
 *   ★その間の**確定が止まります**（D-038 が確定を先に置いているのと同じ懸念）。
 *
 * 【★数】★1 周 ＝ `CYCLE_MS` ＝ **360 秒**。
 *   ★組成 1 本（オッズの MC・`ODDS_MC_TRIALS`）は ★**70〜98 秒**（★本番機・AL-6 の実測）。
 *   ★2 本 ＝ 最悪 **196 秒**。★残り **164 秒**が確定とその他に残ります。
 *   ★3 本にすると **294 秒**で、★残りが 66 秒しかありません。
 * → ★**2**。★平常時に必要なのは 1 本なので、★**取り戻しの余力は 2 倍**です。
 *
 * ⚠️ ★**開発機は 160 秒/本**なので、★ここでは 2 本で 320 秒（★1 周に収まりません）。
 *    ★開発機で溜めると遅れが続きます。★`fillDeferred` に出るので、★数で見えます（DS-8）。
 */
export const MAX_FILLS_PER_CYCLE = 2;

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
