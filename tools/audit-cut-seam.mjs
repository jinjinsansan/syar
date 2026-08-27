/**
 * ★**カットの「境目」でつながっているかを測る**（読取専用）
 *
 * 【なぜ要るか（オーナー指摘 2026-08-27）】
 *   > 画面が切り替わるとカメラワークが切り替わるが、1 つ前のカメラワークと
 *   > スムーズに切り替えていないため**同じレースなのか分からない**（別のレースかもしれないレベル）
 *
 *   ⚠️ ★**既存の `tools/verify-camera-continuity.mjs` はここを測っていません。**
 *      あの道具の判定は
 *
 *          if (prev !== null && prev.id === cur.id) { ... }      ← 同じカット同士だけ
 *
 *      で、★**カットが変わったコマは黙って捨てています**（`verify-camera-continuity.mjs:58`）。
 *      つまり「カットの*中*は滑らか」だけを見ており、★**境目は設計上一度も測られていません。**
 *      あちらは「カメラが瞬間移動していないか」の道具なので、これは欠陥ではなく**担当の外**です。
 *
 * 【★何を測るか — なぜこの 2 つを主にするか】
 *   ⚠️ ★**メートルで測ってはいけません。** 既存道具が自分で書き残しています
 *      （`verify-camera-continuity.mjs:82`）: 注視点が **2.51m** 跳んだだけで
 *      画面は **237px** 飛んだのに、m で見ていたので**見逃した**。
 *      → ★**画面の px で測ります。**
 *
 *   ★**①走行方向の符号**（`dirFlip`）
 *      境目の前後で、馬が画面の**左へ進むか右へ進むか**が入れ替わっていないか。
 *      ★これが入れ替わると、人は「**別のレースだ**」と読みます（映像編集でいう
 *      「イマジナリーラインを越える」）。★**閾値が要りません。符号は事実です。**
 *
 *   ★**②共通の被写体が画面のどこへ跳ぶか**（`jumpPx`）
 *      境目の前後**どちらにも映っている馬**について、画面上の位置が何 px 動くか。
 *      ★**共通の馬が 0 頭**なら、見る人は前後を結びつける手がかりを持ちません。
 *      ★これも閾値が要りません（0 頭は事実）。
 *
 *   ③④は参考値として出すだけです（画角の比・馬の大きさの比）。
 *   ★**私は合否の閾値を決めません。** 決めるのはオーナーとレビュー側です（R-16）。
 *
 * 【★測定器が画面と同じものを読んでいるか】
 *   ⚠️ ★この案件では**測定器と実画面が違う入力を読んでいた事故が通算 5 件**あります（R-30）。
 *      直近は γ（測定器 1.0 / 画面 1.3）。→ ★**この道具は既定を「実画面の既定」に合わせ、
 *      実行時に必ず γ と台本を印字します**（R-8）。
 *      ★エンジン既定（γ=1.0）ではありません。合わせたいときは `--gamma 1.0` と明示してください。
 *
 * ⚠️ ★製品コードに触れません。読むだけです（憲法 3）。
 * ⚠️ ★`Date.now()` / `Math.random()` を使いません（憲法 4）。
 *
 * 実行:
 *   npx tsx tools/audit-cut-seam.mjs --seeds 42 --script v6 --gamma 1.6
 *   npx tsx tools/audit-cut-seam.mjs --seeds 42,253,90 --script v5
 */
import { DEFAULT_RACE_BALANCE } from '@star/race-engine';
import { cameraBasis, project, posOf } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

/**
 * ★**既定は「実画面の既定」**です（R-30）。
 *   `apps/web/src/app/race/page.tsx:392` の `DEMO_CONTEST_GAMMA` と同じ値。
 *   ⚠️ ★エンジン既定（`DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA` = 1.0）ではありません。
 */
const SCREEN_GAMMA = 1.3;
/** ★`broadcastV2ScriptFromSearch` の既定と同じ（`?cinematography` 省略時） */
const SCREEN_SCRIPT = 'v5';

const SEEDS = String(arg('seeds', String(RACE_DEFAULTS.seed))).split(',').map((s) => Number(s.trim()));
const SCRIPT = arg('script', SCREEN_SCRIPT);
const GAMMA = Number(arg('gamma', SCREEN_GAMMA));
const FPS = Number(arg('fps', 30));
const W = Number(arg('width', 1280));
const H = Number(arg('height', 720));
const VIEWPORT = { width: W, height: H };

