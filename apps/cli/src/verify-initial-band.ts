/**
 * ★**帯の下のゲート**（D-079 ④）— 初期馬が「適切な育成」でキャリア中に 1 勝できるか
 *
 * 裁定 `REVIEW_SETUP_RPC_VERDICT_20260820.md` §2-③ が、初期馬の帯（D-074/D-079）について
 * **帯の値をゲートにしない**と定め、代わりに 2 つを置きました。
 *
 * | | 基準 | 意味 |
 * |---|---|---|
 * | 上 | ★表示が全個体で同一 | 振り直しが成立しない（★★段をひとつ選べば**構造的に**満たされます） |
 * | **下** | ★**初期馬が、適切な育成でキャリア中に少なくとも 1 勝できること** | 「外れではない」の実体 |
 *
 * ★**本ツールは「下」を測ります。**
 *
 * 【★2026-09-18 の作り直し（裁定 `REVIEW_INITIAL_BAND_GATE_VERDICT_20260918.md` BG-1・BG-2）】
 *   ★初版は**出走表の窓（`classBand`）の抽選にだけ**馬を載せていました。
 *   ★その形では ★**能力順の両端の馬が窓に入る回数が構造的に少なく**、
 *   ★**★1.0 の帯が平均 4.9 走**（キャリア上限 24 戦に対して）しか走れませんでした。
 *   ★つまり「1 勝以上 23.1%」は ★**弱さではなく機会の少なさ**の値でした。
 *
 *   → ★**本番の形に合わせました。** ★`enter_race`（`db/migrations/0024_entry_rpc_and_story.sql:172-174`）は
 *     ★**生成済みのレースに `gate = max+1` で追加**します＝ ★**窓による除外を受けません**（正典 §10.4・1321 行）。
 *   → ★ただし ★**「必ず走れる」ではありません** — ★正典 1317 行「**上限超過は完全抽選**（賞金上位優先にしない）」。
 *     ★頭数の上限（`FIELD_SIZE.MAX`）に当たったら**一様に落とし、落選の回数も出します**（BG-2）。
 *   → ★`generateRace` の引数・既定値には**触っていません**（★V-4〜V-6 の取り直しは発生しません）。
 *
 * 【★測る量は★の算出量と同一（裁定 §2-①）】
 *   ★は `starsOfPotential`（`packages/sim-engine/src/stars.ts`）だけが出します。★**付与時の素質**から。
 *
 * 【★育成は V-14 と同じ経路】
 *   `training-career.ts` の `runCareer`。「適切な育成」＝ `APPROPRIATE_POLICY`（`balanced`）。
 *   ★**測る側が方針を選びません。**
 *
 * 【★R-16: この基準を最も安易に満たす方法は何か】
 *   ★**「1 勝」は相対です。** 全員が弱くても勝者は出ます。→ ★対照を 2 本置きます:
 *     - **対照 A**: 全頭を放置で育てた場合（★ほぼ変わらないなら、この基準は「開催されたこと」を測っています）
 *     - **対照 B**: ★**その帯の馬だけ放置**（★プレイヤーが直面する形。★**帯ごとに出します**・BG-5）
 *
 * 【★判定線は正典にありません】
 *   ★**本ツールは合否を出しません**（R-3）。★裁定 Q-BAND-01 も「★**測り直してから線を引く**」としています。
 *
 * 実行: npm run verify:band
 *       npm run verify:band -- --seeds 42
 */
import {
  ABILITY_KEYS, NICKS_GEN, VERIFY_BAND_STREAM, deriveRng, starsOfPotential,
  type AbilityKey, type HorseId, type HorseRecord, type Rng,
} from '@star/sim-engine';
import type { RaceEntrant } from '@star/race-engine';
import { CAREER_RACE_LIMIT, LIFECYCLE_WEEKS } from '@star/scheduler';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { FIELD_SIZE, toEntrant, type GeneratedRace } from './race-field.js';
import { emptyCareer, runSeason, type CareerRecord } from './racing-season.js';
import { POOL_GENERATIONS, POOL_MARES, VERIFY_SEEDS } from './measurement.js';
import { APPROPRIATE_POLICY, runCareer, type CareerResult, type Policy } from './training-career.js';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const list = (n: string, d: readonly number[]): readonly number[] => {
  const i = argv.indexOf(`--${n}`);
  if (i < 0) return d;
  const xs = (argv[i + 1] ?? '').split(',').map(Number).filter((x) => Number.isFinite(x));
  return xs.length > 0 ? xs : d;
};

