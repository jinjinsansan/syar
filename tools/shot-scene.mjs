/**
 * ★`scene.js`（第2便）を **Node で実際に描いて PNG にする**。
 *
 * 【なぜ要るか】
 *   ★型検査もテストも、描画の壊れを1つも検出しません。今日は
 *   「S.rgba が無い」「馬番が焼かれていない」「引数が壊れた」の3件を、
 *   **オーナーが画面を見て初めて**分かりました。
 *
 * 【★この道具の作り方の約束】
 *   ⚠️ 以前 `shot.mjs` は**自前で似た絵を描いて**いたため、
 *      「背景がのっぺり」というこちらの判断が**道具の絵に対する判断**でした。
 *   → ★**この道具は絵を1画素も自分で描きません。**
 *      `apps/web/public/art/still-reference.js` と `scene.js` を**そのまま読み込んで実行**します。
 *      画面と違う絵が出たら、それは**ページ側の引数が違う**ということです。
 *
 * 【描かないもの】
 *   ★UI（順位・スタミナ・実況・着順）は**ページ側が描く**ので、ここには出ません。
 *
 * 使い方:
 *   node tools/shot-scene.mjs                    → out/scene/*.png
 *   node tools/shot-scene.mjs --pan 0.5          → 回頭の補間を途中で止めた絵
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import path from 'node:path';

const ART = path.resolve('apps/web/public/art');
const OUT = path.resolve('out/scene');
const W = 1280;
const H = 720;

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};

/** ★ブラウザの土台を最小限だけ用意する（絵は一切描かない） */
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`想定外の要素: ${tag}`);
    const c = createCanvas(1, 1);
    // ★still.js は `c.width = …` で作り直します。napi-rs はこれに対応しています
    return c;
  },
};

runInThisContext(readFileSync(path.join(ART, 'still-reference.js'), 'utf8'), { filename: 'still-reference.js' });
runInThisContext(readFileSync(path.join(ART, 'scene.js'), 'utf8'), { filename: 'scene.js' });

const S = globalThis.STARStill;
const Scene = globalThis.STARScene;
if (!S) throw new Error('★STARStill が出ていません');
if (!Scene) throw new Error('★STARScene が出ていません');

const pal = JSON.parse(readFileSync(path.join(ART, 'palette.json'), 'utf8'));
const l1 = JSON.parse(readFileSync(path.join(ART, 'layers.json'), 'utf8'));
const l2 = JSON.parse(readFileSync(path.join(ART, 'layers2.json'), 'utf8'));

