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
import { authClient, readClient } from './supabase';

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
 * ★**画面 1 枚ぶんを読む**（★1 往復 ＋ 週の 1 往復）。
 * ⚠️ ★**失敗を空配列にしません**（★「引退馬が居ない」に見えてしまう）。★投げます。
 */
export async function loadRetiredScreen(): Promise<RetiredScreenData> {
  const auth = authClient();
  const read = readClient();
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
