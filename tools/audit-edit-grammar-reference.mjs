/**
 * ★**参考映像（スターホース版）のカット割りを読むための下ごしらえ**（読取専用）
 *
 *   `ダービースタリオン/参考映像スターホース版.mp4` は
 *   **アーケード筐体を手持ちで撮った動画**です。次の制約があります。
 *     ⚠️ ★画面の中身は **約 5Hz でしか更新されません**（25fps のうち 5 枚だけが新しい絵）
 *     ⚠️ ★左下の LED 帯が**毎秒色を変えます**。画面全体で差を取ると LED に支配されます
 *     ⚠️ ★手持ちなので**画面が枠の中で動きます**。画素の差だけではカットと追従を分けられません
 *     ⚠️ ★右上に配信のワイプ（人物）が乗っています
 *
 * 【この道具がすること】
 *   ① 筐体の**上段（中継画面）だけ**を切り出し、5fps で並べる
 *   ② 隣り合う絵の **RGB ヒストグラムのχ²距離**を測る（手ぶれに強い＝平行移動で変わらない）
 *   ③ 閾値を超えた組を**カット候補**として出す
 *   ④ 候補の前後 1 組を**並べた確認用の絵**にする。さらに**候補でない組も一定間隔で混ぜる**
 *      （見落としを見つけるため。R-21: 出力が無い＝合格 ではない）
 *
 * ⚠️ ★**この道具は EDL を決めません。** 候補と証拠を出すだけです。
 *    カットの採否・カメラ方向・主役の判定は、人が絵を見て `reference-edl.json` に書きます。
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('out/2d-edit-grammar');
const FRAMES = path.join(OUT, '_ref-frames');
const PAIRS = path.join(OUT, '_ref-pairs');
mkdirSync(OUT, { recursive: true });

const VIDEO = path.resolve('ダービースタリオン/参考映像スターホース版.mp4');
const FFMPEG = 'C:/Users/USER/AppData/Local/Microsoft/WinGet/Packages/'
  + 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin/ffmpeg.exe';

/**
 * ★**中継画面（上段）の切り出し**。1920x1080 の中での位置。
 *   左下の LED 帯・下段のプレイヤー席・右上のワイプを外してあります。
 */
const CROP = { w: 1400, h: 520, x: 100, y: 40 };
/** ★中身が変わる速さ。これ以上細かく撮っても同じ絵が並ぶだけ */
const CONTENT_FPS = 5;
/**
 * ★読む区間（レース）。発走と決勝は 1 秒刻み・0.2 秒刻みの一覧で目視して決めました。
 *   46.8s = 発馬機が開いて馬が出てくる / 122.0s = 勝馬の寄りが暗転する直前
 */
const RACE = { from: 46.8, to: 122.0 };
/** ★候補にする χ² のしきい値。**この値で EDL が決まるわけではありません**（人が確認します） */
const CUT_CHI2 = 0.05;
/** ★候補でない組も、この間隔で確認用に混ぜる（見落としの検査） */
const CONTROL_EVERY = 12;

/* ── ① 5fps で切り出す ───────────────────────────── */

function extractFrames() {
  if (existsSync(FRAMES)) rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  execFileSync(FFMPEG, [
    '-v', 'error', '-ss', String(RACE.from), '-to', String(RACE.to), '-i', VIDEO,
    '-vf', `crop=${CROP.w}:${CROP.h}:${CROP.x}:${CROP.y},fps=${CONTENT_FPS},scale=700:-1`,
    '-q:v', '3', path.join(FRAMES, 'f%04d.jpg'),
  ], { stdio: 'ignore' });
  const files = readdirSync(FRAMES).filter((f) => /^f\d+\.jpg$/.test(f)).sort();
  console.log(`  切り出し ${files.length} 枚（${RACE.from}〜${RACE.to}s / ${CONTENT_FPS}fps）`);
  return files;
}

/* ── ② ヒストグラムの距離 ─────────────────────────── */

const BINS = 8;   // ★R/G/B を 8 段階ずつ → 512 個の箱

/**
 * ★**平行移動で変わらない指標**を使います。
 *   手持ち撮影で画面が枠の中を動くので、画素どうしを引き算すると
 *   カットでなくても大きな差が出てしまいます。
 */
