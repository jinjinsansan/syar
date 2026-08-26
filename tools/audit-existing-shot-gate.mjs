/**
 * ★**既存ショットの適性を測る**（読取専用・指示書 §3〜§10）
 *
 *   未使用・到達不能の既存ショットを**強制適用**して、画として成立するかを測ります。
 *
 *   ⚠️ ★変えるのは**ショット選択だけ**です（§7）。
 *      馬の実座標・順位・着差・横位置・素材・走行位相・カメラ定義・target 定義・
 *      zoom・画角・anchor・背景速度・HUD・レース結果には**触れていません**。
 *   ⚠️ ★「成立させるため」にショット設定を修正していません。
 *   ⚠️ ★`resolveBroadcastV2Scene` の `forceShotId` は**もとから在る引数**です。
 *      監査のために新設したものではありません。
 *
 * 【この道具で測れること・測れないこと】
 *   ○ 幾何（頭数・可視・馬高比・広がり・重なり・空白・切れ・投影異常）
 *   × 実際の絵（勝負服の色・毛色・背景や地面の破綻）
 *     → 実画面の絵は `?shot=` の経路が無いため撮れません（報告書 §16 に記載）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  broadcastV2FinishStyleOf, broadcastV2ShotById, cameraBasis, posOf, project, resolveBroadcastV2Scene,
} from '@star/render';
import { buildAuditRace, auditClock, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const OUT = path.resolve('out/2d-existing-shot-gate');
mkdirSync(OUT, { recursive: true });

const W = 1280;
const H = 720;
const HORSE_HEIGHT_M = 2.4;
const HORSE_LENGTH_M = 2.4;
const CORNER_CUT_M = 40;

/** ★§4 の 4 seed。分類地点は 1280m で固定（1520m の finish 判定と混同しない） */
const SEEDS = [
  { seed: 42, role: 'default', label: '既定確認' },
  { seed: 332, role: 'contest', label: '1280m 接戦代表' },
  { seed: 474, role: 'solo', label: '1280m 独走代表' },
  { seed: 14, role: 'boundary', label: '1280m 境界代表' },
];
const CLASSIFY_LEADER_M = 1280;

/** ★§3 の対象ショット */
const SIDE_CANDIDATES = ['side-close', 'side-low', 'homestretch-side', 'backstretch-side'];
const HIGH_CANDIDATES = ['second-corner-high', 'fourth-corner-high', 'aerial'];
const BASELINES = ['side-drive', 'homestretch-front', 'fourth-corner-front', 'finish-line'];
const SHOTS = [...SIDE_CANDIDATES, ...HIGH_CANDIDATES, ...BASELINES];

/** ★§5 の撮影地点。**進行率で 4 seed をそろえます** */
const POINTS = [
  { key: 'early', label: '序盤', ratio: 0.12 },
  { key: 'backstretch', label: '向正面', ratio: 0.40 },
  { key: 'third-corner', label: '第3コーナー', ratio: 0.56 },
  { key: 'fourth-corner', label: '第4コーナー', ratio: 0.68 },
  { key: 'straight-entry', label: '直線入口', ratio: 0.76 },
  { key: 'straight-mid', label: '直線中盤', ratio: 0.86 },
  { key: 'pre-finish', label: 'ゴール前', ratio: 0.96 },
];

/**
 * ★**HUD の占有域**（1280×720 の実画面から読み取った矩形）。
 *   読み取り元: `out/2d-edit-grammar/_race-shots/seed42-c05-homestretch-front-21.5s.png`
 *   ⚠️ ★目で読んだ値です。描画コードから取った値ではありません。
 */
const HUD_RECTS = [
  { name: '枠色ピン列（上端）', x0: 0, y0: 0, x1: W, y1: 32 },
  { name: 'レース名バー', x0: 36, y0: 38, x1: 275, y1: 82 },
  { name: '順位表（右上）', x0: 930, y0: 38, x1: 1246, y1: 258 },
  { name: 'コースミニマップ（左）', x0: 34, y0: 318, x1: 308, y1: 528 },
  { name: '馬名ラベル帯', x0: 0, y0: 505, x1: W, y1: 552 },
  { name: '下帯（実況・残り）', x0: 0, y0: 558, x1: W, y1: H },
];

