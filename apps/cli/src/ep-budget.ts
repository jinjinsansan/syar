/**
 * ★**EP の入りと出の比を見る**（★Q-2 の第 2 段の土台・D-121 ③・V-11）
 *   ★裁定 `REVIEW_EP_BUDGET_20260925.md`（2026-09-25）
 *   ★照会 `QUESTIONS_EP_BUDGET_20260925.md`
 *
 *   npx tsx apps/cli/src/ep-budget.ts [--daily 200] [--horses 1] [--menu light]
 *
 * 【★何のための道具か】
 *   ★**額を動かすたびに、入りと出の比を見る**ためです（★裁定の指示）。
 *   ★`--daily` で ★候補の額を入れて試せます（★コードを直さずに）。
 *
 * 【⚠️ ★数を写しません】★すべて ★`packages/` の 1 か所から引きます（★D-052）。
 *   ★`--daily` を渡さなければ ★`EP_GRANTS.daily`（★D-075 の値）を使います。
 *
 * 【🔴 ★EP が増える道は 2 つだけ】（★2026-09-25 に ★現物で確かめました）
 *   ★① `inflow` … ★デイリー（★登録時の 1 回を含む）
 *   ★② `horse_sale` … ★馬を手放したときに戻る額（★**買った額より必ず小さい** → ★差し引きでは減る）
 *
 *   ⚠️ 🔴 ★**当たり馬券は EP を増やしません。** ★`payout.ts:99` が
 *      ★「★PP を発行する。EP の台帳には書かない（憲法 §0.2 の一方通行）」と書いており、
 *      ★実際に `prize_points` を増やして `pp_ledger` に書きます。
 *      ★EP に入るのは ★**返還（`refund`）だけ**で、★それは ★取ったものを返しているだけです
 *      （★取消・開催中止のとき・`payout.ts:87`・`cancel.ts:76`・`scratch.ts:126`）。
 *      → ★★**馬券で EP を稼ぐ道は在りません。** ★これは ★`ep_reason_class()`（`0080`）の
 *        ★分類と一致します（★「発行」は `inflow` と `horse_sale` の 2 つだけ）。
 *
 * ★DB も時刻も乱数も使いません（★憲法 4）。★画面には出しません（★D-114・D-116）。
 */
import { EP_GRANTS } from '@star/betting';
import {
  STUD_FEE_BASE_EP, STUD_FEE_EARNINGS_DIVISOR, STUD_FEE_PER_G1_EP,
  WEEKS_PER_DAY, WEEKS_PER_YEAR,
} from '@star/scheduler';
import { MENUS, type MenuId } from '@star/training';

const argValue = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : (process.argv[i + 1] ?? null);
};
const numArg = (name: string, fallback: number): number => {
  const v = argValue(name);
  if (v === null) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`★${name} が読めません: ${v}`);
  return n;
};

/** ★1 ゲーム年 ＝ 何 実日か（★52 週 ÷ 1 日 6 週・★写さずに導く） */
const REAL_DAYS_PER_YEAR = WEEKS_PER_YEAR / WEEKS_PER_DAY;

/** ★デイリーの額（★既定は D-075 の値。★`--daily` で候補を試せます） */
const DAILY = numArg('--daily', EP_GRANTS.daily);
/** ★育てる頭数（★既定 1 頭） */
const HORSES = numArg('--horses', 1);

const MENU_LIST = (Object.keys(MENUS) as MenuId[])
  .map((id) => ({ id, label: MENUS[id].label, ep: MENUS[id].epCost }))
  .sort((a, b) => a.ep - b.ep);
/** ★毎週やる調教（★既定は ★0 EP でない中でいちばん安いもの） */
const MENU_ID = argValue('--menu');
const MENU = MENU_ID === null
  ? (MENU_LIST.find((m) => m.ep > 0) ?? MENU_LIST[0]!)
  : (MENU_LIST.find((m) => m.id === MENU_ID)
    ?? (() => { throw new Error(`★--menu が読めません: ${MENU_ID}（${MENU_LIST.map((m) => m.id).join(' / ')}）`); })());

const say = (s = ''): void => { console.log(s); };
/** ★比を「n 倍」で出す（★足りているかは ★1.0 を境に読めます） */
const ratio = (out: number, income: number): string =>
  income === 0 ? '（入りが 0）' : `${(out / income).toFixed(2)} 倍`;

const incomeYear = DAILY * REAL_DAYS_PER_YEAR;

say('★EP の入りと出（★数は正典の定数から。★写していません）');
say();
say(`  1 ゲーム年 = ${WEEKS_PER_YEAR} 週 ÷ 1 日 ${WEEKS_PER_DAY} 週 = ${REAL_DAYS_PER_YEAR.toFixed(2)} 実日`);
say(`  デイリー = ${DAILY.toLocaleString('ja-JP')} EP/実日`
  + `${DAILY === EP_GRANTS.daily ? '（★D-075 の値）' : `（★--daily で試した値・★D-075 は ${EP_GRANTS.daily}）`}`);
say(`  育てる頭数 = ${HORSES} 頭 ／ 毎週の調教 = 「${MENU.label}」${MENU.ep} EP`);
say();

