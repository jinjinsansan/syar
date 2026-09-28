/**
 * ★**V-11（PP の純発行量）を 1 人・1 実日で見積もる**（★純関数・★DB も時刻も乱数も使わない・★2026-09-28・レビュー側の決定 2）
 *
 *   npx tsx apps/cli/src/v11-budget.ts --x 0:2000:100 --daily 200,2000 --starts 10 --tier maiden --field 12
 *
 * 【★式（`tools/diag-v11.mjs` の恒等式と同じ）】
 *   ★純発行量/日 = (1 − margin)·B ＋ P − X
 *     B … ★投票に回る EP（★上限 ＝ デイリー − 調教 − 種付料 − 出走料・★全部を投票に回したとき）
 *     P … ★賞金の PP（★§11.1 の賞金表 × 出走回数 ÷ 実日・★着順は頭数で等しいとした期待値）
 *     X … ★景品交換の PP（★プレイヤーの行動 ＝ ★**未知**・★必ず引数で受ける）
 *   ★判定は `ppNetHealth`（`@star/betting`・★V-11 の毎日の判定と同じ関数）に ★その 1 日を渡す。
 *
 * 【★レビュー側の条件】
 *   ① ★X に ★隠れた既定を持たせない（★`--x` が無ければ止まる）。★出力に ★「X をいくつに置いた判定か」を並べる。
 *   ② ★1 つの数字で判定しない。★X の幅で ★「どこから割るか」を出す（★割れ目の X も出す）。
 *   ③ ★margin・賞金表・出走料・騎手料・調教・種付料は ★`packages/` の定数から引く（★写さない・D-052）。
 *   ⚠️ ★出走回数・格・頭数も ★判定を動かすので ★引数で受ける（★既定を持たない）。
 *
 * 【⚠️ ★これは上限の見積もり】★B は「余りを全部 投票に回した」ときです。★実際の投票はそれ以下（★payout も小さい）。
 */
import { EP_GRANTS, MARGIN, ppNetHealth, type PointFlowDaily } from '@star/betting';
import {
  ENTRY_FEE_EP, JOCKEYS, PRIZE_TABLE, STUD_FEE_BASE_EP, WEEKS_PER_DAY, WEEKS_PER_YEAR, type PrizeTier,
} from '@star/scheduler';
import { MENUS, type MenuId } from '@star/training';

const argValue = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : (process.argv[i + 1] ?? null);
};
const required = (name: string, hint: string): string => {
  const v = argValue(name);
  if (v === null) throw new Error(`★${name} が要ります（★既定を持ちません・${hint}）`);
  return v;
};
const num = (name: string, v: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`★${name} が読めません: ${v}`);
  return n;
};

/** ★`--x 0:2000:100`（★始め:終わり:刻み）か ★`--x 0,500,1000` */
function xValues(raw: string): readonly number[] {
  const range = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(raw);
  if (range !== null) {
    const [a, b, s] = [Number(range[1]), Number(range[2]), Number(range[3])];
    if (s <= 0 || b < a) throw new Error(`★--x の幅が読めません: ${raw}`);
    return Array.from({ length: Math.floor((b - a) / s) + 1 }, (_, i) => a + i * s);
  }
  return raw.split(',').map((v) => num('--x', v));
}

const X = xValues(required('--x', '景品交換の PP / 人 / 実日。例 --x 0:2000:100'));
const DAILIES = (argValue('--daily') ?? String(EP_GRANTS.daily)).split(',').map((v) => num('--daily', v));
const STARTS = num('--starts', required('--starts', '1 頭の出走回数 / ゲーム年'));
const TIER = required('--tier', `賞金の格（${Object.keys(PRIZE_TABLE).join(' / ')}）`) as PrizeTier;
if (!(TIER in PRIZE_TABLE)) throw new Error(`★--tier が読めません: ${TIER}`);
const FIELD = num('--field', required('--field', '1 レースの頭数'));
if (FIELD < 1) throw new Error('★--field は 1 以上');

const REAL_DAYS_PER_YEAR = WEEKS_PER_YEAR / WEEKS_PER_DAY;
/** ★毎週やる調教（★0 EP でない中でいちばん安いもの・★ep-budget.ts と同じ選び方） */
const MENU = (Object.keys(MENUS) as MenuId[]).map((id) => MENUS[id]).filter((m) => m.epCost > 0)
  .sort((a, b) => a.epCost - b.epCost)[0]!;
const JOCKEY_MIN = Math.min(...JOCKEYS.map((j) => j.feeEP));
const MARGINS = Object.values(MARGIN);
const [M_MIN, M_MAX] = [Math.min(...MARGINS), Math.max(...MARGINS)];
/** ★1 出走の賞金の期待値（★1〜5 着の賞金を ★頭数で割る ＝ 各着に等しい確率） */
const PRIZE_PER_START = PRIZE_TABLE[TIER].reduce((s, v) => s + v, 0) / FIELD;
const P = (STARTS * PRIZE_PER_START) / REAL_DAYS_PER_YEAR;

