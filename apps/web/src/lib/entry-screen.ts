/**
 * ★**出走登録の画面が使う形**（★UI1-8 の続き・2026-09-19）
 *
 * 【★なぜ画面と別に置くか】
 *   ★画面に「サーバーの行 → 見せる形」の変換を置くと、★**画面が仕様を持ち始めます**。
 *   ★`slotOfDay()` や `rankOfWins()` を ★**画面で呼ばず、ここで 1 回だけ**呼びます。
 *
 * 🔴 ⚠️ ★**並べ方・見せ方は仮です**（★UI1-8・★デザイナー便で差し替わります）。
 *    ★ここにあるのは ★**「あるか無いか」の側**だけです。
 *    ★**これを「デザイン」と思わないでください。**
 *
 * 【★画面は時計を持ちません】（★正典 §14）
 *   ★「いま」は ★**呼ぶ側が渡します**。★週は `world_state_public`（UI1-10）、
 *   ★締切は `races_public.entry_deadline_at`（ED-1）から来ます。★画面では計算しません。
 */
import { rankOfWins, slotOfDay } from '@star/scheduler';
import { CLASS_LABEL, CONDITION_LABEL, SURFACE_LABEL, formatClock } from './format';
import { authClient, readClient } from './supabase';
import { entryStateOf, type EntryRaceRow, type EntryState } from './entry-repo';

/** ★画面に出す 1 レース（★`game-demo.ts` の `EntryRace` と同じ形） */
export interface EntryRaceView {
  readonly id: string;
  readonly time: string;
  readonly raceNo: string;
  readonly classRank: number;
  readonly classLabel: string;
  readonly course: string;
  readonly going: string;
  readonly heads: number;
  readonly feeEP: number;
  /** ★締切までの表記。★締切後は null */
  readonly deadline: string | null;
  readonly state: EntryState;
  readonly weightKg: number;
}

/**
 * ★**締切までの残り**（★`M:SS`／1 時間以上なら `H:MM:SS`）。
 * ⚠️ ★**「いま」は呼ぶ側が渡します**（★画面が時計を持たない・§14）。
 */
