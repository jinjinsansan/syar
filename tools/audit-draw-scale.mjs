/**
 * ★**馬は画面上で何 px で描かれるか**を測る（★読取専用・★引継ぎ書 §0-4 の答え）
 *
 * 【★なぜ要るか】
 *   ★`/race` は開くたびに ★**利用者の端末で毛色を焼き直して**います（★992 枚 / 2,398MB）。
 *   ★これを ★**事前に焼いたものを配る**形へ移すとき、★**何 px で焼くか**を決めなければなりません。
 *   ★素材は 1536px ですが、★画面の馬がそれより小さいなら、★その差はまるごと無駄です。
 *
 * 【★なぜ 2 度失敗したか（★引継ぎ書 §2-2）】
 *   ★① ブラウザの `drawImage` を数えたら ★**`bakeCoat` の中の 1:1 転写**を数えていた
 *   ★② 画面のキャンバスだけに絞ったら ★**馬が 1 度も描かれない**という結果になった
 *   → ★どちらも ★**測定器を新しく作った**ことによる誤りです。
 *
 * 【★この道具のやり方】★**式を作りません。描画コードの式をそのまま読みます。**
 *
 *   `perspective-draw.ts:881`   const hpx = HORSE_HEIGHT_M * d.p.pxPerM;
 *   `perspective-draw.ts:1206`  const scale = hpx / hi.referenceHeight;
 *   `perspective-draw.ts:1207`  const hiW = source.width * scale; const hiH = source.height * scale;
 *
 *   ★つまり ★**画面に出る大きさは `hpx`**、★**素材の使われ方は `hpx / referenceHeight`** です。
 *   ★`hpx` は描画コードと ★**同じ関数（`posOf` → `project`）・同じ絞り込み**で出します。
 *   ★`referenceHeight` は ★**実素材の不透明範囲の高さ**を、★画面の `opaqueBounds` と
 *     ★同じ規則（α<12 は透明・余白 2px）で測ります。
 *
 * ⚠️ ★**1 場だけ測らないこと**（R-33）。★画面は 10 場・50 鞍の形を引きます（D-071）。
 *    ★走路の形が変わればカメラの置き場所が変わり、★馬の大きさも変わります。
 *
 * ⚠️ ★幾何の数字です。★**「この px で焼いてよいか」は最後はオーナーの目**です
 *    （★引継ぎ書 §5 の判断①）。★この道具は ★**上限を出すだけ**です。
 *
 * 【★DB に触りません】★時刻も乱数も使いません。★seed と表示秒だけで決まります。
 *
 * 使い方:
 *   node tools/audit-draw-scale.mjs                 # ★50 鞍すべて（★数分）
 *   node tools/audit-draw-scale.mjs --races 6       # ★先頭 6 鞍だけ（★下見）
 *   node tools/audit-draw-scale.mjs --step 0.1      # ★刻みを細かく
 *   node tools/audit-draw-scale.mjs --seeds 42,332,474,14   # ★シードを振る（R-20）
 */
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import {
  cameraBasis, posOf, project, HORSE_HEIGHT_M, DEFAULT_RACE_SCRIPT, DEMO_CONTEST_GAMMA,
} from '@star/render';
import { GRADED_RACES, raceSetupById } from '@star/scheduler';
import {
  buildAuditRace, auditClock, auditSceneAt, auditTotalDisplaySec, RACE_DEFAULTS,
} from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const STEP = Number(arg('step', 0.2));
const RACE_LIMIT = Number(arg('races', GRADED_RACES.length));
/**
 * ★**シードは 1 本で決めないこと**（R-20）。
 *   ★馬群の締まり方はレースごとに違い、★カメラは馬群に合わせて寄ります。
 *   ★締まった 1 本を見逃すと、★焼いた素材が足りない側に外れます。
 */
const SEEDS = String(arg('seeds', String(RACE_DEFAULTS.seed))).split(',').map(Number);

/**
 * ★**画面と同じ画布**（`page.tsx` の `const W = 1280; const H = 720;`）。
 * ⚠️ ★キャンバスは ★**`devicePixelRatio` を掛けていません**（`width={W} height={H}` の直指定）。
 *    ★つまり端末が何であれ、★**描画される px はこの画布の中の px** です。
 *    ★画面上では CSS で 67% 前後に縮んで見えますが、★焼く解像度を決めるのは ★**縮む前**の値です。
 */
const VIEWPORT = { width: 1280, height: 720 };

/* ══════════════════════════════════════════════════════════════
   ★① 素材の側 — `referenceHeight`（不透明範囲の高さ）
   ══════════════════════════════════════════════════════════════ */

/**
 * ★`page.tsx` の `opaqueBounds` と ★**同じ規則**（α<12 は透明扱い・余白 2px）。
 * ⚠️ ★規則を変えると `referenceHeight` が変わり、★画面と違う倍率を出します（R-30）。
 */