const say = (s = ''): void => { console.log(s); };
const n0 = (v: number): string => Math.round(v).toLocaleString('ja-JP');
const day = (issued: number, x: number): PointFlowDaily => ({
  epInflow: 0, epBurned: 0, ppIssued: issued, ppExchanged: x, ppNet: issued - x,
  byKind: [], marginActualOverall: 0, alert: false,
});

say('★V-11（PP の純発行量）の見積もり — 1 人・1 実日（★上限: 余りの EP を全部 投票に回したとき）');
say(`  前提: 1 ゲーム年 = ${REAL_DAYS_PER_YEAR.toFixed(2)} 実日 ／ 1 頭 ／ 調教「${MENU.label}」${MENU.epCost} × ${WEEKS_PER_DAY} 週/日`
  + ` ／ 種付料 ${n0(STUD_FEE_BASE_EP)}/年 ／ 出走 ${STARTS} 回/年 × (登録料 ${ENTRY_FEE_EP} ＋ 騎手 ${JOCKEY_MIN}〜)`);
say(`        賞金の格 ${TIER}（1〜5 着 ${PRIZE_TABLE[TIER].map(n0).join(' / ')}）÷ ${FIELD} 頭 ＝ 1 出走の期待値 ${n0(PRIZE_PER_START)} PP`);
say(`        margin ${(M_MIN * 100).toFixed(0)}〜${(M_MAX * 100).toFixed(0)}%（券種で違う）・★判定は ppNetHealth（純増 ÷ 発行 ≤ 許容）`);
say('  ★X（景品交換 PP/人/実日）は ★未知のパラメータです（★下の表の行ごとに置いた値）');
say();
for (const daily of DAILIES) {
  const training = MENU.epCost * WEEKS_PER_DAY;
  const stud = STUD_FEE_BASE_EP / REAL_DAYS_PER_YEAR;
  const entry = (STARTS * (ENTRY_FEE_EP + JOCKEY_MIN)) / REAL_DAYS_PER_YEAR;
  const B = Math.max(0, daily - training - stud - entry);
  const payLo = B * (1 - M_MAX);
  const payHi = B * (1 - M_MIN);
  say(`## デイリー ${n0(daily)} EP/実日`);
  say(`  出: 調教 ${n0(training)} ＋ 種付料 ${n0(stud)} ＋ 出走 ${n0(entry)} ＝ ${n0(training + stud + entry)} EP/実日`
    + ` → ★B（投票に回せる上限）${n0(B)} EP${daily - training - stud - entry < 0 ? `（★赤字 ${n0(daily - training - stud - entry)}・投票 0）` : ''}`);
  say(`  PP の発行: 払戻 ${n0(payLo)}〜${n0(payHi)} ＋ 賞金 P ${n0(P)} ＝ ★${n0(payLo + P)}〜${n0(payHi + P)} PP/人/実日`);
  /** ★割れ目: ★発行の多い側（margin 最小）で判定する（★厳しい側） */
  const issued = payHi + P;
  if (issued <= 0) { say('  判定: ★発行 0 ＝ 測れない（unmeasured）'); say(); continue; }
  let breakX: number | null = null;
  say('    X（交換）   純発行     純増/発行   判定');
  for (const x of X) {
    const h = ppNetHealth(day(issued, x));
    if (h === 'healthy' && breakX === null) breakX = x;
    say(`    ${n0(x).padStart(7)}   ${n0(issued - x).padStart(8)}   ${(((issued - x) / issued) * 100).toFixed(1).padStart(6)}%   ${h === 'healthy' ? '✅ 保つ' : '🔴 割る'}`);
  }
  /** ★正確な割れ目（★同じ判定関数で 2 分探索・★刻みに左右されない） */
  let [lo, hi] = [0, issued * 2];
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (ppNetHealth(day(issued, mid)) === 'healthy') hi = mid; else lo = mid; }
  say(`  ★正確な割れ目: X ≥ ★${n0(hi)} PP/人/実日（★発行 ${n0(issued)} の ${((hi / issued) * 100).toFixed(1)}%）`);
  say(`  ★割れ目: X が ${breakX === null ? `★表の範囲（〜${n0(X[X.length - 1]!)}）では 1 度も保たない` : `★${n0(breakX)} PP/人/実日 以上なら保つ（★それ未満は割る）`}`);
  say();
}
say('⚠️ ★`ppNetHealth` は ★増える側（純増 ÷ 発行 ≤ 許容）だけを見ます。★正典の「ゼロ近傍〜微減」の ★減りすぎる側は 判定していません（★表の大きな負は「保つ」と出ます）。');
say('⚠️ ★X を決めるのは プレイヤーの行動（★景品の値段・在庫・交換の手間）で、★この道具は決めません。');
say('⚠️ ★本番の実集団は まだ測れません（★利用者 1・馬券 0・pp_ledger 0 行・diag-v11）。');
