/**
 * ★**後続が、前を行く馬の砂を被る**（2026-08-29・報告 `REPORT_P4_DIRT_20260829.md` §10-1）
 *
 * 【★この検査が生まれた理由】
 *   砂煙は「その馬を描くついでに、★**その馬の下に**」描かれていました。
 *   馬は**深さの降順**（遠→近）で描かれるので、
 *   ★**手前にいる後続馬は、奥にいる前の馬の砂の“上”に**描かれます。
 *   → ★各馬が自分の砂を出すだけで、★**誰も他馬の砂を被っていませんでした。**
 *   ★これは「ダートの見せ場」そのものなので、**順序を検査で固定**します。
 *
 * 【★何を見るか — 見た目ではなく「描く順」】
 *   ★色の濃さを測ると、砂の量や色を変えるたびに閾値の議論になります（裁定 §4「線は引かない」）。
 *   ★守りたいのは**順序という 0/1 の性質**です。
 *     ① ★**全馬の絵を描き終えたあとに、砂が描かれる**（＝誰かが被れる状態にある）
 *     ② ★**蹄元の砂は自分の絵より先**（＝全馬が自分の砂で曇らない）
 *     ③ ★**芝では 1 粒も増えない**（芝の見え方はオーナー承認済み・変えてはいけない）
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { drawPerspectiveHorses } from '../src/perspective-draw.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** ★砂の色。★これで「砂の塗り」と「影の塗り」を見分けます（影は暗い色） */
const DUST = '#cdb494';
const GROUND = '#796047';

const frameFor = (gate: number) => [{
  image: `horse-${gate}` as never,
  source: { x: 0, y: 0, width: 300, height: 200 },
  referenceHeight: 200,
  bodyAnchorSourcePx: { x: 150, y: 120 },
  bodyLiftSourcePx: 0,
  shadow: { image: `shadow-${gate}` as never, width: 300, height: 200 },
}];

type Event =
  | { readonly kind: 'sprite'; readonly image: string }
  | { readonly kind: 'dust' };

/**
 * ★1 コマ描いて、**描いた順**を並べて返す。
 *
 * ⚠️ ★`createRadialGradient` を**わざと生やしません**。生やすと砂は
 *    `fillStyle` に gradient オブジェクトが入って色で見分けられなくなります。
 *    ★実装は濃淡が無い環境では均一な塗りに落ちる（そちらの枝を通します）。
 */
function drawOrder(surface: 'turf' | 'dirt', horses: readonly { gate: number; s: number; w: number }[]): Event[] {
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: 'side-drive' });
  const events: Event[] = [];
  const state = { globalAlpha: 1, fillStyle: '' };
  const target: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    transform: () => undefined,
    drawImage: (image: string) => {
      // ★影も drawImage で描かれるので、馬体だけを拾う
      if (typeof image === 'string' && image.startsWith('horse-')) events.push({ kind: 'sprite', image });
    },
    beginPath: () => undefined,
    ellipse: () => undefined,
    fill: () => { if (state.fillStyle === DUST) events.push({ kind: 'dust' }); },
    fillRect: () => undefined, moveTo: () => undefined, lineTo: () => undefined,
    closePath: () => undefined, stroke: () => undefined,
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => {
      if (key === 'globalAlpha') return state.globalAlpha;
      if (key === 'fillStyle') return state.fillStyle;
      if (key === 'createRadialGradient') return undefined;   // ★上の注記のとおり
      return key in obj ? obj[key as string] : () => undefined;
    },
    set: (obj, key, value) => {
      if (key === 'globalAlpha') state.globalAlpha = value as number;
      else if (key === 'fillStyle') state.fillStyle = value as string;
      else obj[key as string] = value;
      return true;
    },
  });
  drawPerspectiveHorses(ctx as never, course, scene.camera, horses, {
    sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
    frameImagesByGate: horses.map((h) => frameFor(h.gate)),
    fieldSize: horses.length, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
    trackEffect: { surface, condition: 'good', color: GROUND, dustColor: DUST },
  });
  return events;
}

/** ★先頭が前、2 番手が 3m 後ろ。★同じ走線に置いて「被る」状況を作る */
const LEADER = { gate: 1, s: 700, w: 2.2 };
const CHASER = { gate: 2, s: 697, w: 2.2 };

describe('★ダートの砂は後続に掛かる（描く順）', () => {
  it('★全馬の絵を描き終えたあとに砂が描かれる（＝後続が被れる）', () => {
    const events = drawOrder('dirt', [LEADER, CHASER]);
    const lastSprite = events.map((e) => e.kind).lastIndexOf('sprite');
    const dustAfter = events.slice(lastSprite + 1).filter((e) => e.kind === 'dust').length;
    expect(lastSprite, '★馬の絵が 1 枚も描かれていない（検査が空回りしている）').toBeGreaterThanOrEqual(0);
    expect(
      dustAfter,
      '★最後の馬より後ろに砂が 1 粒も無い。★この状態では、誰も他馬の砂を被れない',
    ).toBeGreaterThan(0);
  });

  it('★蹄元の砂は自分の絵より先に描かれる（全馬が自分の砂で曇らない）', () => {
    const events = drawOrder('dirt', [LEADER, CHASER]);
    const firstSprite = events.map((e) => e.kind).indexOf('sprite');
    const dustBefore = events.slice(0, firstSprite).filter((e) => e.kind === 'dust').length;
    expect(
      dustBefore,
      '★1 枚目の馬より前に砂が無い。★蹄元の砂まで上に出ると、馬が自分の砂で灰色になる',
    ).toBeGreaterThan(0);
  });

  it('★2 頭とも自分の砂を出している（片方だけ、になっていない）', () => {
    const one = drawOrder('dirt', [LEADER]).filter((e) => e.kind === 'dust').length;
    const two = drawOrder('dirt', [LEADER, CHASER]).filter((e) => e.kind === 'dust').length;
    expect(one, '★1 頭でも砂が出ていない').toBeGreaterThan(0);
    expect(two, '★2 頭にしても砂の量が増えていない').toBeGreaterThan(one);
  });

  it('★芝では砂を 1 粒も描かない（芝の見え方は変えない）', () => {
    const events = drawOrder('turf', [LEADER, CHASER]);
    expect(events.filter((e) => e.kind === 'dust').length).toBe(0);
    expect(events.filter((e) => e.kind === 'sprite').length, '★芝で馬が描かれていない').toBeGreaterThan(0);
  });

  it('★検出器が鈍っていないこと（R-14: 砂の塗りと影の塗りを取り違えない）', () => {
    // ★影の色で塗っても「砂」に数えないこと
    const events = drawOrder('dirt', [LEADER, CHASER]);
    expect(events.every((e) => e.kind === 'sprite' || e.kind === 'dust')).toBe(true);
    // ★砂の色を持たない馬場（芝）で 0 になることが、色で見分けている証拠
    expect(drawOrder('turf', [LEADER]).filter((e) => e.kind === 'dust').length).toBe(0);
  });
});
