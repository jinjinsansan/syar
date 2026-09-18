/**
 * ★**投票の画面が使う形**（★UI-2・2026-09-19）
 *
 * 【★なぜ画面と別に置くか】★`entry-screen.ts` と同じ理由
 *   ★画面に「サーバーの行 → 見せる形」の変換を置くと、★**画面が仕様を持ち始めます**。
 *
 * 🔴 ⚠️ ★**並べ方・見せ方は仮です**（★UI1-8 と同じ扱い・★デザイナー便で差し替わります）。
 *    ★**これを「デザイン」と思わないでください。**
 *
 * 【★この層が持たないもの】
 *   ⚠️ ★**上限も控除率も持ちません**（★`place_bet` が持っています。★§9.1・§9.3）。
 *      ★画面が持つと ★**SQL と画面の二重帳簿**になります（★EF で踏んだ形）。
 *      ★上限に当たったことは ★**RPC の文言**で分かります（★UI1-9 と同じ作法）。
 *   ⚠️ ★**オッズを計算しません**（★モンテカルロはサーバー・§9.2）。★`race_odds_public` を読むだけです。
 *   ⚠️ ★**締切を計算しません**（★`races_public.entry_deadline_at` と `scheduled_at` はサーバーの値）。
 */
import { CLASS_LABEL, CONDITION_LABEL, SURFACE_LABEL, formatClock } from './format';
import { authClient, readClient } from './supabase';

/** ★出馬表の 1 頭（★`race_entries_public` が返す列だけ） */
export interface BetEntryView {
  readonly gate: number;
  readonly horseName: string;
  readonly strategy: string;
  readonly weight: number;
  /** ★人気（★モンテカルロ勝率の順位・§9.2）。★確定前から見てよい */
  readonly popularity: number | null;
  /** ★所有者の表示名（★NPC は厩舎の冠名。★`owner_id` は出ない） */
  readonly ownerLabel: string | null;
  /**
   * ★**これは自分の馬か**（★`0044`・**BT-3**）。
   * 🔴 ★旧は ★**馬名で突き合わせて**いました — ★`horses.name` に**一意制約はありません**
   *    （★staging は 7,370 / 7,370 で**たまたま**一致しているだけ）。★**測っていない前提**でした。
   * ★いまは ★**サーバーが `auth.uid()` で判定した結果**を読むだけです（★BT-0）。
   */
  readonly isMine: boolean;
}

/** ★1 レースぶん */
export interface BetRaceView {
  readonly id: string;
  readonly raceNo: string;
  readonly raceName: string;
  readonly cond: string;
  readonly classLabel: string;
  readonly time: string;
  readonly fieldSize: number;
  readonly entries: readonly BetEntryView[];
  /** ★券種と選択 → オッズ（★`race_odds_public` の写し。★画面では計算しない） */
  readonly odds: ReadonlyMap<string, number>;
  readonly status: string;
}

/** ★オッズの鍵（★券種と選択の組。★`race_odds` の一意の組と同じ形） */
export function oddsKey(betType: string, selection: readonly number[]): string {
  return `${betType}:${JSON.stringify(selection)}`;
}

/** ★画面がひとそろい必要とするもの */
export interface BetScreenData {
  readonly race: BetRaceView | null;
  readonly epBalance: number;
  /**
   * ★**自分の馬の枠番**（★§9.5: 自馬が出るレースは、自馬を全頭含む買い目しか買えない）。
   * ⚠️ ★**判定は `place_bet` がします**。★ここは ★**「どれが自分の馬か」を見せる**ためだけです。
   */
  readonly ownGates: readonly number[];
}

/**
 * ★**あと何 EP 投票できるか**（★`0047`・BT-1/**BT-5**）。
 * ⚠️ ★**上限そのものは持ちません** — ★画面に渡すのは「判断の結果」だけです（BT-0）。
 * ⚠️ ★`bindingLabel` は ★**「いま効いている上限の名前」**であって、★**「達した」ではありません**
 *    （★達したかどうかは `remainingEP === 0` かどうかで、★画面が言います）。
 */