export function formatRemaining(untilMs: number, nowMs: number): string | null {
  const ms = untilMs - nowMs;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

/**
 * ★**レースの行 → 画面の形**。
 * ⚠️ ★`heads`（出走頭数）と `wins`（その馬の勝利数）は ★**呼ぶ側が渡します**
 *    — ★出走できるかは ★**選んでいる馬ごとに変わる**ためです。
 */
export function toEntryRaceView(
  row: EntryRaceRow,
  heads: number,
  wins: number,
  nowMs: number,
): EntryRaceView {
  return {
    id: row.id,
    time: formatClock(new Date(row.scheduledAtMs).toISOString()),
    // ★R 番号は `slotOfDay()` が唯一の出どころ（★EF-5。★DB に数を持たせない）
    raceNo: `${slotOfDay(row.cycleIndex) + 1}R`,
    classRank: row.classRank,
    classLabel: CLASS_LABEL[row.classRank - 1] ?? '?',
    course: `${SURFACE_LABEL[row.surface] ?? row.surface} ${row.distance.toLocaleString('ja-JP')}m`,
    going: CONDITION_LABEL[row.trackCondition] ?? row.trackCondition,
    heads,
    // ⚠️ ★出走料は ★**サーバーが行に書いた値**（★EF-3。★画面は定数を持たない）
    feeEP: row.entryFeeEP ?? 0,
    deadline: row.entryDeadlineAtMs === null ? null : formatRemaining(row.entryDeadlineAtMs, nowMs),
    state: entryStateOf(row, wins, nowMs),
    weightKg: row.weightKg ?? 0,
  };
}

/** ★画面に出す 1 頭 */
export interface EntryHorseView {
  readonly id: string;
  readonly name: string;
  readonly sexAge: string;
  readonly classRank: number;
  readonly classLabel: string;
  readonly condition: number;
  readonly fatigue: number;
  readonly wins: number;
  readonly starts: number;
}

/** ★1 年は 52 週 */
const WEEKS_PER_YEAR = 52;

/**
 * ★**馬の行 → 画面の形**。
 *
 * ⚠️ ★**年齢は「いまの週」から出します**（★UI1-10・`world_state_public`）。
 *    ★画面が開催の起点と 1 週の長さを持たないためです（§14）。
 * ⚠️ ★**段は勝利数から**（★`@star/scheduler` の 1 か所・D-052）。
 *    ★`rankOfWins` は **0 始まり**（maiden=0）で、★画面の `CLASS_LABEL` は
 *    ★**`class_rank - 1` で引く 1 始まり**です。★+1 して揃えます。
 *    🔴 ★この案件には ★**段 → 数の対応が 2 つ**あります
 *      （`eligibility.ts` の 0 始まり／`pg-store.ts` の 1 始まり）。★報告済み。
 */
export function toEntryHorseView(
  row: {
    readonly id: string; readonly name: string; readonly sex: string;
    readonly condition: number; readonly fatigue: number;
    readonly birthWeek: number | null; readonly wins: number; readonly starts: number;
  },
  gameWeek: number,
): EntryHorseView {
  const ageYears = row.birthWeek === null
    ? null
    : Math.max(0, Math.floor((gameWeek - row.birthWeek) / WEEKS_PER_YEAR));
  const classRank = rankOfWins(row.wins) + 1;
  return {
    id: row.id,
    name: row.name,
    sexAge: ageYears === null ? row.sex : `${row.sex}${ageYears}`,
    classRank,
    classLabel: CLASS_LABEL[classRank - 1] ?? '?',
    condition: row.condition,
    fatigue: row.fatigue,
    wins: row.wins,
    starts: row.starts,
  };
}

/** ★出走登録の画面がひとそろい必要とするもの */
export interface EntryScreenData {
  /** ★生の行（★馬を切り替えたら `toEntryRaceView` で組み直す） */
  readonly raceRows: readonly EntryRaceRow[];
  readonly headsByRace: ReadonlyMap<string, number>;
  readonly horses: readonly EntryHorseView[];
  readonly epBalance: number;
  readonly gameWeek: number;
  /** ★世界が最後に書かれてから何秒経ったか（★大きければワーカーが止まっている） */
  readonly staleSeconds: number;
}

const RACE_COLUMNS =
  'id, scheduled_at, class_rank, surface, distance, track_condition, course_id, min_wins, max_wins, status, entry_deadline_at, entry_fee_ep, weight_kg, cycle_index';

/**
 * ★**画面 1 枚ぶんを読む**。
 *
 * ⚠️ ★**失敗を空配列にしません**（★「レースが無い」に見えてしまう）。★投げます。
 * ⚠️ ★`RACE_COLUMNS` は ★**1 つの文字列リテラル**にしてあります —
 *    ★`supabase-js` は select の中身を ★**型の層で読む**ので、★連結すると推論が外れ、
 *    ★列が 1 つも見えなくなります（★2026-09-19 に踏みました）。
 */
export async function loadEntryScreen(limit = 40): Promise<EntryScreenData> {
  const read = readClient();
  const auth = authClient();

  const [racesRes, weekRes] = await Promise.all([
    read.from('races_public').select(RACE_COLUMNS)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(limit),
    read.from('world_state_public').select('game_week, stale_seconds').limit(1),
  ]);
  if (racesRes.error !== null) throw new Error(`races_public を読めませんでした: ${racesRes.error.message}`);
  if (weekRes.error !== null) throw new Error(`world_state_public を読めませんでした: ${weekRes.error.message}`);
  const world = weekRes.data?.[0];
  const gameWeek = Number(world?.game_week ?? 0);
  const staleSeconds = Number(world?.stale_seconds ?? 0);

  const raceRows: EntryRaceRow[] = (racesRes.data ?? []).map((r) => ({
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

  const ids = raceRows.map((r) => r.id);
  const [horsesRes, entriesRes, userRes] = await Promise.all([
    auth.from('my_horses').select('id, name, sex, condition, fatigue, birth_week, wins, starts').order('name'),
    // ★出走頭数は ★**公開ビューを数える**（★画面で推測しない）
    ids.length === 0
      ? Promise.resolve({ data: [], error: null })
      : read.from('race_entries_public').select('race_id').in('race_id', ids),
    auth.from('users').select('entry_points').limit(1),
  ]);
  if (horsesRes.error !== null) throw new Error(`my_horses を読めませんでした: ${horsesRes.error.message}`);
  if (entriesRes.error !== null) throw new Error(`race_entries_public を読めませんでした: ${entriesRes.error.message}`);
  if (userRes.error !== null) throw new Error(`users を読めませんでした: ${userRes.error.message}`);

  const headsByRace = new Map<string, number>();
  for (const e of entriesRes.data ?? []) {
    const id = String((e as { race_id: unknown }).race_id);
    headsByRace.set(id, (headsByRace.get(id) ?? 0) + 1);
  }

  const horses = (horsesRes.data ?? []).map((h) => toEntryHorseView({
    id: String(h.id),
    name: String(h.name),
    sex: String(h.sex),
    condition: Number(h.condition),
    fatigue: Number(h.fatigue),
    birthWeek: h.birth_week === null || h.birth_week === undefined ? null : Number(h.birth_week),
    wins: Number(h.wins),
    starts: Number(h.starts),
  }, gameWeek));

  return {
    raceRows,
    headsByRace,
    horses,
    epBalance: Number(userRes.data?.[0]?.entry_points ?? 0),
    gameWeek,
    staleSeconds,
  };
}
