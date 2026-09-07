/**
 * ★デフォルメ馬 — ★**パーツ姿勢モデル**（4 層分離の ★③）
 *
 * 【★この層が答える問い】
 *   ★「★**各部位を、どこに・どれだけ回して・どれだけ潰して置くか**」
 *
 * 【⚠️ ★絵の形式を一切知りません】
 *   ★ベクターでも画像でも、★**この層までは同一**です。
 *   ★差し替えは ④（`deformed-horse-draw.ts`）の中だけで起きます（★裁定 2 の条件）。
 *
 * 【★指示書 §4-3 の禁止事項が「構造的に」起こせない理由】
 *   | ★禁止 | ★なぜ起こせないか |
 *   |---|---|
 *   | ★胴体を固定したまま脚だけを回す | ★**胴体の高さを接地脚から求めます**。脚が動けば胴が動きます |
 *   | ★蹄が接地中に滑る | ★②が世界座標を固定しています |
 *   | ★騎手と馬が別々の周期で上下する | ★騎手の腰は ★**鞍に直付け**。位相を持ちません |
 *   | ★1 周期内で脚の長さ・関節数が変わる | ★**骨の長さは定数**。★動くのは角度だけ（★下の逆運動学）|
 *
 * 【★憲法4】★時刻も乱数も使いません。★進んだ距離と馬番だけで決まります。
 */

import type { DeformedHorseContract, DeformedLegId, DeformedPartName } from './deformed-horse-parts.js';
import {
  DEFORMED_LEG_IDS, DEFORMED_STAND_BEND, DEFORMED_FLIGHT_RISE_M, DEFORMED_STANCE_DIP_M, legReachM,
} from './deformed-horse-parts.js';
import type { DeformedGait } from './deformed-horse-rig.js';
import {
  DEFORMED_GAIT_V0, gaitPhase, hoofLocalX, hoofY, legPhase, legSupportWeight, legInContact,
} from './deformed-horse-rig.js';