/** ★正典 §13.3 の受け入れシード列。★プールしてから 1 回だけ集計します（R-20） */
const SEEDS = list('seeds', VERIFY_SEEDS);
const HORSES = num('horses', POOL_MARES);

/**
 * ★キャリアを何区間に割るか（★測定条件）。
 *
 * ★現役は `raceableFrom`(104) 〜 `retireAt`(260) の **156 週**（正典 §7.1・`week.ts`）。
 *   ★6 区間（26 週 ＝ 半年ぶん）に割り、★**区間の頭で引退済みの馬は登録しません**。
 *   → ★故障による早期引退が、そのまま**出走機会の減少**として効きます。
 */
const SEGMENTS = 6;
/** ★1 区間あたりの申し込み数 ＝ キャリア上限 24 戦（正典 §7.1 `CAREER_RACE_LIMIT`）÷ 区間数 */
const ENTRIES_PER_SEGMENT = CAREER_RACE_LIMIT / SEGMENTS;
/**
 * ★**抽選が実際に働くための超過分**（★測定条件・BG-2）。
 *
 * ★正典 1317 行は「上限超過は**完全抽選**」と定めています。★超過が一度も起きない本数にすると、
 *   ★**その機構が死んでいても数字が変わりません**（R-16）。★そこで空き枠 ＋ この数だけ申し込ませ、
 *   ★**必ず何頭かは落ちる**ようにします。★**落選は一様**なので、どの帯にも偏りません。
 */
const LOTTERY_SURPLUS = 3;

/**
 * ★**どのレースに申し込むか**（★測定の自由変数・R-12）。
 *
 * ★正典 §10.4（1321 行）は「**自分で時刻を選んでエントリー**」としか書いておらず、
 *   ★**どのレースを選ぶかはプレイヤーに委ねられています。** ★その選び方が数字を支配します:
 *
 * | 選び方 | 中身 |
 * |---|---|
 * | `uniform` | ★**無差別**に申し込む（★番組の格を見ない。★現行の実装に出走資格の述語が無い状態そのもの） |
 * | `matched` | ★**自分と同じくらいの相手が集まっている番組を選ぶ**（★「勝ち目のあるレースを選ぶ」という実際の行動） |
 *
 * ⚠️ ★**どちらが正しいかは開発側では決めません**（★正典に無い）。★**両方測って照会に出します**
 *    （R-12「測定の自由変数は、判定に効かないことを確認するか、正典に固定する」）。
 */
type Choice = 'uniform' | 'matched';
const CHOICE: Choice = (argv.includes('--choice') ? argv[argv.indexOf('--choice') + 1] : 'uniform') === 'matched'
  ? 'matched'
  : 'uniform';
/** ★`matched` のとき「同じくらい」と見なす幅（★測定条件）。★出走表の窓（0.06）ではなく能力の比で見る */
const MATCH_TOLERANCE = 0.10;

/** ★能力の代表値（★5 能力の平均。★出走表の窓が使う素質の合計とは別の量を作らないよう、同じ 5 能力を使う） */
function abilityMean(stats: Record<AbilityKey, number>): number {
  let t = 0;
  for (const k of ABILITY_KEYS) t += stats[k];
  return t / ABILITY_KEYS.length;
}

type Arm = 'appropriate' | 'neglect_all' | 'neglect_band';

/** 育て終わった馬（★`stats` が能力・`potential` はクラス分けの並べ替えに使われる） */
function raced(horse: HorseRecord, r: CareerResult): HorseRecord {
  return { ...horse, stats: r.stats as Record<AbilityKey, number>, potential: r.potential as Record<AbilityKey, number> };
}

