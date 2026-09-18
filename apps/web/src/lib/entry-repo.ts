/**
 * ★**出走登録のデータ層**（UI-1・★2026-09-18）
 *
 * 【★いまは「入っているが使われない」状態です】（★R-15）
 *   ★`/entry` の画面はまだデモデータを見ています。★**差し替えは別便**です。★理由は 2 つ:
 *     ① ★**`StableHorse` が `stars`（素質）を持っています** — ★**D-114 で出せません**。
 *        ★画面の型から★を外すのは **T-10** の便の仕事です
 *     ② ★非同期の読み込みに差し替えると ★**読み込み中・失敗の表示**が要ります ＝ ★**見た目**。
 *        ★見た目はデザイナー経由（2026-09-15 オーナー指示）なので、★配線だけを先に置きます
 *   → ★**接続の前後で対照が取れる形**にしてあります（R-15）。
 *
 * 【★この層が持つもの】
 *   ★**判断の規則だけ**（★どのレースに出られるか・★エラーをどう読むか）。★見た目は持ちません。
 *   ★段の定義（勝利数 → クラス）は ★**`@star/scheduler` の 1 か所**にあり、★ここでは持ちません（D-052）。
 */
import { authClient, readClient } from './supabase';

/** ★出走登録できるかの状態（★既存の画面の語と同じ 3 値。★増やしていません） */
export type EntryState = 'ok' | 'class' | 'closed';

/** ★画面に渡す 1 レース（★`EntryRace` と同じ形にする。★素質は 1 つも含みません） */
export interface EntryRaceRow {
  readonly id: string;
  readonly scheduledAtMs: number;
  readonly classRank: number;
  readonly surface: string;
  readonly distance: number;
  readonly trackCondition: string;
  readonly courseId: string;
  /** ★出走に要る勝利数（`0033`・`0035`）。★null は「資格の情報が無い」＝登録不可 */
  readonly minWins: number | null;
  readonly maxWins: number | null;
  readonly status: string;
  /**
   * ★**登録の締切**（`0041`・ED-1）。★null は「締切の情報が無い」＝登録不可。
   * ⚠️ ★**画面で計算しません**（★正典 §14「画面は時計を持たない」）。
   */
  readonly entryDeadlineAtMs: number | null;
  /** ★出走料 [EP]（`0039`・EF-3）。★null は登録不可 */
  readonly entryFeeEP: number | null;
  /** ★斤量 [kg]（`0039`・EF-3） */
  readonly weightKg: number | null;
  /** ★R 番号のもと（`0040`・EF-5）。★`slotOfDay(cycleIndex)` で導く */
  readonly cycleIndex: number;
}

/**
 * ★**その馬がこのレースに出られるか**（★画面に出す 3 値）。
 *
 * ⚠️ ★**段の定義をここに書きません。** ★レースに保存された数と比べるだけです
 *    （★`enter_race`〔`0033`〕が DB 側で行っている判定と**同じ形**・D-052）。
 * ⚠️ ★**締切の判定は `scheduled_at` から**（★§10.4「発走 60 分前まで」）。
 *    ★画面の時計は信用しません — ★**サーバーから来た時刻**と、★呼ぶ側が渡す「いま」で比べます。
 */
export function entryStateOf(race: EntryRaceRow, wins: number, nowMs: number): EntryState {
  if (race.status !== 'scheduled') return 'closed';
  /**
   * 🔴 ★**締切を画面で計算しません**（★2026-09-19・**ED-1**）。
   *   ★旧: `scheduledAtMs - 60 分`。★これは ★**SQL の `interval '60 minutes'` の写し**でした。
   *   ★新: ★**サーバーが行に書いた `entry_deadline_at`** を読むだけ。
   * ⚠️ ★無い場合は **closed**（R-27: 分からないなら狭い側。★`enter_race` も同じ）。
   */
  if (race.entryDeadlineAtMs === null) return 'closed';
  if (nowMs >= race.entryDeadlineAtMs) return 'closed';
  // ★資格の情報が無いレースは登録できない（★R-27: 分からないなら狭い側。`0033` と同じ）
  if (race.minWins === null) return 'class';
  if (wins < race.minWins) return 'class';
  if (race.maxWins !== null && wins > race.maxWins) return 'class';
  return 'ok';
}

/**
 * ★**登録の失敗をそのまま画面に出す**（★黙って握らない・R-27）。
 *
 * ★`enter_race` は理由ごとに `errcode` を付けています:
 *   ★`ST001` ＝ EP 不足 ／ ★`ST002` ＝ 出走資格（`0033`・CL-4）。
 * ⚠️ ★**当てはまらないものは、原文をそのまま出します**（★`/login` と同じ作法。★推測で言い換えない）。
 */
export type EntryFailure =
  | { readonly kind: 'insufficient_ep'; readonly message: string }
  | { readonly kind: 'not_eligible'; readonly message: string }
  | { readonly kind: 'other'; readonly message: string };

