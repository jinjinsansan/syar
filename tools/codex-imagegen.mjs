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
import sharp from 'sharp';
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
  /**
   * ★コピーに失敗して非ゼロ終了しても、**画像はできている**ことがある。ここで止めない。
   *
   * ⚠️ ★ただし ★**理由は必ず出します**（★2026-09-07）。
   *    ★以前は理由を捨てていたため、★利用上限に当たったときも
   *    ★「★画像が作られていません」としか出ず、★開発側が手で codex を叩いて
   *    ★はじめて「You've hit your usage limit … try again at 7:12 PM」と分かりました。
   *    ★**復帰時刻は成果物です。** ★捨てないこと。
   */
  const text = [e.stdout, e.stderr].join(String.fromCharCode(10));
  const limit = text.match(/hit your usage limit.*/i);
  if (limit !== null) {
    console.error(`  ★★Codex の利用上限です — ${limit[0].trim()}`);
    console.error('  ★時間をおいてから、同じコマ番号でもう一度実行してください（★できたコマは飛ばされます）');
    process.exit(2);
  }
  console.log('  ★Codex は非ゼロ終了しました（コピー失敗の可能性）。生成物を確認します');
  const last = text.trim().split(String.fromCharCode(10)).filter((l) => l.trim() !== '').slice(-2);
  for (const l of last) console.log(`    codex: ${l.trim()}`);
}

const added = listPngs().filter((f) => !before.has(f));
console.log(`  新しく作られた画像: ${added.length} 件`);
if (added.length === 0) {
  console.error('  ★画像が作られていません');
  process.exit(1);
}
if (added.length > 1) {
  /**
   * ★**候補が実質同じなら自動で 1 枚採る。★違うときだけ止まる**（★2026-09-07）
   *
   * ⚠️ ★最初は「必ず人が選ぶ」設計にしました。★理由は正しい —
   *    ★「新しい方」「大きい方」で黙って選ぶと、★**違う絵を『これです』と報告**します。
   * ★ところが実測すると、★2 枚の候補は ★**面積差 80 画素・高さ差 1px**（★ほぼ同一）でした。
   *    ★これで毎回止めると、★16 コマで 16 回中断します。
   * → ★**被写体の面積と高さを測り、差が小さければ同じものとして 1 枚採ります。**
   *   ★差が大きいときだけ、★候補を書き出して止まります（★そこは人が見るべき違い）。
   */
  const measure = async (file) => {
    const { data, info } = await sharp(file).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    let n = 0; let top = info.height; let bottom = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if ((data[(y * info.width + x) * 4 + 3] ?? 0) < 128) continue;
        n += 1; if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
    return { area: n, height: bottom - top + 1 };
  };
  const stats = [];
  for (const f of added) stats.push(await measure(f));
  const areas = stats.map((s2) => s2.area);
  const heights = stats.map((s2) => s2.height);
  const areaSpread = (Math.max(...areas) - Math.min(...areas)) / Math.max(1, Math.min(...areas));
  const heightSpread = (Math.max(...heights) - Math.min(...heights)) / Math.max(1, Math.min(...heights));
  /** ★これ以下なら「同じもの」。★実測の候補差は面積 0.02%・高さ 0.15% でした */
  const SAME = 0.02;
  if (areaSpread <= SAME && heightSpread <= SAME) {
    console.log(`  ★候補 ${added.length} 枚はほぼ同一（面積差 ${(areaSpread * 100).toFixed(2)}% / 高さ差 ${(heightSpread * 100).toFixed(2)}%）。1 枚採ります`);
  } else {
    console.error(`  ★${added.length} 枚できて、★中身が違います（面積差 ${(areaSpread * 100).toFixed(1)}% / 高さ差 ${(heightSpread * 100).toFixed(1)}%）`);
    console.error('  ★どれか判断できないので選びません:');
    added.forEach((f, i) => {
      const cand = outPath.replace(/\.png$/, `.cand${String(i + 1).padStart(2, '0')}.png`);
      copyFileSync(f, cand);
      console.error(`      ${cand}（${statSync(f).size.toLocaleString()} バイト）`);
    });
    console.error('  ★見比べて、採用する 1 枚を出力名へコピーしてください');
    process.exit(1);
  }
}
copyFileSync(added[0], outPath);
console.log(`  ★取り込みました: ${outPath}（${statSync(outPath).size.toLocaleString()} バイト）`);
