/**
 * ★**通常 `/race` の編集構造を測る**（読取専用・指示書 §4/§5/§7〜§13）
 *
 *   4 seed について、レース全体の EDL（カット割り）と主役提示を出します。
 *   ⚠️ ★製品コードを変更しません。カット・カメラ・target も変えません。
 *   ⚠️ ★場面解決は**実画面と同じ** `resolveBroadcastV2Scene` を通します（R-30）。
 *      実ブラウザの絵は `tools/capture-edit-grammar-race.mjs` が別に撮ります（§3）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  broadcastV2FinishStyleOf, broadcastV2ShotById, cameraBasis, posOf, project,
} from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const OUT = path.resolve('out/2d-edit-grammar');
mkdirSync(OUT, { recursive: true });

const W = 1280;
const H = 720;
const HORSE_HEIGHT_M = 2.4;
const STEP = 0.2;                 // ★§10: 最低 0.2 秒刻み
const HORSE_LENGTH_M = 2.4;

/** ★§4 の 4 seed。用途はレビュー側の指定 */
const SEEDS = [
  { seed: 42, role: 'default', label: '現行既定確認' },
  { seed: 332, role: 'contest', label: '接戦代表' },
  { seed: 474, role: 'solo', label: '独走代表' },
  { seed: 14, role: 'boundary', label: '境界代表' },
];

/**
 * ★**過去（`audit-2d-contest-seeds.mjs`）と同じ 3 地点**で分類し直します（§4）。
 * ⚠️ ★分類は**測る地点で変わります**。ページ自身の `finishStyle` は
 *    「先頭が残り 80m（＝1520m）へ入った瞬間」で判定しており、別物です。
 *    両方を出して、どちらの話かを取り違えないようにします。
 */
const CLASS_POINTS = [
  { key: 'entry', leaderM: 1100 },
  { key: 'mid', leaderM: 1280 },      // ★過去の代表 seed を選んだ地点
  { key: 'preFinish', leaderM: 1480 },
];

/* ── §11 区間ラベル ───────────────────────────────── */

/**
 * ★秒ではなく**レース進行**で並べるためのラベル。
 *   `/race` は距離が確定しているので、**先頭馬の進んだ距離**で決めます。
 */
function sectionLabelOf(leaderM, dist) {
  const r = leaderM / dist;
  if (leaderM < 60) return '発走';
  if (r < 0.18) return '序盤';
  if (r < 0.30) return '第1コーナー';
  if (r < 0.50) return '向正面';
  if (r < 0.62) return '第3コーナー';
  if (r < 0.72) return '第4コーナー';
  if (r < 0.80) return '直線入口';
  if (r < 0.92) return '直線中盤';
  if (leaderM < dist) return 'ゴール前';
  return 'ゴール後';
}

/* ── §8 分類語 ───────────────────────────────────── */

/** ★ショット定義の `view` を §8 のカメラ方向へ写す */
function cameraDirectionOf(shot) {
  switch (shot.view) {
    case 'side': return 'side';
    case 'front': return 'front';
    case 'diag-front': return 'diag-front';
    case 'diag-rear': return 'diag-rear';
    case 'rear': return 'rear';
    case 'high': return 'high';
    default: return 'unknown';
  }
}

/**
 * ★**画角**は名前ではなく**実際の見え方**から決めます（§8）。
 *   ⚠️ ★閾値はここに書いてあるものがすべてです。報告書にも同じ値を載せます。
 */
function framingOf(maxHeightRatio, visibleCount, field) {
  if (maxHeightRatio >= 0.55) return 'extreme-close';
  if (visibleCount <= 1) return 'single';
  if (visibleCount <= 4) return 'contenders-2-4';
  if (visibleCount >= Math.ceil(field * 0.8)) return 'whole-field';
  return 'pack';
}

/** ★§9 の主役 4 分類へ、ショットの `target` を写す */
function editorialSubjectOf(shot) {
  switch (shot.target) {
    case 'winner': return 'winner';
    case 'leader': return 'leader';
    case 'contenders': return 'contenders';
    case 'pack': return 'pack';
    default: return 'unknown';
  }
}

/* ── 1 コマの測定 ─────────────────────────────────── */

