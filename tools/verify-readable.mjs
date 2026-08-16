/**
 * ★「画面は情報を運んでいるか」を測る（REVIEW_P4_QUALITY_VERDICT Q-P4-13）
 *
 * > N レースを勝負所（残り800m）で止める
 * >  → **画面に描かれた情報だけを見るボット**が「自馬は3着以内か」を予想
 * >  → 素の的中率と比べる
 * > ★上回る = 画面が情報を運んでいる / 上回らない = 画面は装飾である
 *
 * 【★なぜボットに見せるか】（裁定より）
 *   > 「見れば分かる」ものは、作った人には見えません。作った人は
 *   > **何が描かれているべきかを知っているので、描かれていなくても補完して見ます。**
 *   → ボットは補完しません。
 *
 * 【★ボットの係数を手で決めてはいけません】
 *   最初はしていました。**そして数字が上がりました。**
 *   ⚠️ それは**画面ではなく読み手を鍛えた**だけで、R-16
 *      （「この基準を最も安易に満たす方法は何か」）に真正面から当たります。
 *   → **前半のレースで係数を学習し、後半のレースだけで採点します。**
 *     私が触れるのは「画面に何を描くか」だけになります。
 *
 * 【★比べる相手を1度間違えました】
 *   最初は「エンジンの真実」を上限に置きました。**AUC 0.952 が出ました。**
 *   ⚠️ 位置モデルは**確定した結果から**作られています（`replayOf(result, …)`）。
 *      つまり残り1500mの「真実」には**既にゴールが入っていました**。漏洩です。
 *      ★私はこれを「レースはスタート時点で93%決まっている」と読みかけました。**誤りです。**
 *      （同じ出走表で乱数だけ変えると、12頭すべてが勝ちます: `tools/diag-uncertainty.mjs`）
 *
 *   → 上限ではなく**比較対象**を置きます: **出走表ボット**。
 *     レース前に分かること（能力・脚質・ペース）だけで予想します。
 *     ★**プレイヤーがゲートが開く前から持っている情報**です。
 *
 *   ★問いはこうなります: **画面を見ることは、出走表を見る以上の情報を与えているか。**
 *     与えていないなら、レースを見る意味がありません。
 *
 * 【★この測定が言えないこと】
 *   「面白いか」は測っていません。**「読めるか」だけ**です。
 *   ただし裁定のとおり、**読めないものは確実に面白くありません。**
 *
 * 実行: npx tsx tools/verify-readable.mjs [--races 800]
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, laneAt } from '@star/race-engine';
import { replayPositionModel, sceneAt, cameraFor, ovalCourse } from '@star/render';

const argv = process.argv.slice(2);
const num = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};
const RACES = num('--races', 800);
/**
 * ★**隊列の強さ**（Q-P4-38）。★`jostle`（揺らぎ）は撤去しました。
 *   1 = 道中を脚質から生成する（既定）／0 = 真の位置そのまま（★漏れる。対照用）
 */
const FORMATION = num('--formation', 1);
/**
 * ★斜め俯瞰で測るか（D-062 の再測定）。
 *   ⚠️ 既定は**平面のまま**にします。★対照が取れなくなるので、既定を勝手に動かしません。
 */
const OBLIQUE = argv.includes('--oblique');
/** ★どこで止めて予想させるか（残りメートル）。時間の構造を測るために動かせます */
const AT_LEFT = num('--at', 800);
/** ★中間境界を位置として厳守するか（'exact' = D-059 の明文 / 'shape' = D-061 改訂の含意） */
/** ★能力の幅（1 = 同クラス最小 / 大きいほどばらばら） */
const SPREAD = num('--spread', 1);
const DIST = 1600;
const FIELD = 12;
const TOP = 3;
const BASE_RATE = TOP / FIELD;

const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const pool = JSON.parse(readFileSync('docs/pool-staging.json', 'utf8'));
const arr = Array.isArray(pool) ? pool : (pool.horses ?? []);
const stock = arr.filter((h) => h.stats && Number.isFinite(h.stats.sp));
if (stock.length < FIELD * 2) {
  console.error(`★プールが小さすぎます（${stock.length}頭）`);
  process.exit(2);
}

