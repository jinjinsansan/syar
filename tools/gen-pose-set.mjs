/**
 * ★走行 8 コマの生成を回す（Codex 画像生成のドライバ）
 *
 * 【なぜ道具にするか】
 *   `design/art/prompts/*.txt` は `{POSE}` と `{PREV_REF}` を持つ雛形で、
 *   **置換はこれまで手でやっていました**（`out/gen/*.prompt.txt` がその痕跡）。
 *   コマは 8 枚あり、方向も side / diag / rear / front と増えるので、
 *   **同じ置換を何度も手で書くと、いつか 1 枚だけ別のコマを参照します。**
 *
 * 【★連続性の参照（PREV_REF）が要点】
 *   1 コマずつ独立に作ると、**馬の体格・鞍・光の向きが少しずつ流れます**。
 *   直前のコマを参照に渡して、同じ個体・同じカメラを保たせます。
 *   → **必ず前のコマが存在してから次を作る**（並列に作らない）。
 *
 * 【★ここは DB に触れません】
 *   画像とプロンプトを書くだけなので分類は readonly（`tools/lib/classification.mjs` の基準）。
 *
 * 実行:
 *   node tools/gen-pose-set.mjs <雛形> <セット名> <コマ番号...>
 *   例) node tools/gen-pose-set.mjs design/art/prompts/winner-rear.txt horse-jockey-winner-rear-v1 06 07 08
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [tpl, setName, ...poses] = process.argv.slice(2);
if (tpl === undefined || setName === undefined || poses.length === 0) {
  console.error('使い方: node tools/gen-pose-set.mjs <雛形> <セット名> <コマ番号...>');
  process.exit(2);
}
if (!existsSync(tpl)) { console.error(`★雛形が無い: ${tpl}`); process.exit(2); }

const template = readFileSync(tpl, 'utf8');
/** 雛形が想定どおりの差し込み口を持っているか（黙って置換漏れにしない） */
if (!template.includes('{POSE}')) { console.error('★雛形に {POSE} がありません'); process.exit(2); }

const outOf = (p) => `out/gen/${setName}-pose${p}-chroma.png`;
/** 短い接頭辞（ログとプロンプトの名前用）。`horse-jockey-` を落とす */
const short = setName.replace(/^horse-jockey-/, '');

for (const pose of poses) {
  const out = outOf(pose);
  if (existsSync(out)) { console.log(`${pose}: 既にある（飛ばす）— ${out}`); continue; }

  // ★直前のコマ。無ければ「無い」と明示する（存在しないパスを渡すと Codex が黙って無視する）
  const prevNum = String(Number(pose) - 1).padStart(2, '0');
  const prev = outOf(prevNum);
  const prevRef = existsSync(prev) ? prev : '(none — this is the first frame of the set)';
  if (!existsSync(prev) && Number(pose) > 1) {
    console.error(`★前のコマ ${prev} がありません。連続性が保てないので止めます`);
    console.error('  （順番に作ってください。飛ばして作ると体格や光が流れます）');
    process.exit(1);
  }

  const prompt = template.replaceAll('{POSE}', pose).replaceAll('{PREV_REF}', prevRef);
  const promptFile = `out/gen/${short}-${pose}.prompt.txt`;
  writeFileSync(promptFile, prompt);
  console.log(`\n=== ${setName} pose${pose} ===`);
  console.log(`  雛形: ${tpl}`);
  console.log(`  連続性の参照: ${prevRef}`);

  try {
    const log = execFileSync('node', ['tools/codex-imagegen.mjs', promptFile, out], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024,
    });
    process.stdout.write(log);
    writeFileSync(`out/gen/${short}-${pose}.log`, log);
  } catch (e) {
    console.error(`  ★${pose} の生成に失敗しました。ここで止めます（後続は前のコマを参照するため）`);
    process.exit(1);
  }
  if (!existsSync(out)) { console.error(`  ★出力が作られていません: ${out}`); process.exit(1); }
}
console.log('\n完了');
