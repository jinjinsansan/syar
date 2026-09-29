/**
 * ★**実レース 1 本を読む**（★段 2・2026-09-26・裁定 `REVIEW_RACE_WIRING_20260926.md` Q-RACE-2）
 *   ★計画 `PLAN_RACE_REAL_WIRING_20260926.md`・★正本 `DESIGN_LIVE_RACE_DATA_CONTRACT_20260921.md`
 *   ★2026-09-27（段 2 D）: ★走らせるのに要るもの全部（★場・距離・馬場・格・週・オッズ・自馬）を読む形へ
 *   （★裁定 `REVIEW_RACE_REAL_D_AND_CALIBRATION_20260927.md` §3〜§6）
 *
 * 【🔴 ★この層が ★**決めないこと**】
 *   ★① ★**着順を決めません。** ★`finish_pos` を ★そのまま読みます（★憲法 3・サーバー権威）。
 *   ★② ★**馬番を作りません。** ★`gate` を ★そのまま読みます。
 *     ⚠️ ★`/race` は 2026-09-26 まで ★`horseId: String(i + 1)` で ★**index を馬番と言い張って**いました。
 *   ★③ ★**毛色を決めません。** ★`coatOfHorseId(horseId)`（`@star/render`）が唯一の出どころです。
 *   ★④ ★**季節を決めません。** ★`game_week` を読むだけで、★月にするのは ★`gameMonthOf`（★D-124）。
 *
 * 【★なぜ `parseReplayRunners` を共有するか】
 *   ★契約 §実装前の判定 は ★「同じレース ID の常設表示と本編の馬番・位置・着順が一致する」を要求します。
 *   → ★★**同じ関数を通せば、★突き合わせではなく ★構造で一致します。**
 *   ★常設帯（`components/uma/race-strip.tsx`）と ★この層が ★同じ `parseReplayRunners` を呼びます。
 *   ⚠️ ★位置の式（★見せ方）は ★2 か所のままです（★簿 `RACE-POSITION-FORMULA-DUPLICATED`・
 *      ★裁定「着順と馬番を決めないなら、位置の式は見せ方に降格する」）。
 *
 * 【⚠️ ★確定済みだけ・★ログインしている人だけ】
 *   ★走行は ★**`settled` のときだけ**出します（★契約 §暫定の録画表示）。
 *   ★2026-09-28（観戦・オーナー許可）: ★自分の馬が出ていないレースも出します。★そのとき `ownGate` は `null`、
 *      ★カメラの主役 `focusGate` は ★1 着の馬。★画面は `ownGate === null` のとき ★「あなたの馬」を描きません
 *      （★どれかの馬を自馬と偽らない ＝ ★裁定 Q-RACE-6 が止めていた理由）。
 *   ⚠️ ★ログインしていない人には ★まだ出しません（★別の判断・今回は変えない）。
 */
import { finalOrderMatches, marginLabel } from '@star/race-engine';
import { slotOfDay } from '@star/scheduler';
import { parseReplayRunners, type ReplayRunner } from '../components/uma/race-replay';
import { authClient, readClient } from './supabase';
import { REAL_RACE_SIGN_IN_MESSAGE, canPlayRealRace } from './race-real-access';

/** ★読めなかった理由（★画面はこれをそのまま出さず、★言葉に直して出します） */
export class RaceNotPlayableError extends Error {}
/**
 * ★**まだ発走していない**（★2026-09-29・0098・オーナー「発走時刻に 小窓も本格的な画面も 同じものが流れないとおかしい」）。
 *   ★待てば見られる（★エラーではない）。★本編は 1 秒おきに読み直し、★発走時刻に着順が見えたら流す。
 */
export class RaceNotStartedError extends RaceNotPlayableError {
  constructor(message: string, readonly scheduledAtMs: number) { super(message); }
}

/** ★確定着順の 1 行（★エンジンの `RaceResultEntry` のうち ★録画が読む欄だけ） */
export interface SettledRow {
  readonly horseId: string;
  readonly finishPosition: number;
  readonly timeSec: number;
  readonly marginLabel: string;
}

/**
 * ★**確定記録 → 録画が読む着順**（★段 2 D・2026-09-27）。★着順・走破タイムは ★1 つも作りません（★憲法 3）。
 *   ★`horseId` は ★馬番（★D-056・`replayOf` が馬番として読む）。
 *   ★着差の文字は ★走破タイムの差を ★エンジンと同じ `marginLabel` に通したもの（★簿 `REPLAY-MARGIN-FROM-TIME`）。
 */
