/**
 * ★**参考映像と通常 `/race` の編集構造を突き合わせる**（読取専用・指示書 §12/§13）
 *
 *   ⚠️ ★採否は書きません。事実の集計だけです。
 *   ⚠️ ★unknown を 0 として数えません（§17-7）。unknown は別枠で数えます。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('out/2d-edit-grammar');
mkdirSync(OUT, { recursive: true });

const need = (f) => {
  const p = path.join(OUT, f);
  if (!existsSync(p)) throw new Error(`★${f} が無い。先に該当ツールを走らせること`);
  return JSON.parse(readFileSync(p, 'utf8'));
};
const ref = need('reference-edl.json');
const race = need('race-edl.json');
const caps = need('race-captures.json');

/* ── §13 台本の中身をソースから取る（手打ちしない） ─────── */

const SRC = readFileSync(path.resolve('packages/render/src/broadcast-v2.ts'), 'utf8');
function scriptRows(name) {
  const m = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`).exec(SRC);
  if (m === null) throw new Error(`★${name} が読めません`);
  return [...m[1].matchAll(/\{\s*until:\s*([0-9.]+),\s*id:\s*'([a-z0-9-]+)'\s*\}/g)]
    .map((x) => ({ until: Number(x[1]), id: x[2] }));
}
const V4 = scriptRows('SCRIPT_V4');
const V3 = scriptRows('SCRIPT_V3');
const allShotIds = (() => {
  const m = /export type BroadcastV2ShotId =([\s\S]*?);/.exec(SRC);
  return [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
})();

/**
 * ★**未使用の理由**を、当てずっぽうではなく**選択の実装**から決めます。
 *   `broadcastV2ShotAt` は既定 `script:'v4'` で、
 *     ① `allFinished` なら winner-follow / winner-follow-rear
 *     ② それ以外は SCRIPT_V4 の表を上から見る
 *     ③ `fourth-corner-front` は `fourthCornerFront === false` のとき fourth-corner-wide へ
 *   なので、v4 の表に無いショットは既定経路では選ばれません。
 */
function unusedReasonOf(id) {
  if (V4.some((r) => r.id === id)) return null;
  if (id === 'winner-follow' || id === 'winner-follow-rear') {
    return { reason: '区間外（ゴール後）', detail: 'allFinished のときだけ選ばれる。今回の対象区間はゴールまでなので範囲外。到達可能' };
  }
  if (id === 'fourth-corner-wide') {
    return { reason: '条件不成立', detail: 'fourthCornerFront === false のときの代用。ページは FOURTH_CORNER_FRONT_WEB = true 固定' };
  }
  if (V3.some((r) => r.id === id)) {
    return { reason: '台本v4から参照されない', detail: '台本 v3 には在るが、既定の v4 では使われない' };
  }
  return { reason: 'resolver上で到達不能', detail: '台本 v3 にも v4 にも無い。旧 script:"v2" の分岐でしか選ばれず、ページは v4 固定' };
}

/* ── §12 集計 ───────────────────────────────────── */

const SIDE = new Set(['side']);
const FRONTISH = new Set(['front', 'diag-front']);
const REARISH = new Set(['diag-rear', 'rear']);
const HIGH = new Set(['high']);

function longestRun(cuts, key) {
  let best = 0; let cur = 0; let prev = null;
  for (const c of cuts) {
    const v = c[key];
    if (v !== null && v !== undefined && v === prev) cur += c.durationSec;
    else cur = c.durationSec;
    prev = v;
    if (cur > best) best = cur;
  }
  return +best.toFixed(2);
}

function aggregate(label, cuts, totalSec, extra = {}) {
  const d = cuts.map((c) => c.durationSec).sort((a, b) => a - b);
  const sumBy = (pred) => +cuts.filter(pred).reduce((s, c) => s + c.durationSec, 0).toFixed(2);
  const share = (pred) => +(sumBy(pred) / totalSec).toFixed(4);
  const unknownDir = cuts.filter((c) => c.cameraDirection === 'unknown' || c.cameraDirection === 'mixed').length;
  const unknownFrm = cuts.filter((c) => c.framing === 'unknown' || c.framing === 'mixed').length;
  return {
    label,
    totalSec: +totalSec.toFixed(2),
    cutCount: cuts.length,
    ...extra,
    meanSec: +(totalSec / cuts.length).toFixed(2),
    medianSec: +d[Math.floor(d.length / 2)].toFixed(2),
    minSec: d[0], maxSec: d[d.length - 1],
    cutsOver5s: cuts.filter((c) => c.durationSec >= 5).length,
    cutsOver10s: cuts.filter((c) => c.durationSec >= 10).length,
    longestCutShare: +(d[d.length - 1] / totalSec).toFixed(4),
    timeShare: {
      front: share((c) => FRONTISH.has(c.cameraDirection)),
      side: share((c) => SIDE.has(c.cameraDirection)),
      rear: share((c) => REARISH.has(c.cameraDirection)),
      high: share((c) => HIGH.has(c.cameraDirection)),
      unknownOrMixedDirection: share((c) => c.cameraDirection === 'unknown' || c.cameraDirection === 'mixed'),
      wholeField: share((c) => c.framing === 'whole-field'),
      pack: share((c) => c.framing === 'pack'),
      contenders2to4: share((c) => c.framing === 'contenders-2-4'),
      single: share((c) => c.framing === 'single'),
      extremeClose: share((c) => c.framing === 'extreme-close'),
      unknownOrMixedFraming: share((c) => c.framing === 'unknown' || c.framing === 'mixed'),
    },
    subjectShare: Object.fromEntries(['self', 'leader', 'winner', 'contenders', 'pack', 'unknown']
      .map((k) => [k, share((c) => c.editorialSubject === k)])),
    longestSameFraming: longestRun(cuts, 'framing'),
    longestSameTarget: longestRun(cuts, 'target'),
    /** ★unknown を 0 として数えない（§17-7）。件数を別に出す */
    unknownCounts: { cameraDirection: unknownDir, framing: unknownFrm },
  };
}

const refAgg = aggregate('参考映像（スターホース版）', ref.cuts, ref.race.durationSec, {
  confirmedCutCount: ref.cutCount.confirmed,
  maxCutCountWithAmbiguities: ref.cutCount.maxWithAmbiguities,
  ambiguousBoundaryCount: ref.cuts.reduce((s, c) => s + (c.internalAmbiguities?.length ?? 0), 0),
  meanSecWithAmbiguities: ref.cutLength.withAmbiguities.meanSec,
});

const raceAggs = race.seeds.map((s) => aggregate(`/race seed ${s.seed}（${s.label}）`, s.edl, s.displaySec, {
  seed: s.seed, role: s.role,
  confirmedCutCount: s.edl.length,
  maxCutCountWithAmbiguities: s.edl.length,
  ambiguousBoundaryCount: 0,
  classification: s.classification,
}));

/* ── §13 ショット台帳 ──────────────────────────── */

const inventory = allShotIds.map((id) => {
  const perSeed = race.seeds.map((s) => {
    const u = s.shotUsage.find((x) => x.shotId === id);
    return { seed: s.seed, count: u?.count ?? 0, totalSec: u?.totalSec ?? 0,
      firstProgress: u?.firstProgress ?? null, lastProgress: u?.lastProgress ?? null };
  });
  const usedIn = perSeed.filter((p) => p.count > 0).length;
  return {
    shotId: id,
    inScriptV4: V4.some((r) => r.id === id),
    inScriptV3: V3.some((r) => r.id === id),
    usedInSeeds: usedIn,
    perSeed,
    unused: usedIn === 0 ? unusedReasonOf(id) : null,
  };
});

/* ── 比較シート ─────────────────────────────── */

async function timelineSheet() {
  const W = 1500;
  const rowH = 64;
  const rows = [
    { name: '参考映像（75.2s / 確定 9 カット）', cuts: ref.cuts, total: ref.race.durationSec },
    ...race.seeds.map((s) => ({ name: `/race seed ${s.seed}（${s.displaySec}s / ${s.edl.length} カット）`, cuts: s.edl, total: s.displaySec })),
  ];
  const COLOR = {
    front: '#e0554d', 'diag-front': '#e08a4d', side: '#4d8ee0', 'diag-rear': '#8a4de0',
    rear: '#6b4de0', high: '#4dc0a0', unknown: '#666', mixed: '#999',
  };
  let svg = `<svg width="${W}" height="${rows.length * rowH + 40}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="100%" height="100%" fill="#14120f"/>`;
  rows.forEach((r, i) => {
    const y = i * rowH + 26;
    svg += `<text x="6" y="${y - 6}" fill="#efe9dc" font-size="15" font-family="monospace">${r.name}</text>`;
    let acc = 0;
    for (const c of r.cuts) {
      const x = (acc / r.total) * (W - 12) + 6;
      const w = (c.durationSec / r.total) * (W - 12);
      acc += c.durationSec;
      svg += `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, w - 1).toFixed(1)}" height="26" `
        + `fill="${COLOR[c.cameraDirection] ?? '#666'}" stroke="#14120f"/>`;
      if (w > 46) {
        svg += `<text x="${(x + 3).toFixed(1)}" y="${y + 18}" fill="#fff" font-size="11" font-family="monospace">`
          + `${c.durationSec.toFixed(1)}s</text>`;
      }
      /* ★曖昧な内部境界は破線で示す（隠さない） */
      for (const a of c.internalAmbiguities ?? []) {
        const ax = ((acc - c.durationSec + (a.atSec - c.startSec)) / r.total) * (W - 12) + 6;
        svg += `<line x1="${ax.toFixed(1)}" y1="${y}" x2="${ax.toFixed(1)}" y2="${y + 26}" `
          + `stroke="#ffd60a" stroke-width="2" stroke-dasharray="3,3"/>`;
      }
    }
  });
  const legend = Object.entries(COLOR).map(([k, v], i) =>
    `<rect x="${6 + i * 150}" y="${rows.length * rowH + 12}" width="14" height="14" fill="${v}"/>`
    + `<text x="${24 + i * 150}" y="${rows.length * rowH + 24}" fill="#efe9dc" font-size="12" font-family="monospace">${k}</text>`).join('');
  svg += legend + '</svg>';
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, 'timeline-comparison.png'));
  console.log('  timeline-comparison.png');
}