/** ★ページ側と**同じ構図**（3段12枠）。ここを変えたら意味がありません */
const ROW_DEF = [
  { id: 'back', scale: 1, groundY: 436, air: 0.1, x: [150, 330, 505, 685, 860] },
  { id: 'mid', scale: 1, groundY: 520, air: 0.04, x: [430, 615, 800, 985] },
  { id: 'front', scale: 2, groundY: 626, air: 0, x: [230, 660, 1060] },
];
/** 先頭から順に手前 → 中 → 奥（ページ側の SLOTS と同じ並び） */
const ORDER = [3, 1, 7, 8, 12, 4, 9, 17, 2, 11, 6, 14];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sheet = await loadImage(path.join(ART, 'horse-gallop.png'));

  S.setOptions({ coat: false, backlight: false });
  // ★1〜18 を全部焼く（載っていない馬番は **黙って描かれません**）
  const all = Array.from({ length: 18 }, (_, i) => i + 1);
  const atlas = S.buildAtlas(sheet, pal, {
    horsePlan: { rows: ROW_DEF.map((r) => ({ id: r.id, gates: all })) },
  });
  const baked = Object.keys(atlas).map(Number).sort((a, b) => a - b);
  if (baked.length !== 18) throw new Error(`★焼けた馬番が ${baked.length} 個しかありません: ${baked}`);

  // ★順位 → 枠（手前 3枠 → 中 4枠 → 奥 5枠 の順に埋める）
  const slotOrder = [
    { ri: 2, i: 2 }, { ri: 2, i: 1 }, { ri: 2, i: 0 },
    { ri: 1, i: 3 }, { ri: 1, i: 2 }, { ri: 1, i: 1 }, { ri: 1, i: 0 },
    { ri: 0, i: 4 }, { ri: 0, i: 3 }, { ri: 0, i: 2 }, { ri: 0, i: 1 }, { ri: 0, i: 0 },
  ];
  const plan = {
    own: 7,
    rows: ROW_DEF.map((r) => ({ id: r.id, scale: r.scale, groundY: r.groundY, air: r.air, x: r.x, gates: r.x.map(() => 1) })),
  };
  slotOrder.forEach((s, rank) => { plan.rows[s.ri].gates[s.i] = ORDER[rank]; });

  const panMul = Number(arg('pan', '1'));
  const cases = [
    { name: '1-gate-closed', section: 'gate', gate: { x: 83, groundY: 626, stalls: 12, open: false, firstGate: 1, scale: 2 }, showHorses: false, fanfare: 0 },
    { name: '2-gate-open', section: 'gate', gate: { x: 83, groundY: 626, stalls: 12, open: true, firstGate: 1, scale: 2 }, showHorses: true },
    { name: '3-backstretch', section: 'backstretch' },
    { name: '4-corner', section: 'corner', sign: '3角' },
    { name: '5-homestretch', section: 'homestretch' },
  ];

  const report = [];
  for (const cs of cases) {
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    const scroll = cs.section === 'gate' ? 0 : 900 * 20;
    const useL2 = cs.section === 'corner'
      ? { ...l2, $cornerMotion: { ...l2.$cornerMotion, pan: l2.$cornerMotion.pan * panMul } }
      : l2;
    Scene.drawScene(ctx, {
      palette: pal, layers2: useL2, sharedLayers: l1.layers, atlas,
      section: cs.section, scroll, cornerVariant: 'c',
      signText: cs.sign || '4 角',
      horsePlan: plan,
      gate: cs.gate,
      showHorses: cs.showHorses !== false,
      frameOf: (gate) => Math.floor(((((scroll / 340) * 2.4 + gate * 0.37) % 1) + 1) % 1 * 6),
    });
    if (cs.fanfare !== undefined) Scene.drawFanfare(ctx, pal, W, cs.fanfare);
    if (cs.section !== 'gate') Scene.drawCutBadge(ctx, pal, cs.sign || '直線', 400);

    const file = path.join(OUT, `${cs.name}.png`);
    writeFileSync(file, cv.toBuffer('image/png'));

    // ★測る: 何色使われているか（のっぺり検出）・馬が実際に写っているか
    const d = ctx.getImageData(0, 0, W, H).data;
    const colours = new Set();
    for (let i = 0; i < d.length; i += 4) colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    report.push({ name: cs.name, colours: colours.size, file });
  }

  console.log('★焼けた馬番:', baked.join(','));
  for (const r of report) console.log(`  ${r.name.padEnd(16)} 色数 ${String(r.colours).padStart(6)}  ${r.file}`);

  /**
   * ★**回頭は静止画では見えません。**「上は左へ、下は右へ流れる」を**測ります**。
   *
   * ⚠️ 最初は「2コマ描いて画素の横ずれを相互相関で拾う」で測りました。
   *    ★**帯がタイルで繰り返すため、ずれが折り返して探索範囲の端に張り付き、
   *      もっともらしい数字を返しました。**（今日3件目の「正常に終わって嘘を返す」）
   * → ★`drawLayer` に**実際に渡っている速度比を記録**します。
   *    走路の帯（turfFar / turfMain / railFront / turfNear）が対象です。
   *    ★回転の軸は turfFar と turfMain の間（y=400）だと言われているので、
   *    ここの符号が割れるかどうかが、そのまま判定になります。
   */
  const realDrawLayer = S.drawLayer;
  const measure = (section, panMul) => {
    const seen = [];
    S.drawLayer = (ctx2, L, p, sc, v) => { seen.push([L.id, L.speedRatio]); return realDrawLayer(ctx2, L, p, sc, v); };
    const ctx = createCanvas(W, H).getContext('2d');
    Scene.drawScene(ctx, {
      palette: pal, layers2: { ...l2, $cornerMotion: { ...l2.$cornerMotion, pan: l2.$cornerMotion.pan * panMul } },
      sharedLayers: l1.layers, atlas, section, scroll: 18000, cornerVariant: 'c',
      horsePlan: plan, showHorses: false, sign: false,
    });
    S.drawLayer = realDrawLayer;
    return seen;
  };
  console.log('\n★走路の帯に渡っている実効速度比（＋＝右→左に流れる／−＝左→右に**逆流**する）');
  for (const [label, section, panMul] of [['直線     ', 'homestretch', 0], ['★コーナー', 'corner', 1], ['  （補間の途中 pan×0.5）', 'corner', 0.5]]) {
    const seen = measure(section, panMul);
    console.log(`  ${label}  ${seen.map(([id, r]) => `${id}=${r.toFixed(2)}`).join('  ')}`);
  }
  {
    const m = Object.fromEntries(measure('corner', 1));
    const split = m.turfFar < 0 && m.turfMain > 0;
    console.log(`  ★判定: turfFar=${m.turfFar.toFixed(2)} / turfMain=${m.turfMain.toFixed(2)} → 符号が割れている: ${split ? 'はい（回頭）' : '★いいえ'}`);
    if (!split) throw new Error('★コーナーで符号が割れていません。回頭が出ません');
  }

  console.log('\n⚠️ ★UI（順位・スタミナ・実況・着順）はページ側が描くので、この PNG には出ません。');
  console.log('⚠️ ★日本語が □ になるのは Node にフォントが無いためです。ブラウザでは出ます。');
}

main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
