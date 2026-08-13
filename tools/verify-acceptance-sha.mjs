/**
 * ★合格基準の SHA が HEAD かを機械で確かめる（正典 R-23）
 *
 * 【なぜ要るか】
 *   > 合格は「そのコード状態に対する主張」であり、**コードが変われば黙って失効する**。
 *   > フェーズを閉じるときは**全項目が HEAD であること**。
 *
 *   ★実例（R-23 の由来）: **A-2 の PASS は D-037/D-038 を入れる前の証拠のまま繰り越され**、
 *     しかも検証ツールが実行不能だったため誰も気づかず、報告表には毎回「PASS」と書かれていました。
 *
 * 【★「書いた」では足りない】
 *   判定書に SHA を書くのは**手順**です。書き忘れ・書き換え忘れは黙って通ります。
 *   → ここで**古い SHA を数え上げ**、フェーズを閉じる前に必ず目に入るようにします。
 *
 * 【★このツールが言えないこと】
 *   SHA が HEAD でも「その SHA で**実際に再実行した**」ことは保証しません。
 *   ここが守るのは「**古い証拠が黙って残っていない**」ことだけです。
 *
 * 実行: node tools/verify-acceptance-sha.mjs [docs/ACCEPTANCE_P3.md ...]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TARGETS = files.length > 0 ? files : ['docs/ACCEPTANCE_P3.md'];

/**
 * ★`shell: true` を使いません。
 *   Windows の cmd では **`^` がエスケープ文字**なので、`<sha>^{commit}` の `^` が消え、
 *   すべての SHA が「この repo に無い」と出ました（実際に出た）。
 *   ★**26件「不明」という結果は、判定ではなく引用の誤りでした。**
 */
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const HEAD = sh('git', ['rev-parse', 'HEAD']);
const HEAD_SHORT = HEAD.slice(0, 7);

/**
 * ★**「全 SHA が HEAD と一致」は原理的に達成できません。**
 *
 *   SHA を判定書に書き込むと**新しいコミットができる**ので、
 *   書いた SHA は必ず1つ古くなります。実際、9件を更新した直後に
 *   その9件が「古い」と出ました。**基準そのものが誤っていました。**
 *
 * ★R-23 が守りたいのは「**証拠が現在のコードに対応していること**」です。
 *   だから判定はこうします:
 *     ・その SHA から HEAD までの間に、**コードが1行も変わっていない** → 有効
 *     ・コードが変わっている → **古い**（再実行するか、理由を書く）
 *
 *   ★「コード」から除くのは **文書だけ**です（`.md` と `docs/`）。
 *     ⚠️ ツールやテストは**除きません**。測定に効きうるからです。
 *     実例: `race-field.ts` が91行変わっていたのを、
 *     「効く経路」を手で選んだせいで見落としかけました。
 */
