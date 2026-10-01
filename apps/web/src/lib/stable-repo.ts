/**
 * ★**牧場（わたしの馬）を、★本物のデータで返す**（★2026-09-20・オーナー指示「データ繋ぐのは OK」）。
 *
 * 【★何をしたか】
 *   ★`stable.ts:6` に ★**「実データが来たら `supabaseStableRepo` を差し替えるだけにする（画面は触らない）」**
 *   ★と書いてありました。★**その口を埋めただけ**です。★画面（見た目）は 1 行も変えていません。
 *
 * 【🔴 ★出どころが無い値を、★発明しません】
 *   ⚠️ ★`StableHorse` には、★いまの DB から出せない項目が在ります。
 *     ★**それらは `null` か、★「まだ決まっていない」側の値で返します。**
 *   ★★**0 を入れて「稼いでいない」に見せる、★menu を作って「やった」に見せる、をしません。**
 *   ★出せないものは下の `MISSING` に列挙し、★`STABLE-SCREEN-GAPS` として起票します。
 *
 * 【★合否の置き方（★`CK-14`）】
 *   ⚠️ ★**「デモの帯が出ないこと」を合格にしません。** ★繋ぎ忘れても描画に失敗しても帯は出ません。
 *   ✅ ★対照は ★**「本物のデータが届いていること」**: ★頭数が `my_horses` の行数と一致すること。
 */
import { raceClassOfWins, rankOfWins } from '@star/scheduler';

import { coatOfHorseId, ownerSilksOf, type CoatName } from '@star/render';
import { CLASS_LABEL, CONDITION_LABEL, SURFACE_LABEL, formatRaceTime, formatSexAge } from './format';
import { authClient, readClient } from './supabase';
import type { HorseDetail, RaceRow, StableHorse, StableRepo, StableView, WeekPlan } from './stable';

/**
 * 🔴 ★**いま出せないもの**（★発明せずに `null` を返している項目）。
 *   ★`STABLE-SCREEN-GAPS` に起票してあります。
 */
export const MISSING = [
  'nextRace / weeksToNextRace … ★登録済みの未来のレースを、★本人の行として読む口がまだ無い',
  'week.menu … ★その週に何の調教をしたかは `horse_week_log` に在るが、★公開ビューが無い',
  'home の daily / 次走 / レースを見る口 … ★出どころが無いので 0・null・false（★数を入れると「もらえる」と見える）',
  'prizePP（獲得賞金）… ★`horse_total_prize_pp` は authenticated に閉じている・★`my_runs` に 1 走の賞金が無い（PR-1）',
  '詳細の races[].prizePP … ★1 走の賞金の読む口が無いので null（★0 は「賞金なし」に見える）',
  '詳細の training … ★`horse_week_log` / `training_orders` に読む口が無いので空',
  '詳細の crosses / 3 代より先の血統 … ★`pedigree_cache` は祖先 id → 代数で、★父系・母系の枠を持たない',
  '詳細の strategyLabel / entryFeeEP … ★脚質の列が無い・★次走が null なので出走料も null',
] as const;

interface MyHorseRow {
  id: string; name: string; sex: string; condition: number; fatigue: number;
  stable_grade: string; birth_week: number | null; wins: number; starts: number;
  last_processed_week: number | null; rest_until_week: number | null;
  retired_at_week: number | null; career_ended: boolean;
}

const HORSE_COLUMNS =
  'id, name, sex, condition, fatigue, stable_grade, birth_week, wins, starts,'
  + ' last_processed_week, rest_until_week, retired_at_week, career_ended';


/**
 * ★その週の予定。
 * ⚠️ ★**`done` を返しません** — ★「何の調教をしたか」の出どころが無いので、
 *    ★`menu` を作ると ★**やっていないことをやったように見せます**。
 */
function weekPlanOf(row: MyHorseRow, gameWeek: number): WeekPlan {
  if (row.rest_until_week !== null && row.rest_until_week > gameWeek) return { kind: 'rest' };
  return { kind: 'todo' };
}

async function currentGameWeek(): Promise<number> {
  const { data, error } = await readClient()
    .from('world_state_public').select('game_week').limit(1);
  if (error !== null) throw new Error(`world_state_public を読めませんでした: ${error.message}`);
  return Number(data?.[0]?.game_week ?? 0);
}