const BALANCE = GAMMA === DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA
  ? DEFAULT_RACE_BALANCE
  : { ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: GAMMA };

/** ★R-8: 何で測ったかを毎回出す。これが無いと数字が独り歩きします */
console.log('\n★測定条件（実行のたびに必ず出します・R-8 / R-30）');
console.log(`   台本 ${SCRIPT}${SCRIPT === SCREEN_SCRIPT ? '（画面既定）' : ''}`
  + ` / γ ${GAMMA.toFixed(2)}${GAMMA === SCREEN_GAMMA ? '（画面既定）' : ''}`
  + ` / ${W}×${H} / ${FPS}fps / seed ${SEEDS.join(',')}`);
if (GAMMA !== DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA) {
  console.log(`   ⚠️ エンジン既定は γ=${DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA.toFixed(2)} です（この測定は画面側に合わせています）`);
}

/**
 * ★**その馬が画面のどこに描かれるか**（px）。
 *   ⚠️ 高さ 0（接地点）で測ります。スプライトの大きさは `pxPerM` に出るので別に見ます。
 */
function screenOf(course, camera, basis, horse) {
  const p = posOf(course, horse.s, horse.w);
  return project(camera, basis, { x: p.x, y: p.y, z: 0 });
}

/**
 * ★**走行方向が画面のどちら向きか**（+1 = 右へ進む / −1 = 左へ進む）。
 *   注視点にいる馬を 2m 先へ進めて、画面 x がどちらへ動くかで決めます。
 *   ⚠️ ★`depth` が負（カメラの後ろ）なら判定できないので 0 を返します。
 */
function screenDirection(course, camera, basis, s, w) {
  const a = project(camera, basis, { ...posOf(course, s, w), z: 0 });
  const b = project(camera, basis, { ...posOf(course, s + 2, w), z: 0 });
  if (!(a.depth > 0) || !(b.depth > 0)) return 0;
  const dx = b.x - a.x;
  return Math.abs(dx) < 1e-6 ? 0 : Math.sign(dx);
}