/* ------------------------------------------------------------------ *
 * ★画面から読める特徴（**描画コマンドだけ**が入力）
 * ------------------------------------------------------------------ */
/**
 * @param {readonly object[]} commands ★画面。これが唯一の情報源
 * @param {string} ownSilk ★プレイヤーが画面の外から知っている唯一のこと＝自分の勝負服
 * @returns {number[]} 特徴ベクトル
 *
 * ⚠️ 引数はこの2つだけです。**エンジンの値を覗く経路がありません**（R-24: 不在で守る）
 */
function screenFeatures(commands, ownSilk) {
  const sprites = commands.filter((c) => c.kind === 'sprite');
  const own = sprites.find((c) => c.silk === ownSilk);
  if (own === undefined) return null;               // ★自馬が画面にいない＝何も読めない

  const xs = sprites.map((c) => c.at.x);
  const ahead = sprites.filter((c) => c.at.x > own.at.x).length;
  // ★馬群の広がり。実際の中継では「隊列が伸びた＝速いペース」が見える情報です
  const spread = (Math.max(...xs) - Math.min(...xs)) / Math.max(1, xs.length);

  const efforts = commands.filter((c) => c.kind === 'effort');
  let ownEffort = 1, aheadEffortMean = 1, aheadEffortMin = 1;
  if (efforts.length > 0) {
    const mine = efforts.reduce((b, e) =>
      Math.abs(e.at.x - own.at.x) < Math.abs(b.at.x - own.at.x) ? e : b);
    ownEffort = mine.ratio;
    const up = efforts.filter((e) => e.at.x > own.at.x).map((e) => e.ratio);
    if (up.length > 0) {
      aheadEffortMean = up.reduce((s, v) => s + v, 0) / up.length;
      aheadEffortMin = Math.min(...up);
    }
  }

  /**
   * ★**内を通っているか、外を回されているか**（D-071 の `w` が画面に出たので読めます）。
   *
   * 【★なぜ足すか】
   *   斜め俯瞰では**内ラチ側が画面の上**です。人間には「外を回されている」ことが
   *   ★**見えています**。ボットが `at.x` しか読まないままだと、
   *   **人間が読めるものをボットが読めない**状態を測ることになります。
   *
   * ⚠️ ★**通るまで特徴を足しません。** 足すのはこの1つだけで、結果は出たまま報告します。
   *    （平面のままなら全馬が同じ段に並ぶので、この特徴は 0 付近で効きません）
   */
  const ys = sprites.map((c) => c.at.y);
  const ySpan = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const ownOutside = (own.at.y - Math.min(...ys)) / ySpan;
  // ★前にいる馬たちが内を通れているか（＝自分より前が得をしているか）
  const upY = sprites.filter((c) => c.at.x > own.at.x).map((c) => (c.at.y - Math.min(...ys)) / ySpan);
  const aheadOutside = upY.length === 0 ? 0.5 : upY.reduce((a, b) => a + b, 0) / upY.length;

  const gap = commands.find((c) => c.kind === 'gap');
  const gauge = commands.find((c) => c.kind === 'gauge');

  /**
   * ★**脚質とペース**（V-16 ①）。
   *   これが無いと位置の意味が読めません:
   *   「前にいる逃げ馬」と「前にいる追込馬」はまったく違う情報です。
   */
  const STR = ['nige', 'senko', 'sashi', 'oikomi'];
  const ownStrategy = own.strategy === undefined ? 1.5 : STR.indexOf(own.strategy);
  const paceCmd = commands.find((c) => c.kind === 'pace');
  const paceIdx = paceCmd === undefined ? 1 : ['slow', 'middle', 'high'].indexOf(paceCmd.pace);
  // ★前にいる馬のうち、逃げ・先行がどれだけ占めるか（速いペースなら止まる）
  const upFront = sprites.filter((c) => c.at.x > own.at.x && c.strategy !== undefined);
  const frontRunnersAhead = upFront.length === 0 ? 0
    : upFront.filter((c) => c.strategy === 'nige' || c.strategy === 'senko').length / upFront.length;

  return [
    1,                                              // 切片
    ahead / FIELD,
    spread / 100,
    ownOutside,        // ★自分が外を回されているか（D-071）
    aheadOutside,      // ★前の馬が内を通れているか
    ownEffort,
    aheadEffortMean,
    aheadEffortMin,
    gap === undefined ? 0 : Math.min(1, gap.meters / 50),
    gap === undefined ? 0 : Math.max(-1, Math.min(1, gap.closingMps / 5)),
    gap === undefined ? 0 : gap.toGo / FIELD,
    gauge === undefined ? 1 : gauge.ratio,
    ownStrategy / 3,
    paceIdx / 2,
    // ★噛み合い: 速いペース × 差し追込 が有利
    (paceIdx - 1) * (ownStrategy - 1.5) / 3,
    frontRunnersAhead,
    // ★前が逃げ・先行だらけ かつ 速いペース = 前は止まる
    frontRunnersAhead * (paceIdx - 1),
  ];
}