export function settledResultOf(
  runners: readonly Pick<ReplayRunner, 'gate' | 'finishPosition' | 'finishSec'>[],
  distanceM: number,
): { readonly order: readonly SettledRow[]; readonly conditions: { readonly distance: number } } {
  const byPlace = [...runners].sort((a, b) => a.finishPosition - b.finishPosition);
  return {
    conditions: { distance: distanceM },
    order: byPlace.map((r, i) => ({
      horseId: String(r.gate), finishPosition: r.finishPosition, timeSec: r.finishSec,
      marginLabel: i === 0 ? '' : marginLabel(r.finishSec - byPlace[i - 1]!.finishSec),
    })),
  };
}

/** ★D-059 の番人が鳴いたことを示す誤り（★画面は ★これを受けたら 見本に落とさず止めます） */
export class ReplayOrderMismatchError extends Error {}

/**
 * 🔴 ★**D-059 の番人**（★見本・実レースの両方の道が ★ここを通ります）。
 *   ★映像の境界時刻から並べた順が ★確定着順と ★1 頭でも違えば ★投げます。
 */
export function assertReplayOrder(
  result: { readonly order: readonly Pick<SettledRow, 'horseId'>[] },
  boundaries: readonly { gate: number; finishSec: number }[],
): void {
  if (!finalOrderMatches(result, boundaries)) {
    throw new ReplayOrderMismatchError('映像の着順が確定着順と違います（D-059）');
  }
}

/**
 * ★**実レースの録画を止めるときの文**（★裁定 Q-RACE-3 の追加条件）。
 *   ★番人が鳴いたときは ★その旨を、★それ以外の組み立ての失敗は ★その理由を添えて ★「出せません」と言います。
 */
export function replayStopMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof ReplayOrderMismatchError
    ? `この録画は出せません（映像の着順が確定した着順と合いませんでした）: ${message}`
    : `この録画は出せません: ${message}`;
}

export interface RealRaceData {
  readonly id: string;
  readonly raceName: string;
  /** ★R 番号（★`slotOfDay(cycle_index) + 1`・★番組表と同じ出どころ） */
  readonly raceNo: string;
  readonly status: string;
  readonly scheduledAt: string;
  /** ★場（★`VENUES` の id）。★走路はここから `raceSetupFor` が組みます */
  readonly courseId: string;
  readonly distanceM: number;
  readonly surface: 'turf' | 'dirt';
  readonly trackCondition: 'good' | 'yielding' | 'soft' | 'bad';
  /** ★格。★`null` は平場（★裁定 Q-RACE-7） */
  readonly grade: 'G1' | 'G2' | 'G3' | null;
  /** ★そのレースのゲーム内の週（★`my_runs.game_week`）。★`0046` より前のレースは `null` */
  readonly gameWeek: number | null;
  /** ★出走馬（★枠番の順・★`parseReplayRunners` が検証済み・★馬番は 1〜頭数で欠けない） */
  readonly runners: readonly ReplayRunner[];
  /** ★斤量（★馬番 → kg） */
  readonly weightKgByGate: ReadonlyMap<number, number>;
  /** ★単勝オッズ（★馬番 → 倍率）。★無い馬は入っていません（★埋めない） */
  readonly winOddsByGate: ReadonlyMap<number, number>;
  /**
   * ★自分の馬の馬番（★2 頭いれば小さいほう）。★**自分の馬が出ていないレースは `null`**（★2026-09-28・観戦・オーナー許可）。
   *   ★`null` のとき ★画面は「あなたの馬」を ★1 つも描きません（★どれかの馬を自馬と偽らない）。
   */
  readonly ownGate: number | null;
  /**
   * ★**カメラの主役**（★位置の組み立て・カメラ・実況が追う馬）。★自分の馬が居れば その馬、★居なければ ★1 着の馬。
   *   ★1 着にしたのは ★暫定（★録画なので結果は確定済み）。
   */
  readonly focusGate: number;
}

const SURFACES = ['turf', 'dirt'] as const;
const CONDITIONS = ['good', 'yielding', 'soft', 'bad'] as const;
const GRADES = ['G1', 'G2', 'G3'] as const;
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  (list as readonly unknown[]).includes(v) ? (v as T) : undefined;

