/**
 * ★**利用者に見せる「仕組みの説明」の文**（★2026-09-29・レビュー側）
 *
 * 【★なぜ 1 か所か】
 *   ★2026-09-29 の 1 日で ★仕組みの説明の嘘が 3 つ出た（★芝の下に沈んで見えていなかった文を 見えるようにしたら見つかった）:
 *     ★/setup「あとから変えられます」・★/signup「記録もご覧いただけます」・★オッズ「締切まで変わります」。
 *   ★数字には網が在るのに ★文には無かった。★文は ★ここに置き、★出どころとの照合は
 *   ★`apps/cli/test/claims-backed.test.ts`（★主張 → 裏づけ・★食い違ったら落ちる）が持つ。
 *   ★画面は ★ここから読む（★同じ文を 2 か所に写さない・★次に直す人が 1 か所だけ直す事故を防ぐ）。
 *
 * 🔴 ★**作法: 利用者に見せる「仕組みの説明」は、新しく書くときも ★ここに置く（★画面に直に書かない）**。
 *   ★置いたら ★claims-backed の登録簿に ★裏づけを 1 件足す。★置き場が 1 つあれば ★次の嘘は網が捕まえる。
 *   ★言わなくてよいことを言わない（★「最終の数字です」は ★前に別の数字が在った含みで誤解させる・2026-09-29 に落とした）。
 */

import { BET_CAP_OWN_RACE_EP, MIN_STAKE, PLACE_THREE_MIN_FIELD } from '@star/betting';

/**
 * ★投票の券種（★2026-09-29・オーナー「まずは単勝・複勝」）と ★的中の説明（★settle.ts・balance.ts の placeDepth から）。
 */
/**
 * ★**続けて投票**（★2026-09-29・`lib/repeat-bet.ts`）。★出すのは投票を受け付けた直後だけ（★結果の後には出さない・デザイナー R-22 の指摘・レビュー側裁定）。
 *   ★馬は選び直す・★参加ポイントだけ・★続けて 3 回まで。
 */
export const REPEAT_BET_MAX = 3;
/** ★受け付けた直後の補足（★R-22 §5・デザイナーの文）。★案内の 1 行（券種・額）は画面が組む */
export const CLAIM_REPEAT_BET = '発売になったら券種だけそろえます。馬はご自身で選んでください。自動では投票しません。';
/** ★予定どおり 次のレースが発売になったとき（★券種だけ揃える・★馬は本人が選ぶ） */
export const CLAIM_REPEAT_BET_PLANNED = '馬を選んで「投票する」を押してください。';
export const CLAIM_REPEAT_BET_SHORT = '参加ポイントが足りないため、次のレースへの続けて投票はできません';
export const CLAIM_REPEAT_BET_LIMIT = `続けて投票は ${REPEAT_BET_MAX} 回までです。馬と券種を選んで投票してください`;

/**
 * ★**発走時刻からの映像の 待ちの 2 つ**（★2026-09-29・0098・レビュー側 B 条件 4・条件 2）。
 *   ★① 決めるが遅れて ★発走を過ぎても着順が見えない間（★エラーにしない・待っていると分かる）。
 *   ★② 締めるが ★発走から SETTLE_AFTER_START_MS ＋ 余裕 を過ぎても来ない間（★止まったと分かる・払戻はまだと言う）。
 */
export const CLAIM_LIVE_PENDING = 'まもなく発走の映像が始まります';
export const CLAIM_SETTLE_CHECKING = '結果の確定を確認中です（払戻はまだです）';
/** ★発走前に開いた本編（★発走時刻に 小窓と同じ場面から始まる・0098） */
export const CLAIM_WAIT_START = '発走時刻になると、ここでレースが始まります';

/** ★投票の確認のシートの注記（★R-22 §4・取り消せないことを 押す前に言う） */
export const CLAIM_VOTE_NO_CANCEL = '投票は取り消せません。締め切り（発走の 1 分前）までに確かめてください。';

export const BET_TYPE_LABEL = { win: '単勝', place: '複勝' } as const;
export type VoteBetType = keyof typeof BET_TYPE_LABEL;
export const CLAIM_BET_TYPE_RULE: Readonly<Record<VoteBetType, string>> = {
  win: '選んだ馬が 1 着なら的中',
  place: `選んだ馬が 3 着以内なら的中（${PLACE_THREE_MIN_FIELD - 1} 頭以下のレースは 2 着以内）`,
};

/**
 * ★1 口の額（★正典 §9.1: 全券種 100 EP・★`MIN_STAKE`）。★DB の制約 `bets_amount_range`（0001・100 以上・100 刻み・10,000 以下）が ★通す額。
 *   ★2026-09-29: ★/vote は 10 EP を送っていて ★制約で必ず落ち、★投票が 1 件も成立していなかった。
 *   ★網 claims-backed は ★制約の定義を読んで ★この額が通るかを見る（★文字列の一致ではなく）。
 */