/** ★1 部位の姿勢。★x/y は [m]（★y は上が正）・角は反時計回りが正 */
export interface DeformedPartTransform {
  readonly x: number;
  readonly y: number;
  readonly angleRad: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** ★1 本の脚の解 */
export interface DeformedLegSolve {
  readonly leg: DeformedLegId;
  readonly contact: boolean;
  /** ★付け根 [m] */
  readonly hip: { readonly x: number; readonly y: number };
  /** ★**関節**（★これが従来まったく無かったもの）[m] */
  readonly knee: { readonly x: number; readonly y: number };
  /** ★蹄 [m] */
  readonly hoof: { readonly x: number; readonly y: number };
  /** ★脚がどれだけ伸び切っているか（1.0 = 伸び切り） */
  readonly extension: number;
}

export interface DeformedPose {
  readonly phase: number;
  readonly supportCount: number;
  readonly torso: DeformedPartTransform;
  readonly legs: Readonly<Record<DeformedLegId, DeformedLegSolve>>;
  readonly parts: Readonly<Record<DeformedPartName, DeformedPartTransform>>;
}

export interface DeformedPoseInput {
  /** ★**見た目の**進行距離 [m]（★時間圧縮を打ち消した後） */
  readonly travelM: number;
  /** ★馬番（★位相の個体差） */
  readonly gate: number;
  /** ★見た目の速さ [m/s]。★前傾と尾のなびきにだけ使います */
  readonly speedMps: number;
  readonly contract: DeformedHorseContract;
  readonly gait?: DeformedGait;
  /**
   * ★立ったときの付け根の高さ（★脚を伸ばし切った長さに対する比）。
   *   ⚠️ ★**Gate 0B で目で決める値**なので、差し替え口を開けています。
   *   ★省略すると `DEFORMED_STAND_BEND`（v0 = 0.72）。
   */
  readonly standBend?: number;
}

/** ★着地の潰れ（★§4-2「蹄の接地で 1〜2 フレームの軽い潰れ」） */
const LANDING_SQUASH = 0.05;
/** ★たてがみ・尾の遅れ（★完歩の何割か・§4-2「尾とたてがみの遅れ」） */
const HAIR_LAG = 0.12;
/** ★前傾が最大になる速さ [m/s] */
const LEAN_FULL_MPS = 18;
/** ★全速のとき、★前の付け根が下がる量 [m]（★＝前傾の作り方） */
const LEAN_DROP_M = 0.05;
/** ★騎手のかがみ。★上体の長さに対して、頭が座面のどれだけ上に来るか（★小さいほど伏せる） */
const JOCKEY_CROUCH = 0.40;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * ★**2 骨の逆運動学**。★付け根と蹄を与えると、★関節の位置が 1 つに決まります。
 *
 *   ⚠️ ★**骨の長さ `a` `b` は動きません。** ★動くのは角度だけです。
 *      ★これが「1 周期内で脚の長さが変わらない」の中身で、★検定②はここを見ています。
 *
 *   ★`bendSign` … ★前脚は後ろへ、後脚は前へ折れます（★向きの違いだけ）。
 */
function solveTwoBone(
  hipX: number, hipY: number, footX: number, footY: number,
  a: number, b: number, bendSign: number,
): { kneeX: number; kneeY: number; extension: number } {
  const dx = footX - hipX;
  const dy = footY - hipY;
  const far = Math.hypot(dx, dy);
  /** ★伸び切りと畳み切りを避ける（★0 割りと「棒」を防ぐ） */
  const d = clamp(far, Math.abs(a - b) + 1e-4, (a + b) - 1e-4);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const upper = base + bendSign * Math.acos(cosA);
  return {
    kneeX: hipX + a * Math.cos(upper),
    kneeY: hipY + a * Math.sin(upper),
    extension: far / (a + b),
  };
}

/** ★前脚は後ろへ折れ、★後脚は前へ折れる */
function bendSignOf(leg: DeformedLegId): number {
  return leg === 'foreFar' || leg === 'foreNear' ? 1 : -1;
}

/**
 * ★**胴体の高さを、接地している脚から求めます。**
 *
 *   ★接地している脚が多いほど**踏ん張って沈み**、★宙に浮くと**上がります**。
 *   ★重み `w` は接地の中央で 1・端で 0 の山なので、★境目で跳びません。
 *
 * 【⚠️ ★1 度目の作りは間違っていました（★2026-09-03）】
 *   ★最初は「★接地脚が届く高さ `√(脚長² − ずれ²)` の重み付き平均」にしました。
 *   ★**接地の端では重みが 0 に近く、高さが下がらないまま蹄だけが遠くへ行くため、
 *     ★脚が届かなくなりました**（★検定②が `1.223 倍` で落ちて分かりました）。
 *   → ★**届くかどうかは歩法の側で保証し**（`gaitFitsLegs`・検定⑤）、
 *     ★高さは ★**支えの量**から素直に出す形にしました。
 *   ★こうすると、★どの位相でも脚が届くことが**歩法の検定 1 つ**で言えます。
 */
function supportHeightM(
  input: DeformedPoseInput, legs: readonly DeformedLegId[], phase: number,
): number {
  const { contract } = input;
  const gait = input.gait ?? DEFORMED_GAIT_V0;
  let wSum = 0;
  for (const leg of legs) {
    wSum += legSupportWeight(legPhase(phase, leg, gait), gait);
  }
  const w = clamp(wSum, 0, 1);
  /**
   * ★**その組の脚の長さから高さを出します**（★2026-09-06 修正）。
   *
   * 【⚠️ ★何が壊れていたか】
   *   ★元は ★**`foreNear` の脚長だけ**を使い、★前も後ろも同じ高さを基準にしていました。
   *   ★`DEFORMED_HORSE_V0` は 4 本ともほぼ同じ長さ（0.78m）なので、★表に出ませんでした。
   *
   *   ★ところが**納品パーツから測った実寸**は、★前後で 15% 違います:
   *   　★前脚 **1.241 / 1.210m** ／ ★後脚 **1.082 / 1.099m**
   *   → ★後脚の付け根が ★**脚の長さより高く**置かれ、★接地とされた蹄が
   *     ★**最大 28cm 浮きました**（★レビュー裁定 2026-09-06 §1）。
   *   → ★`gaitFitsLegs`（検定⑤）は**脚ごと**に自分の長さで見ていたので、
   *     ★**判定と解法が食い違って**いました。★検定が通っても幾何が破れます。
   *
   * ★組の中でいちばん短い脚に合わせます（★長い方は曲げれば届く・短い方は届かない）。
   */
  let base = Number.POSITIVE_INFINITY;
  for (const leg of legs) base = Math.min(base, legReachM(contract.legs[leg]));
  base *= (input.standBend ?? DEFORMED_STAND_BEND);
  return base + DEFORMED_FLIGHT_RISE_M * (1 - w) - DEFORMED_STANCE_DIP_M * w;
}

/** ★脚を伸ばし切らないための余裕（★1.0 だと「棒」になる） */
const REACH_MARGIN = 0.94;

/**
 * ★**遊脚の蹄を、届く高さまで畳み上げます。**
 *
 * 【⚠️ ★これが無いと、遊脚で脚が伸び切ります（★2026-09-03・検定②が 1.149 倍で落ちた）】
 *   ★蹄を離した直後、★**体は前へ進むのに蹄はまだ後ろに残ります。**
 *   ★世界の足跡（着地 → 次の着地）を滑らかにすると、
 *   ★離地の直後に ★**付け根から 0.80m** 離れる瞬間ができます（★脚は 0.85m）。
 *   ★そこへ地面すれすれの小さな持ち上げしか与えていなかったので、★届きませんでした。
 *
 * 【★実馬も同じことをします】
 *   ★駆歩の馬は離地の直後に ★**脚を強く畳みます**（★蹄が腹の近くまで上がる）。
 *   ★「畳む」のは格好つけではなく、★**そうしないと脚が足りない**からです。
 *
 * → ★持ち上げ量を手で調整せず、★**幾何から必要なぶんだけ**足します。
 *   ★前後に離れているときほど自動的に高く畳まれ、★真下に来ると自然に降ります。
 * ⚠️ ★接地中（`natural` が 0 かつ届く）には効きません。
 */
function liftedToStayInReach(
  hip: { readonly x: number; readonly y: number },
  footX: number, natural: number, reach: number,
): number {
  const max = reach * REACH_MARGIN;
  const dx = footX - hip.x;
  const room = max * max - dx * dx;
  /** ★真横に離れすぎて解が無いときは、付け根の高さまで畳む（★起きない想定・検定⑤） */
  const lowest = room > 0 ? hip.y - Math.sqrt(room) : hip.y;
  return Math.max(natural, lowest);
}

/** ★着地の直後だけ立つ山（★潰れに使う） */
function landingImpulse(input: DeformedPoseInput, phase: number): number {
  const gait = input.gait ?? DEFORMED_GAIT_V0;
  const window = gait.duty * 0.35;
  let peak = 0;
  for (const leg of DEFORMED_LEG_IDS) {
    const u = legPhase(phase, leg, gait);
    if (u < window) peak = Math.max(peak, 1 - u / window);
  }
  return peak;
}

/**
 * ★**姿勢を求める**（★この便の中心）
 *
 *   ★入力は「進んだ距離・馬番・速さ」だけ。★★同じ入力なら常に同じ姿勢です。
 */
export function deformedPoseAt(input: DeformedPoseInput): DeformedPose {
  const { contract } = input;
  const gait = input.gait ?? DEFORMED_GAIT_V0;
  const phase = gaitPhase(input.travelM, input.gate, gait);

  /** ★前と後ろで別々に高さを出すので、★**胴体が自然に前後へ傾きます** */
  const foreH = supportHeightM(input, ['foreFar', 'foreNear'], phase);
  const hindH = supportHeightM(input, ['hindFar', 'hindNear'], phase);

  const foreHip = contract.legs.foreNear.hip;
  const hindHip = contract.legs.hindNear.hip;

  /**
   * ★**胴体を、2 つの付け根の高さから解きます。**
   *
   * 【⚠️ ★1 度目の作りは間違っていました（★2026-09-03・検定②が落ちて分かりました）】
   *   ★最初は「★傾き = 前後の高さの差」＋「★速さによる前傾」を**足して**から、
   *   ★胴体の高さを平均で置きました。★すると ★**前傾のぶん後脚の付け根が持ち上がり**、
   *   ★`hindFar` が脚長の **1.022 倍**を要求しました。
   *   ★つまり ★**傾けた結果、脚が地面に届かなくなっていた**のに、
   *   ★胴体の高さはそれを知りませんでした。
   *
   * → ★**付け根の高さを先に決め、胴体（高さと傾き）はそこから解きます。**
   *   ★未知数 2 つ（高さ・傾き）に式 2 つ（前の付け根・後の付け根）なので、1 つに決まります。
   *   ★これで ★**付け根は必ず狙った高さに来る**ので、届くかどうかは
   *   ★歩法の検定（⑤）だけで言い切れます。
   *
   * ★前傾は「★前の付け根を少し下げる」形で入れます（★§4-2「加速時の前傾」）。
   *   ★傾きを後から足さないので、★脚が届かなくなりません。
   */
  const leanDrop = LEAN_DROP_M * clamp(input.speedMps / LEAN_FULL_MPS, 0, 1);
  const foreTargetY = foreH - leanDrop;
  const dxHip = foreHip.x - hindHip.x;
  const dyHip = foreHip.y - hindHip.y;
  const hipSpan = Math.hypot(dxHip, dyHip);
  const alpha = Math.atan2(dyHip, dxHip);
  const pitch = Math.asin(clamp((foreTargetY - hindH) / hipSpan, -1, 1)) - alpha;
  const torsoY = foreTargetY - (foreHip.x * Math.sin(pitch) + foreHip.y * Math.cos(pitch));

  const impulse = landingImpulse(input, phase);
  const torso: DeformedPartTransform = {
    x: 0,
    y: torsoY,
    angleRad: pitch,
    scaleX: 1 + LANDING_SQUASH * impulse * 0.6,
    scaleY: 1 - LANDING_SQUASH * impulse,
  };

  /** ★胴体のピボットを中心に回した先の、実際の取り付け位置 */
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  const onTorso = (lx: number, ly: number): { x: number; y: number } => ({
    x: torso.x + lx * cos - ly * sin,
    y: torso.y + lx * sin + ly * cos,
  });

  const legs = {} as Record<DeformedLegId, DeformedLegSolve>;
  let support = 0;
  for (const leg of DEFORMED_LEG_IDS) {
    const bones = contract.legs[leg];
    const hip = onTorso(bones.hip.x, bones.hip.y);
    const footX = hoofLocalX(input.travelM, input.gate, leg, bones, gait);
    const footY = liftedToStayInReach(
      hip, footX, hoofY(input.travelM, input.gate, leg, bones, gait), legReachM(bones),
    );
    const solved = solveTwoBone(hip.x, hip.y, footX, footY, bones.upperM, bones.lowerM, bendSignOf(leg));
    const contact = legInContact(legPhase(phase, leg, gait), gait);
    if (contact) support += 1;
    legs[leg] = {
      leg,
      contact,
      hip,
      knee: { x: solved.kneeX, y: solved.kneeY },
      hoof: { x: footX, y: footY },
      extension: solved.extension,
    };
  }

  /**
   * ★**騎手** — ★腰は鞍に**直付け**（★浮きません）。
   *   ★頭の上下だけを `followRatio` まで抑えるため、★**背が上がるほど深くかがみます。**
   *   ★これが「上下は馬体より小さく」と「腰が浮かない」を同時に満たす形です。
   */
  const seat = onTorso(contract.saddle.x, contract.saddle.y);
  const standTorsoY = legReachM(contract.legs.foreNear) * DEFORMED_STAND_BEND - foreHip.y;
  const standSeatY = standTorsoY + contract.saddle.y;
  const jt = contract.jockey.torsoHeightM;
  /**
   * ⚠️ ★**深くかがませます**（★2026-09-03・オーナー評「論外」を受けて直したところ）。
   *   ★1 度目は `standHeadY = 座面 + 上体 × 0.94` ＝ ★**ほぼ直立**で、
   *   ★**棒が刺さっているように見えました**。★参考映像の騎手は ★**上体がほぼ水平**で、
   *   ★頭が馬の首の横まで前に出て、★尻だけが後ろ上に残ります。
   *   → ★頭は座面の **0.40 倍**しか上に来ません（★水平から約 24°）。
   */
  const standHeadY = standSeatY + jt * JOCKEY_CROUCH;
  const targetHeadY = standHeadY + (seat.y - standSeatY) * contract.jockey.followRatio;
  /** ★水平からの角。★背が上がるほど深くかがむので、頭の上下が抑えられます */
  const jockeyAngle = Math.asin(clamp((targetHeadY - seat.y) / jt, 0.16, 0.72));
  const jockeyHead = {
    x: seat.x + jt * Math.cos(jockeyAngle),
    y: seat.y + jt * Math.sin(jockeyAngle),
  };

  /** ★たてがみと尾は**遅れて**ついてきます（★同じ位相から、ずらすだけ） */
  const lagPhase = gaitPhase(input.travelM - HAIR_LAG * gait.strideM, input.gate, gait);
  const hairSwing = Math.sin(2 * Math.PI * lagPhase);
  const windLift = 0.35 * clamp(input.speedMps / LEAN_FULL_MPS, 0, 1);

  const neckRoot = onTorso(contract.neck.rootX, contract.neck.rootY);
  const neckAngle = 0.60 + pitch - 0.10 * hairSwing;
  const headPos = {
    x: neckRoot.x + contract.neck.lengthM * Math.cos(neckAngle),
    y: neckRoot.y + contract.neck.lengthM * Math.sin(neckAngle),
  };
  const tailRoot = onTorso(contract.tail.rootX, contract.tail.rootY);

  const at = (p: { x: number; y: number }, angleRad = 0): DeformedPartTransform =>
    ({ x: p.x, y: p.y, angleRad, scaleX: 1, scaleY: 1 });

  const parts: Record<DeformedPartName, DeformedPartTransform> = {
    shadow: { x: 0, y: 0, angleRad: 0, scaleX: 1 + 0.05 * impulse, scaleY: 1 },
    hindLegFarUpper: at(legs.hindFar.hip), hindLegFarLower: at(legs.hindFar.knee), hindHoofFar: at(legs.hindFar.hoof),
    foreLegFarUpper: at(legs.foreFar.hip), foreLegFarLower: at(legs.foreFar.knee), foreHoofFar: at(legs.foreFar.hoof),
    jockeyLegFar: at(seat, jockeyAngle), jockeyArmFar: at(seat, jockeyAngle),
    tail: at(tailRoot, Math.PI - 0.30 - windLift - 0.18 * hairSwing),
    torso,
    neck: at(neckRoot, neckAngle),
    mane: at(neckRoot, neckAngle - 0.22 * hairSwing - windLift * 0.5),
    head: at(headPos, neckAngle - 0.55),
    earFar: at(headPos, neckAngle - 0.20), earNear: at(headPos, neckAngle - 0.05),
    muzzle: at(headPos, neckAngle - 0.55),
    jockeyTorso: at(seat, jockeyAngle),
    jockeyHead: at(jockeyHead, jockeyAngle),
    hindLegNearUpper: at(legs.hindNear.hip), hindLegNearLower: at(legs.hindNear.knee), hindHoofNear: at(legs.hindNear.hoof),
    foreLegNearUpper: at(legs.foreNear.hip), foreLegNearLower: at(legs.foreNear.knee), foreHoofNear: at(legs.foreNear.hoof),
    jockeyLegNear: at(seat, jockeyAngle), jockeyArmNear: at(seat, jockeyAngle),
  };

  return { phase, supportCount: support, torso, legs, parts };
}

/**
 * ★**接地した蹄が、本当に地面にあるか**を、1 完歩を走査して測る（★2026-09-06）
 *
 * 【⚠️ ★なぜ `gaitFitsLegs` では足りないのか】
 *   ★`gaitFitsLegs`（`deformed-horse-rig.ts`）は ★**見積もり**です。
 *   ★腰の高さを `脚長 × standBend + 浮き` と置きますが、★実際は**胴体が傾く**ので
 *   ★もっと高く上がります。★実測（納品パーツの寸法）:
 *
 *   　★判定が見ている腰の高さ **0.862m** ／ ★実際の最大 **0.941m**（★8cm の差）
 *
 *   → ★そのため ★**判定が ○ でも蹄が 6cm 浮く**組み合わせが通っていました
 *     （★レビュー裁定 2026-09-06 §1・★開発側はそれに気づかず見た目を調整していました）。
 *
 * ★この関数は見積もりをやめ、★**実際に解いた姿勢**を数えます。
 * ⚠️ ★`gaitFitsLegs` は残します（★速い前検査）。★ただし**それだけでは不十分**です。
 */
export function worstContactFloatM(
  contract: DeformedHorseContract,
  gait: DeformedGait = DEFORMED_GAIT_V0,
  standBend: number = DEFORMED_STAND_BEND,
  samples = 720,
): { readonly floatM: number; readonly leg: DeformedLegId; readonly contacts: number } {
  let worst = 0;
  let worstLeg: DeformedLegId = DEFORMED_LEG_IDS[0];
  let contacts = 0;
  for (let k = 0; k < samples; k += 1) {
    const pose = deformedPoseAt({
      travelM: (k / samples) * gait.strideM, gate: 1, speedMps: 16, contract, gait, standBend,
    });
    for (const leg of DEFORMED_LEG_IDS) {
      const solved = pose.legs[leg];
      if (!solved.contact) continue;
      contacts += 1;
      const f = Math.abs(solved.hoof.y);
      if (f > worst) { worst = f; worstLeg = leg; }
    }
  }
  return { floatM: worst, leg: worstLeg, contacts };
}