async function opaqueBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * channels + 3] < 12) continue;
      if (x < left) left = x; if (y < top) top = y;
      if (x > right) right = x; if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return { imgW: w, imgH: h, x: 0, y: 0, width: w, height: h };
  const pad = 2;
  const x = Math.max(0, left - pad); const y = Math.max(0, top - pad);
  return {
    imgW: w, imgH: h, x, y,
    width: Math.min(w, right + pad + 1) - x,
    height: Math.min(h, bottom + pad + 1) - y,
  };
}

/**
 * ★**画面がいま実際に使う素材**（`page.tsx` の読み込み順・`??` の並びと同じ）。
 * ⚠️ ★`page.tsx` は「新しい版が 8 枚揃えばそれ、無ければ古い版」です。
 *    ★ここも ★**在るものから決めます** — ★名前を直書きすると、★素材を差し替えた日にずれます。
 */
const ART = 'apps/web/public/art';
const setExists = (prefix) => Array.from({ length: 8 }, (_, i) =>
  `${ART}/${prefix}-pose${String(i + 1).padStart(2, '0')}.png`).every((f) => existsSync(f));
const pickSet = (...prefixes) => prefixes.find((p) => setExists(p));

const MATERIAL_SETS = [
  { role: 'side-v6（真横）', prefix: pickSet('horse-jockey-side-v7', 'horse-jockey-side-v6') },
  { role: 'diag-front-v2（斜め前）', prefix: pickSet('horse-jockey-diag-front-v3', 'horse-jockey-diag-front-v2') },
  { role: 'diag-rear-v2（斜め後ろ）', prefix: pickSet('horse-jockey-diag-rear-v5', 'horse-jockey-diag-rear-v4', 'horse-jockey-diag-rear-v2') },
  { role: 'high-diag-v2（俯瞰）', prefix: pickSet('horse-jockey-high-diag-v4', 'horse-jockey-high-diag-v3', 'horse-jockey-high-diag-v2') },
  { role: 'winner-v1（勝馬・後方）', prefix: pickSet('horse-jockey-winner-rear-v1') },
  { role: 'winner（勝馬・8 コマ）', prefix: pickSet('horse-jockey-winner-v2') },
];

/* ══════════════════════════════════════════════════════════════
   ★② 画面の側 — `hpx`（画面上の馬の高さ）
   ══════════════════════════════════════════════════════════════ */

/**
 * ★**描画コードと同じ絞り込み**（`perspective-draw.ts:813-822`）。
 *   ★奥行き 2m 以下は描かない／画面から完全に外れた馬は描かない。
 * ⚠️ ★ここを緩めると ★**描かれない馬の大きさ**を数えて上限が跳ね上がります。
 */
function drawnHpx(course, cam, horses) {
  const basis = cameraBasis(cam);
  const out = [];
  for (const h of horses) {
    const s = Math.max(0, h.s);
    const g = posOf(course, s, h.w);
    const p = project(cam, basis, { x: g.x, y: g.y, z: 0 });
    if (!(p.depth > 2)) continue;
    const margin = HORSE_HEIGHT_M * p.pxPerM * 1.6;
    if (!(p.x > -margin && p.x < cam.width + margin
      && p.y > -margin && p.y < cam.height + margin * 2)) continue;
    out.push({ gate: h.gate, hpx: HORSE_HEIGHT_M * p.pxPerM });
  }
  return out;
}

const qOf = (sorted, p) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);

console.log('★馬の描画寸法（画布 '
  + `${VIEWPORT.width}x${VIEWPORT.height}・台本 ${DEFAULT_RACE_SCRIPT}・γ ${DEMO_CONTEST_GAMMA}`
  + `・馬高 ${HORSE_HEIGHT_M}m・seed ${SEEDS.join('/')}・刻み ${STEP}s）`);
console.log(`★鞍 ${Math.min(RACE_LIMIT, GRADED_RACES.length)} / ${GRADED_RACES.length}\n`);

const all = [];
const perShot = new Map();
const perRace = [];

