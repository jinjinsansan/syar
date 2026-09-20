/**
 * ★**まだ直っていない指摘の期限を見る**（★**NT-3**・2026-09-19）
 *
 * 【🔴 ★なぜ要るか】
 *   ★`REPORT_AUDIT_20260914.md` の **22 項目**のうち、★**12 件が 5 日 そのまま**でした。
 *   ★報告書には ★**期限がありません**。★読まれなければ、そのまま残ります。
 *   → ★**期限を持たせ、切れたら門で落とします。**
 *
 * ⚠️ ★**検査は流しません**（★`verify-known-red.mjs` と違い、★数秒で終わります）。
 *    ★見るのは ★**簿の期限と、書き漏れ**だけです。
 * ⚠️ ★これは ★**状態を変えない道具**です（★分類: READONLY）。★DB にも繋ぎません。
 *
 * 【★使い方】`node tools/verify-open-findings.mjs`（★門から呼ばれます）
 */
import { OPEN_FINDINGS, WATCHING, diffOpenFindings } from './lib/open-findings.mjs';

/** ⚠️ ★今日はここで 1 回だけ作り、★照合の関数には**渡します**（★純粋に保つ・憲法 4） */
const todayIso = new Date().toISOString().slice(0, 10);
const d = diffOpenFindings(todayIso);

console.log(`\n=== ★まだ開いている指摘（${OPEN_FINDINGS.length} 件・${todayIso} 時点） ===`);

/** ★期限が近い順に並べて、★**いま何が迫っているか**をその場で読めるようにします */
for (const e of [...OPEN_FINDINGS].sort((a, b) => String(a.until).localeCompare(String(b.until)))) {
  const late = String(e.until) < todayIso;
  console.log(`  ${late ? '🔴' : '  '} ${String(e.until)} [${e.owner}] ${e.id} … ${e.what}`);
}

const say = (label, list) => {
  if (list.length === 0) { console.log(`  ✅ ${label}`); return false; }
  console.log(`  🔴 ${label}`);
  for (const x of list) console.log(`       ${x}`);
  return true;
};

console.log('');
let bad = false;
bad = say('★期限が切れていない', d.expired) || bad;
bad = say('★id / what / why / owner / until が揃っている', d.missingFields) || bad;
/**
 * 🔴 ★**NT-4**: ★`stillOpen` が偽になった ＝ ★**もう開いていない**（★消し忘れ）。
 * ⚠️ ★述語を持つ行だけが対象です（★全行に強制しません）。
 */
bad = say('★「もう開いていない」のに簿に残っていない（NT-4）', d.closed) || bad;

/**
 * ★**見張り**（★閉じたが戻る条件が在るもの・2026-09-20）。
 *
 * 🔴 ★**条件と日付の両方を要求します。** ★条件だけだと、★その条件が来ない限り
 *   ★誰も読み返しません（★**DP-1** の罠）。★**早いほうで戻ってきます。**
 */
console.log(`
=== ★見張り（${WATCHING.length} 件・★閉じたが戻る条件が在る） ===`);
const watchBad = [];
for (const w of [...WATCHING].sort((a, b) => String(a.reviewBy).localeCompare(String(b.reviewBy)))) {
  const late = String(w.reviewBy) < todayIso;
  console.log(`  ${late ? '🔴' : '  '} ${String(w.reviewBy)} [${w.owner}] ${w.id} … ${w.what}`);
  console.log(`       ★戻る条件: ${String(w.returnWhen)}`);
  for (const k of ['id', 'what', 'why', 'returnWhen', 'owner', 'reviewBy']) {
    if (typeof w[k] !== 'string' || w[k].length === 0) watchBad.push(`${w.id ?? '(id 無し)'}: ${k} が無い`);
  }
  if (late) watchBad.push(`${w.id}: ★読み返す日（${w.reviewBy}）を過ぎています`);
}
console.log('');
bad = say('★見張りに id / what / why / returnWhen / owner / reviewBy が揃い、日付が切れていない', watchBad) || bad;

if (bad) {
  console.log(
    '\n🔴 ★不合格。★直すか、★期限を伸ばす理由を書いて `tools/lib/open-findings.mjs` を直してください。'
    + '\n   ⚠️ ★**期限だけ伸ばすのは「直した」ではありません。** ★伸ばすなら、★なぜ伸びたかを `why` に足すこと。',
  );
  process.exit(1);
}
console.log('\n✅ ★合格（★期限内・書き漏れ無し）');