/* ── 1 場面の測定 ─────────────────────────────── */

function measure(built, clock, raceSec, shotId, ownGate, winnerGate) {
  const at = built.model.at(raceSec);
  const leaderM = Math.max(...at.map((h) => h.meters));
  const drawn = at.map((h) => ({
    gate: h.gate, s: h.meters, w: h.w ?? built.course.widthM / 2,
    finished: h.meters >= built.DIST - 1e-6,
  }));
  const scene = resolveBroadcastV2Scene(built.course, drawn, { width: W, height: H }, false, {
    finishStyle: clock.finishStyle, cornerCutM: CORNER_CUT_M,
    raceDisplaySec: clock.warp.displaySecAt === undefined ? 0 : 0,
    fourthCornerFront: true, winnerRear: false,
    /** ★ここだけが「変えている」ところ（§7） */
    forceShotId: shotId,
  });
  const basis = cameraBasis(scene.camera);
  const boxes = drawn.map((h) => {
    const p = posOf(built.course, h.s, h.w);
    const foot = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(scene.camera, basis, { x: p.x, y: p.y, z: HORSE_HEIGHT_M });
    const heightPx = foot.y - head.y;
    const widthPx = Math.abs(heightPx) * 1.6;
    return {
      gate: h.gate, meters: h.s, depth: foot.depth,
      x0: foot.x - widthPx / 2, x1: foot.x + widthPx / 2, y0: head.y, y1: foot.y,
      cx: foot.x, cy: (head.y + foot.y) / 2, heightPx, heightRatio: heightPx / H,
    };
  });

  /* ★投影異常（§9）。0 にせず、件数と中身を残す */
  const anomalies = [];
  for (const b of boxes) {
    if (!Number.isFinite(b.cx) || !Number.isFinite(b.y1)) anomalies.push({ gate: b.gate, kind: 'NaN' });
    else if (b.depth <= 0) anomalies.push({ gate: b.gate, kind: 'カメラの後ろ', depth: +b.depth.toFixed(2) });
    else if (b.heightPx <= 0) anomalies.push({ gate: b.gate, kind: '高さが 0 以下', heightPx: +b.heightPx.toFixed(1) });
    else if (b.heightRatio > 2) anomalies.push({ gate: b.gate, kind: '異常に大きい', heightRatio: +b.heightRatio.toFixed(2) });
  }
  const ok = (b) => Number.isFinite(b.cx) && b.depth > 0 && b.heightPx > 0;
  for (const b of boxes) {
    if (!ok(b)) { b.visibility = 'off'; b.clipped = false; continue; }
    const inside = b.x0 >= 0 && b.x1 <= W && b.y0 >= 0 && b.y1 <= H;
    const overlaps = b.x1 > 0 && b.x0 < W && b.y1 > 0 && b.y0 < H;
    b.visibility = inside ? 'full' : overlaps ? 'partial' : 'off';
    b.clipped = overlaps && !inside;
  }
  const visible = boxes.filter((b) => b.visibility !== 'off');
  const byMeters = [...boxes].sort((a, b) => b.meters - a.meters);
  const topN = (n) => byMeters.slice(0, n);
  const allVisible = (list) => list.every((b) => b.visibility !== 'off');

  /* ★空白率: 画面をタイルに割り、馬の箱が触れないタイルの割合 */
  const TX = 64; const TY = 36;
  const covered = new Uint8Array(TX * TY);
  for (const b of visible) {
    const cx0 = Math.max(0, Math.floor((b.x0 / W) * TX));
    const cx1 = Math.min(TX - 1, Math.floor((b.x1 / W) * TX));
    const cy0 = Math.max(0, Math.floor((b.y0 / H) * TY));
    const cy1 = Math.min(TY - 1, Math.floor((b.y1 / H) * TY));
    for (let y = cy0; y <= cy1; y += 1) for (let x = cx0; x <= cx1; x += 1) covered[y * TX + x] = 1;
  }
  const blankRatio = 1 - covered.reduce((s, v) => s + v, 0) / (TX * TY);

  /* ★重なりの組数 */
  let overlapPairs = 0;
  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i]; const b = visible[j];
      if (Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0)) overlapPairs += 1;
    }
  }

  /* ★HUD による主役遮蔽: 上位 4 頭の箱が HUD 矩形とどれだけ重なるか */
  const hudOverlapOf = (b) => {
    let area = 0;
    for (const r of HUD_RECTS) {
      const ov = Math.max(0, Math.min(b.x1, r.x1) - Math.max(b.x0, r.x0))
        * Math.max(0, Math.min(b.y1, r.y1) - Math.max(b.y0, r.y0));
      area += ov;
    }
    const own = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
    return Math.min(1, area / own);
  };
  const top4 = topN(4).filter((b) => b.visibility !== 'off');
  const hudCover = top4.length === 0 ? null
    : +(top4.reduce((s, b) => s + hudOverlapOf(b), 0) / top4.length).toFixed(3);

  /* ★target と、実際に画面中央へ来た対象の一致 */
  const shot = broadcastV2ShotById(shotId);
  const nearestToCenter = visible.length === 0 ? null
    : visible.reduce((a, b) => (Math.abs(b.cx - W / 2) < Math.abs(a.cx - W / 2) ? b : a));
  const leaderGate = byMeters[0].gate;
  const centerMatchesTarget = nearestToCenter === null ? null
    : shot.target === 'leader' ? nearestToCenter.gate === leaderGate
      : shot.target === 'winner' ? nearestToCenter.gate === winnerGate
        : shot.target === 'contenders' ? topN(4).some((b) => b.gate === nearestToCenter.gate)
          : null; /* ★pack は「中央に来るべき対象」が定義できない → unknown */

  const spanPx = visible.length === 0 ? null
    : Math.max(...visible.map((b) => b.x1)) - Math.min(...visible.map((b) => b.x0));
  const topVisible = topN(4).filter((b) => b.visibility !== 'off');
  const topCenter = topVisible.length === 0 ? null
    : topVisible.reduce((s, b) => s + b.cx, 0) / topVisible.length;

  return {
    shotId, target: shot.target, view: shot.view,
    raceSec: +raceSec.toFixed(2), leaderM: +leaderM.toFixed(1),
    progressRatio: +(leaderM / built.DIST).toFixed(4),
    fullCount: boxes.filter((b) => b.visibility === 'full').length,
    partialCount: boxes.filter((b) => b.visibility === 'partial').length,
    offCount: boxes.filter((b) => b.visibility === 'off').length,
    top2Visible: allVisible(topN(2)), top3Visible: allVisible(topN(3)), top4Visible: allVisible(topN(4)),
    maxHeightRatio: visible.length === 0 ? null : +Math.max(...visible.map((b) => b.heightRatio)).toFixed(4),
    topMeanHeightRatio: topVisible.length === 0 ? null
      : +(topVisible.reduce((s, b) => s + b.heightRatio, 0) / topVisible.length).toFixed(4),
    topGroupCenterDistPx: topCenter === null ? null : +Math.abs(topCenter - W / 2).toFixed(1),
    leaderOnScreen: byMeters[0].visibility !== 'off',
    ownOnScreen: boxes.find((b) => b.gate === ownGate).visibility !== 'off',
    clippedCount: boxes.filter((b) => b.clipped).length,
    blankRatio: +blankRatio.toFixed(3),
    packWidthRatio: spanPx === null ? null : +(spanPx / W).toFixed(3),
    overlapPairs,
    hudCoverOfTop4: hudCover,
    centerMatchesTarget,
    projectionAnomalies: anomalies,
    /** ★絵を見ないと分からないものは 0 にせず unknown（§15-8） */
    backgroundOrGroundBreakage: 'unknown',
    /** ★シートで図にするための箱（画面座標）。丸めて小さく持つ */
    boxes: boxes.map((b) => ({
      gate: b.gate,
      x0: Number.isFinite(b.x0) ? +b.x0.toFixed(1) : null,
      x1: Number.isFinite(b.x1) ? +b.x1.toFixed(1) : null,
      y0: Number.isFinite(b.y0) ? +b.y0.toFixed(1) : null,
      y1: Number.isFinite(b.y1) ? +b.y1.toFixed(1) : null,
      v: b.visibility,
      rank: byMeters.findIndex((x) => x.gate === b.gate) + 1,
    })),
  };
}

