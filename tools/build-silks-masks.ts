/**
 * ★**騎手の服の型（マスク）を 事前に作る**（★2026-10-03・3 者会議の結論 B・`MEETING_RACE_QUALITY_RESULT_20261003.md`）。
 *
 * 【なぜ】
 *   ★画面は これまで 白い服の画素を 実行時に閾値で判定して塗っていた（`silksPaintable`）。★陰（暗い灰）・照り・線の際が
 *   ★閾値から外れて 白い斑・色の切れ として残り、★絵を描き直すたびに壊れた（★オーナー「色あせ・色が切れる」・2 回直して再発）。
 *   → ★部位の型を ★1 度だけ作り ★目で確かめて固定し、★実行時は型どおりに塗る（★判定しない）。
 *
 * 【作り方（★1 コマずつ）】
 *   ① ★拾う: 不透明・★色の幅（最大−最小）≤ `SPREAD`・★明るさ ≥ `LEVEL`（★陰の灰色まで）・★肌でない
 *   ② ★探す窓（★兜・上着・鞍布）の中だけ。★窓は 画面と同じ（`SILKS_LAYOUT_*` の値を写したもの・下の `LAYOUTS`）
 *   ③ ★つながった塊（8 近傍）に分け、★小さい塊（★ゴーグルの硝子・目の白・飾り）は捨てる
 *   ④ ★塊の重心がどの窓にあるかで 兜（1）・上着（2）・鞍布（3）に決める
 *   ⑤ ★塊の中の 小さな穴（★照り・陰の筋）を埋める（★`HOLE_MAX` 画素以下・★外とつながらない穴だけ）
 *   出力: `apps/web/public/art/silks-mask/<素材>-poseNN.png`（★赤の値 ＝ 部位 × 80・★0 は塗らない）と
 *        ★確かめる見本 `out/gen/silks-mask/<素材>.png`（★兜 緑・上着 桃・鞍布 青 で塗った 8 コマ）
 *   ★素材の指紋（★画素の SHA-1）を `apps/web/public/art/silks-mask/manifest.json` に残す（★網が 素材と型の組を縛る）。
 *
 * 実行: npx tsx tools/build-silks-masks.ts [素材の名前 ...]   （★省略で 本番が読む騎手つきの組 全部）
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isSkinTone } from '../packages/render/src/silks-skin.ts';

const ART = 'apps/web/public/art';
const OUT = `${ART}/silks-mask`;
const SHEET = 'out/gen/silks-mask';
const SPREAD = 60;
const LEVEL = 40;
const HOLE_MAX = 600;

type Win = { helmet: [number, number, number]; jacket: [number, number, number, number]; saddlecloth: [number, number, number, number]; canvas?: boolean };
/** ★画面の `SILKS_LAYOUT_*`（`apps/web/src/app/race/page.tsx`）と同じ値。★探す窓だけに使う */
/**
 * ★真横の走り・斜め前は 窓を絵に合わせて決め直した（★2026-10-03・外接矩形の割合の目盛りで読んだ）。
 *   ★真横: 兜 x 0.50〜0.70（★背中 0.36〜0.55 と高さが同じなので 横で分ける）・★斜め前: 上着を x 0.62 まで（★B 型の白い流星 x 0.70〜 を外す）。
 */
const CROUCH: Win = { helmet: [0.50, 0.70, 0.155], jacket: [0.34, 0.63, 0.10, 0.37], saddlecloth: [0.28, 0.58, 0.37, 0.66] };
const FRONT: Win = { helmet: [0.47, 0.78, 0.155], jacket: [0.20, 0.62, 0.08, 0.34], saddlecloth: [0.10, 0.60, 0.34, 0.60] };
/** ★後ろ斜め: 兜は 右上の x 0.60〜0.85・y ≤ 0.08（★肩が y 0.06 まで上がるコマで 肩が兜の色になった・方眼で読んだ） */
const REAR: Win = { helmet: [0.50, 0.85, 0.08], jacket: [0.15, 0.85, 0.06, 0.24], saddlecloth: [0.1, 0.9, 0.34, 0.5] };
const HIGH: Win = { helmet: [0.25, 0.75, 0.10], jacket: [0.15, 0.85, 0.06, 0.24], saddlecloth: [0.1, 0.9, 0.34, 0.5] };
const WALK: Win = { canvas: true, helmet: [0.50, 0.69, 0.13], jacket: [0.34, 0.62, 0.14, 0.375], saddlecloth: [0.29, 0.55, 0.375, 0.60] };
export const LAYOUTS: Record<string, Win> = {
  'horse-jockey-side-v8': CROUCH, 'horse-jockey-side-v8b': CROUCH, 'horse-jockey-side-v8m': CROUCH,
  'horse-jockey-diag-front-v4': FRONT, 'horse-jockey-diag-front-v4b': FRONT, 'horse-jockey-diag-front-v4m': FRONT,
  'horse-jockey-diag-rear-v5': REAR, 'horse-jockey-diag-rear-v5m': REAR,
  'horse-jockey-high-diag-v4': HIGH, 'horse-jockey-high-diag-v4m': HIGH,
  'horse-jockey-side-walk-v1': WALK, 'horse-jockey-side-walk-v1m': WALK,
};
const nn = (i: number): string => String(i).padStart(2, '0');

