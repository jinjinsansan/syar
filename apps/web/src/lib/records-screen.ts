/**
 * ★**記録の画面が使う形**（★UI-4・`/records`・2026-09-19）
 *
 * 【★この層が持たないもの】★`entry-screen.ts`・`bet-screen.ts`・`prize-screen.ts` と同じ作法
 *   ⚠️ ★**時計を持ちません**（★憲法 4）。★`Date.now()` も epoch も 1 週の長さも使いません。
 *      ★「今週」は ★**`world_state_public.week_started_at`**（★ワーカーが書いた実時刻）と
 *      ★`created_at` を比べるだけです。
 *   ⚠️ ★**EP と PP を合算しません**（★憲法 2・別カラム別台帳）。★表も別々です。
 *   ⚠️ ★**増減の符号を語から決めません** — ★`delta` が持っています（後述）。
 *
 * 🔴 ⚠️ ★**並べ方・見せ方は仮です**（★UI1-8 と同じ扱い・★デザイナー便で差し替わります）。
 */
import { CLASS_LABEL, CONDITION_LABEL, SURFACE_LABEL } from './format';
import { readClient, authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';

/**
 * ★**期間**（★`/records` の絞り込み）。
 *
 * 🔴 ⚠️ ★**「今月」がありません。** ★正典に ★**ゲーム内の「月」が無い**ためです
 *    （★1 週 ＝ 4 時間・D-007）。★実時刻の暦月で切ると、★BT-6 とまったく同じ
 *    ★**「どの暦か決まっていない境目」**になります。
 *    → ★**推測で埋めず、照会に出しています**（★`QUESTIONS_UI4_20260919.md`）。
 */
export type RecordPeriod = 'week' | 'all';

export const PERIOD_LABEL: Readonly<Record<RecordPeriod, string>> = {
  week: '今週',
  all: '全期間',
};

/**
 * ★**台帳の理由の表示名**。
 *
 * ⚠️ 🔴 ★**SQL の CHECK と過不足があってはいけません。**
 *    ★`ep_ledger_reason_allowed` / `pp_ledger_reason_allowed` が ★**語彙の正**で、
 *    ★ここは ★**その語を日本語にするだけ**です。
 *    ★足りなければ画面に生の英語が出ますし、★余っていれば「もう無い理由」を持ち続けます。
 *    → ★`apps/cli/test/records-screen-wiring.test.ts` が ★**両方向**を突き合わせます。
 *
 * ⚠️ ★**`from_ep` / `convert` / `topup` の類をここに書かないこと**（★構造 S-5・憲法 2）。
 *    ★PP 側に EP からの変換を表す語を作った瞬間、★二種ポイント制が壊れます。
 */
export const EP_REASON_LABEL: Readonly<Record<string, string>> = {
  inflow: '配布',
  training: '調教',
  entry_fee: '出走料',
  bet: '投票',
  refund: '返還',
  stud_fee: '種付料',
  horse_purchase: '馬の購入',
  horse_sale: '馬の売却',
  stable_grade: '厩舎の格',
};

export const PP_REASON_LABEL: Readonly<Record<string, string>> = {
  prize: '賞金',
  payout: '払戻',
  prize_exchange: '景品交換',
};

/** ★台帳の 1 行 */
export interface LedgerRowView {
  readonly at: string;
  readonly reason: string;
  /** ★理由の表示名。⚠️ ★知らない語は**そのまま出します**（★勝手に「その他」にまとめない） */
  readonly reasonLabel: string;
  readonly delta: number;
  readonly balance: number;
}

/** ★出走の 1 行（★`my_runs`・`0046`） */
export interface RunRowView {
  readonly raceId: string;
  readonly horseName: string;
  /** ★ゲーム内の何週めか。⚠️ ★`0046` より前のレースは **null**（★0 週と偽らない） */
  readonly gameWeek: number | null;
  readonly at: string;
  readonly raceName: string;
  readonly classLabel: string;
  readonly classRank: number;
  readonly cond: string;
  readonly gate: number;
  readonly place: number;
  readonly fieldSize: number;
}

export interface RecordsScreenData {
  readonly runs: readonly RunRowView[];
  readonly ep: readonly LedgerRowView[];
  readonly pp: readonly LedgerRowView[];
  /** ★いまのゲーム内の週（★`world_state_public`） */
  readonly gameWeek: number;
  /**
   * 🔴 ★**1 走あたりの賞金 PP を出していません。**
   *    ★`pp_ledger` の `reason = 'prize'` は ★**`ref_id = race_id`** で、
   *    ★同じレースに自分の馬が 2 頭出ると ★**どちらの分か区別できません**。
   *    ★賞金表（`packages/scheduler/src/prize.ts`）を SQL に写すのは D-052 です。
   *    → ★照会中（★`QUESTIONS_UI4_20260919.md`）。★戦績表に「賞金」列を出しません。
   */
  readonly prizeColumnAvailable: false;
}

const label = (map: Readonly<Record<string, string>>, reason: string): string => map[reason] ?? reason;

/**
 * ★**記録の画面 1 枚ぶんを読む**。
 * ⚠️ ★**失敗を空にしません**（★「記録が無い」に見えてしまう・R-16）。★投げます。
 */
export async function loadRecordsScreen(period: RecordPeriod): Promise<RecordsScreenData> {
  const read = readClient();
  const auth = authClient();

  /**
   * 🔴 ★**先にセッションを見ます**（★2026-09-25・裁定 `REVIEW_IDLE_WORK_20260925.md` (A)）
   *
   * 【★何が起きていたか — ★`/entry` と ★**同じ欠陥**が ここにも生きていました】
   *   ★下で ★`my_runs`（★`where h.owner_id = auth.uid()`）を読みます。
   *   ★未ログインの人が `/records` を開くと（★`/mypage` から来られます）、
   *   ★★**`permission denied for view my_runs` が そのまま画面に出ます**。
   *   ✔ ★staging で実測しました:
   *     ★`anon` … 🔴 `permission denied for view my_runs`
   *     ★`authenticated`（セッションなし）… ★0 行（★「戦績がありません」と ★**嘘**を出す）
   *   → ★どちらも駄目です。★前者は ★DB の内部を見せ、★後者は ★**無いと言い切る**。
   *
   * ★`/entry` で同じものを 2026-09-25 に直しました（★あちらは ★公開のレース一覧まで
   *   ★道連れにして「今週は出走できるレースがありません」と嘘を出していました）。
   * → ★**ログインしていないなら、★DB に触る前に `SignInRequiredError`** にします。
   * ⚠️ ★網: `apps/cli/test/owner-scoped-needs-session.test.ts`
   */
  const { data: sessionData } = await auth.auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();

  /**
   * ★「今週」の境目は ★**サーバーが書いた実時刻**です（★`0048`）。
   * ⚠️ ★ここで `Date.now()` を使わないこと（★憲法 4）。
   */
  const worldRes = await read.from('world_state_public').select('game_week, week_started_at').limit(1);
  if (worldRes.error !== null) throw new Error(`world_state_public を読めませんでした: ${worldRes.error.message}`);
  const world = worldRes.data?.[0];
  const weekStartedAt = world?.week_started_at === null || world?.week_started_at === undefined
    ? null : String(world.week_started_at);
  /**
   * 🔴 ★**週の始まりが書かれていなければ「今週」で絞れません**。
   *    ★黙って全期間にすると ★**「今週」と書いてある表に全部出ます**（R-16）。★投げます。
   */
  if (period === 'week' && weekStartedAt === null) {
    throw new Error('週の始まりがまだ書かれていません（★ワーカーが 0048 より後に 1 周していません）');
  }

  const runsQ = auth.from('my_runs')
    .select('race_id, horse_name, game_week, scheduled_at, race_name, grade, class_rank, surface, distance, track_condition, gate, finish_pos, field_size')
    .order('scheduled_at', { ascending: false }).limit(100);
  const epQ = auth.from('ep_ledger').select('created_at, reason, delta, balance_after')
    .order('created_at', { ascending: false }).limit(100);
  const ppQ = auth.from('pp_ledger').select('created_at, reason, delta, balance_after')
    .order('created_at', { ascending: false }).limit(100);

  const [runsRes, epRes, ppRes] = await Promise.all([
    period === 'week' && weekStartedAt !== null ? runsQ.gte('scheduled_at', weekStartedAt) : runsQ,
    period === 'week' && weekStartedAt !== null ? epQ.gte('created_at', weekStartedAt) : epQ,
    period === 'week' && weekStartedAt !== null ? ppQ.gte('created_at', weekStartedAt) : ppQ,
  ]);
  if (runsRes.error !== null) throw new Error(`my_runs を読めませんでした: ${runsRes.error.message}`);
  if (epRes.error !== null) throw new Error(`ep_ledger を読めませんでした: ${epRes.error.message}`);
  if (ppRes.error !== null) throw new Error(`pp_ledger を読めませんでした: ${ppRes.error.message}`);

  const runs: RunRowView[] = (runsRes.data ?? []).map((r) => ({
    raceId: String(r.race_id),
    horseName: String(r.horse_name),
    gameWeek: r.game_week === null || r.game_week === undefined ? null : Number(r.game_week),
    at: String(r.scheduled_at),
    raceName: String(r.race_name),
    /** ★格の表示は `bet-screen.ts` と同じ作法（★G1 などがあればそれ、無ければ段の名前） */
    classLabel: String(r.grade ?? '') !== ''
      ? String(r.grade)
      : (CLASS_LABEL[Number(r.class_rank) - 1] ?? '?'),
    classRank: Number(r.class_rank),
    cond: `${SURFACE_LABEL[String(r.surface)] ?? String(r.surface)}${Number(r.distance).toLocaleString('ja-JP')}m `
      + `${CONDITION_LABEL[String(r.track_condition)] ?? String(r.track_condition)}`,
    gate: Number(r.gate),
    place: Number(r.finish_pos),
    fieldSize: Number(r.field_size),
  }));

  const toLedger = (rows: readonly Record<string, unknown>[], map: Readonly<Record<string, string>>): LedgerRowView[] =>
    rows.map((l) => ({
      at: String(l['created_at']),
      reason: String(l['reason']),
      reasonLabel: label(map, String(l['reason'])),
      delta: Number(l['delta']),
      balance: Number(l['balance_after']),
    }));

  return {
    runs,
    ep: toLedger(epRes.data ?? [], EP_REASON_LABEL),
    pp: toLedger(ppRes.data ?? [], PP_REASON_LABEL),
    gameWeek: Number(world?.game_week ?? 0),
    prizeColumnAvailable: false,
  };
}