export const BET_PER_PICK_EP = MIN_STAKE;
export const CLAIM_BET_PER_PICK = `使う参加ポイント: ${BET_PER_PICK_EP.toLocaleString('ja-JP')} EP`;
import { CYCLE_MS, PHASE_OFFSET_MS, cycleStartMs, entryDeadlineMs } from '@star/scheduler';

/** ★ミリ秒を「5 分 30 秒」の形に（★画面に数字を直書きしない・cycle.ts から導く） */
function jaDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m === 0 ? `${r} 秒` : r === 0 ? `${m} 分` : `${m} 分 ${r} 秒`;
}

/**
 * ★出馬表の公開（★ワーカーは ★出走登録の締切 `entryDeadlineMs()`（★`cycleStart(N−2)`）を過ぎてから組成し ★`scheduled` にする＝
 *   cycle-runner.ts の `nowMs < entryDeadlineMs(...)` ・★組成前（`announced`）は `race_entries_public` が馬番を隠す）。
 *   ★発走は `cycleStart(N) + PHASE_OFFSET_MS.start`。★その差が「発走の何分前」。
 *   ★2026-09-29: ★「発走 10 分前に確定します」は嘘。★同じ日に 一度「5 分 30 秒前」（★表の `publish`）と書いたが
 *   ★**それも嘘**（★表の publish は 組成のきっかけではない・★LOOKAHEAD で 2 周先を組成する）→ ★組成のきっかけから導く。
 *   ★「後に」: ★ワーカーの周（約 1 分）と ★1 周で組成する本数の上限（DS-9）のぶん 遅れうる。
 */
const CARD_LEAD_MS = (cycleStartMs(10, 0) + PHASE_OFFSET_MS.start) - entryDeadlineMs(10, 0);
export const CLAIM_CARD_PUBLISH = `出馬表は 出走登録の締切（発走の ${jaDuration(CARD_LEAD_MS)}前）の後に公開されます`;

/**
 * ★投票の締切（★正典 §9.6: 締切は発走より前・★cycle.ts の salesClose）。
 *   ★2026-09-29: ★place_bet は ★発走の瞬間まで受けていた → ★`0096` で ★`sales_close_lead_seconds()` に合わせた（★網 sales-close-sql）。
 */
export const CLAIM_SALES_CLOSE = `投票は発走の ${jaDuration(CYCLE_MS - PHASE_OFFSET_MS.salesClose)}前に締め切ります`;

/**
 * ★自馬出走レースの投票（★`place_bet` 0045:163-183 ＝ 自馬を全頭含む買い目だけ・★上限は `BET_CAP_OWN_RACE_EP`＝limits.ts）。
 *   ★2026-09-29: ★entry・howto は「投票できません」、★/vote は「上限は 5,000 EP」と ★画面どうしが逆のことを言っていた。
 */
export const CLAIM_OWN_RACE_BET = `自分の馬が出るレースは、出ている自分の馬をすべて含む買い目だけ、${BET_CAP_OWN_RACE_EP.toLocaleString('ja-JP')} EP まで投票できます`;

/** ★脚質（★登録ごとに保存・馬には書かない＝0088:144）と ★適性（★走り全体に掛かる倍率＝race-engine coefficients.ts `strategyCoef`） */
export const CLAIM_STRATEGY = '脚質は今回のレースにだけ適用されます。馬の適性から外れた指示は、走り全体が鈍ります';

/** ★参加ポイントの受け取り（★いま発行するのは signup と daily だけ＝`ep_grant_amount`・★使えない口を並べない・将来の約束を書かない） */
export const CLAIM_EP_FREE_ONLY = '無償でのみ受け取れます（いまは毎日のログイン）';

/**
 * ★デイリーの受け取り（★`claim_daily_ep` の dedupe_key ＝ 'daily:' || 利用者 || ':' || その日の始まり・★`ep_ledger_dedupe_key_uniq`（0013）が DB で担保）。
 */
export const CLAIM_DAILY_ONCE = '1 日 1 回 受け取れます';

/** ★発売の締切を過ぎた（★/odds・帯・/vote が同じ語を出す・★締切の時刻は `sales-close.ts` の salesCloseAtMs） */
export const CLAIM_SALES_CLOSED = '投票は締め切りました';

/**
 * ★調教の費用が残高に足りないとき（★ワーカーは `spend_training_ep` の ST001 で その週を ★無料の休養に落とす＝training-runner.ts）。
 *   ★2026-09-29: ★落ちたことは ワーカーのログにしか出ず、★オーナーの馬が 約 30 時間 毎週休養になっていた（★利用者に届いていなかった）。
 *   ★裁定 `REVIEW_EP_BUDGET_20260925.md` 09-29 追記: ★休養に落とすのは確定・★まず前向きの警告。
 */
export const CLAIM_TRAIN_EP_SHORT = 'このままだと次の週は休養になります（参加ポイントが足りません）';

