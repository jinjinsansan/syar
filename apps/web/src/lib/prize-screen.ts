/**
 * ★**景品交換の画面が使う形**（★UI-4・2026-09-19）
 *
 * 【★この層が持たないもの】★`entry-screen.ts`・`bet-screen.ts` と同じ作法
 *   ⚠️ ★**在庫の判定を持ちません**（★§11.3「★在庫切れは交換画面に出さない ＝ 選ばせてから断らない」）。
 *      ★`prize_catalog_public` が ★**`active and stock > 0` で絞った行だけ**を返します。
 *      → ★**出ている ＝ 交換できる**。★画面が在庫を数えません。
 *   ⚠️ ★**PP → 景品の交換可否を判定しません**（★`exchange_prize` が持っています）。
 *      ★残高との比較は「押せるか」の見せ方のためだけで、★**最終判定は RPC**です。
 *   ⚠️ ★**PP を EP に戻す導線を作りません**（★憲法 2。★賞金 P → 参加 P の還流は弁護士判断まで不可）。
 *
 * 🔴 ⚠️ ★**並べ方・見せ方は仮です**（★UI1-8 と同じ扱い・★デザイナー便で差し替わります）。
 */
import { authClient, readClient } from './supabase';

/** ★交換できる景品（★`prize_catalog_public` が返す列だけ） */
export interface PrizeView {
  readonly id: string;
  readonly name: string;
  readonly costPP: number;
}

/** ★交換の履歴（★`prize_exchanges` は本人の行だけが見える） */
export interface PrizeHistoryView {
  readonly id: string;
  readonly prizeName: string;
  readonly costPP: number;
  readonly status: string;
  readonly at: string;
}

/** ★状態の表示名（★`0007` の `exchange_status_known` と同じ 3 値） */
export const PRIZE_STATUS_LABEL: Readonly<Record<string, string>> = {
  requested: '受付ました',
  fulfilled: 'お届け済み',
  cancelled: '取消',
};

export interface PrizeScreenData {
  readonly prizes: readonly PrizeView[];
  readonly history: readonly PrizeHistoryView[];
  readonly ppBalance: number;
}

/**
 * ★**画面 1 枚ぶんを読む**。
 * ⚠️ ★**失敗を空にしません**（★「景品が無い」に見えてしまう）。★投げます。
 */
export async function loadPrizeScreen(): Promise<PrizeScreenData> {
  const read = readClient();
  const auth = authClient();
  const { data: sessionData } = await auth.auth.getSession();
  if (sessionData.session === null) throw new Error('景品交換にはログインしてください。');

  const [catalogRes, userRes, historyRes] = await Promise.all([
    /**
     * ⚠️ ★**絞り込みを書いていません** — ★`prize_catalog_public` が
     *    ★**`active and stock > 0` で既に絞っています**（`0007:53`）。
     *    ★画面でもう一度絞ると、★**在庫の規則が 2 か所**になります（D-052）。
     */
    read.from('prize_catalog_public').select('id, name, cost_pp').order('cost_pp', { ascending: true }),
    auth.from('users').select('prize_points').limit(1),
    auth.from('prize_exchanges')
      .select('id, cost_pp, status, created_at, prize_id')
      .order('created_at', { ascending: false }).limit(50),
  ]);
  if (catalogRes.error !== null) throw new Error(`prize_catalog_public を読めませんでした: ${catalogRes.error.message}`);
  if (userRes.error !== null) throw new Error(`users を読めませんでした: ${userRes.error.message}`);
  if (historyRes.error !== null) throw new Error(`prize_exchanges を読めませんでした: ${historyRes.error.message}`);
  if ((userRes.data ?? []).length === 0) throw new Error('利用者情報を取得できませんでした。ログイン状態を確認してください');

  const prizes: PrizeView[] = (catalogRes.data ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    costPP: Number(p.cost_pp),
  }));

  /**
   * ★履歴に景品の名前を付ける。
   * ⚠️ 🔴 ★**掲載が終わった景品の名前は出せません** — ★`prize_catalog_public` は
   *    ★`active and stock > 0` で絞っているためです。
   *    ★**推測で埋めず**、★「掲載が終了しています」と出します（★名前を作らない）。
   */
  const nameById = new Map(prizes.map((p) => [p.id, p.name]));
  const history: PrizeHistoryView[] = (historyRes.data ?? []).map((h) => ({
    id: String(h.id),
    prizeName: nameById.get(String(h.prize_id)) ?? '（掲載が終了しています）',
    costPP: Number(h.cost_pp),
    status: String(h.status),
    at: String(h.created_at),
  }));

  return { prizes, history, ppBalance: Number(userRes.data?.[0]?.prize_points ?? 0) };
}

/** ★交換の失敗（★`readEntryError` / `readBetError` と同じ作法） */
export interface PrizeFailure { readonly message: string }

/**
 * ★**失敗をそのまま出す**（★黙って握らない・R-27）。
 * ⚠️ ★在庫切れも PP 不足も ★**`exchange_prize` が判定**します。★画面は文言を見せるだけです。
 */
export function readPrizeError(err: { message?: string } | null): PrizeFailure {
  return { message: err?.message ?? '交換できませんでした（理由が返っていません）' };
}

/** ★交換する（★`exchange_prize`） */
export async function exchangePrize(input: {
  readonly prizeId: string;
  readonly clientToken: string;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly failure: PrizeFailure }> {
  const { error } = await authClient().rpc('exchange_prize', {
    p_prize_id: Number(input.prizeId),
    p_client_token: input.clientToken,
  });
  if (error !== null) return { ok: false, failure: readPrizeError(error) };
  return { ok: true };
}
