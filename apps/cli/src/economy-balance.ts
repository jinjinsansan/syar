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
import { JOCKEYS, npcStudFee, sellBackEP, MIN_PRICE_EP } from '@star/scheduler';

/**
 * ★**キャリアの想定**（★正典 §3.4 の表の前提の写し）。
 * ⚠️ ★較正定数ではありません。★「§3.4 が何を仮定して −38,000 EP と書いたか」を、★同じ仮定で並べ直すための値です。
 */
export const CAREER_ASSUMPTION = {
  /** ★現役の週数（★§3.4「現役約 90 週」） */
  weeks: 90,
  /** ★出走数（★§3.4「24 戦」） */
  starts: 24,
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
}