const perSeed = new Map();
for (const race of GRADED_RACES.slice(0, RACE_LIMIT)) {
  const setup = raceSetupById(race.id);
  const mine = [];
  for (const seed of SEEDS) {
    const built = buildAuditRace({
      seed, distance: setup.distanceM, surface: setup.surface,
      field: RACE_DEFAULTS.field, spec: setup.spec, turn: setup.turn,
    });
    const clock = auditClock(built);
    const total = auditTotalDisplaySec(clock);
    let got = 0;
    for (let t = 0; t <= total; t += STEP) {
      const r = auditSceneAt(built, clock, t, VIEWPORT);
      const rows = drawnHpx(built.course, r.scene.camera, r.scene.visibleHorses);
      if (rows.length === 0) continue;
      const mx = Math.max(...rows.map((x) => x.hpx));
      mine.push(mx); all.push(mx); got += 1;
      const key = r.scene.shot.id;
      const hit = perShot.get(key);
      if (hit === undefined) perShot.set(key, [mx]); else hit.push(mx);
      const sh = perSeed.get(seed);
      if (sh === undefined) perSeed.set(seed, [mx]); else sh.push(mx);
    }
    /** ★1 コマも取れなかったなら「異常なし」ではありません（R-3 / R-21） */
    if (got === 0) {
      console.log(`  ★★${race.id} / seed ${seed} は 1 コマも描かれませんでした`);
      process.exitCode = 1;
    }
  }
  if (mine.length === 0) continue;
  const s = [...mine].sort((a, b) => a - b);
  perRace.push({ id: race.id, venue: setup.meta.venue, dist: setup.distanceM, surface: setup.surface, max: qOf(s, 1), p50: qOf(s, 0.5) });
}

if (all.length === 0) {
  console.log('★★1 コマも測れませんでした。★結果を「小さい」と読まないこと（R-21）');
  process.exitCode = 1;
} else {
  const s = [...all].sort((a, b) => a - b);
  const MAX = qOf(s, 1);

  console.log('★ショット別（★そのカットで最も大きく映る馬の高さ・px）');
  console.log('  ショット                  コマ数    p50     p90   ★最大');
  for (const [shot, arr] of [...perShot.entries()].sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]))) {
    const t = [...arr].sort((a, b) => a - b);
    console.log(`  ${shot.padEnd(22)}  ${String(arr.length).padStart(6)}`
      + `  ${qOf(t, 0.5).toFixed(0).padStart(5)}  ${qOf(t, 0.9).toFixed(0).padStart(6)}  ${qOf(t, 1).toFixed(0).padStart(6)}`);
  }

  console.log('\n★鞍別の最大（★大きい順に 8 鞍）');
  for (const r of [...perRace].sort((a, b) => b.max - a.max).slice(0, 8)) {
    console.log(`  ${r.id.padEnd(14)} ${r.venue.padEnd(9)} ${String(r.dist).padStart(4)}m ${r.surface.padEnd(4)}`
      + `  最大 ${r.max.toFixed(0).padStart(4)}px  中央 ${r.p50.toFixed(0).padStart(4)}px`);
  }

  if (SEEDS.length > 1) {
    console.log('\n★シード別の最大（★1 本で決めない・R-20）');
    for (const [seed, arr] of [...perSeed.entries()]) {
      const t = [...arr].sort((a, b) => a - b);
      console.log(`  seed ${String(seed).padStart(4)}  最大 ${qOf(t, 1).toFixed(0).padStart(4)}px  p99 ${qOf(t, 0.99).toFixed(0).padStart(4)}px  中央 ${qOf(t, 0.5).toFixed(0).padStart(4)}px`);
    }
  }

  console.log('\n★★全体（★焼く解像度はここから決めます）');
  console.log(`  中央 ${qOf(s, 0.5).toFixed(0)}px  p90 ${qOf(s, 0.9).toFixed(0)}px  p99 ${qOf(s, 0.99).toFixed(0)}px  ★最大 ${MAX.toFixed(0)}px`);

  console.log('\n★素材の側（★不透明範囲の高さ = `referenceHeight`）');
  console.log('  役割                        素材                             画布      中身   ★いまの最大倍率');
  for (const m of MATERIAL_SETS) {
    if (m.prefix === undefined) { console.log(`  ${m.role.padEnd(24)}  ★★該当する素材が 8 枚揃っていません`); process.exitCode = 1; continue; }
    const bounds = [];
    for (let i = 1; i <= 8; i += 1) bounds.push(await opaqueBounds(`${ART}/${m.prefix}-pose${String(i).padStart(2, '0')}.png`));
    const ref = Math.max(...bounds.map((b) => b.height));
    const scale = MAX / ref;
    console.log(`  ${m.role.padEnd(24)}  ${m.prefix.padEnd(30)}  ${bounds[0].imgW}x${bounds[0].imgH}`
      + `  ${String(ref).padStart(5)}px  ${scale.toFixed(3).padStart(8)} 倍`
      + `  → ★${(1 / scale).toFixed(1)} 分の 1 が無駄`);
  }
  console.log('\n⚠️ ★「いまの最大倍率」は ★**画面で最も大きく映るコマでも素材のこの割合しか使っていない**という意味です。');
  console.log('⚠️ ★幾何の上限です。★実際に何 px で焼くかは ★**この値に余裕を掛けて、オーナーの目で決めます**（引継ぎ書 §5 ①）。');
}
