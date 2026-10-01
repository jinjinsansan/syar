/**
 * ★**1 頭・1 キャリアの収支を取り直す**（★GB-6・2026-09-16・正典 §3.4・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §6）
 *
 * 【★なぜ取り直すか】
 *   ★正典 §3.4 の表は ★**2026-09-16 の決定を含んでいません**:
 *     ★D-102 馬の購入 ／ ★D-103 厩舎の格 ／ ★D-105 騎手の料金
 *   ★この 3 つが入った後の収支を ★**まとめて 1 回**で出します。
 *
 * 【★この道具がすること】
 *   ★**計算だけ**です。★DB にも本番にも触れません。★較正定数も動かしません（★値は読むだけ）。
 *   ★額は ★**実装の 1 か所**（`@star/training` の `MENUS`・`grade.ts`、`@star/scheduler` の `jockeys.ts`・`horse-market.ts`）から引きます。
 *   ⚠️ ★ここに数を書き写さないこと（★二重帳簿にすると、実装を直した日に報告だけが古くなります）。
 *
 * 実行: `npx tsx apps/cli/src/economy-balance.ts [--g1 0] [--earnings 0]`（★T-11 で `--stars` を廃止）
 */
import { MENUS, MENU_IDS, STABLE_GRADES, gradeEpCost, type StableGrade, type MenuId } from '@star/training';
import {
  CAREER_DAYS, CAREER_RACE_LIMIT, ENTRY_FEE_EP, JOCKEYS, npcStudFee, sellBackEP, MIN_PRICE_EP, WEEKS_PER_DAY,
} from '@star/scheduler';
import { EP_GRANTS } from '@star/betting';
import { defaultMenu } from '../../worker/src/training-runner.js';

/**
 * ★**キャリアの想定**（★正典 §3.4 の表の前提の写し）。
 * ⚠️ ★較正定数ではありません。★「§3.4 が何を仮定して −38,000 EP と書いたか」を、★同じ仮定で並べ直すための値です。
 */
export const CAREER_ASSUMPTION = {
  /** ★現役の週数（★§3.4「現役約 90 週」） */
  weeks: 90,
  /**
   * ★**出走数**（★正典 §7.1 の `CAREER_RACE_LIMIT`）。
   *
   * 🔴 ⚠️ ★**2026-09-19 まで `24` を直書き**していました（D-052 の写し）。
   *    ★**CC-1 ③ で上限が 24 → 40 に変わったとき、★ここだけが 24 のまま古くなる**ところでした。
   *    → ★**正典の定数を引きます。** ★「§3.4 が 24 戦を仮定して書いた」ことは、★§3.4 の側の話です。
   * ⚠️ ★したがって ★**§3.4 の収支は取り直しが要ります**（★24 戦の前提で書かれた表なので）。
   */
  starts: CAREER_RACE_LIMIT,
  /** ★出走登録料 [EP]（★§10.4） */
  entryFeeEP: 200,
  /** ★配合費（自家種牡馬）[EP]（★§3.4 の表の写し） */
  breedingEP: 2000,
  /** ★平凡な馬の賞金 [PP 相当]（★§3.4） */
  prizeAveragePP: 25_000,
  /** ★重賞級の馬の賞金 [PP 相当]（★§3.4） */
  prizeTopPP: 120_000,
} as const;

/** ★1 週の平均の調教費 [EP]（★8 メニューの平均・★§3.4 の「平均 350」に対応する量を実装から出す） */
export function meanWeeklyTrainingEP(grade: StableGrade): number {
  let sum = 0;
  for (const id of MENU_IDS) sum += gradeEpCost(id, grade);
  return sum / MENU_IDS.length;
}

export interface CareerBalance {
  readonly grade: StableGrade;
  /**
   * ⚠️ 🔴 ★**2026-09-19・T-11 で `stars` を外しました。**
   *    ★D-102 ③ で ★**価格は素質を入力に取らなくなった**ので、
   *    ★この収支に「★いくつの馬か」という欄はもう置けません。
   */
  /** ★調教費（★90 週 × 1 週の平均） */
  readonly trainingEP: number;
  /** ★出走登録料（★24 戦 × 200） */
  readonly entryEP: number;
  /** ★騎手の料金（★24 戦 × 名簿の平均） */
  readonly jockeyEP: number;
  /** ★配合費 */
  readonly breedingEP: number;
  /** ★馬の購入（★§10.5 の式から決まる価格・T-11） */
  readonly purchaseEP: number;
  /** ★手放したときに戻る EP（★負の支出＝戻り） */
  readonly sellBackEP: number;
  /** ★支出計 [EP]（★負の数） */
  readonly totalEP: number;
  readonly prizeAveragePP: number;
  readonly prizeTopPP: number;
}

