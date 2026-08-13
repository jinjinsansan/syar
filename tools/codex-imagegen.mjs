/**
 * ★Codex に画像を作らせて、生成物を取り込む
 *
 * 【なぜ要るか】
 *   この環境の Codex は**画像は作れるがファイルをコピーできません**
 *   （`CreateProcessAsUserW failed: 1312` — Windows のサンドボックスが
 *   ローカルコマンドを起動できない）。毎回こちらで拾っています。
 *   ★**3回続けて同じことをしたので、手順を道具にします。**
 *
 * 【★取り違えないための工夫】
 *   `~/.codex/generated_images/` には過去の生成物も溜まります。
 *   **実行前の時刻を覚えておき、それより後に作られたものだけ**を拾います。
 *   ⚠️ 時刻だけで拾うと、**別の作業が同時に生成したもの**を掴みます。
 *      → 拾った件数を必ず表示し、1件でなければ**選ばずに止まります**。
 *
 * 実行: node tools/codex-imagegen.mjs <プロンプトファイル> <出力.png>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const [promptFile, outPath] = process.argv.slice(2);
if (promptFile === undefined || outPath === undefined) {
  console.error('使い方: node tools/codex-imagegen.mjs <プロンプトファイル> <出力.png>');
  process.exit(2);
}

const CODEX = join(
  homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@openai', 'codex',
  'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe',
);
if (!existsSync(CODEX)) {
  console.error(`★Codex が見つかりません: ${CODEX}`);
  process.exit(2);
}
const GEN_DIR = join(homedir(), '.codex', 'generated_images');

/** 実行前にあったものを覚える。★「時刻より後」ではなく「無かったもの」で拾う */
const before = new Set();
const listPngs = () => {
  const out = [];
  if (!existsSync(GEN_DIR)) return out;
  for (const d of readdirSync(GEN_DIR)) {
    const dir = join(GEN_DIR, d);
    try {
      for (const f of readdirSync(dir)) if (f.endsWith('.png')) out.push(join(dir, f));
    } catch { /* 読めないものは飛ばす */ }
  }
  return out;
};
for (const f of listPngs()) before.add(f);
console.log(`  実行前の生成物: ${before.size} 件`);

const prompt = readFileSync(promptFile, 'utf8');
console.log('  Codex を起動します（数分かかります）…');
try {
  const res = execFileSync(CODEX, ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', prompt], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
  console.log(`  Codex の最後の出力: ${res.trim().split('\n').slice(-1)[0]}`);
} catch (e) {
  // ★コピーに失敗して非ゼロ終了しても、**画像はできている**ことがある。ここで止めない
  console.log('  ★Codex は非ゼロ終了しました（コピー失敗の可能性）。生成物を確認します');
}

const added = listPngs().filter((f) => !before.has(f));
console.log(`  新しく作られた画像: ${added.length} 件`);
if (added.length === 0) {
  console.error('  ★画像が作られていません');
  process.exit(1);
}
if (added.length > 1) {
  // ★複数あったら選びません。取り違えると、別の絵を「これです」と報告することになります
  console.error('  ★複数あります。どれか判断できないので選びません:');
  for (const f of added) console.error(`      ${f} (${statSync(f).size} バイト)`);
  process.exit(1);
}
copyFileSync(added[0], outPath);
console.log(`  ★取り込みました: ${outPath}（${statSync(outPath).size.toLocaleString()} バイト）`);
