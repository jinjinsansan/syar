/**
 * ★**正典が額を決めた項目 ↔ その額を実際に動かす実装**（★対応表）
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §7 ③（2026-09-25・レビュー側の指示）
 *
 * 【🔴 ★なぜ要るか — ★これが「今回の欠陥そのもの」だから】
 *   ★正典 **D-075** は ★2026-08-20 に「★デイリーログイン **200 EP**」と決めていました。
 *   ★画面にも「毎日のログイン」の枠が在りました。
 *   🔴 ★しかし ★**渡す側の実装が、どこにも在りませんでした。**
 *     ★**1 か月以上**、★誰も気づきませんでした。★調教が EP を吸うので、
 *     ★本番のオーナーの口座は ★残高 0 になり、★何もできなくなりました。
 *   ★これは ★**D-119 の族**です（★決めた・画面は出す・★渡す側が無い）。
 *
 * 【★何をする表か】★3 列だけです（★裁定の指示どおり小さく始めます）:
 *   ★① `decision` … ★正典のどの決定か（★実在を確かめます）
 *   ★② `amount` … ★正典が決めた額（★言葉で。★ここに数を写しません ＝ D-052）
 *   ★③ `implementation` … ★**その額を実際に動かす実装**（★`null` なら ★**落ちます**）
 *
 * 【⚠️ ★ここに数を書かないこと】
 *   ★額の突き合わせは ★`ep-grant-sql.test.ts` の仕事です（★SQL ↔ TS の定数）。
 *   ★この表が見るのは ★**「渡す側／引く側が在るか」**だけです。★役割を混ぜると両方が甘くなります。
 *
 * 【★`implementation` が嘘をつけないようにしてあります】
 *   ★`sql` なら ★**移行に その関数の定義が在るか**を見ます（★`lastFunctionBody`）。
 *   ★`ts` なら ★**そのファイルに その名前が在るか**を見ます。
 *   → ★「在ることにしておく」ができません（★`canon-amounts-implemented.test.ts`）。
 */

/**
 * ★その額を動かす実装の在りか。★`null` は ★**未実装**（★表が落ちます）。
 *
 * 【🔴 ★`not-yet-reachable` を足した理由（★2026-09-25・(B) で要りました）】
 *   ★D-107 ③ の「持ち主へ移る分」は ★**実装が在りません**が、
 *   ★他人の種牡馬を選ぶ口が ★**まだ無い**ので ★**今日は正典どおりに動いています**
 *   （★D-107 ③「★NPC へは全額焼却」）。
 *   🔴 ★これを `null`（★赤）にすると ★**「いま壊れている」と嘘になります**。
 *   🔴 ★これを実装済み（★緑）にすると ★**開いた日に黙って全額焼却**になります。
 *   → ★**通す／落とすの 2 つでは足りません。** ★第 3 の判定を置きます:
 *     ★**「まだ届かないことを、機械で確かめ続ける」**。
 *     ★`guard` が ★「口がまだ閉じている」ことを見ます。★開いた瞬間に ★**落ちます**。
 */
export type AmountImpl =
  | { readonly kind: 'sql'; readonly fn: string }
  | { readonly kind: 'ts'; readonly file: string; readonly symbol: string }
  /**
   * ★**まだ誰も届かない**（★だから今日は困らない）。
   *   ★`guard` … ★「まだ閉じている」ことを見る検査の名前（★実在が確かめられます）
   *   ★`opensWhen` … ★**何をしたら開くか**（★言葉で。★開いたら `guard` が落ちます）
   */
  | { readonly kind: 'not-yet-reachable'; readonly guard: string; readonly opensWhen: string }
  | null;

export interface CanonAmount {
  /** ★正典の決定（★`D-075` や `§10.4`）。★実在を確かめます */
  readonly decision: string;
  /** ★正典が決めた額（★言葉で。★数を写さない） */
  readonly amount: string;
  /** ★その額を実際に動かす実装。★`null` なら ★**落ちます** */
  readonly implementation: AmountImpl;
  /** ★`null` のときだけ: ★**なぜ無いのか**（★空欄で `null` にしない） */
  readonly missingWhy?: string;
}

/**
 * ★**EP と PP の額だけ**（★裁定 §7 ③「小さく始めて構いません」）。
 * ⚠️ ★足すときは ★**実装を確かめてから**書くこと（★`implementation` は機械で検証されます）。
 */