/* ── §8 A / B / C の分類 ───────────────────────── */

/**
 * ★**§10 の成立条件をそのまま式にしたもの**です。
 *   ⚠️ ★参考数値へ無理に一致させていません。既存設定のままでどこまで近づくかを見ます。
 */
const HIGH_VIEWS = new Set(['high', 'high-diag']);
function classify(m, baselineMaxHeightRatio) {
  /* ★基準そのもの（homestretch-front）は自分と比べても意味がないので別枠 */
  if (m.shotId === 'homestretch-front') {
    return { role: 'baseline', reasons: [`現行の基準。最大馬高比 ${m.maxHeightRatio}`] };
  }
  const reasons = [];
  if (m.projectionAnomalies.length > 0) reasons.push(`投影異常 ${m.projectionAnomalies.length} 件`);
  if (!m.leaderOnScreen) reasons.push('先頭馬が画面外');
  if (m.fullCount + m.partialCount === 0) reasons.push('空舞台（馬が 1 頭も映らない）');
  if (m.blankRatio >= 0.97) reasons.push(`空白率 ${(m.blankRatio * 100).toFixed(0)}%`);
  if (reasons.length > 0) return { role: 'C', reasons };

  /* B: 位置関係の再提示 */
  const manyVisible = m.fullCount + m.partialCount >= 8;
  const notSpecks = (m.maxHeightRatio ?? 0) >= 0.03;
  if (HIGH_VIEWS.has(m.view)) {
    if (manyVisible && notSpecks) return { role: 'B', reasons: [`俯瞰で ${m.fullCount + m.partialCount} 頭・最大馬高比 ${m.maxHeightRatio}`] };
    if (!manyVisible) reasons.push(`見えている馬が ${m.fullCount + m.partialCount} 頭（8 頭未満）`);
    if (!notSpecks) reasons.push(`豆粒（最大馬高比 ${m.maxHeightRatio}）`);
    return { role: 'C', reasons };
  }

  /* A: 競り合い主役 */
  if (!m.top2Visible) reasons.push('上位 2 頭が同時に見えない');
  if ((m.maxHeightRatio ?? 0) <= baselineMaxHeightRatio) {
    reasons.push(`最大馬高比 ${m.maxHeightRatio} が現行 homestretch-front（${baselineMaxHeightRatio}）を超えない`);
  }
  if (m.fullCount + m.partialCount >= 10) reasons.push(`12 頭のうち ${m.fullCount + m.partialCount} 頭が映る全体画`);
  if (m.hudCoverOfTop4 !== null && m.hudCoverOfTop4 >= 0.5) reasons.push(`上位 4 頭の ${(m.hudCoverOfTop4 * 100).toFixed(0)}% が HUD の裏`);
  if (m.blankRatio >= 0.90) reasons.push(`空白率 ${(m.blankRatio * 100).toFixed(0)}%`);
  if (reasons.length > 0) return { role: 'C', reasons };
  return { role: 'A', reasons: [`上位 2 頭同時可視・最大馬高比 ${m.maxHeightRatio}・見える馬 ${m.fullCount + m.partialCount} 頭`] };
}