function frameAt(built, clock, displaySec) {
  const r = auditSceneAt(built, clock, displaySec, { width: W, height: H });
  const basis = cameraBasis(r.scene.camera);
  const boxes = r.drawn.map((h) => {
    const p = posOf(built.course, h.s, h.w);
    const foot = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(r.scene.camera, basis, { x: p.x, y: p.y, z: HORSE_HEIGHT_M });
    const heightPx = Math.max(0, foot.y - head.y);
    /* ★馬の幅は体長 ≈ 体高 × 1.6 とみなす（描画の縦横比に合わせた近似） */
    const widthPx = heightPx * 1.6;
    return {
      gate: h.gate, meters: h.s, depth: foot.depth,
      x0: foot.x - widthPx / 2, x1: foot.x + widthPx / 2,
      y0: head.y, y1: foot.y,
      cx: foot.x, heightPx, heightRatio: heightPx / H,
      behindCamera: foot.depth <= 0,
    };
  });
  /* ★可視の判定。★画面外は「まったく重ならない」場合だけ */
  for (const b of boxes) {
    const inside = !b.behindCamera && b.x0 >= 0 && b.x1 <= W && b.y0 >= 0 && b.y1 <= H;
    const overlaps = !b.behindCamera && b.x1 > 0 && b.x0 < W && b.y1 > 0 && b.y0 < H;
    b.visibility = inside ? 'full' : overlaps ? 'partial' : 'off';
    b.clippedByEdge = overlaps && !inside;
  }
  /* ★他馬に隠れるか（手前の馬が横幅の 50% 以上を覆う） */
  for (const b of boxes) {
    if (b.visibility === 'off') { b.occluded = false; continue; }
    let covered = 0;
    for (const o of boxes) {
      if (o.gate === b.gate || o.visibility === 'off') continue;
      if (o.depth >= b.depth) continue;           // 奥の馬は隠さない
      const ov = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0);
      if (ov > 0) covered += ov;
    }
    b.occluded = covered >= (b.x1 - b.x0) * 0.5;
  }
  const visible = boxes.filter((b) => b.visibility !== 'off');
  const maxHeightRatio = visible.length === 0 ? 0 : Math.max(...visible.map((b) => b.heightRatio));
  const biggest = visible.length === 0 ? null
    : visible.reduce((a, b) => (b.heightRatio > a.heightRatio ? b : a));
  const leaderGate = built.model.at(r.raceSec)
    .reduce((a, b) => (b.meters > a.meters ? b : a)).gate;

  return {
    displaySec, raceSec: r.raceSec, raceDisplaySec: r.raceDisplaySec,
    shotId: r.scene.shot.id, camera: r.scene.camera, boxes,
    leaderM: Math.max(...built.model.at(r.raceSec).map((h) => h.meters)),
    leaderGate, biggestGate: biggest === null ? null : biggest.gate,
    maxHeightRatio,
    fullCount: boxes.filter((b) => b.visibility === 'full').length,
    partialCount: boxes.filter((b) => b.visibility === 'partial').length,
    offCount: boxes.filter((b) => b.visibility === 'off').length,
    visibleCount: visible.length,
    clippedCount: boxes.filter((b) => b.clippedByEdge).length,
  };
}

/* ── 実行 ───────────────────────────────────────── */

/**
 * ★**定義ショットは型定義から機械的に取ります**（§13「全列挙」）。
 * ⚠️ ★最初は手で並べていて、`side-drive` / `aerial` / `fourth-corner-wide` / `front-close`
 *    の 4 つを**落としました**。使われている `side-drive` まで抜けていたので、
 *    集計が「5 ショットしか使っていない」と誤って出ました。→ 手打ちをやめます。
 */
