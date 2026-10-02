/**
 * ★**地面の行を 模様で 1 回に塗る**（★2026-10-02・オーナーの記録「コマ落ち」: 空撮 303ms・ゲート 150〜288ms）。
 *
 * 【★見ている壊れ方】
 *   ① ★遠い行ほど 1 行に タイルが何百枚も並び ★drawImage をタイルの数だけ呼ぶ
 *      （★本番の見本で 1 コマ: 空撮 23,000〜30,000 回・ゲート 3,500 回 → ★コマの間 150〜300ms）。
 *   ② ★速くしたせいで ★絵が変わる（★2 つの塗り方の画素を ★同じ画布の実装で比べる）。
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { drawTexturedWorld, ovalCourse, posOf, type Ctx2D, type PerspectiveCamera, type TexturedWorldAssets } from '@star/render';

const ROOT = path.resolve(__dirname, '../../..');
const ART = path.join(ROOT, 'apps/web/public/art/parallax/backstretch-side-v1');
const W = 640, H = 360;

async function assets(): Promise<TexturedWorldAssets<Image>> {
  const m = JSON.parse(readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as {
    world: { turf: { file: string; pxPerM: number }; panorama: { file: string; horizonY: number } };
  };
  const turf = await loadImage(path.join(ART, m.world.turf.file));
  const pano = await loadImage(path.join(ART, m.world.panorama.file));
  return {
    turf: { image: turf, width: turf.width, height: turf.height, pxPerM: m.world.turf.pxPerM },
    panorama: { image: pano, width: pano.width, height: pano.height, horizonY: m.world.panorama.horizonY },
  } as TexturedWorldAssets<Image>;
}

/** ★本番の空撮（`race/page.tsx` の flyover・ease 0.5）と ★ゲートの低い視点 */
function cameras(): Array<[string, PerspectiveCamera]> {
  const course = ovalCourse(1600);
  const eye = posOf(course, -140 + 0.5 * 620, -50);
  const target = posOf(course, -140 + 0.5 * 620 + 260, 12);
  const gEye = posOf(course, -8, -30);
  const gTarget = posOf(course, 60, 10);
  return [
    ['空撮', { eye: { x: eye.x, y: eye.y, z: 55 }, target: { x: target.x, y: target.y, z: 0 }, fovY: (34 * Math.PI) / 180, width: W, height: H }],
    ['ゲート', { eye: { x: gEye.x, y: gEye.y, z: 4 }, target: { x: gTarget.x, y: gTarget.y, z: 1 }, fovY: (30 * Math.PI) / 180, width: W, height: H }],
  ];
}

function render(a: TexturedWorldAssets<Image>, cam: PerspectiveCamera, groundPattern: boolean): { px: Uint8ClampedArray; draws: number } {
  const canvas = createCanvas(W, H);
  const raw = canvas.getContext('2d');
  let draws = 0;
  const drawImage = raw.drawImage.bind(raw) as (...args: unknown[]) => void;
  const ctx = new Proxy(raw, {
    get(t, k) {
      if (k === 'drawImage') return (...args: unknown[]) => { draws += 1; drawImage(...args); };
      const v = Reflect.get(t, k) as unknown;
      return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(t) : v;
    },
    set(t, k, v) { return Reflect.set(t, k, v); },
  }) as SKRSContext2D;
  const course = ovalCourse(1600);
  drawTexturedWorld(ctx as unknown as Ctx2D<Image>, course, cam, a, { groundPattern, infield: false });
  return { px: raw.getImageData(0, 0, W, H).data, draws };
}

describe('★地面の行を 模様で 1 回に塗る', () => {
  it('🔴 ① ★drawImage の回数が 行の数より ずっと少ない（★対照: 刻む塗り方は 行の数より多い）', async () => {
    const a = await assets();
    for (const [name, cam] of cameras()) {
      const fast = render(a, cam, true);
      const slow = render(a, cam, false);
      expect(fast.draws, `${name}: 模様で塗っても drawImage が多い`).toBeLessThan(20);
      expect(slow.draws, `${name}: 対照（刻む塗り方）が 行の数より少ない＝測れていない`).toBeGreaterThan(H / 2);
    }
  });

  /**
   * ★画素ごとには比べません: ★これまでの drawImage は 区切りごとに ★幅を 0.5px 足して描いていた（`spanPx + 0.5`）ので、
   *   ★タイルが少し縮み ★区切りの中で最大 0.5px ずれていました（★芝の細かい筋が半画素ずれる＝画素の差は雑音で 5 階調）。
   *   ★模様は 幾何どおり。★比べるのは ★8×8 画素の平均。
   *   ⚠️ ★芝は一様なので ★貼り方を間違えても平均は動きにくい → ★幾何は ★縦横に色が変わる作り物のタイルで確かめ、
   *      ★対照に ★カメラを 2m 動かした絵が ★はっきり超えることを見る。★本物の芝は ★緩い線で見た目の確認だけ。
   */
  it('🔴 ② ★2 つの塗り方で 同じところに同じ色が乗る（★作り物のタイル・★対照: カメラを 2m 動かす）', async () => {
    const a = await assets();
    const tile = createCanvas(300, 52);
    const g = tile.getContext('2d');
    for (let y = 0; y < 52; y += 1) for (let x = 0; x < 300; x += 1) {
      g.fillStyle = `rgb(${Math.round((x / 300) * 255)},${Math.round((y / 52) * 255)},${Math.round(128 + 100 * Math.sin((x / 300) * Math.PI * 2))})`;
      g.fillRect(x, y, 1, 1);
    }
    const synth = { ...a, turf: { image: tile as unknown as Image, width: 300, height: 52, pxPerM: 18 } } as TexturedWorldAssets<Image>;
    for (const [name, cam] of cameras()) {
      const same = blockDiff(render(synth, cam, true).px, render(synth, cam, false).px);
      const moved = { ...cam, eye: { ...cam.eye, x: cam.eye.x + 2 }, target: { ...cam.target, x: cam.target.x + 2 } };
      const control = blockDiff(render(synth, moved, false).px, render(synth, cam, false).px);
      console.log(`[ground-pattern] ${name}（作り物）: 8×8 の平均の差 ${same.toFixed(2)} 階調（★対照 2m 動かす ${control.toFixed(2)}）`);
      expect(same, `${name}: 2 つの塗り方の差`).toBeLessThan(2);
      expect(control, `${name}: 対照が差を出さない＝測れていない`).toBeGreaterThan(same * 5);
    }
  });

  it('③ ★本物の芝でも 8×8 の平均は 1 階調未満', async () => {
    const a = await assets();
    for (const [name, cam] of cameras()) {
      const same = blockDiff(render(a, cam, true).px, render(a, cam, false).px);
      console.log(`[ground-pattern] ${name}（芝）: 8×8 の平均の差 ${same.toFixed(2)} 階調`);
      expect(same).toBeLessThan(1);
    }
  });
});

/** ★8×8 画素の平均色の差（★RGB の平均・階調） */
function blockDiff(p: Uint8ClampedArray, q: Uint8ClampedArray): number {
  let sum = 0, n = 0;
  for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) {
    let d = 0;
    for (let c = 0; c < 3; c += 1) {
      let sp = 0, sq = 0;
      for (let y = by; y < by + 8; y += 1) for (let x = bx; x < bx + 8; x += 1) { const i = (y * W + x) * 4 + c; sp += p[i]!; sq += q[i]!; }
      d += Math.abs(sp - sq) / 64;
    }
    sum += d / 3; n += 1;
  }
  return sum / n;
}