const codeChangedSince = (sha) => {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', sha, 'HEAD', '--', '.', ':(exclude)*.md', ':(exclude)docs/*'],
    { encoding: 'utf8' },
  ).trim();
  return out === '' ? [] : out.split(String.fromCharCode(10));
};

/** その SHA が HEAD の祖先か（＝古い証拠か）。不明な SHA は「不明」として区別する */
const ageOf = (sha) => {
  try {
    // ★`^{commit}` を使わない（上記のエスケープ問題を避ける）。型は cat-file で確かめる
    if (sh('git', ['cat-file', '-t', sha]) !== 'commit') return 'unknown';
    const full = sh('git', ['rev-parse', sha]);
    if (full === HEAD) return 'HEAD';
    // ★HEAD に含まれない SHA（別ブランチ等）は「古い」と断定しない
    try {
      sh('git', ['merge-base', '--is-ancestor', full, HEAD]);
      return 'old';
    } catch {
      return 'unrelated';
    }
  } catch {
    return 'unknown';
  }
};

console.log('# ★合格基準の SHA が HEAD か（R-23）');
console.log('');
console.log(`  HEAD = ${HEAD_SHORT}`);
console.log('');

let old = 0;
let justifiedCount = 0;
let unknown = 0;
let head = 0;
for (const file of TARGETS) {
  /**
   * ★**合格基準の行だけ**を見ます。
   *
   *   最初は文書全体の SHA を拾っていましたが、**経緯の記述**まで
   *   「古い証拠」と判定していました（「配備前 `ca575f9` → 配備後 `67b2971`」など）。
   *   ★あれは証拠ではなく**歴史**で、古いのが正しい状態です。
   *   → 行頭が `| **X-n**` の行に限ります。
   *
   * ⚠️ 逆に、**合格基準を表以外の形で書いたら、この検査からこぼれます。**
   *    判定の証拠は必ず表の行に置くこと。
   */
  const whole = readFileSync(file, 'utf8');
  const text = whole
    .split(String.fromCharCode(10))
    .filter((l) => /^\|\s*\*\*[A-Z]+-[0-9]/.test(l))
    .join(String.fromCharCode(10));
  /**
   * ★**「なぜ古い SHA でも有効か」が明文で書かれている行**（R-23 が認める例外）。
   *   目印は `古いSHA根拠` を含むことです（`**` などの書式は問いません）。
   *
   * ⚠️⚠️ **これは黙らせる仕組みではありません。**
   *    ・目印があっても**必ず一覧に出します**（件数も内容も）
   *    ・「再実行した」とは扱いません。**人が読んで判断するために出します**
   *    ★目印を付ければ検査が緑になる、という使い方をした瞬間に
   *      R-23 は「SHA を書き換えて閉じる」と同じところへ戻ります。
   */
  const justified = new Set();
  for (const line of text.split(String.fromCharCode(10))) {
    // ★書式（`**` や `★`）に依存させない。実際 `★**古いSHA根拠:**` と書いて一致しなかった
    if (!/古いSHA根拠/.test(line)) continue;
    for (const m of line.matchAll(/`([0-9a-f]{7,40})`/g)) justified.add(m[1]);
  }

  const found = new Map();
  for (const m of text.matchAll(/`([0-9a-f]{7,40})`/g)) {
    const sha = m[1];
    if (!found.has(sha)) found.set(sha, 0);
    found.set(sha, found.get(sha) + 1);
  }
  console.log(`## ${file}`);
  if (found.size === 0) {
    // ★0件は「全部 HEAD」ではなく「**抽出できていない**」かもしれない（R-21）
    console.log('  ★SHA が1件も見つかりません。抽出器が壊れている可能性があります');
    unknown += 1;
    continue;
  }
  for (const [sha, count] of [...found.entries()].sort()) {
    const age = ageOf(sha);
    if (age === 'HEAD') { head += count; continue; }
    if (age === 'old') {
      // ★文書しか変わっていなければ、証拠は現在のコードに対応している
      const files = codeChangedSince(sha);
      if (files.length === 0) {
        head += count;
        console.log(`  ✓ ${sha}（${count}箇所）— この SHA 以降、コードは変わっていません`);
        continue;
      }
      if (justified.has(sha)) {
        // ★根拠が書いてある。**それでも必ず出す**（黙らせない）
        justifiedCount += count;
        console.log(`  ⚠️ ${sha}（${count}箇所）— 以降 ${files.length} ファイル変更・**根拠が明文で書かれています**`);
        console.log('       ★「根拠あり」は「再実行した」ではありません。人が読んで判断してください');
        continue;
      }
      old += count;
      console.log(`  ★古い: ${sha}（${count}箇所）— 以降 ${files.length} ファイルが変更:`);
      for (const f of files.slice(0, 4)) console.log(`        ${f}`);
      if (files.length > 4) console.log(`        …ほか ${files.length - 4} 件`);
    }
    else if (age === 'unrelated') { old += count; console.log(`  ★HEAD に含まれない: ${sha}（${count}箇所）`); }
    else { unknown += count; console.log(`  ★不明（この repo に無い）: ${sha}（${count}箇所）`); }
  }
  console.log('');
}

console.log('【判定】');
console.log(`  HEAD の SHA: ${head}箇所 / 古い: ${old}箇所 / 不明: ${unknown}箇所`
  + (justifiedCount > 0 ? ` / ⚠️根拠つきの古い SHA: ${justifiedCount}箇所` : ''));
console.log('');
if (old === 0 && unknown === 0) {
  console.log(justifiedCount === 0
    ? '★R-23: PASS — すべての証拠が現在のコードに対応しています'
    : `★R-23: PASS — ただし ⚠️${justifiedCount}箇所は「根拠を明文で書いた」古い SHA です。`
      + String.fromCharCode(10) + '  ★その根拠が妥当かは、この検査では判定していません。必ず読むこと');
  process.exit(0);
}
console.log('★R-23: 古い SHA が残っています。');
console.log('  ★フェーズを閉じるなら、**その SHA で再実行するか、');
console.log('    「なぜ古い SHA でも有効か」を明文で書く**かのどちらかが要ります。');
console.log('  ⚠️ ここを黙らせるために SHA だけ書き換えないこと。**証拠は再実行でしか作れません。**');
process.exit(1);
