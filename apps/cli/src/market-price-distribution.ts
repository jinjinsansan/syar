/**
 * ★**定常での出品価格の分布を測る**（★**T11-1 ②'**・2026-09-19・裁定 `REVIEW_T11_BANDS_VERDICT_20260919.md`）
 *   ★分類: **READONLY**（★DB に触りません。★計算だけです）
 *
 * 【🔴 ★なぜこの道具が要るか】
 *   ★開発側は staging の実測（★候補 732 頭・価格 3,000〜4,620 EP・G1 全頭 0 勝）を見て、
 *   ★「★境目は測っても決まらない」と報告しました。
 *   🔴 ★**それは「測っても決まらない」ではなく「まだ測れていない」でした。**
 *     ✔ ★staging の **875 走**は、★1 日 3,230 走に対して ★**6.5 時間ぶん**、
 *       ★1 頭のキャリア（26 日 ＝ 83,990 走）の ★**1.04%** です。
 *     ✔ 🔴 ★**G1 は「1 日 3 本」ではなく「週 3 本」です**（★正典 §10.3「G1 を週3回」・
 *       `G1_DAYS` は `dayOfWeek` 5 に 1 本・6 に 2 本）。★6.5 時間で期待される G1 は ★**0.12 本**。
 *       → ★★**「全頭 G1 0 勝」は式の性質ではなく、★経過時間がそう予測するとおり**でした。
 *   → ★**実時間を待たずに、★定常の集団をここで作って測ります。**
 *
 * 【★何を本物から取るか】★数を写しません（D-052）
 *   ★番組表 … `classOf` / `gradeOf`（★G1 の枠もここから）
 *   ★賞金   … `prizeFor`（★正典 §11 の表）
 *   ★出走表 … `generateRace`（★V-1/V-3 と同じ道具）
 *   ★着順   … `resolveRace`（★本番と同じエンジン）
 *   ★資格   … `winsRangeFor`（★本番のワーカーと同じ絞り方）
 *   ★価格   … `npcStudFee`（★§10.5 の式）
 *   ★帯     … `PRICE_TIERS_EP` / `priceTierOf`
 *
 * 【⚠️ ★これは「見立て」ではなく「測定」ですが、★本番そのものではありません】
 *   ★**違うところ**（★報告に必ず書くこと）:
 *     ① ★育成（★調教・調子・疲労）を入れていません。★`generateRace` の既定の仮定値で走ります。
 *     ② ★引退と世代交代を回していません。★**1 コホートのキャリアを最後まで走らせ**、
 *        ★定常の集団は ★**「キャリアの途中で切った断面」**として出します。
 *     ③ ★NPC の生産（★配合）を入れていません。★創始馬の集団です。
 *   → ★**分布の形**（★どの帯に何頭いるか）を見るための道具で、★**合否の門ではありません**。
 *
 * 【★使い方】
 *   `npx tsx apps/cli/src/market-price-distribution.ts [--pool 3000] [--days 26] [--seed 42] [--starts 24]`
 */
import {
  classOf, gradeOf, winsRangeFor, prizeFor, npcStudFee,
  PRICE_TIERS_EP, LISTINGS_PER_TIER, priceTierOf, CAREER_RACE_LIMIT, RACES_PER_DAY,
  type RaceClass, type PrizeTier,
} from '@star/scheduler';
import {
  CALIBRATED_RACE_RANDOM_K, DEFAULT_RACE_BALANCE, resolveRace,
} from '@star/race-engine';
import {
  createFounder, deriveRng, DEFAULT_BALANCE, FOUNDERS,
  type HorseId, type HorseRecord, type AbilityKey,
} from '@star/sim-engine';
import { generateRace, sortPoolByClass, type GenerateRaceOptions } from './race-field.js';
import { runCareer, APPROPRIATE_POLICY } from './training-career.js';

/**
 * ★段 → 賞金の格（★`apps/worker/src/prize-award.ts` の `tierFromDb` と同じ対応）。
 * ⚠️ ★名前が同じなのでそのまま返します。★知らない段は投げます（R-27）。
 */
function tierOf(raceClass: RaceClass, grade: string | null): PrizeTier {
  if (grade === 'G1' || grade === 'G2' || grade === 'G3') return grade;
  switch (raceClass) {
    case 'maiden': case 'win1': case 'win2': case 'win3': case 'open':
      return raceClass;
    default:
      throw new Error(`tierOf: 未知の段 ${String(raceClass)}`);
  }
}

