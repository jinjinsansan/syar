/**
 * ★**毎日のログインで参加ポイントを受け取る**（★D-075・`0080_daily_ep.sql`）
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §1（条件 1〜7）・§5 (c)
 *
 * 【🔴 ★2026-09-25 まで、渡す側が無いまま画面だけ在りました】
 *   ★`/earn` は「毎日のログイン … 受け取り機能を準備中です」と ★**正直に**出していました。
 *   ★しかし調教はワーカーが毎週 EP を吸うので、★**全員がいずれ 0 になり、何もできなくなります。**
 *   ★本番のオーナーの口座が実際にそうなりました（★`inflow +2,000` / `training −2,000` / 残高 0）。
 *
 * 【⚠️ ★ここは額を決めません】
 *   ★`claim_daily_ep()` は ★**引数を取りません**。★渡す額はサーバーが `ep_grant_amount('daily')`
 *   ★から取ります（★憲法 3「クライアント計算を信用しない」）。
 *   ★`EP_GRANTS.daily` をここで使うのは ★**押す前に「いくら」と言うため**だけです。
 */
import { authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';

export interface DailyEpState {
  /** ★受け取れる額 [EP]（★サーバーが返した値） */
  readonly amount: number;
  /** ★いま押せるか（★未受領・日次上限に余裕あり・★配布が止まっていない） */
  readonly claimable: boolean;
  /** ★今日はもう受け取ったか */
  readonly alreadyClaimed: boolean;
  /**
   * 🔴 ★**配布そのものが止まっているか**（★`0081`・裁定 §7 ①）。
   *   ★「1 日」の鍵は ★ワーカーが書く `world_state.day_started_at` から作るので、
   *   ★ワーカーが止まると ★**誰も受け取れません**。
   * ⚠️ ★このとき ★**「受け取り済み」と出してはいけません**（★受け取ったから押せないのではない）。
   */
  readonly distributionStalled: boolean;
}

export interface DailyEpResult {
  /** ★実際に渡った額 [EP]（★2 回めは 0） */
  readonly granted: number;
  /** ★受け取ったあとの残高 [EP] */
  readonly balance: number;
  /** ★今日はもう受け取っていた */
  readonly alreadyClaimed: boolean;
}

function row(data: unknown): Record<string, unknown> {
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (r === undefined) throw new Error('サーバーが何も返しませんでした');
  return r;
}

function num(r: Record<string, unknown>, k: string): number {
  const v = r[k];
  // ★`bigint` は文字列で返ります（★`Number` を通す。★`NaN` を黙って通さない）
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) throw new Error(`サーバーの返した ${k} が数ではありません`);
  return n;
}

/** ★今日 受け取れるか（★表示のため。★可否はサーバーが押されたときに数え直します） */
export async function fetchDailyEpState(): Promise<DailyEpState> {
  const { data: sessionData } = await authClient().auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();
  const { data, error } = await authClient().rpc('my_daily_ep_state');
  if (error !== null) throw new Error(`受け取りの状態を読めませんでした: ${error.message}`);
  const r = row(data);
  return {
    amount: num(r, 'amount'),
    claimable: r['claimable'] === true,
    alreadyClaimed: r['already_claimed'] === true,
    distributionStalled: r['distribution_stalled'] === true,
  };
}

/**
 * ★配布が止まっているときに出す言葉（★裁定 §7 ①「古いものを新しいように見せない」）。
 * ⚠️ ★画面から消さないこと。★`apps/cli/test/daily-ep-screen.test.ts` が見ています。
 */
export const DAILY_EP_STALLED_NOTE = 'いま配布が止まっています';

/** ★受け取る（★1 日 1 回・押した本人だけ・繰り越さない） */
export async function claimDailyEp(): Promise<DailyEpResult> {
  const { data: sessionData } = await authClient().auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();
  const { data, error } = await authClient().rpc('claim_daily_ep');
  if (error !== null) throw new Error(error.message);
  const r = row(data);
  return {
    granted: num(r, 'granted'),
    balance: num(r, 'balance'),
    alreadyClaimed: r['already_claimed'] === true,
  };
}

/**
 * ★**押す前に言うこと**（★裁定 §5 (c)・D-123 の作法）。
 *   ★繰り越しません。★押さなかった日のぶんは消えます。
 * ⚠️ ★画面から消さないこと。★`apps/cli/test/daily-ep-screen.test.ts` が見ています。
 */
export const DAILY_EP_NO_CARRYOVER_NOTE = 'その日のぶんは翌日に持ち越せません';