/**
 * ★**確定済みの 1 本を読む**。★読めないときは ★`RaceNotPlayableError` を投げます。
 * ⚠️ ★**空の一覧で「レースが無い」に見せません**（★R-16）。★投げます。
 * ⚠️ ★**見本の走行に落としません**（★呼ぶ側も落とさない）。
 */
export async function loadRealRace(raceId: string): Promise<RealRaceData> {
  const read = readClient();

  const raceRes = await read.from('races_public')
    .select('id, name, status, scheduled_at, grade, surface, distance, track_condition, course_id, cycle_index')
    .eq('id', raceId).limit(1);
  if (raceRes.error !== null) {
    throw new RaceNotPlayableError(`レースを読めませんでした: ${raceRes.error.message}`);
  }
  const race = raceRes.data?.[0];
  if (race === undefined) throw new RaceNotPlayableError('そのレースはありません');
  const status = String(race.status);
  /**
   * 🔴 ★**確定前は走行を出しません**（★契約 §表示段階）。
   *   ⚠️ ★ここで見本の走行に落とすと ★**「そのレースを見た」と嘘になります**。
   */
  /**
   * ★2026-09-29（★0098）: ★確定前でも ★発走時刻を過ぎていれば ① 決めた着順が見える → ★走行を出す（★着順が揃わなければ下で止まる）。
   *   ★発走前・中止・公示は ★出さない（★ビューも出さないが ★ここでも段と時刻で見る）。
   */
  const startedMs = new Date(String(race.scheduled_at)).getTime();
  const liveNow = status === 'scheduled' && Number.isFinite(startedMs) && Date.now() >= startedMs;
  if (status !== 'settled' && !liveNow) {
    const msg = `このレースはまだ発走していません（いまの状態: ${status}）`;
    /** ★発走待ち（★発売中・締切後の scheduled）は ★待てる形で投げる（★中止・公示は待っても始まらない） */
    if (status === 'scheduled' && Number.isFinite(startedMs)) throw new RaceNotStartedError(msg, startedMs);
    throw new RaceNotPlayableError(msg);
  }
  /** ★条件は ★知らない値を既定に落とさず ★投げます（★R-27） */
  const surface = oneOf(SURFACES, race.surface);
  const trackCondition = oneOf(CONDITIONS, race.track_condition);
  const distanceM = Number(race.distance);
  const courseId = typeof race.course_id === 'string' ? race.course_id : '';
  const cycleIndex = Number(race.cycle_index);
  const grade = race.grade === null || race.grade === undefined ? null : oneOf(GRADES, race.grade);
  if (surface === undefined || trackCondition === undefined || !Number.isFinite(distanceM) || distanceM <= 0
    || courseId === '' || !Number.isInteger(cycleIndex) || grade === undefined) {
    throw new RaceNotPlayableError(
      `レースの条件が読めません（馬場 ${String(race.surface)}・状態 ${String(race.track_condition)}・`
      + `距離 ${String(race.distance)}・場 ${String(race.course_id)}・格 ${String(race.grade)}）`,
    );
  }

  /**
   * 🔴 ★**自分の馬かどうかは ★サーバーが決めます**（★`is_mine` は `auth.uid()` で判定・BT-3）。
   *   ★だから ★セッションを持つ `authClient()` で読みます（★`readClient()` では ★常に偽になります）。
   */
  const auth = authClient();
  /** ★出せる人の判定は ★帯と同じ 1 か所（`race-real-access.ts`） */
  if (!(await canPlayRealRace())) throw new RaceNotPlayableError(REAL_RACE_SIGN_IN_MESSAGE);

  const [entRes, runsRes, oddsRes] = await Promise.all([
    auth.from('race_entries_public')
      .select('gate,horse_name,strategy,weight,finish_pos,finish_time,horse_id,is_mine')
      .eq('race_id', raceId).order('gate'),
    auth.from('my_runs').select('gate, game_week').eq('race_id', raceId),
    read.from('race_odds_public').select('bet_type, selection, odds').eq('race_id', raceId).eq('bet_type', 'win'),
  ]);
  if (entRes.error !== null) {
    throw new RaceNotPlayableError(`出走表を読めませんでした: ${entRes.error.message}`);
  }
  if (runsRes.error !== null) {
    throw new RaceNotPlayableError(`自分の馬の記録を読めませんでした: ${runsRes.error.message}`);
  }
  if (oddsRes.error !== null) {
    throw new RaceNotPlayableError(`オッズを読めませんでした: ${oddsRes.error.message}`);
  }
  const allRows = (entRes.data ?? []) as Record<string, unknown>[];
  const rows = allRows.filter((r) => r['finish_pos'] !== null && r['finish_pos'] !== undefined);

  /**
   * ⚠️ ★`parseReplayRunners` は ★**1 つでも噛み合わなければ空**を返します
   *    （★タイムの順と着順が合わない・★枠の重複・★`horse_id` が無い 等）。
   *    ★`0089` を当てていない環境では ★`horse_id` が来ないので ★ここで空になります。
   */
  const runners = parseReplayRunners(rows);
  if (runners.length === 0) {
    throw new RaceNotPlayableError(
      '出走表が揃っていません（★着順・走破タイム・馬 ID のどれかが欠けています。'
      + '★移行 0089 が当たっていない環境でも こうなります）',
    );
  }
  /**
   * 🔴 ★**馬番は 1〜頭数で欠けないこと**（★画面は `roster[gate - 1]` と ★枠の色 `frameRoleOf(gate, 頭数)` で引きます）。
   *   ★取消で欠けた枠があるレースは ★**出しません**（★詰めて並べ直すと ★馬番の嘘になります）。
   *   ★簿 `REPLAY-GATE-GAP-NOT-DRAWN`。
   */
  if (runners.length !== allRows.length || runners.some((r, i) => r.gate !== i + 1)) {
    throw new RaceNotPlayableError(
      `取消で欠けた枠があるレースの録画は、まだ出せません（出走 ${allRows.length} 頭のうち 確定 ${runners.length} 頭）`,
    );
  }

  /**
   * ★**自分の馬**（★居なければ `null`）と ★**カメラの主役**（★自分の馬 か ★1 着）。
   *   ★2026-09-28: ★自分の馬が出ていないレースも出します（★オーナー許可・簿 `REPLAY-NEEDS-OWN-HORSE` を閉じる便）。
   */
  const mineGates = allRows
    .filter((r) => r['is_mine'] === true)
    .map((r) => Number(r['gate']))
    .filter((g) => Number.isInteger(g) && g >= 1)
    .sort((a, b) => a - b);
  const ownGate = mineGates[0] ?? null;
  const winnerGate = runners.find((r) => r.finishPosition === 1)?.gate;
  if (winnerGate === undefined) throw new RaceNotPlayableError('1 着の馬が読めません');
  const focusGate = ownGate ?? winnerGate;

  const weightKgByGate = new Map<number, number>();
  for (const r of allRows) {
    const g = Number(r['gate']);
    const w = Number(r['weight']);
    if (Number.isInteger(g) && Number.isFinite(w) && w > 0) weightKgByGate.set(g, w);
  }
  /** ★斤量は出馬表に出ます。★欠けた馬がいれば ★埋めずに止めます */
  if (runners.some((r) => !weightKgByGate.has(r.gate))) {
    throw new RaceNotPlayableError('出走表の斤量が揃っていません');
  }
  const winOddsByGate = new Map<number, number>();
  for (const o of (oddsRes.data ?? []) as Record<string, unknown>[]) {
    const sel = Array.isArray(o['selection']) ? (o['selection'] as unknown[]) : [];
    const g = Number(sel[0]);
    const odds = Number(o['odds']);
    if (sel.length === 1 && Number.isInteger(g) && Number.isFinite(odds) && odds > 0) winOddsByGate.set(g, odds);
  }
  /** ★週は ★自分の記録（`my_runs`）から。★`races_public` は `game_week` を出していません */
  const weekRaw = ((runsRes.data ?? []) as Record<string, unknown>[])[0]?.['game_week'];
  const gameWeek = weekRaw === null || weekRaw === undefined || !Number.isInteger(Number(weekRaw)) ? null : Number(weekRaw);

  return {
    id: String(race.id),
    raceName: String(race.name),
    raceNo: `${slotOfDay(cycleIndex) + 1}R`,
    status,
    scheduledAt: String(race.scheduled_at),
    courseId,
    distanceM,
    surface,
    trackCondition,
    grade,
    gameWeek,
    runners,
    weightKgByGate,
    winOddsByGate,
    ownGate,
    focusGate,
  };
}