/** ★名簿の騎手の料金の平均 [EP] */
export function meanJockeyFeeEP(): number {
  return JOCKEYS.reduce((a, j) => a + j.feeEP, 0) / JOCKEYS.length;
}

/**
 * ★**1 頭・1 キャリアの収支**。
 *
 * 🔴 ★**2026-09-19・T-11 で引数を変えました**。
 *   ★旧: `stars`（★目盛）から価格を出していました。
 *   ★新: **D-102 ③** で ★**価格は素質を入力に取らなくなり**ました。
 *        → ★**購入額そのものを受け取ります**（★この層は「どう決まったか」を知らない）。
 */
export function careerBalance(grade: StableGrade, purchaseEP: number): CareerBalance {
  const training = Math.round(meanWeeklyTrainingEP(grade) * CAREER_ASSUMPTION.weeks);
  const entry = CAREER_ASSUMPTION.entryFeeEP * CAREER_ASSUMPTION.starts;
  const jockey = Math.round(meanJockeyFeeEP() * CAREER_ASSUMPTION.starts);
  const purchase = purchaseEP;
  const back = sellBackEP(purchase);
  return {
    grade, purchaseEP: -purchase,
    trainingEP: -training, entryEP: -entry, jockeyEP: -jockey,
    breedingEP: -CAREER_ASSUMPTION.breedingEP, sellBackEP: back,
    totalEP: -(training + entry + jockey + CAREER_ASSUMPTION.breedingEP + purchase) + back,
    prizeAveragePP: CAREER_ASSUMPTION.prizeAveragePP,
    prizeTopPP: CAREER_ASSUMPTION.prizeTopPP,
  };
}

/**
 * ★**1 実日の収支**（★D-130 ③ ① の合格線・2026-10-01）。
 *   ★「付与 1 頭が、受け取り（デイリー）だけで、設計の頻度で走り、毎週 調教できる」かを見ます。
 *   ★調教は ★ワーカーの既定の献立（`defaultMenu` の 4 週の輪・疲労が 70 未満のとき）の平均で数えます。
 *   ★出走は ★`CAREER_RACE_LIMIT ÷ CAREER_DAYS`（★設計の頻度・D-128 の本番の実測とは別）。
 *   ⚠️ ★投票は数えません（★余りから払う形）。
 */
export interface DailyBudget {
  readonly grade: StableGrade;
  readonly horses: number;
  readonly jockeyFeeEP: number;
  /** ★受け取り [EP/実日] */
  readonly inflowEP: number;
  /** ★調教 1 回の平均 [EP]（★既定の献立の輪） */
  readonly trainingPerSessionEP: number;
  /** ★調教 [EP/実日]（★WEEKS_PER_DAY 回 × 頭数） */
  readonly trainingEP: number;
  /** ★1 頭の出走 [回/実日] */
  readonly startsPerDay: number;
  /** ★出走 [EP/実日]（★(登録料 ＋ 騎手) × 回数 × 頭数） */
  readonly raceEP: number;
  /** ★余り [EP/実日]（★0 以上なら合格線を満たす） */
  readonly remainderEP: number;
}

/** ★既定の献立の輪（★`defaultMenu` を年齢 0〜3 週・疲労 0 で引いたもの）の 1 回の平均 [EP] */
export function defaultRotationSessionEP(grade: StableGrade): number {
  let sum = 0;
  for (let w = 0; w < 4; w += 1) sum += gradeEpCost(defaultMenu(w, 0), grade);
  return sum / 4;
}

export function dailyBudget(grade: StableGrade, jockeyFeeEP: number, horses = 1): DailyBudget {
  const inflowEP = EP_GRANTS.daily;
  const trainingPerSessionEP = defaultRotationSessionEP(grade);
  const trainingEP = trainingPerSessionEP * WEEKS_PER_DAY * horses;
  const startsPerDay = CAREER_RACE_LIMIT / CAREER_DAYS;
  const raceEP = (ENTRY_FEE_EP + jockeyFeeEP) * startsPerDay * horses;
  return {
    grade, horses, jockeyFeeEP, inflowEP, trainingPerSessionEP, trainingEP, startsPerDay, raceEP,
    remainderEP: inflowEP - trainingEP - raceEP,
  };
}