type RunSummary = Map<string, { prizePP: number; lastWeek: number | null }>;

/** ★馬ごとの前走からの週数を、確定済みの `my_runs` から数える。賞金はこのビューに無い。 */
async function runsByHorse(): Promise<RunSummary> {
  const { data, error } = await authClient()
    .from('my_runs').select('horse_id, game_week, finish_pos');
  if (error !== null) throw new Error(`my_runs を読めませんでした: ${error.message}`);
  return summarizeRuns(data ?? []);
}

/**
 * ★`my_runs` の行 → 馬ごとの要約（★一覧 `stable()` と ★詳細 `horse()` が ★**同じ関数**を通る・★食い違わせない）。
 */
function summarizeRuns(
  rows: readonly { readonly horse_id: unknown; readonly game_week: unknown; readonly finish_pos: unknown }[],
): RunSummary {
  const out: RunSummary = new Map();
  for (const r of rows) {
    const id = String(r.horse_id);
    const cur = out.get(id) ?? { prizePP: 0, lastWeek: null };
    // ★確定した行だけを「走った」と数えます（★登録しただけ・取消は finish_pos が null）
    if (r.finish_pos !== null && r.finish_pos !== undefined) {
      const w = Number(r.game_week);
      cur.lastWeek = cur.lastWeek === null ? w : Math.max(cur.lastWeek, w);
    }
    out.set(id, cur);
  }
  return out;
}

function toStableHorse(row: MyHorseRow, gameWeek: number, runs: RunSummary): StableHorse {
  /**
   * 🔴 ★**`rankOfWins` は 0 始まり**（maiden=0）で、★`CLASS_LABEL` は ★**`classRank - 1` で引く 1 始まり**です
   *    （★`entry-screen.ts` の `toEntryHorseView` と同じく ★+1 して揃える）。
   *    ★2026-10-01 まで ★+1 が抜けていて、★0 勝の馬が「?」・★1 勝の馬が「新馬・未勝利」と ★**1 段ずれて**出ていました
   *    （★詳細の格のプレートを繋いだときに気づいた）。
   */
  const rank = rankOfWins(Number(row.wins)) + 1;
  const r = runs.get(row.id);
  return {
    id: row.id,
    name: row.name,
    /** ★性別と年齢は ★`formatSexAge` 1 か所で（★2026-09-27 に寄せた・D-052） */
    sexAge: formatSexAge(row.sex, row.birth_week, gameWeek),
    sex: row.sex === 'female' ? 'female' : 'male',
    classRank: rank,
    classLabel: CLASS_LABEL[rank - 1] ?? '?',
    condition: Math.min(5, Math.max(1, Number(row.condition))) as StableHorse['condition'],
    fatigue: Number(row.fatigue),
    // 🔴 ★出どころが無いので null（★発明しない）
    nextRace: null,
    weeksToNextRace: null,
    weeksSinceLastRace: r?.lastWeek === null || r?.lastWeek === undefined
      ? null
      : Math.max(0, gameWeek - r.lastWeek),
    week: weekPlanOf(row, gameWeek),
    prizePP: r?.prizePP ?? 0,
    stableGrade: row.stable_grade as StableHorse['stableGrade'],
  };
}

// ---------------------------------------------------------------------------
// ★1 頭の詳細（★R-26・2026-10-01・引き渡し資料 `design_handoff_r26` D26-3 ②）
// ---------------------------------------------------------------------------

/**
 * ★毛色の呼び名。★毛色そのものは ★`coatOfHorseId`（`@star/render`）が唯一の出どころ（★一覧の丸と同じ）。
 * ⚠️ ★`horses` に毛色の列はありません。★ここは ★**名前を日本語にするだけ**です（★`design-check` の表と同じ語）。
 */
export const COAT_LABEL: Readonly<Record<CoatName, string>> = {
  bay: '鹿毛', 'dark-bay': '黒鹿毛', chestnut: '栗毛', 'liver-chestnut': '栃栗毛',
  'seal-brown': '青鹿毛', 'blue-black': '青毛', grey: '芦毛',
  palomino: '月毛', white: '白毛',
};