async function histogramOf(file) {
  const { data, info } = await sharp(file).resize({ width: 350 }).raw().toBuffer({ resolveWithObject: true });
  const h = new Float64Array(BINS * BINS * BINS);
  const n = info.width * info.height;
  for (let i = 0; i < n; i += 1) {
    const r = data[i * info.channels] >> 5;
    const g = data[i * info.channels + 1] >> 5;
    const b = data[i * info.channels + 2] >> 5;
    h[(r * BINS + g) * BINS + b] += 1;
  }
  for (let i = 0; i < h.length; i += 1) h[i] /= n;
  return h;
}

/** ★χ²距離（0＝同じ / 1 に近いほど別物） */
function chi2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    const t = a[i] + b[i];
    if (t > 0) s += (d * d) / t;
  }
  return s / 2;
}

/* ── ③ 確認用の絵（前後 2 枚を並べる） ─────────────── */

async function pairImage(fileA, fileB, label, outFile) {
  const [A, B] = await Promise.all([sharp(fileA).toBuffer(), sharp(fileB).toBuffer()]);
  const meta = await sharp(A).metadata();
  const svg = Buffer.from(`<svg width="${meta.width * 2 + 12}" height="28">`
    + `<text x="6" y="20" fill="#ffd60a" font-size="19" font-family="monospace">${label}</text></svg>`);
  await sharp({ create: { width: meta.width * 2 + 12, height: meta.height + 28, channels: 4, background: '#14120f' } })
    .composite([
      { input: svg, left: 0, top: 0 },
      { input: A, left: 0, top: 28 },
      { input: B, left: meta.width + 12, top: 28 },
    ]).jpeg({ quality: 88 }).toFile(outFile);
}

/* ── 実行 ───────────────────────────────────────── */

console.log('参考映像のカット候補:');
const files = extractFrames();
const secOf = (i) => +(RACE.from + i / CONTENT_FPS).toFixed(2);

const hists = [];
for (const f of files) hists.push(await histogramOf(path.join(FRAMES, f)));

const pairs = [];
for (let i = 1; i < files.length; i += 1) {
  pairs.push({
    index: i,
    /** ★この組の「後ろ」の絵が始まる時刻。カットならここが境目 */
    sec: secOf(i),
    chi2: +chi2(hists[i - 1], hists[i]).toFixed(5),
  });
}
const cand = pairs.filter((p) => p.chi2 >= CUT_CHI2);
/** ★候補でない組も混ぜる（見落とし検査。R-21） */
const control = pairs.filter((p) => p.chi2 < CUT_CHI2 && p.index % CONTROL_EVERY === 0);

if (existsSync(PAIRS)) rmSync(PAIRS, { recursive: true, force: true });
mkdirSync(PAIRS, { recursive: true });
for (const p of [...cand, ...control].sort((a, b) => a.index - b.index)) {
  const kind = p.chi2 >= CUT_CHI2 ? 'cand' : 'ctrl';
  await pairImage(
    path.join(FRAMES, files[p.index - 1]), path.join(FRAMES, files[p.index]),
    `${kind}  ${secOf(p.index - 1).toFixed(2)}s  →  ${p.sec.toFixed(2)}s   chi2=${p.chi2}`,
    path.join(PAIRS, `${kind}-${String(p.index).padStart(4, '0')}-${p.sec.toFixed(2)}.jpg`),
  );
}

const s = pairs.map((p) => p.chi2).sort((a, b) => a - b);
const q = (f) => s[Math.floor(s.length * f)];
writeFileSync(path.join(OUT, 'reference-cuts.json'), JSON.stringify({
  video: path.relative(process.cwd(), VIDEO).replace(/\\/g, '/'),
  crop: CROP, contentFps: CONTENT_FPS, race: RACE, cutChi2: CUT_CHI2,
  note: '★カット候補と証拠。EDL はここでは決めない（人が絵を見て reference-edl.json に書く）。',
  frames: files.length,
  chi2Distribution: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: s[s.length - 1] },
  candidates: cand,
  controlPairs: control.map((p) => ({ index: p.index, sec: p.sec, chi2: p.chi2 })),
  pairs,
}, null, 2));

console.log(`  χ² 分布: p50 ${q(0.5)} / p90 ${q(0.9)} / p99 ${q(0.99)} / max ${s[s.length - 1]}`);
console.log(`  候補 ${cand.length} 件（閾値 ${CUT_CHI2}）: ${cand.map((c) => c.sec.toFixed(1)).join(' ')}`);
console.log(`  見落とし検査用の対照 ${control.length} 件`);
console.log(`\n→ ${path.join(OUT, 'reference-cuts.json')}`);
console.log(`→ 確認用の絵: ${PAIRS}`);