/**
 * ★**出走表ボット** — レース前に分かることだけ。
 *   ⚠️ レース中の位置・余力は**入れません**（それは結果からの漏洩になります）。
 *   これがプレイヤーの持ち点です。画面はこれを**上回らなければ意味がありません**。
 */
function formFeatures(f) {
  return [
    1,
    f.ownSp, f.ownSt, f.ownPw, f.ownIq, f.ownGt,
    f.rivalSpMean,
    f.ownSp - f.rivalSpMean,      // ★相対的な強さ
    f.strategyIdx / 3,
    f.paceIdx / 2,
    f.strategyFitsPace,           // ★展開との噛み合い（coefficients.ts:134 の観点）
    f.ownGate / FIELD,
    /**
     * ★**出走表ボットにも「隊列の顔ぶれ」を渡します。**
     *
     *   ⚠️ 渡さないまま画面ボットに脚質を足すと、**比較が不公平**になります。
     *      実際、渡さずに測ったとき道中が −0.221 → **+0.176** に跳ねました。
     *      ★それは「画面が良くなった」ではなく「**読み手に良い特徴を与えた**」
     *        可能性があります（R-16・裁定の「画面に出走表を貼る」）。
     *   → **逃げ馬の頭数も、相手の脚質構成も、ゲートが開く前に分かります。**
     *     だから出走表ボットが持っていて当然です。
     */
    f.frontRunnerShare,
    f.frontRunnerShare * (f.paceIdx - 1),
    f.rivalStMean,
    f.ownSp - f.rivalSpMean > 0 ? 1 : 0,
  ];
}

/* ------------------------------------------------------------------ *
 * ★ロジスティック回帰（勾配降下）。★手で係数を決めないための最小の道具
 * ------------------------------------------------------------------ */
function fit(X, y, steps = 4000, lr = 0.5) {
  const d = X[0].length;
  const w = new Array(d).fill(0);
  for (let s = 0; s < steps; s += 1) {
    const g = new Array(d).fill(0);
    for (let i = 0; i < X.length; i += 1) {
      let z = 0;
      for (let j = 0; j < d; j += 1) z += w[j] * X[i][j];
      const p = 1 / (1 + Math.exp(-z));
      const e = p - y[i];
      for (let j = 0; j < d; j += 1) g[j] += e * X[i][j];
    }
    for (let j = 0; j < d; j += 1) w[j] -= (lr / X.length) * g[j];
  }
  return w;
}
const predict = (w, x) => {
  let z = 0;
  for (let j = 0; j < w.length; j += 1) z += w[j] * x[j];
  return 1 / (1 + Math.exp(-z));
};

