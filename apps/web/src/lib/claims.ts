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

import { BET_CAP_OWN_RACE_EP } from '@star/betting';
import { CYCLE_MS, PHASE_OFFSET_MS } from '@star/scheduler';

/** ★ミリ秒を「5 分 30 秒」の形に（★画面に数字を直書きしない・cycle.ts から導く） */
function jaDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m === 0 ? `${r} 秒` : r === 0 ? `${m} 分` : `${m} 分 ${r} 秒`;
}

/**
 * ★出馬表の公開（★scheduler cycle.ts: 公開は周の `publish`・発走は周の終わり `CYCLE_MS`）。
 *   ★2026-09-29: ★「発走 10 分前に確定します」は 10 分の周だった頃の名残り（★いまは 6 分）。
 */
export const CLAIM_CARD_PUBLISH = `出馬表は発走の ${jaDuration(CYCLE_MS - PHASE_OFFSET_MS.publish)}前に公開されます`;

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

/** ★出走の取消（★口 0079 は在るが ★画面から呼ぶ所が 0 件 ＝ 画面からは取り消せない・★オーナー判断待ち） */
export const CLAIM_ENTRY_NO_CANCEL = '登録は、画面から取り消せません。';

/** ★表示名・牧場名・勝負服は ★あとから変えられない（★変える口が 0 件・`create_account` は作り直せない） */
export const CLAIM_NO_CHANGE_LATER = 'あとから変えられません。';

/** ★固定オッズ（★生成時に `race_odds` へ 1 回入れて 変えない・★購入時の値で払う） */
export const CLAIM_ODDS_FIXED = 'オッズは発売のときに決まり、締切まで変わりません';

/**
 * ★未ログインで見られるもの（★開催情報とオッズ・★実レースの録画は ログインが要る＝`canPlayRealRace`）。
 * ⚠️ ★オーナーが「未ログインにも録画を見せる」を通したら ★書き直し（★網が落ちて知らせる）。
 */
export const CLAIM_GUEST_CAN_SEE = '登録しなくても、レースの開催情報とオッズはご覧いただけます';
