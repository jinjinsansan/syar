/**
 * ★**引退馬の役割の画面が使う形**（★デザイナー第 2 便 §5 A-1〜A-6・2026-09-23・移行 `0074`）
 *
 * 【★なぜ画面と別に置くか】
 *   ★画面に「サーバーの行 → 見せる形」の変換を置くと、★**画面が仕様を持ち始めます**（`entry-screen.ts` と同じ理由）。
 *
 * 【🔴 ★**押せるかどうかを、ここで決めません**】
 *   ★「変えられない理由」は ★**サーバーが決めて返します**（`my_retired_horses` → `breeding_role_block`）。
 *   ★ここがすることは、★**返ってきた語を、デザイナーの見せ方（A-3〜A-6）の名前に写すだけ**です。
 *   ⚠️ ★条件（上限・性別・8 産）を ★**この層で書き直さないでください**。★書いた日に、
 *      ★`request_breeding_role` と判定が 2 つに割れ、★「押せると出ているのに弾かれる」が起きます（`0040:115` CL-4）。
 *
 * 【★画面は時計を持ちません】（★正典 §14）
 *   ★年齢に使う「いまの週」は ★呼ぶ側が渡します（`world_state_public`）。
 */
import { WEEKS_PER_YEAR } from '@star/scheduler';
import type { StoryEvent, StoryEventType } from '@star/training';
import { authClient, readClient } from './supabase';
import { SignInRequiredError } from './stable-repo';

/** ★役割（★`horses.retirement_role`） */
export type RetirementRole = 'honored' | 'broodmare' | 'stallion';

/** ★上げられる役割（★功労馬に戻すのは上限を見ないので、この 2 つだけ判定が要る） */
export type PromotableRole = 'broodmare' | 'stallion';

/**
 * ★サーバーが返す「変えられない理由」（★`0070` の `role_requests_failure_known` と同じ集合）。
 * ⚠️ ★この型に無い語が返ったら ★**投げます**（★黙って「押せる」に倒さない）。
 */
export type RoleBlock =
  | 'not_owner'
  | 'not_retired'
  | 'sex_mismatch'
  | 'same_role'
  | 'lifetime_foals_reached'
  | 'owner_limit';

/** ★デザイナーの「変えられない 4 通り」（★第 2 便 §5 A-3〜A-6） */
export type RoleVariant = 'cap' | 'sex' | 'active' | 'done8';

/** ★1 つの役割に上げられるか（★上げられないなら、どの見せ方か） */
export interface RoleAction {
  readonly toRole: PromotableRole;
  readonly enabled: boolean;
  /** ★出す枠（★A-3〜A-6）。★`null` は「枠を出さない」 */
  readonly variant: RoleVariant | null;
  /** ★すでにその役割（★主ボタンでなく「功労馬に戻す」を出す側） */
  readonly alreadyThisRole: boolean;
}

/**
 * ★**理由の語 → 見せ方**（★写すだけ・条件を書かない）。
 *
 *   `same_role` … ★すでにその役割。★A-3〜A-6 のどれでもない（★枠を出さず、「功労馬に戻す」を出す）
 *   `not_owner` … ★この読む口は本人の馬しか返さないので ★**起きません**。
 *                 ★起きたら DB と画面のどちらかが壊れています → ★投げます。
 */
export function roleVariantOf(block: RoleBlock | null): RoleVariant | null {
  switch (block) {
    case null: return null;
    case 'owner_limit': return 'cap';
    case 'sex_mismatch': return 'sex';
    case 'not_retired': return 'active';
    case 'lifetime_foals_reached': return 'done8';
    case 'same_role': return null;
    case 'not_owner':
      throw new Error('retired-screen: 本人の馬でない行が返りました（★my_retired_horses は本人の馬だけを返します）');
    default: {
      const never: never = block;
      throw new Error(`retired-screen: 知らない理由です: ${String(never)}`);
    }
  }
}

function actionOf(toRole: PromotableRole, block: RoleBlock | null): RoleAction {
  return {
    toRole,
    enabled: block === null,
    variant: roleVariantOf(block),
    alreadyThisRole: block === 'same_role',
  };
}