/** ★1 頭の戦績（★出走のたびに積む） */
interface Career {
  starts: number;
  wins: number;
  g1Wins: number;
  earnings: number;
  /** ★出走ごとの「そのときの価格」（★定常の断面を作るため） */
  priceAfterEachStart: number[];
}

export interface Distribution {
  readonly pool: number;
  readonly races: number;
  readonly ran: number;
  readonly prices: readonly number[];
  readonly g1Winners: number;
  /** ★延べ出走数（★**GR-3/GR-4**: ★PO-1 の「1 日の延べ出走」の入力） */
  readonly totalStarts: number;
  /**
   * ★**格ごとに何本開催されたか**。
   * 🔴 ★対照として必須です — ★**「G1 を勝った馬が少ない」のが**
   *    ★「勝ちにくい」なのか ★**「G1 がそもそも開かれていない」**なのかを分けます。
   */
  readonly heldByTier: Readonly<Record<string, number>>;
  /** ★資格者が 8 頭に満たず開けなかった本数（★格ごと） */
  readonly skippedByTier: Readonly<Record<string, number>>;
  /** ★平均頭数（★**PO-6**: ★`pool.length` で頭打ちになるので 13.46 ではない） */
  readonly meanFieldSize: number;
  /**
   * ★**「4 勝以上」を同時に持つ頭数の推移**（★**PO-6**）。
   * 🔴 ★open と graded の資格は `winsRangeFor` で ** min = 4 ** 。
   *    ★この頭数が 8 を割ると ★**上級のレースが開けません**。
   * ★番組表の 1 日ごとに数えます。
   */
  readonly upperEligibleByDay: readonly number[];
  /** ★引退して入れ替わった頭数（★世代交代が動いている証拠） */
  readonly retired: number;
}

/**
 * ★**1 コホートのキャリアを走らせる**。
 * ★`maxStarts` 走で引退（★正典 `CAREER_RACE_LIMIT`）。
 */
