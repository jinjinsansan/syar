/**
 * ★ギャロップの「馬らしさ」を機械で測る（オーナー指摘 ⑫⑬）
 *
 *   ⑫ 騎手がかがんで追っている姿勢がない
 *   ⑬ 生物学的な走り方になっていない（おもちゃに見える）
 *
 * 【★なぜ道具にするか】
 *   ここまで、絵は**作って見せて駄目出し**を繰り返してきました（ゼッケンで5回）。
 *   ★**「良い」を測れないので、私が自分で判断できません。**
 *   → **馬の走りとして成立している条件**を、画素から測れる形にします。
 *     ⚠️ これで「良い絵」になるわけではありません。**明らかに駄目なものを弾く**だけです。
 *
 * 【測るもの — すべて実際のギャロップの性質】
 *   ① **宙に浮く局面がある**（suspension）
 *      駆歩は1完歩に1回、四肢すべてが地面を離れます。これが無いと「小走り」に見えます。
 *   ② **体が伸び縮みする**（extension / collection）
 *      伸びた局面と縮んだ局面で、鼻先から尻までの長さが変わります。
 *   ③ **接地している脚の本数が変わる**
 *      1本 → 2本 → 3本 → 0本 と移り変わります。常に同じなら「行進」です。
 *   ④ **騎手が前傾している**（追う姿勢）
 *      騎手の重心が、鞍より**前**にあること。直立していたら追っていません。
 *   ⑤ **コマごとに姿勢が違う**
 *      同じ絵が並んでいたら、動いて見えません。
 *   ⑥ ★**胴体・首・騎手も動く**
 *      ⚠️ ①〜⑤ は**全部通るのに「おもちゃ」と判定されました**。見たら理由が分かりました:
 *         **胴体・首・頭・騎手が6コマとも完全に同一**で、**脚だけが差し替えられて**いました。
 *      実際のギャロップは**体全体がしなります**（背中が伸縮し、首が伸び、頭が上下し、
 *      騎手が律動に合わせて体を送る）。**脚だけ動かしても馬には見えません。**
 *   ⑦ ★**縁に緑が残っていない**
 *      クロマキーの取り残しがあると、輪郭に緑の線が出ます。
 *
 * 実行: npx tsx tools/measure-gallop.mjs [シート.png]
 */
import sharp from 'sharp';
import { loadFrames } from './lib/dress.mjs';

const SHEET = process.argv[2] ?? 'design/art/assets/horse-gallop-sheet.png';
const frames = await loadFrames(SHEET);

/** 1コマぶんの計測 */
async function measure(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const on = (x, y) => data[(y * W + x) * C + 3] > 128;

  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0, sx = 0, sy = 0;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!on(x, y)) continue;
    n += 1; sx += x; sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (n === 0) return null;

  /**
   * ★**脚の接地**。いちばん下の帯（下から 6% ぶん）に画素があるかで見ます。
   *   ⚠️ 「下端の位置」ではありません。**コマごとに下端が違うのは当たり前**なので、
   *      **全コマ共通の地面線**を基準にします（呼び出し側で決めます）。
   */
  const bottomBand = [];
  for (let y = 0; y < H; y += 1) {
    let c = 0;
    for (let x = 0; x < W; x += 1) if (on(x, y)) c += 1;
    bottomBand.push(c);
  }

  /**
   * ★**騎手の前傾**。
   *   上から 30% の部分（＝騎手）の重心 x と、全体の重心 x を比べます。
   *   ★騎手が前（右）にあるほど「追っている」姿勢です。
   */
  const headTop = y0;
  const cut = headTop + Math.round((y1 - y0) * 0.3);
  let rx = 0, rn = 0;
  for (let y = headTop; y <= cut; y += 1) for (let x = 0; x < W; x += 1) {
    if (on(x, y)) { rx += x; rn += 1; }
  }
  const riderX = rn > 0 ? rx / rn : sx / n;

  /** ★上半分（胴体・首・騎手）の画素だけを取り出す。**ここが変わらなければ脚だけの動き** */
  const upper = [];
  const upperCut = y0 + Math.round((y1 - y0) * 0.55);
  for (let y = y0; y <= upperCut; y += 1) {
    for (let x = 0; x < W; x += 1) upper.push(on(x, y) ? 1 : 0);
  }

  /** ★縁に残った緑（クロマキーの取り残し） */
  let greenEdge = 0;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const o = (y * W + x) * C;
    if (data[o + 3] <= 128) continue;
    const [r, g, b] = [data[o], data[o + 1], data[o + 2]];
    if (g > r + 30 && g > b + 30) greenEdge += 1;
  }

  return {
    W, H, x0, x1, y0, y1, n, upper, upperCut, greenEdge,
    bodyLen: x1 - x0 + 1,
    bodyTop: y0,
    bottom: y1,
    centroidX: sx / n,
    riderLead: (riderX - sx / n) / Math.max(1, x1 - x0),   // ★+ なら前傾
    rowCounts: bottomBand,
  };
}

const ms = [];
for (const f of frames) ms.push(await measure(f));

/** ★全コマ共通の地面線＝どのコマでも最も低い位置 */
const ground = Math.max(...ms.map((m) => m.bottom));