/** ★画面に出す 1 頭（★素質・能力・遺伝子は持ちません・D-114 / D-116） */
export interface RetiredHorseView {
  readonly id: string;
  readonly name: string;
  readonly sex: string;
  /** ★誕生の週が無ければ `null`（★推測しない） */
  readonly ageYears: number | null;
  /**
   * ★誕生の週（★`0075`）。★配合の一覧が ★`canMate` に渡す事実です。
   * ⚠️ ★年齢の計算をここでやり直さないでください（★`ageYears` が既に出ています）。
   */
  readonly birthWeek: number | null;
  /** ★今年もう産んだか（★`0075`・★B-1 が薄く出す素） */
  readonly bredThisYear: boolean;
  /** ★今年の種付数（★`0075`・★牡のとき使う） */
  readonly coveringsThisYear: number;
  readonly role: RetirementRole;
  readonly foalCount: number;
  readonly g1Wins: number;
  readonly wins: number;
  readonly starts: number;
  /** ★血統のつながり（★名前まで。★持ち主は出しません・LR-6） */
  readonly sireName: string | null;
  readonly damName: string | null;
  readonly broodmare: RoleAction;
  readonly stallion: RoleAction;
}

/** ★画面 1 枚ぶん */
export interface RetiredScreenData {
  readonly horses: readonly RetiredHorseView[];
  /** ★役割の枠（★「そのときの数」。★確定するのは RPC） */
  readonly broodmareCount: number;
  readonly stallionCount: number;
  readonly broodmareLimit: number;
  readonly stallionLimit: number;
  readonly lifetimeFoals: number;
  readonly gameWeek: number;
}

/** ★`my_retired_horses()` が返す 1 行（★列名は移行 `0074` と同じ） */
export interface RetiredHorseRow {
  readonly horse_id: string;
  readonly horse_name: string;
  readonly horse_sex: string;
  readonly horse_birth_week: number | string | null;
  readonly retirement_role: string;
  readonly foal_count: number | string;
  readonly g1_wins: number | string;
  readonly wins: number | string;
  readonly starts: number | string;
  readonly sire_name: string | null;
  readonly dam_name: string | null;
  readonly broodmare_block: string | null;
  readonly stallion_block: string | null;
  /** ★`0075` で足した事実（★判定はサーバーでなく `canMate` が持つ・B-1） */
  readonly bred_this_year: boolean;
  readonly coverings_this_year: number | string;
}

function roleOf(value: string): RetirementRole {
  if (value === 'honored' || value === 'broodmare' || value === 'stallion') return value;
  throw new Error(`retired-screen: 知らない役割です: ${value}`);
}

function blockOf(value: string | null): RoleBlock | null {
  if (value === null) return null;
  const known: readonly string[] = [
    'not_owner', 'not_retired', 'sex_mismatch', 'same_role', 'lifetime_foals_reached', 'owner_limit',
  ];
  if (!known.includes(value)) throw new Error(`retired-screen: 知らない理由です: ${value}`);
  return value as RoleBlock;
}

/**
 * ★**1 行を見せる形に**（★「いま」は呼ぶ側が渡す・§14）。
 * ⚠️ ★`bigint` は `supabase-js` が ★**文字列**で返すことがあるので、★どちらでも読めるようにしています。
 */
export function toRetiredHorseView(row: RetiredHorseRow, gameWeek: number): RetiredHorseView {
  const birthWeek = row.horse_birth_week === null ? null : Number(row.horse_birth_week);
  return {
    id: row.horse_id,
    name: row.horse_name,
    sex: row.horse_sex,
    ageYears: birthWeek === null ? null : Math.max(0, Math.floor((gameWeek - birthWeek) / WEEKS_PER_YEAR)),
    birthWeek,
    bredThisYear: row.bred_this_year === true,
    coveringsThisYear: Number(row.coverings_this_year ?? 0),
    role: roleOf(row.retirement_role),
    foalCount: Number(row.foal_count),
    g1Wins: Number(row.g1_wins),
    wins: Number(row.wins),
    starts: Number(row.starts),
    sireName: row.sire_name,
    damName: row.dam_name,
    broodmare: actionOf('broodmare', blockOf(row.broodmare_block)),
    stallion: actionOf('stallion', blockOf(row.stallion_block)),
  };
}

/**
 * ★**1 頭の生涯の記録を読む**（★公開ビュー `horse_story_event_public`・LR-6「他人の馬も見える」）。
 *
 * ⚠️ ★**文はここで組み立てません**（★LR-4）。★`@star/training` の `storyLinesOf` が組み立てます。
 * ⚠️ ★`detail` の鍵は ★**書いた側と同じ名前**です（`story-flow.ts`）。
 *    ★ただし `breeding-role-changed` だけは ★`{from, to, reason}` で書かれているので（`0070`）、
 *    ★ここで `roleTo` / `roleReason` に写します。★**写すのはこの 1 か所だけ**。
 */