/*
 * ─── ★2026-09-29 の点検で「合っている」と判定した文を ★ここへ移した（★1 文ずつ 裏づけを claims-backed ⑬〜㉔ に）───
 */

/** ★賞金ポイントが増えるのは レースの結果（払戻・着順の賞金）だけ（★prize_points を足すのは payout.ts と prize-award.ts だけ） */
export const CLAIM_PP_FROM_RACES_ONLY = 'レースの結果だけで増えます';

/** ★配合の依頼が失敗したら 同じ母で同じ年にもう一度頼める（★一意の索引が failed を除く・0071） */
export const CLAIM_BREED_RETRY_SAME_YEAR = 'この母は、今年のうちにもう一度依頼できます。';

/** ★処理の途中で落ちたら 取引ごと戻す（★種付料も戻る・player-breeding） */
export const CLAIM_BREED_TEMP_NO_EP = '参加ポイントは引かれていません。';

/** ★種付料は 確定のときの式で決まり、★依頼の上限を超えたら生産しない（player-breeding の fee_above_max） */
export const CLAIM_BREED_PAY_AT_CONFIRM = '確定したときの額を払います。上限を超えたら生産しません。';

/** ★馬の名前を 利用者が変える口は無い（★horses.name を書き換える行が 0 件） */
export const CLAIM_NAME_NO_SELF_CHANGE = 'ご自身では変更できません';

/** ★同じ名前の判定は ★送った後にワーカーが行う（player-naming の name_taken） */
export const CLAIM_NAME_DUP_AFTER_SEND = '送ってから分かります';

/** ★繁殖入りは牝馬だけ・牡馬は種牡馬（breeding_role_block の sex_mismatch） */
export const CLAIM_BROODMARE_FEMALE_ONLY = '繁殖入りは牝馬だけです。牡馬は「種牡馬入り」を選べます。';

/** ★役割を選べるのは 引退した馬だけ（breeding_role_block の not_retired） */
export const CLAIM_ROLE_AFTER_RETIRE = '役割を選べるのは、引退して功労馬になってからです。';

/** ★役割は 頼んだ取引の中で変わる（request_breeding_role が horses.retirement_role を書く） */
export const CLAIM_ROLE_IMMEDIATE = 'その場で変わります';

/** ★現在値は 素質（potential）を超えない（growth.ts の grow が potential で止める） */
export const CLAIM_POTENTIAL_CAP = '現在値は素質による上限まで伸びます';

/** ★指示の無い週は 既定の献立（training-runner の `ordered ?? defaultMenu(...)`） */
export const CLAIM_DEFAULT_MENU = '指示しない週は、既定の献立で調教されます';

/** ★参加ポイントと賞金ポイントは 別の台帳（ep_ledger と pp_ledger） */
export const CLAIM_POINTS_SEPARATE = '参加ポイントと賞金ポイントは別々に記録されます';

/**
 * ★出走の取消（★2026-09-29・D-123 ①・`lib/entry-scratch.ts`）。
 *   ★受けるのは ★レースの段が `announced`（★出走表が出る前）の間だけ（★判定は `request_entry_scratch`・0079）。
 *   ★返すのは ★既存の経路（★ワーカーの `scratchEntry`: 登録料は `races.entry_fee_ep` の行・騎手の料金は凍結から・EP で）。
 *   ⚠️ ★旧文「登録は、画面から取り消せません。」は ★画面が口を呼んでいなかった間の事実（★網 claims-backed ⑦）。
 */
export const CLAIM_ENTRY_CANCEL_WINDOW = '登録は、出走表が出る前（発売の準備に入る前）まで取り消せます。取り消すと、出走料と騎手の料金は参加ポイントで戻ります。';
/** ★取消は 依頼を積んだ時点で止められない（★request_entry_scratch に取り下げの口は無い） */
export const CLAIM_ENTRY_SCRATCH_CONFIRM = '取消は、押したあとで止められません。';
/** ★登録ボタンの下の 1 行（★同じ事実の短い形） */
export const CLAIM_ENTRY_CANCEL_SHORT = '出走表が出る前まで取り消せます';

/** ★表示名・牧場名・勝負服は ★あとから変えられない（★変える口が 0 件・`create_account` は作り直せない） */
export const CLAIM_NO_CHANGE_LATER = 'あとから変えられません。';

/** ★固定オッズ（★生成時に `race_odds` へ 1 回入れて 変えない・★購入時の値で払う） */
export const CLAIM_ODDS_FIXED = 'オッズは発売のときに決まり、締切まで変わりません';

/**
 * ★未ログインで見られるもの（★開催情報とオッズ・★実レースの録画は ログインが要る＝`canPlayRealRace`）。
 * ⚠️ ★オーナーが「未ログインにも録画を見せる」を通したら ★書き直し（★網が落ちて知らせる）。
 */
export const CLAIM_GUEST_CAN_SEE = '登録しなくても、レースの開催情報とオッズはご覧いただけます';