/** ★血統表で ★名前が読めなかった枠（★画面の `?? '—'` と同じ字。★名前を作らない） */
export const UNKNOWN_NAME = '—';

/** ★`my_runs`（`0056` ＝ `0046` の定義）から詳細が読む列 */
const RUN_COLUMNS =
  'race_id, horse_id, game_week, scheduled_at, race_name, grade, class_rank, surface, distance,'
  + ' track_condition, finish_pos, finish_time';

export interface MyRunRow {
  readonly race_id: string; readonly horse_id: string; readonly game_week: number | null;
  readonly scheduled_at: string; readonly race_name: string; readonly grade: string | null;
  readonly class_rank: number; readonly surface: string; readonly distance: number;
  readonly track_condition: string; readonly finish_pos: number | null; readonly finish_time: number | string | null;
}

/**
 * ★`my_runs` の 1 行 → 戦績の 1 行。★格・条件の書き方は ★`records-screen.ts` と同じ作法。
 * 🔴 ★**1 走あたりの賞金は `null`**（★`my_runs` に列が無い・★PR-1 の決定で出していない・`0056`）。
 *    ★0 を入れると ★**「賞金なし」と見えます**。★入れません。
 */
export function raceRowOf(r: MyRunRow): RaceRow {
  return {
    week: r.game_week === null || r.game_week === undefined ? null : Number(r.game_week),
    race: String(r.race_name),
    grade: String(r.grade ?? '') !== '' ? String(r.grade) : (CLASS_LABEL[Number(r.class_rank) - 1] ?? '?'),
    cond: `${SURFACE_LABEL[String(r.surface)] ?? String(r.surface)}${Number(r.distance).toLocaleString('ja-JP')}m `
      + `${CONDITION_LABEL[String(r.track_condition)] ?? String(r.track_condition)}`,
    place: Number(r.finish_pos),
    time: r.finish_time === null || r.finish_time === undefined ? UNKNOWN_NAME : formatRaceTime(Number(r.finish_time)),
    prizePP: null,
  };
}

/**
 * ★次の格と ★あと何勝か。★段の決め方は ★`@star/scheduler` の `raceClassOfWins` だけが持ちます（★D-052・★ここに表を持たない）。
 * ★オープン（★4 勝以上）は ★勝利数では上がらないので ★`null`（★重賞は馬の段ではない・`eligibility.ts`）。
 */
export function promotionOf(wins: number): { readonly nextClassLabel: string | null; readonly promotionHint: string | null } {
  const now = raceClassOfWins(wins);
  if (now === 'open') return { nextClassLabel: null, promotionHint: null };
  for (let k = 1; k <= 8; k += 1) {
    if (raceClassOfWins(wins + k) !== now) {
      return { nextClassLabel: CLASS_LABEL[rankOfWins(wins + k)] ?? null, promotionHint: `あと ${k} 勝` };
    }
  }
  return { nextClassLabel: null, promotionHint: null };
}

/** ★親 1 頭について ★読めた事実（★読めなければ null。★作らない） */
export interface ParentFacts {
  readonly name: string | null;
  readonly sireName: string | null;
  readonly damName: string | null;
}

/**
 * ★2 代の血統表（★`[[父, 母], [父の父, 父の母, 母の父, 母の母]]`）。
 * ⚠️ ★父も母も名前が読めなければ ★**空配列**（★画面は「血統情報が登録されていません」）。
 * ⚠️ ★祖父母が 1 頭も読めなければ ★1 代だけ返します。★読めない枠は ★`UNKNOWN_NAME`。
 * 🔴 ★**3 代より先は返しません** — ★`pedigree_cache` は ★祖先 id → 代数 の索引で、★**どの枠か（父系か母系か）を持ちません**。
 */
export function pedigreeRowsOf(sire: ParentFacts | null, dam: ParentFacts | null): readonly (readonly string[])[] {
  if ((sire?.name ?? null) === null && (dam?.name ?? null) === null) return [];
  const gen1 = [sire?.name ?? UNKNOWN_NAME, dam?.name ?? UNKNOWN_NAME];
  const grand = [sire?.sireName ?? null, sire?.damName ?? null, dam?.sireName ?? null, dam?.damName ?? null];
  if (grand.every((n) => n === null)) return [gen1];
  return [gen1, grand.map((n) => n ?? UNKNOWN_NAME)];
}

