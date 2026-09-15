/**
 * ★走行 8 コマの生成を回す（Codex 画像生成のドライバ）
 *
 * 【なぜ道具にするか】
 *   `design/art/prompts/*.txt` は `{POSE}` と `{PREV_REF}` を持つ雛形で、
 *   **置換はこれまで手でやっていました**（`out/gen/*.prompt.txt` がその痕跡）。
 *   コマは 8 枚あり、方向も side / diag / rear / front と増えるので、
 *   **同じ置換を何度も手で書くと、いつか 1 枚だけ別のコマを参照します。**
 *
 * 【★連続性の参照が要点 — ★参照は 2 つ渡します】
 *   1 コマずつ独立に作ると、**馬の体格・鞍・光の向きが少しずつ流れます**。
 *   直前のコマを参照に渡して、同じ個体・同じカメラを保たせます。
 *   → **必ず前のコマが存在してから次を作る**（並列に作らない）。
 *
 *   ⚠️ ★ところが「前のコマだけ」を渡すと、★**ずれが 1 コマずつ積み上がります**。
 *      ★2026-09-07 の実測（v4・8 コマ）:
 *        ★被写体高のばらつき **11.4%**（★合格素材 side-v7 は 9.5%）
 *        ★隣接コマの差 平均 **39.9%**（★合格素材 side-v7 は 18.6%）
 *      ★目で見ても ★**5〜8 コマ目で馬が細く小さくなり、別の個体**になっていました。
 *      ★8 コマ目は「7 世代ぶんのコピーのコピー」だからです。
 *   → ★`{ANCHOR_REF}`（★そのセットの **1 コマ目**）も一緒に渡します。
 *     ★これで全コマが同じ 1 枚を見るので、★ずれが積み上がりません。
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

const rawArgs = process.argv.slice(2);
const ti = rawArgs.indexOf('--type');
if (ti >= 0) rawArgs.splice(ti, 2);
const [tpl, setName, ...poses] = rawArgs;
if (tpl === undefined || setName === undefined || poses.length === 0) {
  console.error('使い方: node tools/gen-pose-set.mjs <雛形> <セット名> <コマ番号...>');
  process.exit(2);
}
if (!existsSync(tpl)) { console.error(`★雛形が無い: ${tpl}`); process.exit(2); }

const template = readFileSync(tpl, 'utf8');
/**
 * ★**個体タイプ**（★2026-09-08）。★`{TYPE}` があれば、★`--type <名前>` で
 * ★`design/art/prompts/deformed-type-<名前>.txt` を差し込みます。
 *
 * 【★なぜ分けるか】
 *   ★育成・繁殖のゲームなので、★馬の見た目に個性が要ります。
 *   ★実測: ★毛色 20 色は ★**実質 3 群**（★鹿毛↔栗毛 31・★黒鹿毛↔青毛 20 で区別できない）。
 *   ★画面の馬は ★**188 x 137px** なので、★読めるのは ★輪郭と大きな明暗だけです。
 *   → ★個性は ★**体つきと白い印**で作り、★1 個体タイプ = 1 セット（8 コマ）とします。
 * ⚠️ ★印をコード側で描いてはいけません。★コマごとに位置を検出すると必ずチラつきます
 *    （★実測: 顔は位置合わせ後でも 26px 動きます）。
 */
const typeArg = process.argv.indexOf('--type');
let typeText = '(no special type — use the character reference as-is)';
/**
 * ★そのタイプの ★**完成済みの真横の絵**を見本にします（★2026-09-08）。
 * ⚠️ ★承認前の原画に戻すと ★別の馬になります。★視点を足すときは、
 *    ★**既に出来ているそのタイプの絵**を見本にすること。
 */
let typeRef = 'apps/web/public/rig-lab-assets/ref/approved-v4.png';
if (typeArg > 0) {
  const name = process.argv[typeArg + 1];
  const f = `design/art/prompts/deformed-type-${name}.txt`;
  if (!existsSync(f)) { console.error(`★個体タイプがありません: ${f}`); process.exit(2); }
  typeText = readFileSync(f, 'utf8').trimEnd();
  typeRef = `apps/web/public/rig-lab-assets/ref/approved-type-${name}.png`;
  if (!existsSync(typeRef)) { console.error(`★タイプの見本がありません: ${typeRef}`); process.exit(2); }
  console.log(`★個体タイプ: ${name}（見本 ${typeRef}）`);
}
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

  /** ★基準コマ（そのセットの 1 コマ目）。★ずれの積み上がりを止めるための「原本」 */
  const anchor = outOf('01');
  const anchorRef = (pose !== '01' && existsSync(anchor)) ? anchor : '(none — this frame is the anchor)';

  const prompt = template
    .replaceAll('{POSE}', pose)
    .replaceAll('{PREV_REF}', prevRef)
    .replaceAll('{ANCHOR_REF}', anchorRef)
    .replaceAll('{TYPE}', typeText)
    .replaceAll('{TYPE_REF}', typeRef)
    /**
     * ★**本番の走りのコマの接尾辞**（★2026-09-15・歩きの雛形 `deformed-8frames-walk.txt` が走りのコマを見本に使うため）。
     *   ★本番は 型A ＝ `horse-jockey-side-v8`（★接尾辞なし）・型B ＝ `horse-jockey-side-v8b`。
     */
    .replaceAll('{TYPE_SUFFIX}', typeArg > 0 && process.argv[typeArg + 1] !== 'a' ? process.argv[typeArg + 1] : '');
  const promptFile = `out/gen/${short}-${pose}.prompt.txt`;
  writeFileSync(promptFile, prompt);
  console.log(`\n=== ${setName} pose${pose} ===`);
  console.log(`  雛形: ${tpl}`);
  console.log(`  連続性の参照: ${prevRef}`);
  console.log(`  ★基準コマ: ${anchorRef}`);

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