export async function loadHorseStory(horseId: string): Promise<readonly StoryEvent[]> {
  const res = await readClient().from('horse_story_event_public')
    .select('event_type, game_week, detail').eq('horse_id', horseId);
  if (res.error !== null) throw new Error(`生涯の記録を読めませんでした: ${res.error.message}`);
  return (res.data ?? []).map((row) => {
    const detail = (row.detail ?? {}) as Record<string, unknown>;
    const pick = (key: string): string | undefined =>
      typeof detail[key] === 'string' ? detail[key] : undefined;
    const type = String(row.event_type) as StoryEventType;
    return {
      type,
      week: Number(row.game_week),
      ...(pick('raceName') === undefined ? {} : { raceName: pick('raceName') }),
      ...(typeof detail['finishPosition'] === 'number' ? { finishPosition: detail['finishPosition'] } : {}),
      ...(pick('jockeyName') === undefined ? {} : { jockeyName: pick('jockeyName') }),
      ...(pick('traitLabel') === undefined ? {} : { traitLabel: pick('traitLabel') }),
      ...(pick('offspringName') === undefined ? {} : { offspringName: pick('offspringName') }),
      // ★役割の変更（`0070` / `breeding-runner.ts` は from / to / reason で書く）
      ...(pick('to') === undefined ? {} : { roleTo: pick('to') as 'stallion' | 'broodmare' | 'honored' }),
      ...(pick('reason') === undefined ? {} : { roleReason: pick('reason') as 'owner' | 'lifetime_foals' }),
    } satisfies StoryEvent;
  });
}

/**
 * ★**この年のうちに、生涯の産駒数に達して自動で功労馬に戻ったか**（★A-7 の告知を出すか）。
 *
 *   ★デザイナー決定（§8-5）: ★**その年のあいだ出し続ける**（★「見た」をサーバーに持たない）。
 *   ★判定は ★**生涯の記録の行**から出します（★新しい列を作らない）。
 * ⚠️ ★年は ★**ゲームの年**です（★実時刻ではない・憲法 4）。★1 年 ＝ `WEEKS_PER_YEAR` 週。
 */
export function autoDemotedThisYear(events: readonly StoryEvent[], gameWeek: number): boolean {
  const thisYear = Math.floor(gameWeek / WEEKS_PER_YEAR);
  return events.some((e) => e.type === 'breeding-role-changed'
    && e.roleReason === 'lifetime_foals'
    && Math.floor(e.week / WEEKS_PER_YEAR) === thisYear);
}

/**
 * ★**役割を変える**（★その場で確定・待ちなし・第 2 便 §3 A）。
 *
 * ⚠️ ★`requestId` は ★**押すたびに変えない**（★同じ要求 ID の再送には、サーバーが前の結果を返します）。
 *    ★成功したら呼ぶ側が新しい ID を作ります（`exchange_prize` と同じ作法）。
 * ⚠️ ★失敗の語を ★**画面に出さないでください**（★第 2 便 §4）。★見せ方に写すのは `roleVariantOf` です。
 */
export async function requestBreedingRole(input: {
  readonly requestId: string;
  readonly horseId: string;
  readonly toRole: RetirementRole;
}): Promise<
  | { readonly ok: true; readonly fromRole: string; readonly toRole: string }
  | { readonly ok: false; readonly block: RoleBlock }