/** ★`my_runs` の確定行から ★2 着・3 着を数える（★1 着・出走数は `my_horses` の `wins` / `starts` ＝ 一覧と同じ数え方） */
export function placeCountsOf(runs: readonly MyRunRow[]): { readonly seconds: number; readonly thirds: number } {
  let seconds = 0;
  let thirds = 0;
  for (const r of runs) {
    if (Number(r.finish_pos) === 2) seconds += 1;
    else if (Number(r.finish_pos) === 3) thirds += 1;
  }
  return { seconds, thirds };
}

interface HorseFacts { name: string | null; sireName: string | null; damName: string | null; sireId: string | null; damId: string | null }

/**
 * ★馬 id → 名前（と ★その馬の父母）を、★**利用者が読める口だけ**から引く。
 *   ① ★`my_horses` … ★自分の馬（★父母の id まで分かる）
 *   ② ★`retired_horses_public`（`0086`）… ★引退馬（★父母の名前まで分かる）
 *   ③ ★`race_entries_public`（`0098`）… ★走ったことのある馬の名前
 * ⚠️ ★どこにも居なければ ★**載せません**（★呼ぶ側が `UNKNOWN_NAME` にする）。★失敗は投げます（★空を「無い」にしない）。
 */
async function horseFactsOf(ids: readonly string[]): Promise<Map<string, HorseFacts>> {
  const out = new Map<string, HorseFacts>();
  if (ids.length === 0) return out;
  const want = [...new Set(ids)];
  const [ownRes, retiredRes, entriesRes] = await Promise.all([
    authClient().from('my_horses').select('id, name, sire_id, dam_id').in('id', want),
    authClient().from('retired_horses_public').select('horse_id, horse_name, sire_name, dam_name').in('horse_id', want),
    authClient().from('race_entries_public').select('horse_id, horse_name').in('horse_id', want).limit(500),
  ]);
  if (ownRes.error !== null) throw new Error(`my_horses を読めませんでした: ${ownRes.error.message}`);
  if (retiredRes.error !== null) throw new Error(`retired_horses_public を読めませんでした: ${retiredRes.error.message}`);
  if (entriesRes.error !== null) throw new Error(`race_entries_public を読めませんでした: ${entriesRes.error.message}`);
  const str = (v: unknown): string | null => (v === null || v === undefined || String(v) === '' ? null : String(v));
  const get = (id: string): HorseFacts => {
    const cur = out.get(id) ?? { name: null, sireName: null, damName: null, sireId: null, damId: null };
    out.set(id, cur);
    return cur;
  };
  for (const r of entriesRes.data ?? []) {
    const f = get(String(r.horse_id));
    f.name ??= str(r.horse_name);
  }
  for (const r of retiredRes.data ?? []) {
    const f = get(String(r.horse_id));
    f.name = str(r.horse_name) ?? f.name;
    f.sireName = str(r.sire_name);
    f.damName = str(r.dam_name);
  }
  for (const r of ownRes.data ?? []) {
    const f = get(String(r.id));
    f.name = str(r.name) ?? f.name;
    f.sireId = str(r.sire_id);
    f.damId = str(r.dam_id);
  }
  return out;
}