function allShotIds() {
  const src = readFileSync(path.resolve('packages/render/src/broadcast-v2.ts'), 'utf8');
  const m = /export type BroadcastV2ShotId =([\s\S]*?);/.exec(src);
  if (m === null) throw new Error('★BroadcastV2ShotId の定義が見つかりません');
  const ids = [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
  if (ids.length === 0) throw new Error('★ショット ID を 1 つも取れませんでした');
  /* ★取った ID が本当に定義に存在することを確かめる */
  for (const id of ids) {
    if (broadcastV2ShotById(id) === undefined) throw new Error(`★定義に無いショット ID: ${id}`);
  }
  return ids;
}
const ALL_SHOT_IDS = allShotIds();
console.log(`定義ショット ${ALL_SHOT_IDS.length} 個: ${ALL_SHOT_IDS.join(' ')}
`);

const out = { generatedFrom: 'resolveBroadcastV2Scene（実画面と同じ場面解決）', step: STEP, viewport: { W, H }, seeds: [] };

for (const spec of SEEDS) {
  const built = buildAuditRace({ seed: spec.seed });
  const clock = auditClock(built, RACE_DEFAULTS.ownGate);
  const endDisplay = clock.introSec + clock.warp.displaySec;
  const endRaceSec = clock.warp.raceSecAt(clock.warp.displaySec);
  const ownGate = RACE_DEFAULTS.ownGate;
  const winnerGate = Number(built.result.order[0].horseId);

  /* ── §4 分類の再確認（過去と同じ 3 地点 ＋ ページ自身の判定） ── */
  const classification = {};
  for (const p of CLASS_POINTS) {
    let sec = null;
    for (let s = 0; s <= endRaceSec + 1e-9; s += 0.02) {
      if (Math.max(...built.model.at(s).map((h) => h.meters)) >= p.leaderM) { sec = s; break; }
    }
    if (sec === null) { classification[p.key] = null; continue; }
    const m = built.model.at(sec).map((h) => h.meters).sort((a, b) => b - a);
    classification[p.key] = {
      leaderM: p.leaderM, raceSec: +sec.toFixed(2),
      style: broadcastV2FinishStyleOf(m, HORSE_LENGTH_M),
      gap2M: +(m[0] - m[1]).toFixed(3), gap3M: +(m[0] - m[2]).toFixed(3),
    };
  }
  /* ★ページ自身が finish カメラを決めるのに使う判定（残り 80m） */
  classification.pageFinishStyle = clock.finishStyle;

  /* ── 0.2 秒刻みで測る ─────────────────────────── */
  const frames = [];
  for (let d = clock.introSec; d <= endDisplay + 1e-9; d += STEP) frames.push(frameAt(built, clock, +d.toFixed(3)));

  /* ── EDL（§5: ショットが変わったら新しい行） ────────── */
  const edl = [];
  for (const f of frames) {
    const last = edl[edl.length - 1];
    if (last === undefined || last.shotId !== f.shotId) {
      edl.push({ cutId: `c${String(edl.length + 1).padStart(2, '0')}`, shotId: f.shotId, frames: [f] });
    } else last.frames.push(f);
  }

  const rows = edl.map((cut, i) => {
    const fs = cut.frames;
    const shot = broadcastV2ShotById(cut.shotId);
    const startSec = fs[0].raceDisplaySec;
    /**
     * ★**最後のカットは対象時間で丸めます**（§17-3: 合計が対象映像時間と一致すること）。
     * ⚠️ 丸めないと 0.2 秒刻みの端数ぶんだけ合計が長くなり、
     *    主役の時間比の合計が 1.0021 のように 1 を超えました。
     */
    const rawEnd = fs[fs.length - 1].raceDisplaySec + STEP;
    const endSec = Math.min(rawEnd, clock.warp.displaySec);
    const mean = (get) => fs.reduce((s, f) => s + get(f), 0) / fs.length;
    const visibleMean = mean((f) => f.visibleCount);
    const framing = framingOf(mean((f) => f.maxHeightRatio), Math.round(visibleMean), built.FIELD);
    /* ★追従方式: カメラの世界位置が動くか */
    const camMoved = Math.hypot(
      fs[fs.length - 1].camera.eye.x - fs[0].camera.eye.x,
      fs[fs.length - 1].camera.eye.y - fs[0].camera.eye.y,
    );
    const stateOf = (gate) => {
      const v = fs.map((f) => f.boxes.find((b) => b.gate === gate));
      const n = v.length;
      return {
        fullRatio: +(v.filter((b) => b.visibility === 'full').length / n).toFixed(3),
        partialRatio: +(v.filter((b) => b.visibility === 'partial').length / n).toFixed(3),
        offRatio: +(v.filter((b) => b.visibility === 'off').length / n).toFixed(3),
        occludedRatio: +(v.filter((b) => b.occluded).length / n).toFixed(3),
        meanHeightRatio: +(v.reduce((s, b) => s + b.heightRatio, 0) / n).toFixed(4),
        meanCenterDistPx: +(v.reduce((s, b) => s + Math.abs(b.cx - W / 2), 0) / n).toFixed(1),
        biggestRatio: +(fs.filter((f) => f.biggestGate === gate).length / n).toFixed(3),
      };
    };
    return {
      cutId: cut.cutId,
      startSec: +startSec.toFixed(2), endSec: +endSec.toFixed(2),
      durationSec: +(endSec - startSec).toFixed(2),
      raceProgressRatio: {
        start: +(fs[0].leaderM / built.DIST).toFixed(4),
        end: +(fs[fs.length - 1].leaderM / built.DIST).toFixed(4),
        shareOfTotal: +((endSec - startSec) / clock.warp.displaySec).toFixed(4),
      },
      sectionLabel: sectionLabelOf(fs[0].leaderM, built.DIST),
      shotId: cut.shotId,
      cameraDirection: cameraDirectionOf(shot),
      fovDeg: shot.camera?.fovDeg ?? null,
      framing,
      followMode: camMoved > 1 ? 'follow' : 'fixed',
      target: shot.target,
      editorialSubject: editorialSubjectOf(shot),
      fullyVisibleMean: +mean((f) => f.fullCount).toFixed(2),
      partiallyVisibleMean: +mean((f) => f.partialCount).toFixed(2),
      offScreenMean: +mean((f) => f.offCount).toFixed(2),
      biggestHorseGate: fs[Math.floor(fs.length / 2)].biggestGate,
      self: stateOf(ownGate),
      leader: { note: '先頭馬はカット内で入れ替わりうるので、可視率は先頭だった時点だけで数える',
        ...(() => {
          const v = fs.map((f) => f.boxes.find((b) => b.gate === f.leaderGate));
          const n = v.length;
          return {
            fullRatio: +(v.filter((b) => b.visibility === 'full').length / n).toFixed(3),
            partialRatio: +(v.filter((b) => b.visibility === 'partial').length / n).toFixed(3),
            offRatio: +(v.filter((b) => b.visibility === 'off').length / n).toFixed(3),
            occludedRatio: +(v.filter((b) => b.occluded).length / n).toFixed(3),
            meanHeightRatio: +(v.reduce((s, b) => s + b.heightRatio, 0) / n).toFixed(4),
            changed: new Set(fs.map((f) => f.leaderGate)).size > 1,
          };
        })() },
      winner: stateOf(winnerGate),
      contenders: (() => {
        /* ★上位 2〜4 頭が同時に見えるか */
        const top = (f, k) => [...f.boxes].sort((a, b) => b.meters - a.meters).slice(0, k);
        const ratio = (k) => +(fs.filter((f) => top(f, k).every((b) => b.visibility !== 'off')).length / fs.length).toFixed(3);
        return { top2VisibleRatio: ratio(2), top3VisibleRatio: ratio(3), top4VisibleRatio: ratio(4) };
      })(),
      clippedByEdgeMean: +mean((f) => f.clippedCount).toFixed(2),
      foregroundOcclusion: 'unknown',      // ★前景ラチの遮蔽は描画時の話で、投影からは出せない
      hudOcclusion: 'unknown',             // ★HUD の遮蔽は実ブラウザの絵で見る（別ツール）
      boundaryStatus: 'confirmed',         // ★/race の境目はショット定義そのものなので確定
      confidence: 'high',
      switchReason: `台本 v4 のショット選択（${cut.shotId}）`,
      unknowns: ['前景ラチの遮蔽', 'HUD の遮蔽'],
      _frames: fs.length,
    };
  });

  /* ── §13 定義ショットと実使用 ─────────────────── */
  const usage = ALL_SHOT_IDS.map((id) => {
    const used = rows.filter((r) => r.shotId === id);
    return {
      shotId: id, count: used.length,
      totalSec: +used.reduce((s, r) => s + r.durationSec, 0).toFixed(2),
      firstProgress: used.length === 0 ? null : used[0].raceProgressRatio.start,
      lastProgress: used.length === 0 ? null : used[used.length - 1].raceProgressRatio.end,
    };
  });

  out.seeds.push({
    ...spec,
    distance: built.DIST, field: built.FIELD, ownGate, winnerGate,
    displaySec: +clock.warp.displaySec.toFixed(2),
    classification,
    edl: rows,
    shotUsage: usage,
    frameCount: frames.length,
  });

  console.log(`seed ${String(spec.seed).padStart(3)}（${spec.label}）`
    + ` 分類 mid=${classification.mid?.style} / ページ判定=${classification.pageFinishStyle}`
    + ` / カット ${rows.length} 本 / ${clock.warp.displaySec.toFixed(2)}s`);
  console.log(`      使用ショット: ${usage.filter((u) => u.count > 0).map((u) => `${u.shotId}(${u.totalSec}s)`).join(' ')}`);
}

writeFileSync(path.join(OUT, 'race-edl.json'), JSON.stringify(out, null, 2));
console.log(`\n→ ${path.join(OUT, 'race-edl.json')}`);