async function build(prefix: string): Promise<{ frames: { file: string; sha1: string; counts: number[] }[] }> {
  const win = LAYOUTS[prefix]!;
  const frames: { file: string; sha1: string; counts: number[] }[] = [];
  const sheets: Buffer[] = [];
  let sw = 0, sh = 0;
  for (let f = 1; f <= 8; f += 1) {
    const file = `${ART}/${prefix}-pose${nn(f)}.png`;
    const raw = readFileSync(file);
    const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    /** ★窓を置く矩形: 外接矩形（★α ≥ 12・余白 2・画面の `opaqueBounds` と同じ）か 画布 */
    let l = W, t = H, r = -1, b = -1;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (data[(y * W + x) * 4 + 3]! >= 12) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    const bx = win.canvas ? 0 : Math.max(0, l - 2), by = win.canvas ? 0 : Math.max(0, t - 2);
    const bw = win.canvas ? W : Math.min(W, r + 3) - bx, bh = win.canvas ? H : Math.min(H, b + 3) - by;
    const inWin = (x: number, y: number): number => {
      const nx = (x - bx) / bw, ny = (y - by) / bh;
      const [h0, h1, h2] = win.helmet, [j0, j1, j2, j3] = win.jacket, [s0, s1, s2, s3] = win.saddlecloth;
      if (nx >= h0 && nx <= h1 && ny <= h2) return 1;
      if (nx >= j0 && nx <= j1 && ny >= j2 && ny <= j3) return 2;
      if (nx >= s0 && nx <= s1 && ny >= s2 && ny <= s3) return 3;
      return 0;
    };
    const ux0 = Math.min(win.helmet[0], win.jacket[0], win.saddlecloth[0]), ux1 = Math.max(win.helmet[1], win.jacket[1], win.saddlecloth[1]);
    const uy1 = Math.max(win.jacket[3], win.saddlecloth[3]);
    const inUnion = (x: number, y: number): boolean => { const nx = (x - bx) / bw, ny = (y - by) / bh; return nx >= ux0 && nx <= ux1 && ny >= 0 && ny <= uy1; };
    /** ① ② 拾う */
    const cand = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const R = data[i]!, G = data[i + 1]!, B = data[i + 2]!, A = data[i + 3]!;
      if (A < 16) continue;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      if (mx - mn > SPREAD || mx < LEVEL) continue;
      const w0 = inWin(x, y);
      /** ★拾うのは 窓をまとめた範囲（★窓からはみ出た兜の下・ズボンも 塊ごと拾う・後ろ斜めで兜が半分白く残った） */
      if (!inUnion(x, y)) continue;
      /**
       * ★肌は 兜・上着の窓でだけ外し、★本物の肌に絞る（★`isSkinTone` は クリーム色の鞍布 240/230/212 や 暖かい白の照りまで 肌にした
       *   → 鞍布がまだら・腿に白い点）。★陰の肌 150/130/120 は 赤−緑 20・赤−青 30。★ズボンの照り 223/208/205 は 赤−青 18（★肌にしない）。
       */
      if (w0 !== 3 && isSkinTone(R, G, B) && R - G >= 14 && R - B >= 25 && R < 235) continue;
      cand[y * W + x] = 1;
    }
    /**
     * ★③' 細いつながり（★首・襟で兜と上着がつながる）を切るため ★候補を 2 画素削ってから塊に分ける。★削った画素は ⑦ で戻す。
     */
    const full = cand.slice();
    for (let pass = 0; pass < 2; pass += 1) {
      const drop: number[] = [];
      for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
        const k = y * W + x; if (cand[k] === 0) continue;
        if (cand[k - 1] === 0 || cand[k + 1] === 0 || cand[k - W] === 0 || cand[k + W] === 0) drop.push(k);
      }
      for (const k of drop) cand[k] = 0;
    }
    /** ③ ④ 塊に分け 重心で部位を決める */
    const mask = new Uint8Array(W * H);
    const seen = new Uint8Array(W * H);
    const minArea = Math.max(80, bw * bh * 0.0012);
    const stack: number[] = [], memb: number[] = [];
    for (let s = 0; s < cand.length; s += 1) {
      if (cand[s] === 0 || seen[s] === 1) continue;
      memb.length = 0; stack.length = 0; stack.push(s); seen[s] = 1;
      let sx = 0, sy = 0;
      while (stack.length > 0) {
        const k = stack.pop()!; memb.push(k);
        const kx = k % W, ky = (k - kx) / W; sx += kx; sy += ky;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const x2 = kx + dx, y2 = ky + dy;
          if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue;
          const k2 = y2 * W + x2;
          if (cand[k2] === 1 && seen[k2] === 0) { seen[k2] = 1; stack.push(k2); }
        }
      }
      /** ★兜の頂上のボタン（★小さい塊・兜の窓の上半分）は 小さくても兜に（★コマによって白いまま残った） */
      const cy0 = (sy / memb.length - by) / bh;
      if (memb.length < minArea && !(memb.length >= 20 && inWin(Math.round(sx / memb.length), Math.round(sy / memb.length)) === 1 && cy0 < win.helmet[2] * 0.5)) continue;
      /**
       * ★部位をまたぐ塊（★白いズボンと鞍布がつながる）は ★画素ごとに 窓で分ける（★塊ごとだと コマで 鞍布が上着の色になったり 白のまま残ったりした）。
       *   ★1 つの部位にほぼ収まる塊（★85% 以上）は 塊ごと（★窓の縁で切らない）。
       */
      /** ★平均が暗い塊（★たてがみ・尾・黒い馬具）は 服でない（★白い服は 陰を入れても 平均が明るい） */
      let lumSum = 0;
      for (const k of memb) lumSum += Math.max(data[k * 4]!, data[k * 4 + 1]!, data[k * 4 + 2]!);
      if (lumSum / memb.length < 120) continue;
      const byWin = [0, 0, 0, 0];
      for (const k of memb) byWin[inWin(k % W, (k - (k % W)) / W)]! += 1;
      const inAny = byWin[1]! + byWin[2]! + byWin[3]!;
      if (inAny === 0) continue;
      const top = byWin.indexOf(Math.max(byWin[1]!, byWin[2]!, byWin[3]!));
      /** ★窓に入った画素の 85% 以上が 1 つの部位なら 塊ごと（★窓の外の画素も） */
      if (byWin[top]! >= inAny * 0.85) { for (const k of memb) mask[k] = top; continue; }
      /** ★またぐ塊は 画素ごとに窓で分ける（★窓の外は 高さで: 兜の窓の高さより上は兜・鞍布の窓より上は上着・それより下は鞍布） */
      for (const k of memb) {
        const kx = k % W, ky = (k - kx) / W;
        const w1 = inWin(kx, ky);
        const ny = (ky - by) / bh;
        mask[k] = w1 !== 0 ? w1 : ny < win.saddlecloth[2] ? 2 : 3;
      }
    }
    /** ★⑦ 削った画素を戻す: ★元の候補で ★隣が塗られていれば その部位（★4 回・★削った 2 画素ぶん＋余裕） */
    for (let pass = 0; pass < 4; pass += 1) {
      const add: [number, number][] = [];
      for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
        const k = y * W + x; if (full[k] === 0 || mask[k] !== 0) continue;
        const v = mask[k - 1] || mask[k + 1] || mask[k - W] || mask[k + W];
        if (v) add.push([k, v]);
      }
      for (const [k, v] of add) mask[k] = v;
    }
    cand.set(full);
    /**
     * ★⑤' 小さすぎて捨てた候補（★太い線で切り離された照りの欠片）のうち ★まわり（半径 3）の半分以上が 1 つの部位なら その部位へ（★3 回）。
     *   ★腿の白い点（★歩きの 5〜8 コマ）がこれ。★候補でない画素（★肌・黒い線・馬体）には広げない。
     */
    for (let pass = 0; pass < 3; pass += 1) {
      const add: [number, number][] = [];
      for (let y = 3; y < H - 3; y += 1) for (let x = 3; x < W - 3; x += 1) {
        const k = y * W + x;
        if (cand[k] === 0 || mask[k] !== 0) continue;
        const near = [0, 0, 0, 0]; let tot = 0;
        for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) { near[mask[k + dy * W + dx]!]! += 1; tot += 1; }
        const best = near[1]! >= near[2]! && near[1]! >= near[3]! ? 1 : near[2]! >= near[3]! ? 2 : 3;
        if (near[best]! * 2 >= tot) add.push([k, best]);
      }
      for (const [k, v] of add) mask[k] = v;
    }
    /**
     * ★⑥ 細い線を消す（★髪や顔に 1〜2 画素幅の縦線が 兜・上着の色で残った）: ★8 近傍に同じ部位が 2 画素以下なら 外す（★2 回）。
     */
    for (let pass = 0; pass < 2; pass += 1) {
      const drop: number[] = [];
      for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
        const k = y * W + x; const v = mask[k]!; if (v === 0) continue;
        let same = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx !== 0 || dy !== 0) && mask[k + dy * W + dx] === v) same += 1;
        if (same <= 2) drop.push(k);
      }
      for (const k of drop) mask[k] = 0;
    }
    /** ⑤ 塊の中の 小さな穴を埋める（★外とつながらない・`HOLE_MAX` 以下・★まわりの部位で埋める） */
    /** ⚠️ ★穴は 最後まで辿ってから決める（★途中で打ち切ると 大きな黒い所の残りが「囲まれた穴」に見え 細切れに埋まって 縦の線になった） */
    const vis = new Uint8Array(W * H);
    for (let s0 = 0; s0 < mask.length; s0 += 1) {
      if (mask[s0] !== 0 || vis[s0] === 1) continue;
      memb.length = 0; stack.length = 0; stack.push(s0); vis[s0] = 1;
      let open = false; const around = [0, 0, 0, 0];
      while (stack.length > 0) {
        const k = stack.pop()!; memb.push(k);
        const kx = k % W, ky = (k - kx) / W;
        if (kx === 0 || ky === 0 || kx === W - 1 || ky === H - 1) open = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const x2 = kx + dx, y2 = ky + dy;
          if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue;
          const k2 = y2 * W + x2;
          if (mask[k2] !== 0) { around[mask[k2]!]! += 1; continue; }
          if (vis[k2] === 0) { vis[k2] = 1; stack.push(k2); }
        }
      }
      if (open || memb.length > HOLE_MAX) continue;
      const fill = around.indexOf(Math.max(...around));
      for (const k of memb) if (data[k * 4 + 3]! >= 16 && fill > 0) mask[k] = fill;
    }
    const counts = [0, 0, 0, 0];
    for (const v of mask) counts[v]! += 1;
    mkdirSync(OUT, { recursive: true });
    const outRgb = Buffer.alloc(W * H);
    for (let k = 0; k < mask.length; k += 1) outRgb[k] = mask[k]! * 80;
    await sharp(outRgb, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toFile(`${OUT}/${prefix}-pose${nn(f)}.png`);
    frames.push({ file: `${prefix}-pose${nn(f)}.png`, sha1: createHash('sha1').update(raw).digest('hex'), counts: counts.slice(1) });
    /** ★見本: 兜 緑・上着 桃・鞍布 青（★元の明るさを掛ける） */
    const col = [[0, 0, 0], [40, 170, 70], [230, 60, 160], [60, 110, 220]];
    const s2 = Buffer.from(data);
    for (let k = 0; k < mask.length; k += 1) {
      const m = mask[k]!; if (m === 0) continue;
      const i = k * 4; const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / (3 * 255);
      const sh2 = 0.30 + lum * 0.78;
      for (let c = 0; c < 3; c += 1) s2[i + c] = Math.min(255, Math.round(col[m]![c]! * sh2));
    }
    const crop = { left: bx, top: by, width: bw, height: Math.round(bh * 0.7) };
    const tile = await sharp(s2, { raw: { width: W, height: H, channels: 4 } }).extract(crop).resize({ height: 300 }).flatten({ background: '#7a9a6a' }).png().toBuffer();
    const m2 = await sharp(tile).metadata(); sw = m2.width!; sh = m2.height!;
    sheets.push(tile);
  }
  mkdirSync(SHEET, { recursive: true });
  await sharp({ create: { width: sw * 8, height: sh, channels: 3, background: '#7a9a6a' } })
    .composite(sheets.map((input, i) => ({ input, left: i * sw, top: 0 }))).png().toFile(`${SHEET}/${prefix}.png`);
  return { frames };
}

const want = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(LAYOUTS);
const manifestPath = `${OUT}/manifest.json`;
const manifest: Record<string, { file: string; sha1: string; counts: number[] }[]> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
for (const prefix of want) {
  if (!existsSync(`${ART}/${prefix}-pose01.png`)) { console.log(`- ${prefix}: 素材が無い`); continue; }
  const r = await build(prefix);
  manifest[prefix] = r.frames;
  console.log(`✓ ${prefix}: ${r.frames.map((f) => f.counts.join('/')).join('  ')}（兜/上着/鞍布 の画素）`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