export interface BetAllowance {
  readonly remainingEP: number;
  readonly binding: string;
  readonly bindingLabel: string;
}

/**
 * ★**券種を渡して、あと何 EP かを聞く**（★`my_bet_allowance(race_id, bet_type)`・**BT-5**）。
 *
 * 🔴 ★**券種を省けません**。★`0044` はビューから `null` を渡していて、
 *    ★**「全券種の合計を 1 券種とみなす」**答えになっていました
 *    （★単勝 10,000 ＋ 複勝 10,000 の人に、★新しい券種の残りを ★**10,000 と表示**。★本当は 30,000）。
 *    ★裁定 `REVIEW_BET_ALLOWANCE_VERDICT_20260919.md` §2。
 * → ★**券種を選び直すたびに呼び直します。**
 *
 * ⚠️ ★ログインしていなければ ★**呼びません**（★RPC は `未認証` で落ちます）。
 *    ★`/vote` はログアウトでも見られる画面なので、★**無い**を null で表します。
 */
export async function loadBetAllowance(raceId: string, betType: string): Promise<BetAllowance | null> {
  const auth = authClient();
  const { data: sess } = await auth.auth.getSession();
  if (sess.session === null) return null;
  const { data, error } = await auth.rpc('my_bet_allowance', { p_race_id: raceId, p_bet_type: betType });
  // ⚠️ ★失敗を null にしません（★「上限が無い」に見えてしまう・R-16）
  if (error !== null) throw new Error(`my_bet_allowance を呼べませんでした: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) return null;
  return {
    remainingEP: Number(row.remaining_ep),
    binding: String(row.binding),
    bindingLabel: String(row.binding_label),
  };
}

const RACE_COLUMNS = 'id, name, grade, class_rank, surface, distance, track_condition, scheduled_at, status, cycle_index';

/**
 * ★**1 レースぶんを読む**。
 *
 * ⚠️ ★**失敗を空にしません**（★「出馬表が無い」に見えてしまう）。★投げます。
 * ⚠️ ★`raceId` が null なら ★**いちばん近い受付中のレース**を選びます
 *    （★`/vote` は 1 鞍だけを見せる画面なので）。
 */
export async function loadBetScreen(raceId: string | null): Promise<BetScreenData> {
  const read = readClient();
  const auth = authClient();

  const q = read.from('races_public').select(RACE_COLUMNS);
  const racesRes = raceId === null
    ? await q.eq('status', 'scheduled').order('scheduled_at', { ascending: true }).limit(1)
    : await q.eq('id', raceId).limit(1);
  if (racesRes.error !== null) throw new Error(`races_public を読めませんでした: ${racesRes.error.message}`);
  const r = racesRes.data?.[0];
  if (r === undefined) {
    const [userRes] = await Promise.all([auth.from('users').select('entry_points').limit(1)]);
    return {
      race: null,
      epBalance: Number(userRes.data?.[0]?.entry_points ?? 0),
      ownGates: [],
    };
  }

  const id = String(r.id);
  /**
   * ⚠️ ★**「あと何 EP」はここでは読みません**（★**BT-5**・`0047`）。
   *    ★券種ごとに違う答えなので、★**券種が決まってから `loadBetAllowance()` で聞きます**。
   *    ★`0044` はここで券種を渡さずに読んでいて、★**誤った数を出していました**。
   */
  const [entriesRes, oddsRes, userRes] = await Promise.all([
    read.from('race_entries_public')
      .select('gate, horse_name, strategy, weight, popularity, owner_label, is_mine')
      .eq('race_id', id).order('gate', { ascending: true }),
    read.from('race_odds_public').select('bet_type, selection, odds').eq('race_id', id),
    auth.from('users').select('entry_points, stable_name').limit(1),
  ]);
  if (entriesRes.error !== null) throw new Error(`race_entries_public を読めませんでした: ${entriesRes.error.message}`);
  if (oddsRes.error !== null) throw new Error(`race_odds_public を読めませんでした: ${oddsRes.error.message}`);
  if (userRes.error !== null) throw new Error(`users を読めませんでした: ${userRes.error.message}`);

  const entries: BetEntryView[] = (entriesRes.data ?? []).map((e) => ({
    gate: Number(e.gate),
    horseName: String(e.horse_name),
    strategy: String(e.strategy),
    weight: Number(e.weight),
    popularity: e.popularity === null || e.popularity === undefined ? null : Number(e.popularity),
    ownerLabel: e.owner_label === null || e.owner_label === undefined ? null : String(e.owner_label),
    isMine: Boolean(e.is_mine),
  }));

  const odds = new Map<string, number>();
  for (const o of oddsRes.data ?? []) {
    const sel = Array.isArray(o.selection) ? (o.selection as number[]) : [];
    odds.set(oddsKey(String(o.bet_type), sel), Number(o.odds));
  }

  /**
   * ★**自分の馬の枠番**（★`is_mine` はサーバーが `auth.uid()` で判定した結果・BT-3）。
   * 🔴 ★旧は ★**馬名で突き合わせて**いました。★`horses.name` に一意制約は無く、
   *    ★**測っていない前提**でした（★裁定 `REVIEW_BET_LIMITS_VERDICT_20260919.md` §3）。
   */
  const ownGates = entries.filter((e) => e.isMine).map((e) => e.gate);

  return {
    race: {
      id,
      raceNo: String(r.name),
      raceName: String(r.name),
      cond: `${SURFACE_LABEL[String(r.surface)] ?? String(r.surface)}${Number(r.distance).toLocaleString('ja-JP')}m ${CONDITION_LABEL[String(r.track_condition)] ?? String(r.track_condition)}`,
      classLabel: String(r.grade ?? '') !== '' ? String(r.grade) : (CLASS_LABEL[Number(r.class_rank) - 1] ?? '?'),
      time: formatClock(new Date(String(r.scheduled_at)).toISOString()),
      fieldSize: entries.length,
      entries,
      odds,
      status: String(r.status),
    },
    epBalance: Number(userRes.data?.[0]?.entry_points ?? 0),
    ownGates,
  };
}

/** ★投票の失敗（★`entry-repo.ts` の `readEntryError` と同じ作法） */
export type BetFailure =
  | { readonly kind: 'insufficient_ep'; readonly message: string }
  | { readonly kind: 'other'; readonly message: string };

/**
 * ★**失敗をそのまま出す**（★黙って握らない・R-27）。
 * ⚠️ ★**上限・控除率・§9.5 の判定はすべて `place_bet` が持っています。**
 *    ★画面は ★**文言をそのまま見せるだけ**です（★言い換えると、直すべき所が見えなくなります）。
 */
export function readBetError(err: { code?: string; message?: string } | null): BetFailure {
  const message = err?.message ?? '投票できませんでした（理由が返っていません）';
  if (err?.code === 'ST001') return { kind: 'insufficient_ep', message };
  return { kind: 'other', message };
}

/** ★投票する（★`place_bet`） */
export async function placeBet(input: {
  readonly raceId: string;
  readonly betType: string;
  readonly selection: readonly number[];
  readonly amount: number;
  readonly clientToken: string;
}): Promise<{ readonly ok: true; readonly betId: string } | { readonly ok: false; readonly failure: BetFailure }> {
  const { data, error } = await authClient().rpc('place_bet', {
    p_race_id: input.raceId,
    p_bet_type: input.betType,
    p_selection: input.selection,
    p_amount: input.amount,
    p_client_token: input.clientToken,
  });
  if (error !== null) return { ok: false, failure: readBetError(error) };
  return { ok: true, betId: String(data) };
}
