/**
 * ★**牝馬のレースの絵を Codex で描き直す**（★2026-10-02・オーナー「パドックは牝馬なのに レース演出はオスでは辻褄が合わない」
 *   「牝馬の絵そのものは合格なので そこを徹底して codex に焼かせればいい」）。
 *
 * 【手順（★1 コマずつ・★順番に。★Codex を同時に動かすと 生成物を取り違える）】
 *   ① `design/art/prompts/race-mare.txt` に 元のコマと 向きの説明を入れて Codex へ（★手本は 合格した牝馬の立ち姿）
 *   ② 候補が何枚か出たら ★全部 `fit-to-frame.mjs` で元の枠へ重ね、★α の重なりがいちばん高い 1 枚を採る
 *   ③ `out/gen/race-mare/<系列>/NN.png`（★元のコマと同じ大きさ・同じ位置）
 *   ★できたコマは飛ばす（★利用上限で止まっても 同じ命令で続きから）。
 *
 * 実行: node tools/gen-race-mare.mjs [系列 ...]   （★省略で 本番が読む 5 系列）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

/** ★本番の見本で 実際に読まれる 5 系列（`out/gen/race-art-requests.mjs`・2026-10-02） */
export const FAMILIES = {
  'side-v8': 'seen exactly from the side, galloping to the right at full speed',
  'side-walk-v1': 'seen exactly from the side, walking calmly to the right before the start',
  'diag-front-v4': 'seen from a front diagonal, galloping toward the viewer',
  'diag-rear-v5': 'seen from a rear diagonal, galloping away from the viewer (the head is partly hidden; keep whatever of the head is visible gentle and feminine)',
  'high-diag-v4': 'seen from high above at a diagonal, galloping',
};

const fams = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(FAMILIES);
const template = readFileSync('design/art/prompts/race-mare.txt', 'utf8');
const nn = (i) => String(i).padStart(2, '0');

for (const fam of fams) {
  const view = FAMILIES[fam];
  if (view === undefined) throw new Error(`★知らない系列: ${fam}`);
  const dir = `out/gen/race-mare/${fam}`;
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 8; i += 1) {
    const out = `${dir}/${nn(i)}.png`;
    if (existsSync(out)) { console.log(`= ${fam} ${nn(i)} はできている`); continue; }
    const src = `apps/web/public/art/horse-jockey-${fam}-pose${nn(i)}.png`;
    if (!existsSync(src)) throw new Error(`★元のコマが無い: ${src}`);
    const promptFile = `${dir}/p${nn(i)}.txt`;
    writeFileSync(promptFile, template.replace('{INPUT}', src).replace('{VIEW}', view));
    const raw = `${dir}/raw${nn(i)}.png`;
    console.log(`▶ ${fam} ${nn(i)} を描き直す`);
    try {
      execFileSync('node', ['tools/codex-imagegen.mjs', promptFile, raw], { stdio: 'inherit' });
    } catch (e) {
      /** ★候補が何枚か出て 選ばずに止まった（★終了コード 0 以外）か ★利用上限。★候補があれば こちらで選ぶ */
      if (!readdirSync(dir).some((f) => f.startsWith(`raw${nn(i)}.cand`))) {
        console.error(`★${fam} ${nn(i)} で止まりました（★上の Codex の出力を見てください）`);
        process.exit(1);
      }
    }
    const cands = existsSync(raw) ? [raw] : readdirSync(dir).filter((f) => f.startsWith(`raw${nn(i)}.cand`)).map((f) => `${dir}/${f}`);
    let best = null;
    for (const c of cands) {
      const fitted = c.replace(/\.png$/, '.fit.png');
      const log = execFileSync('node', ['tools/fit-to-frame.mjs', src, c, fitted], { encoding: 'utf8' });
      const m = /α の重なり ([\d.]+)%・騎手の白 \d+ 画素の差 平均 ([\d.]+)/.exec(log);
      const iou = m === null ? 0 : Number(m[1]);
      console.log(`   ${c.split('/').pop()}: 重なり ${iou}%・騎手の白の差 ${m?.[2] ?? '?'}`);
      if (best === null || iou > best.iou) best = { iou, fitted };
    }
    if (best === null) { console.error(`★${fam} ${nn(i)}: 絵が無い`); process.exit(1); }
    if (best.iou < 85) { console.error(`★${fam} ${nn(i)}: 重なり ${best.iou}% は低すぎる（★姿勢が変わった）→ 採らずに止まる`); process.exit(1); }
    copyFileSync(best.fitted, out);
    console.log(`✓ ${fam} ${nn(i)} → ${out}（重なり ${best.iou}%）`);
  }
}
console.log('★全部できました');
