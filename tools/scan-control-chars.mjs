/**
 * ★**機械編集の後始末 — 制御文字が混ざっていないか走査する**（★READONLY・DB に触りません）
 *
 * 【★なぜこの道具が要るのか】★2026-09-18〜19 に **3 回**、同じ形で踏みました
 *   ★開発側: 正規表現に `\b` を書いたつもりが ★**バックスペース 1 文字**になっていた（6 か所）
 *   ★レビュー側: シェルにバッククォートを食われ、★記憶から 2 語が消えた
 *   ★レビュー側: スクリプトをスクリプトで直し、★`\r\n` が実体化して JS が壊れた
 *
 *   → ★**テキストを機械で編集するとき、エスケープが層をまたぐと壊れます**
 *     （★Python/シェル/正規表現/テンプレート文字列）。
 *   → 🔴 ★**そして「壊れたことに気づかない」形になります。**
 *     ★`/\x08band\x08/` は ★**何にも一致しません** — ★検査は緑のまま、★何も見ていません。
 *
 * 【★対処】★**編集の後に、結果そのものを走査する。**
 *   ★書いたつもりの文字列を目で追うのではなく、★**出来上がったファイルの中身を機械で数えます。**
 *
 * 【★何を探すか】
 *   ★`\x00`〜`\x1f` と `\x7f` のうち、★**改行（`\n`・`\r`）とタブ（`\t`）を除いた**もの。
 *   ★加えて ★**見えない空白**（ゼロ幅スペース・BOM・ノーブレークスペース）も探します
 *   — ★これらも「目で見て分からない壊れ方」だからです。
 *
 * 【★使い方】
 *   `node tools/scan-control-chars.mjs <パス...>`      … 指定したファイル・ディレクトリを走査
 *   `node tools/scan-control-chars.mjs --changed`      … ★**git の未コミットの変更だけ**（★編集直後はこれ）
 *   ★見つかったら **終了コード 1**。★見つからなければ 0。
 *
 * ⚠️ ★**走査が空なら落とします**（R-21: 0 件を「該当なし」と読まない）。
 *    ★「1 件も見つからなかった」と「1 ファイルも読めなかった」は別物です。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** ★読まないもの（★生成物・依存・バイナリ） */
const SKIP_DIR = new Set(['node_modules', '.git', '.next', 'dist', 'out', 'coverage']);
/** ★中身がテキストだと分かっている拡張子だけ読む（★画像を読んでも意味がない） */
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx',
  '.json', '.sql', '.md', '.css', '.html', '.sh', '.yml', '.yaml', '.txt', '.service',
]);

/**
 * ★**探す文字**（★名前つき。★「何が見つかったか」を人に言えるように）。
 * ⚠️ ★改行・タブは除きます（★正常な文字なので、ここで拾うと全部が赤になります）。
 */
/**
 * ⚠️ ★**探す文字を、このファイルに直接書きません**（★コードポイントから組み立てます）。
 *    🔴 ★**この道具自身が、最初に自分を赤くしました** — ★註記に書いた「例」が
 *    ★**実体の不可視文字になって混ざっていました**（★まさにこの道具が探している壊れ方）。
 *    → ★**実体を置かなければ、混ざることもありません。**
 */
const cp = (n) => String.fromCodePoint(n);
const SUSPECT = [
  { re: new RegExp(`[${cp(0)}-${cp(8)}${cp(0x0b)}${cp(0x0c)}${cp(0x0e)}-${cp(0x1f)}${cp(0x7f)}]`, 'g'), name: '制御文字' },
  { re: new RegExp(cp(0x200b), 'g'), name: 'ゼロ幅スペース' },
  { re: new RegExp(cp(0xfeff), 'g'), name: 'BOM（先頭以外）' },
  { re: new RegExp(cp(0x00a0), 'g'), name: 'ノーブレークスペース' },
];

/** ★1 文字を人が読める形にする（★制御文字は 2 桁・それ以上は 4 桁で出す） */
const show = (ch) => {
  const n = ch.codePointAt(0);
  return n <= 0xff
    ? `\\x${n.toString(16).padStart(2, '0')}`
    : `\\u${n.toString(16).padStart(4, '0')}`;
};

function filesUnder(target) {
  const st = statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  for (const e of readdirSync(target, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      out.push(...filesUnder(path.join(target, e.name)));
    } else if (TEXT_EXT.has(path.extname(e.name))) {
      out.push(path.join(target, e.name));
    }
  }
  return out;
}

/** ★git が「変わった」と言っているファイルだけ（★編集直後に使う形） */
function changedFiles() {
  const out = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((f) => f !== '' && TEXT_EXT.has(path.extname(f)))
    .map((f) => f.replace(/^"|"$/g, ''));
}

const args = process.argv.slice(2);
let targets;
if (args.includes('--changed')) {
  targets = changedFiles();
} else if (args.length > 0) {
  targets = args.flatMap((a) => {
    try {
      return filesUnder(a);
    } catch {
      console.error(`★読めません: ${a}`);
      return [];
    }
  });
} else {
  console.error('使い方: node tools/scan-control-chars.mjs <パス...> | --changed');
  process.exit(2);
}

// ★走査が空なら落とす（R-21）。★「0 件」と「見ていない」を混ぜない
if (targets.length === 0) {
  console.error('🔴 ★走査の対象が 0 件です。★「見つからなかった」ではなく「見ていない」状態です（R-21）');
  process.exit(1);
}

let hits = 0;
let read = 0;
for (const f of targets) {
  let src;
  try {
    src = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  read += 1;
  for (const { re, name } of SUSPECT) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      // ★BOM は先頭なら正常
      if (name.startsWith('BOM') && m.index === 0) continue;
      const line = src.slice(0, m.index).split('\n').length;
      const from = src.lastIndexOf('\n', m.index) + 1;
      const to = src.indexOf('\n', m.index);
      const text = src.slice(from, to === -1 ? src.length : to);
      hits += 1;
      console.log(`${f}:${line}  ${name} ${show(m[0])}`);
      // ★その行を、制御文字を見える形に置き換えて出す（★そのまま出すと端末が食べます）
      console.log(`    ${text.replace(re, (c) => show(c))}`);
    }
  }
}

console.log('');
console.log(`読んだファイル ${read} / 指定 ${targets.length} ／ 見つかった箇所 ${hits}`);
if (hits > 0) {
  console.log('');
  console.log('🔴 ★機械編集でエスケープが層をまたいで壊れた形です。');
  console.log('   ★例: 正規表現に `\\b` を書いたつもりが、バックスペース 1 文字になっている');
  console.log('        → その検査は**何にも一致しません**（緑のまま、何も見ていない）。');
  process.exit(1);
}
console.log('✔ ★見つかりませんでした。');