> {
  const { data, error } = await authClient().rpc('request_breeding_role', {
    p_request_id: input.requestId,
    p_horse_id: input.horseId,
    p_to_role: input.toRole,
  });
  if (error !== null) throw new Error(`役割を変えられませんでした: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as {
    readonly status?: string; readonly failure_reason?: string | null;
    readonly from_role?: string | null; readonly to_role?: string | null;
  } | undefined;
  if (row === undefined) throw new Error('役割を変えられませんでした: 返事がありません');
  if (row.status === 'done') {
    return { ok: true, fromRole: String(row.from_role ?? ''), toRole: String(row.to_role ?? input.toRole) };
  }
  const block = blockOf(row.failure_reason ?? null);
  // ★`failed` なのに理由が無いのは、★DB の制約（`role_requests_result_shape`）で起きないはず
  if (block === null) throw new Error('役割を変えられませんでした: 理由がありません');
  return { ok: false, block };
}

/**
 * ★**画面 1 枚ぶんを読む**（★1 往復 ＋ 週の 1 往復）。
 * ⚠️ ★**失敗を空配列にしません**（★「引退馬が居ない」に見えてしまう）。★投げます。
 */
export async function loadRetiredScreen(): Promise<RetiredScreenData> {
  const auth = authClient();
  const read = readClient();
  // ★ログインしていなければ、★見本のデータに落とす（★呼ぶ側が見分けられるように型で投げる）
  const { data: sessionData } = await auth.auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();
  const [rowsRes, weekRes] = await Promise.all([
    auth.rpc('my_retired_horses'),
    read.from('world_state_public').select('game_week').limit(1),
  ]);
  if (rowsRes.error !== null) throw new Error(`my_retired_horses を読めませんでした: ${rowsRes.error.message}`);
  if (weekRes.error !== null) throw new Error(`world_state_public を読めませんでした: ${weekRes.error.message}`);

  const rows = (rowsRes.data ?? []) as readonly RetiredHorseRow[];
  const gameWeek = Number(weekRes.data?.[0]?.game_week ?? 0);
  const first = rows[0] as (RetiredHorseRow & {
    readonly broodmare_count: number | string;
    readonly stallion_count: number | string;
    readonly broodmare_limit: number | string;
    readonly stallion_limit: number | string;
    readonly lifetime_foals: number | string;
  }) | undefined;

  return {
    horses: rows.map((r) => toRetiredHorseView(r, gameWeek)),
    // ★引退馬が 1 頭も居なければ、枠の数も上限もサーバーから来ません（★画面で数字を作らない）
    broodmareCount: first === undefined ? 0 : Number(first.broodmare_count),
    stallionCount: first === undefined ? 0 : Number(first.stallion_count),
    broodmareLimit: first === undefined ? 0 : Number(first.broodmare_limit),
    stallionLimit: first === undefined ? 0 : Number(first.stallion_limit),
    lifetimeFoals: first === undefined ? 0 : Number(first.lifetime_foals),
    gameWeek,
  };
}

/**
 * ★**他の牧場の引退馬**（★正典 **LR-6**「他人の馬の物語も見える」）
 *   ★裁定 `REVIEW_RETIRED_SCREEN_PORTS_20260925.md` §4・移行 `0083_retired_horses_public.sql`
 *
 * 【🔴 ★なぜ在るか】
 *   ★正典は「他人の馬も見える」と決めていたのに、★一覧の口は ★`my_retired_horses()`（自分の分だけ）
 *   ★しか在りませんでした。★そのため `/stable/retired` は ★**見本のデータ**で埋まっていました。
 *
 * 【⚠️ ★出るのは牧場名まで】★`display_name` は ★view が 1 文字も返しません（★LR-6）。
 * 【⚠️ ★素質・能力・発見度は返りません】（★D-114）。
 *
 * ★並び順と件数は ★**決定論**（★裁定 §4 条件 ①）:
 *   ★引退した週の新しい順 → ★同じ週なら `horse_id` 順。★件数は `PUBLIC_RETIRED_LIMIT`。
 * ⚠️ ★`order` を 1 つだけにすると、★同じ週の馬の並びが ★**呼ぶたびに変わりえます**。
 */
export const PUBLIC_RETIRED_LIMIT = 60;

/** ★公開の一覧の 1 行（★`retired_horses_public` の列。★持ち主の表示名は在りません） */
export interface PublicRetiredRow {
  readonly horseId: string;
  readonly horseName: string;
  readonly horseSex: string;
  readonly retiredAtWeek: number | null;
  readonly wins: number;
  readonly starts: number;
  readonly g1Wins: number;
  readonly sireName: string | null;
  readonly damName: string | null;
  /** ★牧場名（★LR-6 の上限。★持ち主がいない馬＝NPC は `null`） */
  readonly stableName: string | null;
}

export async function loadPublicRetired(limit = PUBLIC_RETIRED_LIMIT): Promise<readonly PublicRetiredRow[]> {
  const res = await readClient()
    .from('retired_horses_public')
    // ⚠️ ★**1 つの文字列リテラルにすること**（★supabase-js は型の層でこの中身を読みます）
    .select('horse_id, horse_name, horse_sex, retired_at_week, wins, starts, g1_wins, sire_name, dam_name, stable_name')
    .order('retired_at_week', { ascending: false })
    .order('horse_id', { ascending: true })
    .limit(limit);
  if (res.error !== null) throw new Error(`引退馬の一覧を読めませんでした: ${res.error.message}`);
  return (res.data ?? []).map((row) => ({
    horseId: String(row.horse_id),
    horseName: String(row.horse_name),
    horseSex: String(row.horse_sex),
    retiredAtWeek: row.retired_at_week === null ? null : Number(row.retired_at_week),
    wins: Number(row.wins),
    starts: Number(row.starts),
    g1Wins: Number(row.g1_wins),
    sireName: row.sire_name === null ? null : String(row.sire_name),
    damName: row.dam_name === null ? null : String(row.dam_name),
    stableName: row.stable_name === null ? null : String(row.stable_name),
  }));
}