/** ★登録する側（プレイヤーの馬）の ID。★世界の側と分けて数えるため */
const playerIdOf = (id: HorseId): HorseId => `${id}#entry` as HorseId;

interface EntryStats {
  /** 申し込み（★与えた機会） */
  applications: number;
  /** 実際の出走（★上限に空きがあった分） */
  accepted: number;
  /** ★完全抽選で落ちた回数（正典 1317） */
  rejected: number;
}

/**
 * ★**1 つの場でキャリアを走り切らせる。**
 *
 * ★世界（NPC の出走表）は今までどおり `generateRace` の窓で作り、
 * ★**対象の馬は「生成済みのレースに追加」**します（BG-1・本番の `enter_race` と同じ形）。
 *
 * ★戻り値の `careers` は ★**登録して走った分だけ**を数えます
 *   （★世界の側の馬としてたまたま窓に入った分は別 ID なので混ざりません）。
 */
function runCareers(
  world: readonly HorseRecord[],
  retireWeekOf: ReadonlyMap<HorseId, number>,
  seed: number,
): { careers: Map<HorseId, CareerRecord>; entry: EntryStats } {
  const careers = new Map<HorseId, CareerRecord>();
  const entry: EntryStats = { applications: 0, accepted: 0, rejected: 0 };
  const weeks = LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom;

  for (let s = 0; s < SEGMENTS; s += 1) {
    const segStart = LIFECYCLE_WEEKS.raceableFrom + Math.round((weeks * s) / SEGMENTS);
    const active = world.filter((h) => (retireWeekOf.get(h.id) ?? 0) > segStart);
    if (active.length < FIELD_SIZE.MIN) continue; // ★§10.4 の下限。開催しない

    /** ★この区間に残っている申し込み枠（★落選しても減りません） */
    const remaining = new Map<HorseId, number>(active.map((h) => [h.id, ENTRIES_PER_SEGMENT]));
    const entryRng = deriveRng(seed, VERIFY_BAND_STREAM.ENTRY, s);

    /** ★一様に k 頭選ぶ（★完全抽選。★賞金や能力で並べない・正典 1317） */
    const sample = <T>(xs: readonly T[], k: number, rng: Rng): T[] => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a.slice(0, k);
    };

    const entriesFor = (race: GeneratedRace): readonly RaceEntrant[] => {
      const open = FIELD_SIZE.MAX - race.entrants.length;
      if (open <= 0) return [];
      let waiting = active.filter((h) => (remaining.get(h.id) ?? 0) > 0);
      if (CHOICE === 'matched') {
        // ★自分と同じくらいの相手が集まっている番組だけに申し込む（★勝ち目のあるレースを選ぶ）
        let fieldSum = 0;
        for (const e of race.entrants) fieldSum += abilityMean(e.stats);
        const fieldMean = fieldSum / Math.max(1, race.entrants.length);
        waiting = waiting.filter(
          (h) => Math.abs(abilityMean(h.stats as Record<AbilityKey, number>) - fieldMean) <= fieldMean * MATCH_TOLERANCE,
        );
      }
      if (waiting.length === 0) return [];
      // ★申し込む馬（★自分で時刻を選ぶ・§10.4 1321 行）。★能力で選ばない
      const applicants = sample(waiting, Math.min(waiting.length, open + LOTTERY_SURPLUS), entryRng);
      entry.applications += applicants.length;
      // ★上限超過は完全抽選（正典 1317 行）
      const accepted = applicants.length <= open ? applicants : sample(applicants, open, entryRng);
      entry.accepted += accepted.length;
      entry.rejected += applicants.length - accepted.length;
      return accepted.map((h, k) => {
        remaining.set(h.id, (remaining.get(h.id) ?? 0) - 1);
        // ★`enter_race` と同じ「生成済みのレースに gate = max+1 で追加」（0024:172-174）
        return toEntrant(
          { ...h, id: playerIdOf(h.id) },
          entryRng,
          {
            stats: h.stats as Record<AbilityKey, number>,
            condition: entryRng.int(2, 4),
            fatigue: 0,
            age: entryRng.int(3, 5),
            weightKg: 55 + entryRng.range(-2, 2),
            gate: race.entrants.length + k + 1,
          },
        );
      });
    };

    /**
     * ★本数は「申し込みを捌けるだけ」用意します。
     * ★本番は 1 日 144 本に対し出走可能な馬が数千頭で、★**枠は余っている側**です
     *   （★`generateRace` の窓から出る空き枠は 1 レースあたり平均 5 前後）。
     */
    const raceCount = Math.max(1, Math.ceil((active.length * ENTRIES_PER_SEGMENT) / 4));
    runSeason(
      active,
      careers,
      deriveRng(seed, VERIFY_BAND_STREAM.RACE, s),
      ENTRIES_PER_SEGMENT,
      undefined,
      // ★本番のワーカーと同じ（`build-race.ts:89`）。育て終わった能力で走る
      { abilityOf: (h: HorseRecord) => h.stats },
      entriesFor,
      raceCount,
    );
  }
  return { careers, entry };
}