export function runCohort(
  poolSize: number,
  seed: number,
  maxStarts: number,
  days: number,
  /**
   * ★**育成を入れるか**（★**GR-4**・2026-09-19）。
   *
   * ★入れない（既定）… ★`generateRace` の仮定値 `potential × PLACEHOLDER_UNLOCK`（0.55〜0.85）で走ります。
   * ★入れる          … ★`runCareer`（★較正した週送りの経路そのもの）で 1 頭ずつ育て、
   *                     ★**育て終わった能力**でレースに出します（★本番のワーカーと同じ渡し方）。
   *
   * ⚠️ ★**近似です**: ★本番は ★**走りながら育つ**ので、★キャリアの序盤は能力が低いはずです。
   *    ★ここは ★**最初から育て終わった能力**で走らせるので、★**上限側の見積り**になります。
   *    → ★成立率は ★**育成なし（下限）と育成あり（上限）の 2 つ**で挟んで報告します。
   */
  train: boolean,
  /**
   * ★**open / graded の資格の下限を上書きする**（★**測定専用**・PO-6）。
   *
   * ⚠️ 🔴 ★**既定は `winsRangeFor('open').min`（★正典の値）です。**
   *    ★ここを渡すのは ★**「3 勝以上にしたらどうなるか」を測るときだけ**で、
   *    ★**実装を変えるものではありません**（★正典の改訂はオーナー判断）。
   */
  openMinOverride: number | null,
): Distribution {
  const rng = deriveRng(seed, 0);
  const pool: HorseRecord[] = [];
  for (let i = 0; i < poolSize; i += 1) {
    pool.push(createFounder({
      id: `h${i}` as HorseId,
      sex: i % 2 === 0 ? 'male' : 'female',
      sireLine: `L${i % 12}` as never,
      birthYear: 0,
      rng,
      balance: DEFAULT_BALANCE,
      founders: FOUNDERS,
    }));
  }
  /**
   * ★**育て終わった能力**（★GR-4）。★`runCareer` は較正した週送りの合成器を通ります。
   * ⚠️ ★`APPROPRIATE_POLICY`（`balanced`）で育てます — ★V-14 の較正と同じ方針です。
   */
  const trained = new Map<HorseId, Record<AbilityKey, number>>();
  if (train) {
    for (let i = 0; i < pool.length; i += 1) {
      const r = runCareer(pool[i]!, APPROPRIATE_POLICY, i, seed);
      trained.set(pool[i]!.id, r.stats);
    }
  }
  const raceOpts: GenerateRaceOptions = train
    ? { abilityOf: (h) => trained.get(h.id) }
    : {};
  const careers = new Map<HorseId, Career>();
  const careerOf = (id: HorseId): Career => {
    let c = careers.get(id);
    if (c === undefined) { c = { starts: 0, wins: 0, g1Wins: 0, earnings: 0, priceAfterEachStart: [] }; careers.set(id, c); }
    return c;
  };

  const balance = { ...DEFAULT_RACE_BALANCE, RACE_RANDOM_K: CALIBRATED_RACE_RANDOM_K };
  /**
   * 🔴 ★**番組表の日数で回します**（★「1 頭 × 24 走」で本数を決めない）。
   *
   * ⚠️ ★最初は `poolSize * maxStarts / 13` で本数を出していました。
   *    ★集団 1,000 頭なら 1,846 本 ≡ ★**番組表では 7.7 日しか進みません**。
   *    🔴 ★その間にオープンまで上がる馬が揃わず、★**G1 が一度も成立しませんでした**
   *    （★★**「まだ走っていない」を「稼げない」と読み違える**という、
   *      ★**今回ちょうど指摘された誤りを、★道具の中で再現した**形です）。
   * → ★**日数 × `RACES_PER_DAY`** で回し、★集団の大きさで 1 頭あたりの出走数を合わせます
   *   （★本番: 3,000 頭 × 26 日 → 1 頭 約 28 走）。
   */
  const races = days * RACES_PER_DAY;
  let held = 0;
  let starts = 0;
  let nextId = poolSize;
  let retiredCount = 0;
  const upperEligibleByDay: number[] = [];
  /** ★open / graded の資格の下限（★数を写さない・D-052） */
  const upperMin = openMinOverride ?? winsRangeFor('open').min;
  const heldByTier: Record<string, number> = {};
  const skippedByTier: Record<string, number> = {};

  for (let idx = 0; idx < races; idx += 1) {
    /** ★番組表の 1 日ごとに「4 勝以上」を数える（★PO-6） */
    if (idx % RACES_PER_DAY === 0) {
      let n = 0;
      for (const h of pool) {
        const c = careers.get(h.id);
        if (c === undefined) continue;
        if (c.starts >= maxStarts) continue;
        if (c.wins >= upperMin) n += 1;
      }
      upperEligibleByDay.push(n);
    }
    const raceClass = classOf(idx);
    const grade = gradeOf(idx);
    const tier = tierOf(raceClass, grade);
    const range = winsRangeFor(raceClass);
    /**
     * ★**資格で絞る**（★本番のワーカーと同じ・`build-race.ts` の `selectEligible`）。
     * ⚠️ ★これを外すと ★**下級の馬が G1 に出て**、★分布が本番と別物になります。
     */
    const candidates = pool.filter((h) => {
      const c = careers.get(h.id);
      const wins = c?.wins ?? 0;
      const starts = c?.starts ?? 0;
      if (starts >= maxStarts) return false;
      /** ★測定専用の上書き（★open / graded だけ・既定では何も変わりません） */
      const rangeMin = range.max === null ? upperMin : range.min;
      if (wins < rangeMin) return false;
      if (range.max !== null && wins > range.max) return false;
      return true;
    });
    if (candidates.length < 8) { skippedByTier[tier] = (skippedByTier[tier] ?? 0) + 1; continue; }
    held += 1;
    heldByTier[tier] = (heldByTier[tier] ?? 0) + 1;

    const race = generateRace(sortPoolByClass(candidates), idx, rng, undefined, undefined, undefined, raceOpts);
    const result = resolveRace({
      conditions: race.conditions,
      entrants: race.entrants,
      seed: rng.nextUint32() >>> 0,
      balance,
    });
    starts += result.order.length;
    for (const row of result.order) {
      const c = careerOf(row.horseId);
      c.starts += 1;
      if (row.finishPosition === 1) {
        c.wins += 1;
        if (tier === 'G1') c.g1Wins += 1;
      }
      c.earnings += prizeFor(tier, row.finishPosition);
      c.priceAfterEachStart.push(npcStudFee(c.g1Wins, c.earnings));
      /**
       * ★★**世代交代**（★**PO-6**・2026-09-19）。
       * 🔴 ★これが無いと、★**全頭が同じ日にデビューした 1 コホート**になります。
       *    ★「4 勝以上を同時に持つ頭数」は ★**0 から増える途中**だけを見ることになり、
       *    ★**定常の数ではありません**（★実測で 11 頭しか出ませんでした）。
       * → ★**引退したその場で、新しい馬を 1 頭入れます**。
       *   ★これで、★**キャリアのあらゆる段階の馬が混ざる**集団になります。
       */
      if (c.starts >= maxStarts) {
        const at = pool.findIndex((h) => h.id === row.horseId);
        if (at >= 0) {
          nextId += 1;
          const fresh = createFounder({
            id: `h${nextId}` as HorseId,
            sex: nextId % 2 === 0 ? 'male' : 'female',
            sireLine: `L${nextId % 12}` as never,
            birthYear: 0,
            rng,
            balance: DEFAULT_BALANCE,
            founders: FOUNDERS,
          });
          pool[at] = fresh;
          if (train) trained.set(fresh.id, runCareer(fresh, APPROPRIATE_POLICY, nextId, seed).stats);
          retiredCount += 1;
        }
      }
    }
  }

  /**
   * ★**定常の断面**。
   *   ★いつの時点でも、★プールには ★**キャリアのあらゆる段階の馬**がいます。
   *   → ★各馬の「★k 走めを終えた時点の価格」を ★**k を散らして 1 つずつ**取ります。
   * ⚠️ ★これは ★**モデルです**（★引退と世代交代を回した結果ではありません）。★報告にそう書くこと。
   */
  const prices: number[] = [];
  let ran = 0;
  let g1Winners = 0;
  let totalStarts = 0;
  let i = 0;
  for (const c of careers.values()) {
    if (c.starts === 0) continue;
    ran += 1;
    totalStarts += c.starts;
    if (c.g1Wins > 0) g1Winners += 1;
    const k = i % c.starts;               // ★キャリアの進み具合を散らす（★乱数を使わない）
    prices.push(c.priceAfterEachStart[k]!);
    i += 1;
  }
  return { pool: poolSize, races: held, ran, prices: prices.sort((a, b) => a - b), g1Winners, totalStarts, heldByTier, skippedByTier,
    meanFieldSize: held === 0 ? 0 : starts / held, upperEligibleByDay, retired: retiredCount };
}