function auc(scored) {
  const pos = scored.filter((s) => s.truth).map((s) => s.p);
  const neg = scored.filter((s) => !s.truth).map((s) => s.p);
  if (pos.length === 0 || neg.length === 0) return NaN;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/* ------------------------------------------------------------------ *
 * 1レース分
 * ------------------------------------------------------------------ */
function runRace(seed) {
  /**
   * ★**能力の近い12頭を組みます**（同クラス）。
   *   ⚠️ プールから任意に取ると能力差が大きくなり、
   *      「レースが始まる前に決まっている」という結論が**試験の組み方の産物**になります。
   *   実際の番組はクラス分けされているので、そちらに合わせます。
   *   `--spread` で能力の幅を変えられます（切り分け用）。
   */
  const bySp = [...stock].sort((a, b) => b.stats.sp - a.stats.sp);
  const win = Math.max(FIELD, Math.round(FIELD * SPREAD));
  const start = (seed * 13) % Math.max(1, bySp.length - win);
  const band = bySp.slice(start, start + win);
  const picked = Array.from({ length: FIELD }, (_, i) => band[(i * 7 + seed) % band.length]);
  const entrants = picked.map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4], condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes ?? [],
  }));
  const conditions = {
    raceId: `r${seed}`, distance: DIST, surface: 'turf',
    trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    strategyOf: (g) => entrants[g - 1].strategy,
    pace,
    formation: FORMATION,
    // ★別ストリーム（D-061 改訂）。resolveRace の乱数には触れません
    formationSeed: seed * 2654435761,
    ...(OBLIQUE ? { laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, seed) } : {}),
  });

  const ownGate = 1 + (seed % FIELD);
  const finalOrder = result.order.map((e) => Number(e.horseId));

  let sec = 0;
  for (let i = 0; i <= 400; i += 1) {
    const t = (i / 400) * model.raceSec;
    const o = model.at(t).find((h) => h.gate === ownGate);
    if (o !== undefined && DIST - o.meters <= AT_LEFT) { sec = t; break; }
  }

  const frame = sceneAt({
    model,
    viewport: { width: 1280, height: 720, trackTop: 340, laneHeight: 105 },
    laneOf: (g) => (g - 1) % 3,
    ownGate, silkOf: (g) => `silk-${g}`, gallopFrames: 6,
    camera: cameraFor(AT_LEFT, ownGate),
    // ★V-16 ①: 展開を画面に出す（エンジンが持っているものを渡すだけ）
    strategyOf: (g) => entrants[g - 1].strategy,
    pace,
    // ★横位置はエンジンが引いたものを読むだけ（D-071）
    ...(OBLIQUE ? { oblique: {
      course: ovalCourse(DIST),
      widthOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, seed),
    } } : {}),
  }, sec);

  // ── ★出走表（ゲートが開く前に分かること**だけ**）──
  const me = entrants[ownGate - 1];
  const rivals = entrants.filter((_, i) => i !== ownGate - 1);
  const paceIdx = ['slow', 'middle', 'high'].indexOf(pace);
  const sIdx = STRATS.indexOf(me.strategy);
  const form = {
    ownSp: me.stats.sp / 1000, ownSt: me.stats.st / 1000, ownPw: me.stats.pw / 1000,
    ownIq: me.stats.iq / 1000, ownGt: me.stats.gt / 1000,
    rivalSpMean: rivals.reduce((s, e) => s + e.stats.sp, 0) / rivals.length / 1000,
    strategyIdx: sIdx,
    paceIdx,
    // ★速いペースなら差し・追込が有利、遅いペースなら逃げ・先行が有利
    strategyFitsPace: (paceIdx - 1) * (sIdx - 1.5) / 3,
    ownGate,
    // ★隊列の顔ぶれ（ゲートが開く前に分かる）
    frontRunnerShare: rivals.filter((e) => e.strategy === 'nige' || e.strategy === 'senko').length / rivals.length,
    rivalStMean: rivals.reduce((s2, e) => s2 + e.stats.st, 0) / rivals.length / 1000,
  };

  return {
    y: finalOrder.indexOf(ownGate) < TOP ? 1 : 0,
    screen: screenFeatures(frame.commands, `silk-${ownGate}`),
    form: formFeatures(form),
  };
}