say('  ── EP が増える道（★2 つだけ）──');
say(`    ① デイリー … ★**${Math.round(incomeYear).toLocaleString('ja-JP')} EP / ゲーム年**`);
say(`    ② 馬を手放す … ★買った額より必ず小さい（★差し引きでは ★**減ります**）`);
say('    ⚠️ ★当たり馬券は ★**PP** で払われます（★EP には入りません・憲法 §0.2 の一方通行）。');
say('       ★EP に入る `refund` は ★取ったものを返しているだけです。');
say();

say('  ── 出（★1 ゲーム年）──');
const rows: { readonly label: string; readonly ep: number }[] = [
  { label: `調教「${MENU.label}」${MENU.ep} × ${WEEKS_PER_YEAR} 週 × ${HORSES} 頭`, ep: MENU.ep * WEEKS_PER_YEAR * HORSES },
  { label: `種付料（★最低・G1 0 勝・賞金 0）`, ep: STUD_FEE_BASE_EP },
];
for (const r of rows) {
  say(`    ${r.label.padEnd(42)} ${String(r.ep.toLocaleString('ja-JP')).padStart(9)} EP`
    + `   → 入りの ${ratio(r.ep, incomeYear)}`);
}
const total = rows.reduce((s, r) => s + r.ep, 0);
say(`    ${'合計'.padEnd(42)} ${String(total.toLocaleString('ja-JP')).padStart(9)} EP`
  + `   → 入りの ★**${ratio(total, incomeYear)}**`);
say();

say('  ── 足りるか ──');
if (total <= incomeYear) {
  say(`    ✅ ★足ります（★余り ${Math.round(incomeYear - total).toLocaleString('ja-JP')} EP / 年）`);
} else {
  const needDaily = total / REAL_DAYS_PER_YEAR;
  say(`    🔴 ★**足りません**（★不足 ${Math.round(total - incomeYear).toLocaleString('ja-JP')} EP / 年）`);
  say(`    ★これを満たすデイリーの額 = ★**${Math.ceil(needDaily).toLocaleString('ja-JP')} EP/実日**`
    + `（★いまの ${(needDaily / EP_GRANTS.daily).toFixed(1)} 倍`
    + ` ／ ★日次上限 ${EP_GRANTS.daily_cap.toLocaleString('ja-JP')} の ${(needDaily / EP_GRANTS.daily_cap * 100).toFixed(1)}%）`);
  say('    ⚠️ ★**額は開発側から提案しません**（★較正定数・オーナーの領分・★V-11 の取り直しが前提）。');
  say('       ★この行は ★「その額なら足りる」という ★算術だけです。');
}
say();
/**
 * 🔴 ★**正典の中だけで比べる**（★外から数を持ち込まない）。
 *   ★D-075 は ★日次上限を ★**「能動的なプレイヤーの必要量の約 5 倍」**と書いています。
 *   → ★つまり ★正典が見込んでいた ★**必要量 = 上限 ÷ 5**。
 *   → ★それと ★いまのデイリーの額を比べれば、★**D-075 の中で閉じた比較**になります。
 * ⚠️ ★「5 倍」は ★D-075 の本文の言葉です（★私が決めた数ではありません）。
 */
const CAP_OVER_NEED = 5;
const impliedNeed = EP_GRANTS.daily_cap / CAP_OVER_NEED;
say('  ── 🔴 ★正典の中で比べる（★D-075 の言葉だけを使います）──');
say(`    ★日次上限 ${EP_GRANTS.daily_cap.toLocaleString('ja-JP')} EP は`
  + ` ★D-075 の言葉で「★能動的なプレイヤーの必要量の ★**約 ${CAP_OVER_NEED} 倍**」`);
say(`    → ★正典が見込んでいた必要量 = ${EP_GRANTS.daily_cap.toLocaleString('ja-JP')} ÷ ${CAP_OVER_NEED}`
  + ` = ★**${impliedNeed.toLocaleString('ja-JP')} EP/実日**`);
say(`    → ★いまのデイリー ${EP_GRANTS.daily} EP は ★その **${(EP_GRANTS.daily / impliedNeed * 100).toFixed(0)}%**`
  + `（★**${(impliedNeed / EP_GRANTS.daily).toFixed(0)} 分の 1**）`);
say(`    ⚠️ ★差の ${(impliedNeed - EP_GRANTS.daily).toLocaleString('ja-JP')} EP/日 は、`
  + '★広告・アンケート・オファーから入る前提だったと読めます（★正典 §3.2 / D1 は ★保留のまま）。');
say();
say(`  ★参考: 種付料の式 = ${STUD_FEE_BASE_EP.toLocaleString('ja-JP')}`
  + ` ＋ G1 勝利数 × ${STUD_FEE_PER_G1_EP.toLocaleString('ja-JP')}`
  + ` ＋ 総獲得賞金 ÷ ${STUD_FEE_EARNINGS_DIVISOR}`);
say(`  ★参考: 調教の額 … ${MENU_LIST.map((m) => `${m.label} ${m.ep}`).join(' ／ ')}`);
say();
say('  ⚠️ ★`/earn` の 4 つのうち ★**動いているのはデイリーだけ**です');
say('     （★動画・アンケート・オファーは ★提供元が未定 ＝ ★1 EP も入りません）。');
say('  ⚠️ ★正典 §3.2 / D1 は ★外部の経路を「広告主負担型」に限ったうえで、★具体を ★**保留**にしています。');
