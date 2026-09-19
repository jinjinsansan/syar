/**
 * ★**数えて、印刷して、★合否に入っていない数を探す**（★**CK-11**・読むだけ・2026-09-20）
 *
 * 【★なぜ道具として残すか】
 *   🔴 ★2026-09-19、★同じ走査を**使い捨て**で書いて捨てました。
 *     → ★レビュー側の指摘: ★**「24 / 5 / 4 を誰も再現できません」**。
 *   ★数を報告に書くなら、★**その数を出した道具を残す**こと。★でないと数は主張になります。
 *
 * 【⚠️ ★この走査は目安です。★当たりも外れも出ます】
 *   ✔ ★実測（2026-09-19）: ★網を **3 回** 書き直しました。
 *     ★1 回目 57 件（★手で 5 件 見て**当たり 1 件＝精度 20%**）
 *     ★2 回目 15 件（🔴 ★**探しているものを落とした**）
 *     ★3 回目 24 件（★判定を持つ道具 5 件 → ★手で見て **4 件 当たり**）
 *   🔴 ★2 回目の失敗が要点です: ★テンプレート文字列を潰した側**だけ**で使用回数を数えたので、
 *     ★**印刷だけの使い方が丸ごと消え**、★「一度も使われていない」に見えました。
 *     → ★★**CK-11 を探す道具が、★CK-11 の対象を消していた。**
 *
 * 【✔ ★「判定あり」に出るもののうち、★**説明がついているもの**（★2026-09-20 に手で見ました）】
 *   ⚠️ ★これを ★**便の中だけに置かない**ため、★ここに書きます（★便は消えます）。
 *   ★`cleanup-ds7-leak` の `ledger` / `horses` / `auth`
 *     … ★**下見**の表示です（★`--write` の前に「何件あるか」を出す）。★合否は `after` が持ちます。
 *   ★`settle-races` の `chk`
 *     … ★DB 全体の内訳の表示。★合否は ★**`leftInRange`**（★`cycle_index >= FROM` で絞った数）が持ちます。
 *   ★`verify-cancel` の `st`
 *     … ★馬券の状態の内訳の表示。★合否は別項が持ちます。
 *   ★`diag-conditions` の `tc`
 *     … ★`diag-*` なので印刷が成果物（★下の根拠を参照）。
 *   🔴 ★**ここに無い名前が出たら、★それは見ていないものです。** ★手で読んでください。
 *
 * 【★読み方】
 *   ★`diag-*` は ★**印刷が成果物**なので、★原則 対象外です。
 *   ✔ ★根拠（★レビュー側が採った・2026-09-19）: ★`tools/diag-*.mjs` は **22 本**あり、
 *     ★**終了コードとして読んでいる呼び出し元は 0 本**。
 *   → ★見るべきは ★**判定（`check` / `rec` / `fails` / 終了コード）を持つ道具**のほうです。
 *
 * 実行: node tools/diag-printed-only-counts.mjs
 *       node tools/diag-printed-only-counts.mjs --judging   … ★判定を持つ道具だけ
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TICK = String.fromCharCode(96);
/**
 * ★テンプレート文字列を潰す（★中に居るだけなら「印刷だけ」とみなすため）。
 * 🔴 ★**ファイル全体で 1 度だけ**潰すこと。★切り出した窓の中で潰すと、
 *   ★バッククォートの偶奇がずれて ★**逆側（コードの側）を捨てます**。
 */
const stripTemplates = (s) => s.split(TICK).filter((_, i) => i % 2 === 0).join(' ');

/** ★合否に効いている印。⚠️ ★裸の `>` `<` を落とさないこと（★1 回目はそれで偽陽性を出した） */
const DECIDES = /[!=]==?|[<>]=?|\.push\(|\bfails\b|\brecord\(|\bcheck\(|\brec\(|exitCode|process\.exit|\bok\b|\?\s/;

/** ★その道具が「合否」を持っているか（★持たないなら印刷が成果物） */
const HAS_VERDICT = /\bfails\b|\bcheck\(|\brecord\(|\brec\(|process\.exit\(|exitCode/;

const onlyJudging = process.argv.includes('--judging');

const files = execSync('git ls-files tools', { encoding: 'utf8' }).trim().split('\n')
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('tools/lib/'));

const rows = [];
for (const p of files) {
  let s;
  try { s = fs.readFileSync(p, 'utf8'); } catch { continue; }
  const judging = HAS_VERDICT.test(stripTemplates(s));
  if (onlyJudging && !judging) continue;
  const code = stripTemplates(s);
  for (const m of s.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=[^;]*count\(\*\)[^;]*;/g)) {
    const name = m[1];
    const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b[\\w$.\\[\\]]*`, 'g');
    /** 🔴 ★使われているかは**全文**で、★合否に入っているかは**潰した側**で */
    if ([...s.matchAll(re)].length < 2) continue;
    let decides = false;
    for (const u of code.matchAll(re)) {
      if (DECIDES.test(code.slice(Math.max(0, u.index - 90), u.index + 110))) { decides = true; break; }
    }
    if (!decides) rows.push({ f: p.replace(/^tools\//, ''), name, judging });
  }
}

const judging = rows.filter((r) => r.judging);
console.log(`# CK-11: 数えて印刷しているだけの数（★走査 ${files.length} 本）`);
console.log('');
console.log(`  疑い ${rows.length} 件 — うち ★**判定を持つ道具** ${judging.length} 件 / ★印刷が成果物 ${rows.length - judging.length} 件`);
console.log('');
for (const r of rows) console.log(`  ${r.judging ? '🔴 判定あり' : '   印刷のみ'}  ${r.f.padEnd(30)} ${r.name}`);
console.log('');
console.log('⚠️ ★これは目安です。★最後は人が読みます（★2026-09-19 の精度は 3 回目で 4/5）。');