/* ------------------------------------------------------------------ */
console.log('# ★画面は情報を運んでいるか（Q-P4-13 の測り方）');
console.log(`  ${RACES} レース / ${FIELD}頭 / 残り${AT_LEFT}m で停止 / 「自馬は${TOP}着以内か」`);
console.log(`  ★係数は前半で学習し、**後半のレースだけで採点**します（手で調整できません）`);
console.log('');

const rows = [];
for (let s = 1; s <= RACES; s += 1) {
  const r = runRace(s);
  if (r.screen !== null) rows.push(r);
}
const half = Math.floor(rows.length / 2);
const train = rows.slice(0, half);
const test = rows.slice(half);
const positives = test.filter((r) => r.y === 1).length;

const wScreen = fit(train.map((r) => r.screen), train.map((r) => r.y));
const wForm = fit(train.map((r) => r.form), train.map((r) => r.y));

const A = {
  screen: auc(test.map((r) => ({ truth: r.y === 1, p: predict(wScreen, r.screen) }))),
  form: auc(test.map((r) => ({ truth: r.y === 1, p: predict(wForm, r.form) }))),
  blind: auc(test.map((r) => ({ truth: r.y === 1, p: BASE_RATE }))),
};

console.log('【結果】★AUC（後半 ' + test.length + ' レースで採点）');
console.log(`  3着以内だった割合 : ${((positives / test.length) * 100).toFixed(1)}%（想定 ${(BASE_RATE * 100).toFixed(1)}%）`);
console.log('');
console.log(`  ③ ★出走表ボット          : ${A.form.toFixed(3)}  ← **ゲートが開く前**に持っている情報だけ`);
console.log(`  ① ★画面ボット            : ${A.screen.toFixed(3)}`);
console.log(`  ② 盲目ボット（下限・検算）: ${A.blind.toFixed(3)}  ★0.500 でなければ測定が壊れています`);
console.log('');

if (Math.abs(A.blind - 0.5) > 1e-9) {
  console.error('  ★★測定が壊れています（盲目ボットが 0.5 でない）');
  process.exit(2);
}
/**
 * ★**比較相手が壊れたまま合格が出る**のを塞ぎます。
 *   ⚠️ 実際に起きました: 能力の項目名を間違えて出走表ボットが NaN になり、
 *      AUC ちょうど 0.000（NaN の比較は常に偽）になったまま、
 *      道具は「画面が出走表を上回った」と **PASS を出しました。**
 *   ★合格が出る前に、**比べる相手が生きていること**を確かめます。
 */
if (!(A.form > 0.55)) {
  console.error(`  ★★測定が壊れています（出走表ボットが ${A.form.toFixed(3)}）`);
  console.error('     能力から3着以内を予想できないはずがありません。特徴量を確かめてください。');
  process.exit(2);
}

const se = 1 / Math.sqrt(3 * Math.max(1, positives));
const gain = A.screen - 0.5;
/** ★本題: 画面は**出走表以上のことを教えているか** */
const overForm = A.screen - A.form;
console.log('【判定】');
console.log(`  画面が運んだ情報量 : ${gain >= 0 ? '+' : ''}${gain.toFixed(3)}（標準誤差 ≒ ${se.toFixed(3)}）`);
console.log(`  ★出走表を上回った量: ${overForm >= 0 ? '+' : ''}${overForm.toFixed(3)}（画面ボット − 出走表ボット）`);
const pass = gain > 2 * se && overForm > 2 * se;
console.log(pass
  ? '  PASS — 画面は、出走表を上回る情報を運んでいます'
  : '  ★★FAIL — 画面は情報を運んでいません。**装飾です。**');
if (gain > 2 * se && overForm <= 2 * se) {
  console.log('  ★内訳: 盲目は上回るが、**出走表は上回らない**');
  console.log('        ＝ 画面は「レースを見なくても分かること」しか映していません。');
}
console.log('');
console.log('★注意: この測定は「読めるか」だけを見ています。「面白いか」は見ていません。');
process.exit(pass ? 0 : 1);