const median = (a) => {
  if (a.length === 0) return Number.NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** ★1 シードぶんの境目を全部拾う */
function seamsOf(seed) {
  const built = buildAuditRace({ seed, balance: BALANCE });
  const clock = auditClock(built);
  const totalSec = clock.introSec + clock.warp.displaySec;
  const step = 1 / FPS;

  const seams = [];
  const cutSec = new Map();
  let prev = null;

  for (let t = 0; t <= totalSec + 1e-9; t += step) {
    const { scene } = auditSceneAt(built, clock, t, VIEWPORT, SCRIPT);
    const basis = cameraBasis(scene.camera);
    const cur = {
      t,
      id: scene.shot.id,
      camera: scene.camera,
      basis,
      fovDeg: (scene.camera.fovY * 180) / Math.PI,
      focusS: scene.focusS,
      focusW: scene.focusW,
      horses: scene.visibleHorses.map((h) => ({ gate: h.gate, s: h.s, w: h.w })),
      dir: screenDirection(built.course, scene.camera, basis, scene.focusS, scene.focusW),
    };
    cutSec.set(cur.id, (cutSec.get(cur.id) ?? 0) + step);

    if (prev !== null && prev.id !== cur.id) {
      /**
       * ★**境目の前後で、どちらにも映っている馬**だけを見ます。
       *   ⚠️ ★片方にしか居ない馬を混ぜると「跳んだ」ことになりますが、
       *      それは**跳びではなく出入り**です（R-22: 壊れ方と同じ粒度で照合する）。
       */
      const prevByGate = new Map(prev.horses.map((h) => [h.gate, h]));
      const shared = cur.horses.filter((h) => prevByGate.has(h.gate));
      const jumps = [];
      for (const h of shared) {
        const before = screenOf(built.course, prev.camera, prev.basis, prevByGate.get(h.gate));
        const after = screenOf(built.course, cur.camera, cur.basis, h);
        if (!(before.depth > 0) || !(after.depth > 0)) continue;
        jumps.push({
          gate: h.gate,
          px: Math.hypot(after.x - before.x, after.y - before.y),
          sizeRatio: before.pxPerM > 0 ? after.pxPerM / before.pxPerM : Number.NaN,
        });
      }
      seams.push({
        t,
        from: prev.id,
        to: cur.id,
        /** ★①符号の反転。閾値なし・事実 */
        dirFlip: prev.dir !== 0 && cur.dir !== 0 && prev.dir !== cur.dir,
        dirBefore: prev.dir,
        dirAfter: cur.dir,
        /** ★②共通の被写体。0 頭は閾値なしで問題 */
        sharedCount: shared.length,
        visibleBefore: prev.horses.length,
        visibleAfter: cur.horses.length,
        jumpMedianPx: median(jumps.map((j) => j.px)),
        jumpMaxPx: jumps.length ? Math.max(...jumps.map((j) => j.px)) : Number.NaN,
        /** ③④参考値 */
        fovRatio: prev.fovDeg > 0 ? cur.fovDeg / prev.fovDeg : Number.NaN,
        sizeRatioMedian: median(jumps.map((j) => j.sizeRatio)),
        eyeJumpM: Math.hypot(
          cur.camera.eye.x - prev.camera.eye.x,
          cur.camera.eye.y - prev.camera.eye.y,
          cur.camera.eye.z - prev.camera.eye.z,
        ),
      });
    }
    prev = cur;
  }
  return { seams, cutSec, totalSec };
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—');

const allSeams = [];
for (const seed of SEEDS) {
  const { seams, cutSec, totalSec } = seamsOf(seed);
  allSeams.push(...seams.map((s) => ({ ...s, seed })));

  console.log(`\n=== seed ${seed} — カットの境目 ${seams.length} 箇所（全 ${totalSec.toFixed(1)} 秒）===\n`);
  console.log('   表示秒  切り替わり                              向き  共通  跳び中央  跳び最大   画角比  大きさ比');
  for (const s of seams) {
    const flag = s.dirFlip ? '🔴' : (s.sharedCount === 0 ? '🔴' : '  ');
    const dir = s.dirFlip ? `${s.dirBefore > 0 ? '→' : '←'}${s.dirAfter > 0 ? '→' : '←'}` : '  ';
    console.log(
      `  ${flag}${s.t.toFixed(2).padStart(6)}  ${`${s.from} → ${s.to}`.padEnd(38)}`
      + `${dir.padStart(4)}${String(s.sharedCount).padStart(6)}`
      + `${fmt(s.jumpMedianPx).padStart(10)}${fmt(s.jumpMaxPx).padStart(10)}`
      + `${(fmt(s.fovRatio, 2) + '×').padStart(9)}${(fmt(s.sizeRatioMedian, 2) + '×').padStart(10)}`,
    );
  }

  console.log('\n   カットの尺（秒）');
  for (const [id, sec] of [...cutSec.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${id.padEnd(24)}${sec.toFixed(2).padStart(7)}`);
  }
}

/* ── ★まとめ（★閾値を使う判定は 2 つだけ。どちらも「事実」で、私が決めた線ではありません）── */
const flips = allSeams.filter((s) => s.dirFlip);
const orphans = allSeams.filter((s) => s.sharedCount === 0);
console.log(`\n${'─'.repeat(78)}`);
console.log(`★境目 ${allSeams.length} 箇所（seed ${SEEDS.length} 本）`);
console.log(`   🔴 走行方向が反転した境目 …… ${flips.length} 箇所`);
for (const s of flips) console.log(`        seed ${s.seed} ${s.t.toFixed(2)}s  ${s.from} → ${s.to}`);
console.log(`   🔴 共通の馬が 0 頭の境目 …… ${orphans.length} 箇所`);
for (const s of orphans) console.log(`        seed ${s.seed} ${s.t.toFixed(2)}s  ${s.from} → ${s.to}`);

const px = allSeams.map((s) => s.jumpMedianPx).filter(Number.isFinite);
if (px.length > 0) {
  const sorted = [...px].sort((a, b) => a - b);
  console.log(`   共通馬の跳び（中央値の分布）… 最小 ${fmt(sorted[0])} / 中央 ${fmt(median(sorted))}`
    + ` / 最大 ${fmt(sorted[sorted.length - 1])} px（画面幅 ${W}px）`);
}
console.log('\n★この道具は合否を出しません。走行方向の反転と共通被写体 0 頭だけを事実として挙げます。');
console.log('★跳び px の許容量はオーナー・レビュー側の判断です（R-16: 閾値を測る側が勝手に決めない）。\n');
