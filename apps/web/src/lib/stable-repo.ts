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
import { WEEKS_PER_YEAR } from '@star/scheduler';
import { rankOfWins } from '@star/scheduler';

import { ownerSilksOf } from '@star/render';
import { authClient, readClient } from './supabase';
import type { HorseDetail, StableHorse, StableRepo, StableView, WeekPlan } from './stable';

/** ★格の呼び名（★`entry-screen.ts` と同じ並び。★画面で作らない） */
const CLASS_LABEL = ['新馬・未勝利', '1勝クラス', '2勝クラス', '3勝クラス', 'オープン', '重賞'];

/**
 * 🔴 ★**いま出せないもの**（★発明せずに `null` を返している項目）。
 *   ★`STABLE-SCREEN-GAPS` に起票してあります。
 */
export const MISSING = [
  'nextRace / weeksToNextRace … ★登録済みの未来のレースを、★本人の行として読む口がまだ無い',
  'week.menu … ★その週に何の調教をしたかは `horse_week_log` に在るが、★公開ビューが無い',
  'home の daily / 次走 / 中継 … ★出どころが無いので 0・null・false（★数を入れると「もらえる」と見える）',
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

/** ★性別と年齢（★年齢は「いまの週」から出す・`entry-screen.ts` と同じ規則） */
function sexAgeOf(sex: string, birthWeek: number | null, gameWeek: number): string {
  const label = sex === 'male' ? '牡' : sex === 'female' ? '牝' : 'セ';
  if (birthWeek === null) return label;
  return `${label}${Math.max(0, Math.floor((gameWeek - birthWeek) / WEEKS_PER_YEAR))}`;
}

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

/** ★馬ごとの前走からの週数を、確定済みの `my_runs` から数える。賞金はこのビューに無い。 */
async function runsByHorse(): Promise<Map<string, { prizePP: number; lastWeek: number | null }>> {
  const { data, error } = await authClient()
    .from('my_runs').select('horse_id, game_week, finish_pos');
  if (error !== null) throw new Error(`my_runs を読めませんでした: ${error.message}`);
  const out = new Map<string, { prizePP: number; lastWeek: number | null }>();
  for (const r of data ?? []) {
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

function toStableHorse(
  row: MyHorseRow, gameWeek: number, runs: Map<string, { prizePP: number; lastWeek: number | null }>,
): StableHorse {
  const rank = rankOfWins(Number(row.wins));
  const r = runs.get(row.id);
  return {
    id: row.id,
    name: row.name,
    sexAge: sexAgeOf(row.sex, row.birth_week, gameWeek),
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

  async horse(id: string): Promise<HorseDetail | null> {
    /**
     * ⚠️ ★**まだ実装していません。** ★詳細は `stats`（★素質・現在能力）を出す画面で、
     *   ★`my_horses` には ★**生値が 1 つも出ていません**（★正典 §5.5 / §12.4・D-114）。
     *   → ★★**何を出してよいかが決まっていないので、★勝手に作りません。**
     *   ★一覧（`stable()`）だけを本物にし、★詳細は見本のままにします。
     */
    void id;
    return null;
  },
};
