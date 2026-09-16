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
 * 実行: `npx tsx apps/cli/src/economy-balance.ts [--grade bronze|silver|gold] [--stars 3]`
 */
import { MENUS, MENU_IDS, STABLE_GRADES, gradeEpCost, type StableGrade, type MenuId } from '@star/training';
import { JOCKEYS, priceOfStars, sellBackEP, STAR_PRICE_EP, MIN_PRICE_EP } from '@star/scheduler';

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
  readonly stars: number;
  /** ★調教費（★90 週 × 1 週の平均） */
  readonly trainingEP: number;
  /** ★出走登録料（★24 戦 × 200） */
  readonly entryEP: number;
  /** ★騎手の料金（★24 戦 × 名簿の平均） */
  readonly jockeyEP: number;
  /** ★配合費 */
  readonly breedingEP: number;
  /** ★馬の購入（★★から決まる価格） */
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

export function careerBalance(grade: StableGrade, stars: number): CareerBalance {
  const training = Math.round(meanWeeklyTrainingEP(grade) * CAREER_ASSUMPTION.weeks);
  const entry = CAREER_ASSUMPTION.entryFeeEP * CAREER_ASSUMPTION.starts;
  const jockey = Math.round(meanJockeyFeeEP() * CAREER_ASSUMPTION.starts);
  const purchase = priceOfStars(stars);
  const back = sellBackEP(purchase);
  return {
    grade, stars,
    trainingEP: -training, entryEP: -entry, jockeyEP: -jockey,
    breedingEP: -CAREER_ASSUMPTION.breedingEP, purchaseEP: -purchase, sellBackEP: back,
    totalEP: -(training + entry + jockey + CAREER_ASSUMPTION.breedingEP + purchase) + back,
    prizeAveragePP: CAREER_ASSUMPTION.prizeAveragePP,
    prizeTopPP: CAREER_ASSUMPTION.prizeTopPP,
  };
}

/** ★同じ EP を注いだときに期待する★（★D-102 ④「同じ EP での期待する★を報告する」） */
export function starsPerEP(stars: number): number {
  return stars / priceOfStars(stars);
}

/** ★コマンドとして流したとき（★import されたときは何も出しません） */
const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('economy-balance.ts');
if (isMain) {
  const arg = (n: string, d: string): string => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const stars = Number(arg('stars', '3'));
  console.log('# ★1 頭・1 キャリアの収支（★正典 §3.4 の取り直し・GB-6）');
  console.log(`  前提: 現役 ${CAREER_ASSUMPTION.weeks} 週 / ${CAREER_ASSUMPTION.starts} 戦 / 登録料 ${CAREER_ASSUMPTION.entryFeeEP} EP / 配合費 ${CAREER_ASSUMPTION.breedingEP} EP`);
  console.log(`  騎手の料金の平均 ${meanJockeyFeeEP().toFixed(0)} EP ／ ★${stars} の購入価格 ${priceOfStars(stars).toLocaleString()} EP（★1 つ ${STAR_PRICE_EP} EP・最低 ${MIN_PRICE_EP}）`);
  console.log('');
  console.log('  格        1週の調教費   調教費      登録料     騎手      配合費     購入      戻り      支出計');
  for (const g of STABLE_GRADES) {
    const b = careerBalance(g, stars);
    console.log(
      `  ${g.padEnd(8)} ${meanWeeklyTrainingEP(g).toFixed(0).padStart(8)}  ${b.trainingEP.toLocaleString().padStart(9)}`
      + ` ${b.entryEP.toLocaleString().padStart(9)} ${b.jockeyEP.toLocaleString().padStart(8)}`
      + ` ${b.breedingEP.toLocaleString().padStart(9)} ${b.purchaseEP.toLocaleString().padStart(9)}`
      + ` ${b.sellBackEP.toLocaleString().padStart(8)} ${b.totalEP.toLocaleString().padStart(10)}`,
    );
  }
  console.log('');
  console.log(`  賞金（参考・§3.4 の写し）: 平凡 +${CAREER_ASSUMPTION.prizeAveragePP.toLocaleString()} PP 相当 ／ 重賞級 +${CAREER_ASSUMPTION.prizeTopPP.toLocaleString()} PP 相当`);
  console.log('  ★同じ EP での期待する★（★1 EP あたり）:');
  for (const s of [1, 2, 3, 4, 5]) {
    console.log(`    ★${s}: 価格 ${priceOfStars(s).toLocaleString().padStart(7)} EP ／ ★/EP ${(starsPerEP(s) * 10_000).toFixed(2)}（×10⁻⁴）`);
  }
  const menus = MENU_IDS.map((id: MenuId) => `${MENUS[id].label} ${MENUS[id].epCost}`).join(' / ');
  console.log(`  調教費の内訳（ブロンズ・§7.2 の表）: ${menus}`);
}