console.log(`# ★ギャロップの計測: ${SHEET}`);
console.log(`  ${frames.length} コマ / 地面線 y=${ground}`);
console.log('');
console.log('  コマ | 体長 | 下端 | 地面との差 | 接地の幅 | 騎手の前傾');
const airGaps = [];
const contactWidths = [];
for (let i = 0; i < ms.length; i += 1) {
  const m = ms[i];
  const gap = ground - m.bottom;
  // ★接地している幅（地面線から 3px 以内の行にある画素の広がり）
  let cw = 0;
  for (let y = Math.max(0, ground - 3); y <= ground && y < m.H; y += 1) cw = Math.max(cw, m.rowCounts[y] ?? 0);
  airGaps.push(gap);
  contactWidths.push(cw);
  console.log(`   ${i}   | ${String(m.bodyLen).padStart(4)} | ${String(m.bottom).padStart(4)} | ${String(gap).padStart(6)}px | ${String(cw).padStart(6)}px | ${(m.riderLead * 100).toFixed(1).padStart(5)}%`);
}

console.log('');
console.log('【判定】★実際のギャロップに備わる性質');
const fails = [];

// ① 宙に浮く局面
const maxGap = Math.max(...airGaps);
const AIR_MIN_PX = 4;
if (maxGap < AIR_MIN_PX) {
  fails.push(`① ★**宙に浮く局面がない**（最大でも地面から ${maxGap}px）。駆歩は1完歩に1回、四肢が地面を離れます`);
} else {
  console.log(`  ① 宙に浮く局面: あり（最大 ${maxGap}px 浮く）`);
}

// ② 体の伸び縮み
const lens = ms.map((m) => m.bodyLen);
const lenVar = (Math.max(...lens) - Math.min(...lens)) / Math.max(...lens);
const LEN_MIN = 0.06;
if (lenVar < LEN_MIN) {
  fails.push(`② ★**体が伸び縮みしない**（体長の変化 ${(lenVar * 100).toFixed(1)}%、必要 ${LEN_MIN * 100}%以上）`);
} else {
  console.log(`  ② 体の伸び縮み: ${(lenVar * 100).toFixed(1)}%`);
}

// ③ 接地の変化
const cwVar = (Math.max(...contactWidths) - Math.min(...contactWidths)) / Math.max(1, Math.max(...contactWidths));
if (cwVar < 0.25) {
  fails.push(`③ ★**接地の様子が変わらない**（変化 ${(cwVar * 100).toFixed(0)}%）。行進に見えます`);
} else {
  console.log(`  ③ 接地の変化: ${(cwVar * 100).toFixed(0)}%`);
}

// ④ 騎手の前傾
const leads = ms.map((m) => m.riderLead);
const meanLead = leads.reduce((s, v) => s + v, 0) / leads.length;
const LEAD_MIN = 0.06;
if (meanLead < LEAD_MIN) {
  fails.push(`④ ★**騎手が前傾していない**（前傾 ${(meanLead * 100).toFixed(1)}%、必要 ${LEAD_MIN * 100}%以上）。追っている姿勢ではありません`);
} else {
  console.log(`  ④ 騎手の前傾: ${(meanLead * 100).toFixed(1)}%`);
}

// ⑤ コマごとに違う
let dup = 0;
for (let i = 1; i < ms.length; i += 1) {
  if (ms[i].bodyLen === ms[i - 1].bodyLen && ms[i].bottom === ms[i - 1].bottom) dup += 1;
}
if (dup > 0) fails.push(`⑤ ★**同じ姿勢のコマが ${dup} 組ある**`);
else console.log('  ⑤ コマごとに姿勢が違う: はい');

/**
 * ⑥ ★**胴体・首・騎手も動くか**
 *   ⚠️ この検査が無かったとき、**①〜⑤ が全部通るのに「おもちゃ」**でした。
 *      見たら、**脚だけ差し替えて胴体は同一**でした。
 */
const upperDiffs = [];
for (let i = 1; i < ms.length; i += 1) {
  const a = ms[i - 1].upper, b = ms[i].upper;
  const len = Math.min(a.length, b.length);
  let d = 0, tot = 0;
  for (let k = 0; k < len; k += 1) { if (a[k] || b[k]) tot += 1; if (a[k] !== b[k]) d += 1; }
  upperDiffs.push(tot === 0 ? 0 : d / tot);
}
const meanUpper = upperDiffs.reduce((s2, v) => s2 + v, 0) / Math.max(1, upperDiffs.length);
const UPPER_MIN = 0.08;
if (meanUpper < UPPER_MIN) {
  fails.push(`⑥ ★**胴体・首・騎手が動いていない**（変化 ${(meanUpper * 100).toFixed(1)}%、必要 ${UPPER_MIN * 100}%以上）`
    + ` — **脚だけ差し替えた絵**です。実際のギャロップは体全体がしなります`);
} else {
  console.log(`  ⑥ 胴体・首・騎手の変化: ${(meanUpper * 100).toFixed(1)}%`);
}

// ⑦ ★縁の緑（クロマキーの取り残し）
const greens = ms.map((m) => m.greenEdge);
const totalGreen = greens.reduce((s2, v) => s2 + v, 0);
if (totalGreen > 0) {
  fails.push(`⑦ ★**縁に緑が残っている**（${totalGreen} 画素）。輪郭に緑の線が出ます`);
} else {
  console.log('  ⑦ 縁の緑: なし');
}

console.log('');
if (fails.length === 0) {
  console.log('  ★PASS — 走りとして成立する条件は満たしています');
  console.log('  ⚠️ ただし「良い絵かどうか」は測れません。**そこは見て決まります。**');
} else {
  for (const f of fails) console.log(`  ★★FAIL — ${f}`);
}
process.exit(fails.length === 0 ? 0 : 1);