/** ★コマンドとして流したとき（★import されたときは何も出しません） */
const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('economy-balance.ts');
if (isMain) {
  const arg = (n: string, d: string): string => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  /**
   * 🔴 ★**2026-09-19・T-11**。★旧は `--stars`。
   *   ★価格は **§10.5 の式**で `G1 勝利数` と `総獲得賞金` から決まります。
   */
  const g1 = Number(arg('g1', '0'));
  const earnings = Number(arg('earnings', '0'));
  const purchase = npcStudFee(g1, earnings);
  console.log('# ★1 頭・1 キャリアの収支（★正典 §3.4 の取り直し・GB-6）');
  console.log(`  前提: 現役 ${CAREER_ASSUMPTION.weeks} 週 / ${CAREER_ASSUMPTION.starts} 戦 / 登録料 ${CAREER_ASSUMPTION.entryFeeEP} EP / 配合費 ${CAREER_ASSUMPTION.breedingEP} EP`);
  console.log(`  騎手の料金の平均 ${meanJockeyFeeEP().toFixed(0)} EP ／ 購入価格 ${purchase.toLocaleString()} EP`
    + `（★§10.5 の式: G1 ${g1} 勝・総獲得賞金 ${earnings.toLocaleString()} PP・最低 ${MIN_PRICE_EP}）`);
  console.log('');
  console.log('  格        1週の調教費   調教費      登録料     騎手      配合費     購入      戻り      支出計');
  for (const g of STABLE_GRADES) {
    const b = careerBalance(g, purchase);
    console.log(
      `  ${g.padEnd(8)} ${meanWeeklyTrainingEP(g).toFixed(0).padStart(8)}  ${b.trainingEP.toLocaleString().padStart(9)}`
      + ` ${b.entryEP.toLocaleString().padStart(9)} ${b.jockeyEP.toLocaleString().padStart(8)}`
      + ` ${b.breedingEP.toLocaleString().padStart(9)} ${b.purchaseEP.toLocaleString().padStart(9)}`
      + ` ${b.sellBackEP.toLocaleString().padStart(8)} ${b.totalEP.toLocaleString().padStart(10)}`,
    );
  }
  console.log('');
  console.log(`  賞金（参考・§3.4 の写し）: 平凡 +${CAREER_ASSUMPTION.prizeAveragePP.toLocaleString()} PP 相当 ／ 重賞級 +${CAREER_ASSUMPTION.prizeTopPP.toLocaleString()} PP 相当`);
  /**
   * 🔴 ★**「同じ EP での期待する★」を出せなくなりました**（★T-11）。
   *   ★D-102 ④ は「同じ EP での期待する★を報告する」と定めていますが、
   *   ★**価格が素質を入力に取らなくなった**ので、★価格から★を逆算できません
   *   （★**それが D-102 ③ の目的**です）。
   *   → 🔴 ★**照会中**（`QUESTIONS_T11_20260919.md`）。★代わりに★**戦績 → 価格**を出します。
   */
  console.log('  ★戦績 → 購入価格（★§10.5 の式）:');
  for (const [w, e] of [[0, 0], [0, 20_000], [0, 100_000], [1, 100_000], [3, 300_000]] as const) {
    console.log(`    G1 ${w} 勝 ／ 総獲得賞金 ${e.toLocaleString().padStart(9)} PP: `
      + `${npcStudFee(w, e).toLocaleString().padStart(8)} EP`);
  }
  const menus = MENU_IDS.map((id: MenuId) => `${MENUS[id].label} ${MENUS[id].epCost}`).join(' / ');
  console.log(`  調教費の内訳（ブロンズ・§7.2 の表）: ${menus}`);

  console.log('');
  console.log('# ★1 実日の収支（★D-130 の合格線: 付与 1 頭がデイリーだけで、設計の頻度で走り、毎週 調教できる）');
  const fees = JOCKEYS.map((j) => j.feeEP);
  const jockeyCases: readonly [string, number][] = [
    ['最安', Math.min(...fees)], ['平均', meanJockeyFeeEP()], ['最高', Math.max(...fees)],
  ];
  const b0 = dailyBudget('bronze', 0);
  console.log(`  受け取り ${b0.inflowEP.toLocaleString()} EP/実日 ／ 調教 ${WEEKS_PER_DAY} 回/実日（既定の献立の輪）`
    + ` ／ 出走 ${b0.startsPerDay.toFixed(2)} 回/実日（${CAREER_RACE_LIMIT} 戦 ÷ ${CAREER_DAYS} 実日）・登録料 ${ENTRY_FEE_EP}`);
  console.log('  格       頭数 騎手        調教1回   調教/日   出走/日    余り/日');
  for (const g of STABLE_GRADES) {
    for (const horses of [1, 2]) {
      for (const [name, fee] of jockeyCases) {
        const d = dailyBudget(g, fee, horses);
        console.log(
          `  ${g.padEnd(8)} ${String(horses).padStart(3)}  ${name} ${fee.toFixed(0).padStart(4)}`
          + ` ${d.trainingPerSessionEP.toFixed(0).padStart(9)} ${d.trainingEP.toFixed(0).padStart(9)}`
          + ` ${d.raceEP.toFixed(0).padStart(9)} ${d.remainderEP.toFixed(0).padStart(10)}`
          + (d.remainderEP >= 0 ? '  ✔' : '  ✘'),
        );
      }
    }
  }
}