export const CANON_AMOUNTS: readonly CanonAmount[] = [
  // ── EP が出る側（★発行）────────────────────────────────────
  {
    decision: 'D-075',
    amount: '★登録時に受け取る EP',
    implementation: { kind: 'sql', fn: 'create_account' },
  },
  {
    decision: 'D-075',
    amount: '★デイリーログインで受け取る EP',
    // 🔴 ★2026-09-25 まで ★**ここが `null` でした**（★この表が在れば 1 か月 早く気づけました）
    implementation: { kind: 'sql', fn: 'claim_daily_ep' },
  },
  {
    decision: 'D-075',
    amount: '★1 人 1 日あたりの EP 発行量の上限',
    implementation: { kind: 'sql', fn: 'claim_daily_ep' },
  },
  {
    decision: 'D-102',
    amount: '★馬を手放したときに戻る EP（★買った額より十分小さく）',
    implementation: { kind: 'sql', fn: 'sell_horse' },
  },

  // ── EP が入る側（★焼却）────────────────────────────────────
  {
    decision: '§7.1',
    amount: '★調教にかかる EP',
    implementation: { kind: 'sql', fn: 'spend_training_ep' },
  },
  {
    decision: '§10.4',
    amount: '★出走登録料 EP',
    implementation: { kind: 'sql', fn: 'enter_race' },
  },
  {
    decision: 'D-105',
    amount: '★騎手の料金（★「料金は EP」）',
    /**
     * 🔴 ★**この表が初日に挙げた 1 件**（★2026-09-25）。★D-119 の族の 4 例目でした:
     *   ★`enter_race` は `coalesce((p_jockey_frozen ->> 'feeEP')::int, 0)` で料金を取っていましたが、
     *   ★画面が送るのは `{ id: jockeyId }` だけ（★キーも違い `feeEP` も無い）→ ★**常に 0**。
     *   ★`freezeJockey` は ★製品コードから一度も呼ばれていませんでした。
     *   🔴 ★さらに ★料金の出どころが ★**クライアントの JSON** で、★繋いだ日から
     *     ★`feeEP: 0` を送れば ★**高い騎手を無料で乗せ放題**になる形でした（★憲法 3）。
     * ✅ ★`0082` で直しました（★裁定 `REVIEW_JOCKEY_FEE_20260925.md`）:
     *   ★名簿を DB に転記し、★`enter_race` は `jockeyId` だけを受け取り、
     *   ★料金と凍結を ★`jockey_frozen_build` が ★**名簿から**作ります。
     *   ★古い `jsonb` の署名は ★**落としました**（★多重定義で穴を残さない）。
     * ✔ ★staging 実測: ★登録料 200 ＋ 騎手 400 ＝ **600 引かれる**（★以前は 200 だけ）。
     */
    implementation: { kind: 'sql', fn: 'jockey_frozen_build' },
  },
  {
    decision: '§10.5',
    amount: '★NPC 種牡馬の種付料 EP',
    implementation: { kind: 'sql', fn: 'spend_stud_fee_ep' },
  },
  {
    decision: 'D-102',
    amount: '★馬を買う EP',
    implementation: { kind: 'sql', fn: 'buy_horse' },
  },
  {
    decision: 'D-103',
    amount: '★厩舎の格を EP で解放する額',
    implementation: { kind: 'sql', fn: 'unlock_stable_grade' },
  },
  {
    decision: '§9.5',
    amount: '★自馬を含む馬券の 1 レース上限 EP',
    implementation: { kind: 'sql', fn: 'bet_allowance' },
  },
  {
    decision: '§9',
    amount: '★馬券 1 枚の額の幅',
    implementation: { kind: 'sql', fn: 'place_bet' },
  },

  // ── PP ─────────────────────────────────────────────────────
  {
    decision: '§9.1',
    amount: '★着順に応じた賞金 PP',
    implementation: { kind: 'ts', file: 'apps/worker/src/prize-award.ts', symbol: 'awardPrizes' },
  },
  {
    decision: '§11',
    amount: '★景品交換で消える PP',
    implementation: { kind: 'sql', fn: 'exchange_prize' },
  },

  /**
   * ── ★**PP 側を広げます**（★2026-09-25・裁定 `REVIEW_IDLE_WORK_20260925.md` (B)）───
   *
   * ★レビュー側の読み: ★「★EP で 1 件（騎手の料金）出たので、★PP 側にも同じ形が眠っている見込み」。
   * ✔ ★**先に §9 と D-107 を 1 件ずつ現物で辿りました**（★下の註記がその結果です）。
   */
  {
    decision: '§9.3',
    amount: '★馬券の控除率 margin（★券種ごと・★経済の最大のシンク）',
    /**
     * ✔ ★**渡す側が在ります**（★念のため辿りました・★D-119 の形ではありません）:
     *   ★`balance.ts:191` … ★オッズを作るときに `(1 - MARGIN[kind])` を掛けています
     *   ★`apps/worker/src/odds.ts:136` … ★本番のオッズ表が ★この値を読んでいます
     *   ★`point-flow.ts:92` … ★実測との乖離を見ています（★V-10）
     * ⚠️ ★額そのものの突き合わせは ★この表の仕事ではありません（★上の註記）。
     */
    implementation: { kind: 'ts', file: 'packages/betting/src/balance.ts', symbol: 'MARGIN' },
  },
  {
    decision: 'D-094',
    amount: '★的中馬券の払戻 PP（★0.1 単位の切り捨て・★同着で割る）',
    /**
     * ✔ ★`settleTenths` が ★`⌊ stake × tenths ÷ (10 × 同着数) ⌋` を ★整数だけで計算します。
     * ★これは ★監査 H-1（★999,000 通り中 31,577 通りで ★1 PP 少なく払っていた）の直しの本体です。
     */
    implementation: { kind: 'ts', file: 'packages/betting/src/settle.ts', symbol: 'settleTenths' },
  },
  {
    decision: 'D-035',
    amount: '★発売しない目の下限 p_min（★上限に当たる目・★1.0 倍未満）',
    /**
     * ✔ ★`sellDecision` が ★**「売る目」の判定を 1 か所に**持っています（★D-035 ＋ D-096）。
     * ★本番のオッズ表（`apps/worker/src/odds.ts`）と ★V-10（`v10-accounting.ts`）の
     * ★**両方が この関数だけを通ります**（★以前は別々に決めていました・R-30）。
     */
    implementation: { kind: 'ts', file: 'packages/betting/src/balance.ts', symbol: 'sellDecision' },
  },

  /**
   * 🔴 ★**この表が 2 件目に挙げた項目**（★2026-09-25・★(B) で出ました）。
   */
  {
    decision: 'D-107',
    amount: '★プレイヤー種牡馬の種付料のうち ★**持ち主へ移る分**（★D-107 ③「プレイヤー間は 20% 焼却」'
      + ' ＝ ★残りは ★**持ち主へ移転**する。★NPC へは全額焼却）',
    /**
     * 🔴 ★**`null`（赤）でも 実装済み（緑）でもありません。** ★上の `AmountImpl` の註記を読んでください。
     *   ★`guard` が ★**「他人の種牡馬を選ぶ口が まだ無い」**ことを見続けます。
     *   → ★開いた瞬間に ★**落ちます**（★そのとき移転を実装するか、★判断を仰ぐことになります）。
     */
    implementation: {
      kind: 'not-yet-reachable',
      guard: 'stallion-sources-are-npc-only',
      opensWhen: '★配合の画面が ★`npc_stallion_facts` ★以外から種牡馬を引いた日'
        + '（★他人の種牡馬・★自分の種牡馬を問わず）',
    },
    /**
     * 【★現物】★`spend_stud_fee_ep`（`0071`）は ★**引くだけ**です:
     *   ★`ep_ledger` に ★`-p_amount`／`reason = 'stud_fee'` を 1 行 書き、
     *   ★`users.entry_points` を ★その分 減らします。
     *   🔴 ★**種牡馬の持ち主に足す行が どこにもありません。** → ★いまは ★**常に全額焼却**です。
     *
     * 【⚠️ ★ただし ★**今日の時点では 正しく動いています**】
     *   ✔ ★画面が種牡馬を引くのは ★`npc_stallion_facts()` ★**だけ**です
     *     （★`breed-screen.ts:174`。★他人の種牡馬を選ぶ口が ★まだ在りません）。
     *   ★D-107 ③ は ★**NPC へは全額焼却**と決めています → ★**今日の全額焼却は 正典どおり**です。
     *   → 🔴 ★つまり これは ★**「いま出ている不具合」ではなく、★開いた日に出る不具合**です。
     *
     * 【🔴 ★なぜ `null` で置くか】★**開いた日に黙って全額焼却になるから**です。
     *   ★プレイヤー種牡馬を選べるようにした瞬間、★持ち主は ★1 EP も受け取りません。
     *   ★しかも ★**誰も エラーを見ません**（★引き落としは成功し、★配合も成立します）。
     *   ★これは ★騎手の料金（★D-105・★常に 0 だった）と ★**同じ形**です。
     *   → ★この行が `null` である限り、★`canon-amounts-implemented.test.ts` が
     *     ★**`missingWhy` を読ませ続けます**（★消すには ★移転を実装するしかありません）。
     *
     * ⚠️ ★**ここで実装しません**（★指示書の範囲外・★スコープ外の先走りは差し戻し）。
     *   ★`QUESTIONS_STUD_FEE_TRANSFER_20260925.md` に出します。
     */
    missingWhy: '🔴 ★`spend_stud_fee_ep`（`0071`）は ★**引くだけ**で、★種牡馬の持ち主に ★足す行が無い。'
      + '★いまは ★他人の種牡馬を選ぶ口が無く（★`npc_stallion_facts` だけ）、'
      + '★D-107 ③「NPC へは全額焼却」のとおりなので ★**今日は正しい**。'
      + '🔴 ★プレイヤー種牡馬を開いた日に ★**黙って全額焼却**になる（★D-105 と同じ形）。'
      + '★照会: `QUESTIONS_STUD_FEE_TRANSFER_20260925.md`',
  },
];