/** ★コマンドとして流したとき */
const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('market-price-distribution.ts');
if (isMain) {
  const arg = (n: string, d: number): number => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? Number(process.argv[i + 1] ?? d) : d;
  };
  const poolSize = arg('pool', 3000);
  const days = arg('days', 26);
  const seed = arg('seed', 42);
  const maxStarts = arg('starts', CAREER_RACE_LIMIT);
  const train = process.argv.includes('--train');
  const openMin = process.argv.includes('--open-min') ? arg('open-min', 4) : null;

  console.log('# ★定常での出品価格の分布（★T11-1 ②\'・シミュレータで測定）');
  console.log(`  集団 ${poolSize} 頭 / シード ${seed} / 1 頭 ${maxStarts} 走まで（★CAREER_RACE_LIMIT = ${CAREER_RACE_LIMIT}）`
    + ` / 番組表 ${days} 日（${days * RACES_PER_DAY} レース）`
    + (openMin === null ? '' : ` / 🔴 **open の資格を ${openMin} 勝以上に上書き**（★測定専用）`));
  console.log(train
    ? '  ★**育成あり**（runCareer で育て終わった能力で走る・★上限側の見積り）/ 引退と世代交代・配合は入っていません'
    : '  ⚠️ ★育成なし（★下限側の見積り・`--train` で入れられます）/ 引退・世代交代・配合も入っていません');

  const d = runCohort(poolSize, seed, maxStarts, days, train, openMin);
  console.log(`\n  開催 ${d.races} レース / 走った馬 ${d.ran} 頭 / ★G1 を勝った馬 ${d.g1Winners} 頭`
    + `（${((d.g1Winners / Math.max(1, d.ran)) * 100).toFixed(1)}%）`);
  console.log(`  ★平均頭数 ${d.meanFieldSize.toFixed(2)}`
    + ` / ★入れ替わった馬 ${d.retired.toLocaleString('ja-JP')} 頭（★世代交代）`);
  {
    const half = Math.floor(d.upperEligibleByDay.length / 2);
    const tail = d.upperEligibleByDay.slice(half);
    const mean = tail.length === 0 ? 0 : tail.reduce((a, b) => a + b, 0) / tail.length;
    console.log(`  ★「4 勝以上」を同時に持つ頭数（★**PO-6**）: 後半の平均 ${mean.toFixed(0)} 頭`
      + ` / 最後 ${d.upperEligibleByDay[d.upperEligibleByDay.length - 1] ?? 0} 頭 / 最大 ${Math.max(...d.upperEligibleByDay, 0)} 頭`);
    console.log(`     日ごと: ${d.upperEligibleByDay.join(' ')}`);
  }
  console.log(`  ★成立率 ${((d.races / (days * RACES_PER_DAY)) * 100).toFixed(1)}%`
    + `（開催 ${d.races} / 予定 ${days * RACES_PER_DAY}）`
    + ` / ★延べ出走 ${d.totalStarts.toLocaleString('ja-JP')}`
    + `（★1 日 ${Math.round(d.totalStarts / days).toLocaleString('ja-JP')} ・★1 頭 ${(d.totalStarts / Math.max(1, d.ran)).toFixed(1)} 走）`);

  const q = (p: number): number => d.prices[Math.min(d.prices.length - 1, Math.floor(d.prices.length * p))]!;
  console.log('\n  ★価格の分位点 [EP]:');
  for (const p of [0, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
    console.log(`    ${String(p * 100).padStart(5)}% : ${q(p).toLocaleString('ja-JP').padStart(10)}`);
  }
  console.log(`    最大   : ${d.prices[d.prices.length - 1]!.toLocaleString('ja-JP').padStart(10)}`);

  /**
   * 🔴 ★**対照** — ★「G1 を勝った馬が少ない」のが
   *    ★**「勝ちにくい」**のか ★**「G1 がそもそも開かれていない」**のかを分けます。
   */
  console.log('\n  ★格ごとの開催本数（★対照）:');
  for (const t of ['maiden', 'win1', 'win2', 'win3', 'open', 'G3', 'G2', 'G1']) {
    const h = d.heldByTier[t] ?? 0;
    const sk = d.skippedByTier[t] ?? 0;
    if (h === 0 && sk === 0) continue;
    console.log(`    ${t.padEnd(7)}: 開催 ${String(h).padStart(5)} / 資格者不足で中止 ${String(sk).padStart(5)}`);
  }

  console.log('\n  ★いまの帯ごとの頭数（★3 口 埋まるか）:');
  for (let t = 0; t < PRICE_TIERS_EP.length; t += 1) {
    const lo = PRICE_TIERS_EP[t]!;
    const hi = t + 1 < PRICE_TIERS_EP.length ? PRICE_TIERS_EP[t + 1]! : Infinity;
    const n = d.prices.filter((x) => priceTierOf(x) === t).length;
    const label = hi === Infinity ? '以上' : `〜${hi.toLocaleString('ja-JP')} 未満`;
    console.log(`    帯${t} ${lo.toLocaleString('ja-JP').padStart(7)} ${label.padEnd(14)}: `
      + `${String(n).padStart(5)} 頭 ${n >= LISTINGS_PER_TIER ? '✅' : '🔴 3 口に足りない'}`);
  }

  /**
   * ★**測った分布から境目を出す**（★丸い数ではなく、★**分位点**から）。
   *
   * ⚠️ ★これは ★**案**です。★採否はレビュー側／オーナーが決めます。
   *    ★ここが出すのは「★この境目なら、どの帯も 3 口 埋まる」という ★**数だけ**です。
   */
  const round100 = (v: number): number => Math.round(v / 100) * 100;
  const proposal = [PRICE_TIERS_EP[0]!, round100(q(0.5)), round100(q(0.75)), round100(q(0.9)), round100(q(0.99))];
  console.log('\n  ★測った分布から出した境目の案（★分位点 50/75/90/99%）:');
  console.log(`    [${proposal.map((v) => v.toLocaleString('ja-JP')).join(' / ')}]`);
  for (let t = 0; t < proposal.length; t += 1) {
    const lo = proposal[t]!;
    const hi = t + 1 < proposal.length ? proposal[t + 1]! : Infinity;
    const n = d.prices.filter((x) => x >= lo && x < hi).length;
    const label = hi === Infinity ? '以上' : `〜${hi.toLocaleString('ja-JP')} 未満`;
    console.log(`    帯${t} ${lo.toLocaleString('ja-JP').padStart(7)} ${label.padEnd(14)}: `
      + `${String(n).padStart(5)} 頭 ${n >= LISTINGS_PER_TIER ? '✅' : '🔴 3 口に足りない'}`);
  }
}