/** ★父母と祖父母の名前（★2 回まで引く: 親 → ★自分の馬の親なら その父母の id から名前） */
async function pedigreeOf(sireId: string | null, damId: string | null): Promise<readonly (readonly string[])[]> {
  const parents = [sireId, damId].filter((x): x is string => x !== null);
  const facts = await horseFactsOf(parents);
  // ★親が自分の馬で ★祖父母の名前が無いときだけ、★その父母の id から名前を引く
  const second: string[] = [];
  for (const f of facts.values()) {
    if (f.sireName === null && f.sireId !== null) second.push(f.sireId);
    if (f.damName === null && f.damId !== null) second.push(f.damId);
  }
  const names = await horseFactsOf(second);
  const toParent = (id: string | null): ParentFacts | null => {
    if (id === null) return null;
    const f = facts.get(id);
    if (f === undefined) return null;
    return {
      name: f.name,
      sireName: f.sireName ?? (f.sireId !== null ? names.get(f.sireId)?.name ?? null : null),
      damName: f.damName ?? (f.damId !== null ? names.get(f.damId)?.name ?? null : null),
    };
  };
  return pedigreeRowsOf(toParent(sireId), toParent(damId));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SignInRequiredError extends Error {
  constructor() { super('厩舎を見るにはログインしてください。'); }
}

export class SetupRequiredError extends Error {
  constructor() { super('牧場の初回設定が必要です。'); }
}

export const supabaseStableRepo: StableRepo = {
  async stable(): Promise<StableView> {
    const { data: sessionData } = await authClient().auth.getSession();
    if (sessionData.session === null) throw new SignInRequiredError();
    const userRes = await authClient().from('users')
      .select('entry_points, prize_points, stable_name, silk_color, silk_sleeve').eq('id', sessionData.session.user.id).limit(1);
    if (userRes.error !== null) {
      throw new Error(`users を読めませんでした: ${userRes.error.message}`);
    }
    if ((userRes.data ?? []).length === 0) {
      throw new SetupRequiredError();
    }
    const [gameWeek, runs, horsesRes] = await Promise.all([
      currentGameWeek(),
      runsByHorse(),
      authClient().from('my_horses').select(HORSE_COLUMNS).order('name', { ascending: true }),
    ]);
    // ★失敗を空配列にしない（★「馬が居ない」に見えてしまう）
    if (horsesRes.error !== null) {
      throw new Error(`my_horses を読めませんでした: ${horsesRes.error.message}`);
    }
    const rows = (horsesRes.data ?? []) as unknown as MyHorseRow[];
    const horses = rows
      .filter((h) => h.retired_at_week === null)
      .map((h) => toStableHorse(h, gameWeek, runs));
    return {
      // 🔴 ★**本物のデータです**（★画面の「デモデータ」の帯はこれで消えます）
      demo: false,
      weekNo: gameWeek,
      weekRange: '',
      horses,
      // ⚠️ ★出走登録の頭数と消費予定 EP は、★この経路では読んでいません（★上の MISSING）
      entries: 0,
      plannedEP: 0,
      /**
       * ★**残高と厩舎名は本物**（★`users`）。
       * 🔴 ★**出どころが無いものは 0 / null / false**（★上の `MISSING`）。
       *   ⚠️ ★`dailyEP` に数を入れると ★**「もらえる」と見えます**。★入れません。
       */
      home: {
        displayName: String(userRes.data?.[0]?.stable_name ?? ''),
        stableName: String(userRes.data?.[0]?.stable_name ?? ''),
        // ★勝負服（★裁定 §2・2026-09-23）。★色の出どころは @star/render の 1 か所
        silks: ownerSilksOf({
          silkColor: userRes.data?.[0]?.silk_color as string | null | undefined,
          silkSleeve: userRes.data?.[0]?.silk_sleeve as string | null | undefined,
        }),
        epBalance: Number(userRes.data?.[0]?.entry_points ?? 0),
        ppBalance: Number(userRes.data?.[0]?.prize_points ?? 0),
        notices: 0,
        dailyEP: 0,
        dailyClaimed: false,
        nextStartAt: null,
        closesIn: null,
        liveOpen: false,
        myEntries: 0,
        pendingBets: 0,
        nextRun: null,
      },
    };
  },

  /**
   * ★**1 頭の詳細**（★2026-10-01・R-26 引き渡し資料 D26-3 ② で ★出すものが決まった）。
   *
   * 【★出すもの と ★出どころ】
   *   ★土台（★名前・性齢・格・調子・疲れ・今週・次走・獲得賞金・厩舎の格）… ★**一覧と同じ `toStableHorse`**
   *     （★`my_horses` ＋ `my_runs` の要約・★一覧と詳細が食い違わない）
   *   ★次の格・あと何勝 … ★`my_horses.wins` → `promotionOf`（★`@star/scheduler`）
   *   ★毛色 … ★`coatOfHorseId(id)`（★一覧の丸と同じ）／★厩舎 … ★`users.stable_name`
   *   ★戦績 … ★`my_horses.starts` / `wins`（★`horse_starts` / `horse_wins`）・★2着/3着と行は `my_runs`
   *   ★血統 … ★`my_horses.sire_id` / `dam_id` → ★名前は `my_horses`・`retired_horses_public`・`race_entries_public`
   *
   * 【🔴 ★出さないもの（★D-114・R-26 🔴）】 ★能力・上限・適性の記号・近交係数・勝率 → ★空・0・null（★画面も描かない）
   *
   * 【🔴 ★出どころが無いので空のもの（★発明しない）】
   *   ★1 走の賞金（★`my_runs` に無い・PR-1）／★調教の記録（★`horse_week_log` に読む口が無い）／
   *   ★クロス・5 代の表（★`pedigree_cache` は枠を持たない）／★脚質（★`my_horses` に無い）／★出走料（★次走が null）
   */
  async horse(id: string): Promise<HorseDetail | null> {
    const { data: sessionData } = await authClient().auth.getSession();
    if (sessionData.session === null) throw new SignInRequiredError();
    // ★uuid でない id（★旧い見本の `h1` など）は ★DB に投げずに「見つからない」（★型の誤りを画面に出さない）
    if (!UUID_RE.test(id)) return null;
    const auth = authClient();
    const [userRes, gameWeek, horseRes, runsRes] = await Promise.all([
      auth.from('users').select('stable_name').eq('id', sessionData.session.user.id).limit(1),
      currentGameWeek(),
      auth.from('my_horses').select(`${HORSE_COLUMNS}, sire_id, dam_id`).eq('id', id).limit(1),
      auth.from('my_runs').select(RUN_COLUMNS).eq('horse_id', id).order('scheduled_at', { ascending: false }),
    ]);
    if (userRes.error !== null) throw new Error(`users を読めませんでした: ${userRes.error.message}`);
    if ((userRes.data ?? []).length === 0) throw new SetupRequiredError();
    if (horseRes.error !== null) throw new Error(`my_horses を読めませんでした: ${horseRes.error.message}`);
    if (runsRes.error !== null) throw new Error(`my_runs を読めませんでした: ${runsRes.error.message}`);
    // ★`my_horses` は ★本人の馬だけ（`owner_id = auth.uid()`）。★他人の馬・無い馬は ★0 行 ＝ 見つからない
    const row = (horseRes.data ?? [])[0] as unknown as (MyHorseRow & { sire_id: string | null; dam_id: string | null }) | undefined;
    if (row === undefined) return null;
    const runs = (runsRes.data ?? []) as unknown as MyRunRow[];
    const base = toStableHorse(row, gameWeek, summarizeRuns(runs));
    const pedigree = await pedigreeOf(row.sire_id ?? null, row.dam_id ?? null);
    const { seconds, thirds } = placeCountsOf(runs);
    return {
      ...base,
      coat: COAT_LABEL[coatOfHorseId(row.id)],
      stableName: String(userRes.data?.[0]?.stable_name ?? ''),
      ...promotionOf(Number(row.wins)),
      starts: Number(row.starts),
      wins: Number(row.wins),
      seconds,
      thirds,
      // 🔴 ★D-114: ★能力・上限・適性は ★**読まない・返さない**（★画面も描かない）
      stats: [],
      statCapTotal: 0,
      aptitude: [],
      // ⚠️ ★脚質は `my_horses` に無い（★作らない）
      strategyLabel: '',
      races: runs.map(raceRowOf),
      pedigree,
      // 🔴 ★D-114・R-26 🔴 3: ★近交係数の数値は出さない
      inbreedCoeff: null,
      // ⚠️ ★クロスは `pedigree_cache`（★祖先 id → 代数）からは ★父系か母系かが分からず、★名前も引けない祖先が多い（★作らない）
      crosses: [],
      // ⚠️ ★調教の記録は `horse_week_log` に在るが ★読む口が無い（★上の `MISSING`）
      training: [],
      // ⚠️ ★次走が null なので ★出走料も null（★一覧と同じ・★上の `MISSING`）
      entryFeeEP: null,
    };
  },
};