/* ── 実行 ───────────────────────────────────── */

const out = {
  note: '★既存ショットを強制表示して幾何を測ったもの。変えたのはショット選択だけ（§7）。採否は書いていない。',
  viewport: { W, H }, hudRects: HUD_RECTS,
  hudRectsSource: 'out/2d-edit-grammar/_race-shots/seed42-c05-homestretch-front-21.5s.png を目で読んだ値',
  classifyLeaderM: CLASSIFY_LEADER_M,
  points: POINTS, shots: { side: SIDE_CANDIDATES, high: HIGH_CANDIDATES, baseline: BASELINES },
  seeds: [],
};

for (const spec of SEEDS) {
  const built = buildAuditRace({ seed: spec.seed });
  const clock = auditClock(built, RACE_DEFAULTS.ownGate);
  const endRaceSec = clock.warp.raceSecAt(clock.warp.displaySec);
  const ownGate = RACE_DEFAULTS.ownGate;
  const winnerGate = Number(built.result.order[0].horseId);

  /* ★§4: 分類は 1280m で */
  let classifySec = null;
  for (let s = 0; s <= endRaceSec + 1e-9; s += 0.02) {
    if (Math.max(...built.model.at(s).map((h) => h.meters)) >= CLASSIFY_LEADER_M) { classifySec = s; break; }
  }
  const cm = built.model.at(classifySec).map((h) => h.meters).sort((a, b) => b - a);
  const classification = {
    leaderM: CLASSIFY_LEADER_M, raceSec: +classifySec.toFixed(2),
    style: broadcastV2FinishStyleOf(cm, HORSE_LENGTH_M),
    gap2M: +(cm[0] - cm[1]).toFixed(3),
  };

  /* ★各地点のレース秒（進行率でそろえる） */
  const pointSecs = POINTS.map((p) => {
    const target = p.ratio * built.DIST;
    for (let s = 0; s <= endRaceSec + 1e-9; s += 0.02) {
      if (Math.max(...built.model.at(s).map((h) => h.meters)) >= target) return { ...p, raceSec: s };
    }
    return { ...p, raceSec: null };
  });

  /* ★基準: その地点の homestretch-front の最大馬高比 */
  const rows = [];
  for (const p of pointSecs) {
    if (p.raceSec === null) continue;
    const base = measure(built, clock, p.raceSec, 'homestretch-front', ownGate, winnerGate);
    for (const shotId of SHOTS) {
      const m = shotId === 'homestretch-front' ? base : measure(built, clock, p.raceSec, shotId, ownGate, winnerGate);
      rows.push({
        point: p.key, pointLabel: p.label, targetRatio: p.ratio,
        ...m,
        baselineMaxHeightRatio: base.maxHeightRatio,
        ...classify(m, base.maxHeightRatio ?? 0),
      });
    }
  }

  out.seeds.push({ ...spec, distance: built.DIST, field: built.FIELD, ownGate, winnerGate, classification, rows });
  const n = (role) => rows.filter((r) => r.role === role).length;
  console.log(`seed ${String(spec.seed).padStart(3)}（${spec.label}）分類 1280m=${classification.style} gap2=${classification.gap2M}m`
    + ` / 測定 ${rows.length} 件 → A ${n('A')} / B ${n('B')} / C ${n('C')} / 基準 ${n('baseline')}`);
}

writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(out, null, 2));

/* ── ショット別のまとめ ───────────────────────── */

console.log('\n=== ショット別（4 seed × 7 地点 ＝ 28 件中）===');
for (const shotId of SHOTS) {
  const all = out.seeds.flatMap((s) => s.rows.filter((r) => r.shotId === shotId));
  const a = all.filter((r) => r.role === 'A');
  const b = all.filter((r) => r.role === 'B');
  const base = all.filter((r) => r.role === 'baseline');
  const hr = all.map((r) => r.maxHeightRatio).filter((x) => x !== null).sort((x, y) => x - y);
  const kind = SIDE_CANDIDATES.includes(shotId) ? '横候補' : HIGH_CANDIDATES.includes(shotId) ? '俯瞰候補' : '基準';
  console.log(`  ${shotId.padEnd(20)} ${kind.padEnd(5)} A ${String(a.length).padStart(2)} / B ${String(b.length).padStart(2)} / C ${String(all.length - a.length - b.length - base.length).padStart(2)}${base.length ? ' / 基準 ' + base.length : ''}`
    + `  最大馬高比 中央 ${hr.length ? hr[Math.floor(hr.length / 2)].toFixed(3) : '—'}`
    + `  上位2同時 ${all.filter((r) => r.top2Visible).length}/${all.length}`
    + `  空白率 中央 ${(all.map((r) => r.blankRatio).sort((x, y) => x - y)[Math.floor(all.length / 2)] * 100).toFixed(0)}%`);
}
console.log(`\n→ ${path.join(OUT, 'measurements.json')}`);