// ---------------------------------------------------------------------------
// 集計の器
// ---------------------------------------------------------------------------
interface BandRow {
  n: number;
  winners: Record<Arm, number>;
  starts: number;
  wins: number;
  applications: number;
  earlyRetired: number;
  noStart: number;
}
const bands = new Map<number, BandRow>();
const rowOf = (stars: number): BandRow => {
  const cur = bands.get(stars);
  if (cur !== undefined) return cur;
  const row: BandRow = {
    n: 0,
    winners: { appropriate: 0, neglect_all: 0, neglect_band: 0 },
    starts: 0, wins: 0, applications: 0, earlyRetired: 0, noStart: 0,
  };
  bands.set(stars, row);
  return row;
};
const totalEntry: EntryStats = { applications: 0, accepted: 0, rejected: 0 };

const t0 = Date.now();
const { balance, founders } = resolveRuntimeConfig();

for (const seed of SEEDS) {
  const sim = runSimulation(
    {
      seed, generations: POOL_GENERATIONS, population: POOL_MARES,
      stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true,
    },
    balance, founders, NICKS_GEN,
  );
  const pool = (sim.finalPopulation ?? []).slice(0, HORSES);
  if (pool.length === 0) throw new Error(`母集団が空です（seed=${seed}）`);

  // --- 育成（2 方針とも 1 回ずつ。★同じ馬・同じ乱数系列） ---
  const trained: Record<Policy, CareerResult[]> = { neglect: [], balanced: [], hard_only: [] };
  for (const policy of [APPROPRIATE_POLICY, 'neglect'] as const) {
    for (let i = 0; i < pool.length; i += 1) trained[policy].push(runCareer(pool[i]!, policy, i, seed));
  }
  // ★★は**付与時の素質**から（育成前）。★唯一の出どころ `starsOfPotential`
  const starsOf = pool.map((h) => starsOfPotential(h.potential));

  const retireOf = (rs: CareerResult[]): ReadonlyMap<HorseId, number> =>
    new Map(pool.map((h, i) => [h.id, rs[i]!.retireWeek]));

  // --- 腕 1: 全頭が適切な育成（★これが判定の対象） ---
  const fieldA = pool.map((h, i) => raced(h, trained[APPROPRIATE_POLICY][i]!));
  const armA = runCareers(fieldA, retireOf(trained[APPROPRIATE_POLICY]), seed);
  totalEntry.applications += armA.entry.applications;
  totalEntry.accepted += armA.entry.accepted;
  totalEntry.rejected += armA.entry.rejected;

  // --- 腕 2（対照 A）: 全頭が放置 ---
  const fieldB = pool.map((h, i) => raced(h, trained.neglect[i]!));
  const armB = runCareers(fieldB, retireOf(trained.neglect), seed);

  // --- 腕 3（対照 B・BG-5）: ★その帯だけ放置・他は適切な育成 ---
  const present = [...new Set(starsOf)].sort((a, b) => a - b);
  const armCByBand = new Map<number, Map<HorseId, CareerRecord>>();
  for (const band of present) {
    const pick = (i: number): CareerResult => (starsOf[i] === band ? trained.neglect[i]! : trained[APPROPRIATE_POLICY][i]!);
    const mixed = pool.map((h, i) => raced(h, pick(i)));
    const mixedRetire = new Map<HorseId, number>(pool.map((h, i) => [h.id, pick(i).retireWeek]));
    armCByBand.set(band, runCareers(mixed, mixedRetire, seed).careers);
  }

  // --- 集計（★シードをまたいでプールしてから最後に 1 回だけ割る） ---
  for (let i = 0; i < pool.length; i += 1) {
    const row = rowOf(starsOf[i]!);
    const pid = playerIdOf(pool[i]!.id);
    const a = armA.careers.get(pid) ?? emptyCareer();
    const b = armB.careers.get(pid) ?? emptyCareer();
    const c = armCByBand.get(starsOf[i]!)?.get(pid) ?? emptyCareer();
    row.n += 1;
    row.starts += a.starts;
    row.wins += a.wins;
    if (a.wins >= 1) row.winners.appropriate += 1;
    if (b.wins >= 1) row.winners.neglect_all += 1;
    if (c.wins >= 1) row.winners.neglect_band += 1;
    if (a.starts === 0) row.noStart += 1;
    if (trained[APPROPRIATE_POLICY][i]!.careerEnded) row.earlyRetired += 1;
  }
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------
const pct = (x: number, n: number): string => (n === 0 ? '—' : `${((x / n) * 100).toFixed(1)}%`);
/** 割合の SE（二項）。★n が小さい帯ほど広い — ★幅を見ずに帯を決めない */
const sePt = (x: number, n: number): string => {
  if (n === 0) return '—';
  const p = x / n;
  return `${(Math.sqrt((p * (1 - p)) / n) * 100).toFixed(1)}`;
};

console.log(`# ★帯の下のゲート（D-079 ④）— 初期馬が「適切な育成」でキャリア中に 1 勝できるか`);
console.log(`  seeds=${SEEDS.join(',')}  プール ${POOL_GENERATIONS} 世代 × ${HORSES} 頭 ／ シードごとに 1 プール`);
console.log(`  育成: ${APPROPRIATE_POLICY}（V-14 ① と同じ方針・training-career.ts）`);
console.log(`  出走: ★**本番の enter_race と同じ「生成済みのレースに追加」**（0024:172-174・窓の抽選を経ない）`);
console.log(`        ★レースの選び方: **${CHOICE}**` +
  (CHOICE === 'matched' ? `（自分と同じくらいの相手の番組・幅 ±${(MATCH_TOLERANCE * 100).toFixed(0)}%）` : '（無差別・番組の格を見ない）') +
  ` ← ★正典に無い自由変数（R-12・--choice で切替）`);
console.log(`        ★申し込みは ${SEGMENTS} 区間 × ${ENTRIES_PER_SEGMENT} 回 ＝ キャリア上限 ${CAREER_RACE_LIMIT} 戦（正典 §7.1）`);
console.log(`        ★上限 ${FIELD_SIZE.MAX} 頭を超えたら**完全抽選**で落とす（正典 1317・賞金上位を優先しない）`);
console.log(`  能力: ★育て終わった stats（本番のワーカーと同じ渡し方・build-race.ts:89）`);
console.log(`  ★: starsOfPotential（★付与時の素質から。★の唯一の出どころ・裁定 §2-①）`);
console.log('');
console.log(
  `  ${'★'.padEnd(6)}${'頭数'.padStart(6)}${'1勝以上'.padStart(9)}${'±SE'.padStart(7)}` +
    `${'平均出走'.padStart(9)}${'勝率/走'.padStart(9)}${'早期引退'.padStart(9)}` +
    `   ${'[対照A] 全頭放置'.padStart(16)}${'[対照B] この帯だけ放置'.padStart(22)}`,
);

const keys = [...bands.keys()].sort((a, b) => a - b);
let total: BandRow = {
  n: 0, winners: { appropriate: 0, neglect_all: 0, neglect_band: 0 },
  starts: 0, wins: 0, applications: 0, earlyRetired: 0, noStart: 0,
};
for (const k of keys) {
  const r = bands.get(k)!;
  total = {
    n: total.n + r.n,
    winners: {
      appropriate: total.winners.appropriate + r.winners.appropriate,
      neglect_all: total.winners.neglect_all + r.winners.neglect_all,
      neglect_band: total.winners.neglect_band + r.winners.neglect_band,
    },
    starts: total.starts + r.starts,
    wins: total.wins + r.wins,
    applications: total.applications + r.applications,
    earlyRetired: total.earlyRetired + r.earlyRetired,
    noStart: total.noStart + r.noStart,
  };
  const diff = ((r.winners.neglect_band - r.winners.appropriate) / Math.max(1, r.n)) * 100;
  console.log(
    `  ${`★${k.toFixed(1)}`.padEnd(6)}${String(r.n).padStart(6)}${pct(r.winners.appropriate, r.n).padStart(9)}` +
      `${sePt(r.winners.appropriate, r.n).padStart(6)}pt` +
      `${(r.starts / Math.max(1, r.n)).toFixed(1).padStart(9)}` +
      `${(r.starts === 0 ? '—' : (r.wins / r.starts).toFixed(3)).padStart(9)}` +
      `${pct(r.earlyRetired, r.n).padStart(9)}` +
      `   ${pct(r.winners.neglect_all, r.n).padStart(16)}` +
      `${`${pct(r.winners.neglect_band, r.n)}（${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pt）`.padStart(22)}`,
  );
}
console.log('  ' + '-'.repeat(110));
console.log(
  `  ${'合計'.padEnd(5)}${String(total.n).padStart(6)}${pct(total.winners.appropriate, total.n).padStart(9)}` +
    `${sePt(total.winners.appropriate, total.n).padStart(6)}pt` +
    `${(total.starts / Math.max(1, total.n)).toFixed(1).padStart(9)}` +
    `${(total.starts === 0 ? '—' : (total.wins / total.starts).toFixed(3)).padStart(9)}` +
    `${pct(total.earlyRetired, total.n).padStart(9)}` +
    `   ${pct(total.winners.neglect_all, total.n).padStart(16)}` +
    `${pct(total.winners.neglect_band, total.n).padStart(22)}`,
);

console.log('');
console.log('  ★与えた機会と、実際の出走（★BG-2: 別々に出す）');
console.log(
  `    申し込み ${totalEntry.applications.toLocaleString()} 回 ／ 出走 ${totalEntry.accepted.toLocaleString()} 回 ／ ` +
    `★完全抽選で落選 ${totalEntry.rejected.toLocaleString()} 回（${pct(totalEntry.rejected, totalEntry.applications)}）`,
);
console.log(`    ★一度も出走しなかった馬: ${total.noStart} 頭 / ${total.n} 頭`);
console.log('');
console.log('  ★読み方');
console.log('    - 「1勝以上」は**全頭が分母**です（一度も出走せずに引退した馬も分母に入れます）。');
console.log('    - ★**対照 A（全頭放置）がほぼ同じ割合なら、この基準は育成ではなく「開催されたこと」を測っています**（R-16）。');
console.log('    - ★**対照 B（この帯だけ放置）**が、プレイヤーが直面する形です（★BG-5: 帯ごとに出しています）。');
console.log('    - ★落選は**一様**（正典 1317 の完全抽選）なので、どの帯にも偏りません。');
console.log('');
console.log('  🔴 ★本ツールは合否を出しません（R-3）。');
console.log('     ★裁定 Q-BAND-01 が「★**測り直してから線を引く**」としています。★測った値だけを出します。');
console.log('');
console.log(`  所要: ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