await timelineSheet();

writeFileSync(path.join(OUT, 'comparison.json'), JSON.stringify({
  note: '★参考映像と通常 /race の編集構造の集計。採否は書いていない。unknown は 0 として数えていない。',
  framingThresholds: {
    'extreme-close': 'maxHeightRatio >= 0.55',
    single: 'visibleCount <= 1',
    'contenders-2-4': 'visibleCount <= 4',
    'whole-field': 'visibleCount >= ceil(field * 0.8)',
    pack: 'それ以外',
  },
  reference: refAgg,
  race: raceAggs,
  shotInventory: inventory,
  captures: { count: caps.captured.length, allNative: caps.captured.every((c) => c.w === 1280 && c.h === 720) },
}, null, 2));

console.log('\n=== カット構造 ===');
for (const a of [refAgg, ...raceAggs]) {
  console.log(`  ${a.label}`);
  console.log(`    ${a.cutCount} カット / 平均 ${a.meanSec}s / 中央 ${a.medianSec}s / 最短 ${a.minSec}s / 最長 ${a.maxSec}s`
    + ` / 最長の占有 ${(a.longestCutShare * 100).toFixed(1)}%`);
  console.log(`    5s以上 ${a.cutsOver5s} 本 / 10s以上 ${a.cutsOver10s} 本`
    + ` / 同じ構図が続く最長 ${a.longestSameFraming}s / 同じ target 最長 ${a.longestSameTarget}s`);
  const t = a.timeShare;
  console.log(`    方向: 正面 ${(t.front * 100).toFixed(0)}% 横 ${(t.side * 100).toFixed(0)}%`
    + ` 後方 ${(t.rear * 100).toFixed(0)}% 俯瞰 ${(t.high * 100).toFixed(0)}%`
    + ` 不明/混在 ${(t.unknownOrMixedDirection * 100).toFixed(0)}%`);
  console.log(`    画角: 全体 ${(t.wholeField * 100).toFixed(0)}% 馬群 ${(t.pack * 100).toFixed(0)}%`
    + ` 2〜4頭 ${(t.contenders2to4 * 100).toFixed(0)}% 単騎 ${(t.single * 100).toFixed(0)}%`
    + ` 至近 ${(t.extremeClose * 100).toFixed(0)}% 不明/混在 ${(t.unknownOrMixedFraming * 100).toFixed(0)}%`);
}
console.log('\n=== 定義ショット台帳 ===');
console.log(`  定義 ${inventory.length} 個 / 4 seed のどれかで使われた ${inventory.filter((i) => i.usedInSeeds > 0).length} 個`);
for (const i of inventory.filter((x) => x.usedInSeeds === 0)) {
  console.log(`    未使用 ${i.shotId.padEnd(20)} ${i.unused.reason}`);
}
console.log(`\n→ ${path.join(OUT, 'comparison.json')}`);