export function readEntryError(err: { code?: string; message?: string } | null): EntryFailure {
  const message = err?.message ?? '登録できませんでした（理由が返っていません）';
  if (err?.code === 'ST001') return { kind: 'insufficient_ep', message };
  if (err?.code === 'ST002') return { kind: 'not_eligible', message };
  return { kind: 'other', message };
}

/** ★自分の馬（★`my_horses`〔`0034`〕が返す列だけ。★素質・能力は 1 つも含みません） */
export interface MyHorseRow {
  readonly id: string;
  readonly name: string;
  readonly sex: string;
  readonly condition: number;
  readonly fatigue: number;
  readonly stableGrade: string;
  readonly retiredAtWeek: number | null;
  readonly careerEnded: boolean;
  /** ★勝利数（`0040`・★`enter_race` と同じ数え方） */
  readonly wins: number;
  /** ★出走数（`0040`） */
  readonly starts: number;
}

export interface EntryRepo {
  /** ★これから発走するレース（★公開ビュー。★ログインしていなくても読めます） */
  listRaces(limit?: number): Promise<EntryRaceRow[]>;
  /** ★自分の馬（★`my_horses`。★ログインが要ります） */
  listMyHorses(): Promise<MyHorseRow[]>;
  /** ★その馬の勝利数（★`race_entries` は閉じているので、★確定した着順から数える口が別に要ります） */
  enter(input: {
    readonly raceId: string;
    readonly horseId: string;
    readonly strategy: string;
    readonly jockeyFrozen: unknown;
    readonly clientToken: string;
  }): Promise<{ readonly ok: true; readonly entryId: string } | { readonly ok: false; readonly failure: EntryFailure }>;
}

export const supabaseEntryRepo: EntryRepo = {
  async listRaces(limit = 40) {
    const { data, error } = await readClient()
      .from('races_public')
      // ⚠️ ★**1 つの文字列リテラルにすること** — ★supabase-js はこの中身を ★**型の層で読んでいます**。
      //    ★連結すると推論が外れ、★`GenericStringError` になって列が全部見えなくなります。
      .select('id, scheduled_at, class_rank, surface, distance, track_condition, course_id, min_wins, max_wins, status, entry_deadline_at, entry_fee_ep, weight_kg, cycle_index')
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(limit);
    // ★失敗を空配列にしない（★「レースが無い」に見えてしまう・`supabase.ts` の註記と同じ趣旨）
    if (error !== null) throw new Error(`races_public を読めませんでした: ${error.message}`);
    return (data ?? []).map((r) => ({
      id: String(r.id),
      scheduledAtMs: new Date(String(r.scheduled_at)).getTime(),
      classRank: Number(r.class_rank),
      surface: String(r.surface),
      distance: Number(r.distance),
      trackCondition: String(r.track_condition),
      courseId: String(r.course_id),
      minWins: r.min_wins === null || r.min_wins === undefined ? null : Number(r.min_wins),
      maxWins: r.max_wins === null || r.max_wins === undefined ? null : Number(r.max_wins),
      status: String(r.status),
      entryDeadlineAtMs: r.entry_deadline_at === null || r.entry_deadline_at === undefined
        ? null
        : new Date(String(r.entry_deadline_at)).getTime(),
      entryFeeEP: r.entry_fee_ep === null || r.entry_fee_ep === undefined ? null : Number(r.entry_fee_ep),
      weightKg: r.weight_kg === null || r.weight_kg === undefined ? null : Number(r.weight_kg),
      cycleIndex: Number(r.cycle_index),
    }));
  },

  async listMyHorses() {
    const { data, error } = await authClient()
      .from('my_horses')
      .select('id, name, sex, condition, fatigue, stable_grade, retired_at_week, career_ended, wins, starts')
      .order('name', { ascending: true });
    if (error !== null) throw new Error(`my_horses を読めませんでした: ${error.message}`);
    return (data ?? []).map((h) => ({
      id: String(h.id),
      name: String(h.name),
      sex: String(h.sex),
      condition: Number(h.condition),
      fatigue: Number(h.fatigue),
      stableGrade: String(h.stable_grade),
      retiredAtWeek: h.retired_at_week === null || h.retired_at_week === undefined ? null : Number(h.retired_at_week),
      careerEnded: Boolean(h.career_ended),
      wins: Number(h.wins),
      starts: Number(h.starts),
    }));
  },

  async enter(input) {
    const { data, error } = await authClient().rpc('enter_race', {
      p_race_id: input.raceId,
      p_horse_id: input.horseId,
      p_strategy: input.strategy,
      p_jockey_frozen: input.jockeyFrozen,
      p_client_token: input.clientToken,
    });
    if (error !== null) return { ok: false, failure: readEntryError(error) };
    return { ok: true, entryId: String(data) };
  },
};
