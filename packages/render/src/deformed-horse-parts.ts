/**
 * ★デフォルメ馬 — ★**部位の定義（暫定契約 v0）**
 *
 * 【★この層が何か】
 *   ★4 層分離の ★**①**（`REVIEW_REQUEST_P4_DEFORMED_RIG_20260903.md` §3-2）:
 *
 *     ★① パーツ定義（★このファイル）… 部位名 / 寸法 / 原点 / ピボット / 親子 / 描画順
 *          ↓ 読むだけ
 *     ★② リグ計算（`deformed-horse-rig.ts`）… 進行距離 → 位相 → 接地 → 蹄の世界座標
 *          ↓
 *     ★③ 姿勢モデル（`deformed-horse-pose.ts`）… ①②から各部位の変換値
 *          ↓ 姿勢だけを渡す
 *     ★④ 描画アダプタ（`deformed-horse-draw.ts`）… ★**ベクターか画像かの差は、ここだけ**
 *
 * 【⚠️ ★**これは「暫定契約 v0」です**（★2026-09-03・レビュー側裁定）】
 *   ★`schemaVersion: 0`。★**Gate 0B（動画）を見て修正してよい**寸法です。
 *   ★**オーナー承認後に v1 として固定**します。★v0 のまま Gate 1 の絵を起こしません
 *   （★原点が動くと絵が全部ずれるため）。
 *
 * 【★座標系】
 *   ★**メートル・x は進行方向が正・y は上が正・接地面が y = 0。**
 *   ⚠️ ★画面座標ではありません（★y が下向きになるのは ④ の中だけ）。
 *   ★部位の原点＝その部位の**ピボット**（回転の中心）です。
 *
 * 【★なぜ「絵」ではなく「数」で持つか】
 *   ★2026-08-13 の `DEV_INSTRUCTIONS_P4_ASSETS_20260813.md` A-3 が固定したのは
 *   ★**シートの契約**（フレーム寸法・列数・フレーム数・基準点）でした。
 *   ★関節・接地・パーツ姿勢は**絵の中**にあり、コードは持っていません。
 *   → ★今回固定するのは ★**骨組みの契約**です。
 *
 * 【★憲法】
 *   ★実在・他社の固有名称を含みません。★内部仮称は「STARミニホース」。
 *   ★色は 1 つも持ちません（★役割名だけ・`palette.json` が唯一の色定義 = 裁定 7）。
 */

/** ★部位名。★**この並びが描画順**（先＝奥） */
export const DEFORMED_PART_NAMES = [
  'shadow',
  'hindLegFarUpper', 'hindLegFarLower', 'hindHoofFar',
  'foreLegFarUpper', 'foreLegFarLower', 'foreHoofFar',
  'jockeyLegFar', 'jockeyArmFar',
  'tail',
  'torso',
  'neck', 'mane', 'head', 'earFar', 'earNear', 'muzzle',
  'jockeyTorso', 'jockeyHead',
  'hindLegNearUpper', 'hindLegNearLower', 'hindHoofNear',
  'foreLegNearUpper', 'foreLegNearLower', 'foreHoofNear',
  'jockeyLegNear', 'jockeyArmNear',
] as const;

export type DeformedPartName = (typeof DEFORMED_PART_NAMES)[number];

/** ★脚は 4 本。★手前 / 奥 × 前 / 後 */
export const DEFORMED_LEG_IDS = ['hindFar', 'hindNear', 'foreFar', 'foreNear'] as const;
export type DeformedLegId = (typeof DEFORMED_LEG_IDS)[number];

/** ★色の役割名。⚠️ ★**16 進を持ちません**（裁定 7・`palette.json` から引く） */
export type DeformedPaintRole =
  | 'coat' | 'coatShade' | 'coatLight'
  | 'mane' | 'hoof' | 'muzzle' | 'eye' | 'outline'
  | 'silk' | 'cap' | 'skin' | 'boot' | 'saddle'
  | 'shadow' | 'numberCloth' | 'numberInk';

/** ★1 本の脚の骨。★**長さは位相に依らず不変**（検定②が見ています） */
export interface DeformedLegBones {
  /** ★上の骨（腿）の長さ [m] */
  readonly upperM: number;
  /** ★下の骨（脛）の長さ [m] */
  readonly lowerM: number;
  /** ★付け根の位置（★胴体のピボットからの相対・[m]） */
  readonly hip: { readonly x: number; readonly y: number };
  /**
   * ★**着地点の前後の寄せ** [m]。⚠️ ★**付け根から測ります**（★胴体からではありません）。
   *
   * 【★なぜ付け根基準か — ★最初これを間違えました】
   *   ★接地の間、蹄は付け根の前から後ろへ ★`duty × stride` だけ掃きます。
   *   ★着地点を**胴体基準**で置くと、★掃き終わりが**脚の届く範囲の外**に出ます
   *   （★実際 v0 の数で `|dx| = 1.44m` に対し脚は 0.72m しかなく、★破れました）。
   *   → ★着地点は ★**付け根の真下 ± 掃き幅の半分**が基準。★この値はそこからの寄せだけです。
   *   ★前脚は前へ気持ち多く、★後脚は後ろへ気持ち多く踏む差を作ります。
   *
   * ⚠️ ★大きくすると ★**接地の端で脚が伸び切ります**（★検定⑤が止めます）。
   */
  readonly plantBiasM: number;
  /** ★遊脚で蹄が上がる高さ [m] */
  readonly liftM: number;
  /**
   * ★**宙にある間、蹄が掃き幅より外へ伸びる量** [m]（★省略＝0 で従来どおり）
   *
   * 【⚠️ ★なぜ要るか（★2026-09-06・オーナー評「北海道の道産子」）】
   *   ★従来の遊脚は、★蹄が**付け根の前後 `掃き幅の半分` の中しか動きません**。
   *   ★承認済みの原画を実測すると:
   *
   *     ★4 本すべての脚の伸び切り率 … ★**0.985 〜 1.000**（★完全に伸び切っている）
   *     ★前後の蹄の開き ............... ★**1.513 m**
   *     ★掃き幅（歩幅 4.60 × 接地 0.17） ★**0.782 m**
   *
   *   ★つまり原画は ★**宙に浮いて四肢が伸び切った瞬間**を描いており、
   *   ★従来の遊脚はそこで ★**脚を体の下へ畳んで**いました。★別の体型に見えます。
   *
   * 【★どう入れるか — ★接地には 1 mm も触りません】
   *   ★遊脚の中だけ `−overreachM × sin(2πv)` を足します（★`v` は遊脚内の 0〜1）。
   *   ★`v = 0`（★離地）と `v = 1`（★着地）で **0** なので、
   *   ★**離地点も着地点も動きません** → ★滑り 0 の保証（検定①）はそのまま成り立ちます。
   *   ★`v = 0.25` で後ろへ、★`v = 0.75` で前へ伸びます（★離地直後に後ろ、着地直前に前）。
   *
   * ⚠️ ★水平に伸ばせるのは ★**蹄が浮いているから**です。★接地中は掃き幅が上限で、
   *    ★そこは `gaitFitsLegs`（検定⑤）が引き続き見ています。
   */
  readonly overreachM?: number | undefined;
}

export interface DeformedHorseContract {
  /** ⚠️ ★**0 = 暫定契約。** ★オーナー承認で 1 へ */
  readonly schemaVersion: 0;
  /** ★内部仮称（裁定 5）。⚠️ ★最終名称はオーナー判断待ち */
  readonly codeName: 'STARミニホース';
  /** ★接地面から騎手の頭頂まで [m] */
  readonly totalHeightM: number;
  /** ★胴体（横長の楕円）[m] */
  readonly torso: {
    readonly lengthM: number;
    readonly heightM: number;
    /** ★立っているときの胴体ピボットの高さ [m] */
    readonly standCentreY: number;
  };
  readonly head: { readonly lengthM: number; readonly heightM: number };
  readonly neck: { readonly rootX: number; readonly rootY: number; readonly lengthM: number; readonly thicknessM: number };
  readonly tail: { readonly rootX: number; readonly rootY: number; readonly lengthM: number };
  /** ★騎手が座る位置（★胴体ピボットからの相対）*/
  readonly saddle: { readonly x: number; readonly y: number };
  readonly jockey: {
    readonly torsoHeightM: number;
    readonly headRadiusM: number;
    readonly armLengthM: number;
    readonly legLengthM: number;
    /** ★騎手の上下は胴体の何倍か。⚠️ ★**同位相**（§4-3「別々の周期で上下しない」） */
    readonly followRatio: number;
  };
  readonly legs: Readonly<Record<DeformedLegId, DeformedLegBones>>;
  /** ★蹄の大きさ [m]（★§3-1「脚より一段大きく、接地が読める形」） */
  readonly hoof: { readonly widthM: number; readonly heightM: number };
  /** ★接地影 */
  readonly shadow: { readonly widthM: number; readonly heightM: number };
}

/**
 * ★**暫定契約 v0**
 *
 * 【★寸法の狙い（指示書 §3-1）】
 *   ★脚の見かけ長 … ★**全高の 41%**（★実馬は約 60%）＝ 短脚
 *   ★頭の高さ    … ★**胴体高の 55%**（指示書「胴体高の 45〜55%」の上限）
 *   ★胴体        … ★横長の楕円。★脚より大きな質量として読む
 *   ★蹄          … ★脚の太さより一段大きい
 *
 * 【⚠️ ★寸法を決めるときに出た制約 — ★**リグにしたから見えました**】
 *   ★接地中、蹄は ★**1 完歩の `duty` 割だけ後ろへ掃きます**（= `duty × stride`）。
 *   ★その掃き幅の半分が、★**脚の届く範囲（`upper + lower`）を超えられません。**
 *
 *     ★掃き幅 = duty × stride ／ ★片側 = 掃き幅 ÷ 2 ≦ (upper + lower) × 0.95
 *
 *   ★**短い脚では、長いストライドを物理的に出せません。**
 *   ★逆にストライドを詰めると ★**1 秒あたりの完歩が増え、30fps では足りなくなります**
 *   （★16m/s のとき: stride 6.0m → 2.7 完歩/秒 → 11.2 コマ/完歩）。
 *   → ★この釣り合いは ★**Gate 0B で目で決める値**です。★`deformed-horse-rig.ts` の
 *     `DEFORMED_GAIT_V0` に置き、★検定⑤が幾何の破れを止めます。
 */
export const DEFORMED_HORSE_V0: DeformedHorseContract = {
  schemaVersion: 0,
  codeName: 'STARミニホース',
  totalHeightM: 1.10,
  /**
   * ★**長く薄い胴**（★高さ ÷ 長さ = 0.41）。
   * ⚠️ ★1 度目は 0.64（★ほぼ丸）にして ★**「馬に見えない」**と差し戻されました。
   *    ★参考映像の胴は ★**水平方向に長く、背線がほぼまっすぐ**です。
   */
  torso: { lengthM: 1.32, heightM: 0.54, standCentreY: 0.548 },
  /** ★**長い楔**（★長さ ÷ 深さ = 1.9）。⚠️ ★丸い頭は犬になります */
  head: { lengthM: 0.50, heightM: 0.26 },
  /**
   * ★**長く前へ伸びる首**。⚠️ ★1 度目は短く上向き（0.34m・34°）で、★頭が胴に埋もれていました。
   *   ★参考映像では ★**首と頭で、胸の前へ胴の半分ぶん**ほど届いています。
   */
  neck: { rootX: 0.54, rootY: 0.16, lengthM: 0.50, thicknessM: 0.30 },
  /** ★速さでほぼ水平に流れる尾 */
  tail: { rootX: -0.62, rootY: 0.14, lengthM: 0.52 },
  saddle: { x: -0.04, y: 0.26 },
  jockey: {
    torsoHeightM: 0.44,
    headRadiusM: 0.135,
    armLengthM: 0.38,
    legLengthM: 0.30,
    /** ★胴体の上下の 0.40 倍。★§4-2「騎手の上下を馬体より小さくする追従」 */
    followRatio: 0.40,
  },
  legs: {
    hindFar: { upperM: 0.40, lowerM: 0.38, hip: { x: -0.50, y: -0.06 }, plantBiasM: -0.05, liftM: 0.16 },
    hindNear: { upperM: 0.40, lowerM: 0.38, hip: { x: -0.46, y: -0.06 }, plantBiasM: -0.05, liftM: 0.16 },
    foreFar: { upperM: 0.39, lowerM: 0.39, hip: { x: 0.44, y: -0.08 }, plantBiasM: 0.05, liftM: 0.18 },
    foreNear: { upperM: 0.39, lowerM: 0.39, hip: { x: 0.48, y: -0.08 }, plantBiasM: 0.05, liftM: 0.18 },
  },
  /** ★蹄（★脚が細いので、蹄で接地を読ませる）*/
  hoof: { widthM: 0.11, heightM: 0.075 },
  shadow: { widthM: 1.50, heightM: 0.15 },
};

/** ★脚の届く最大長 [m]（★上の骨 + 下の骨）。★**位相に依らず不変** */
export function legReachM(bones: DeformedLegBones): number {
  return bones.upperM + bones.lowerM;
}

/**
 * ★立っているときの、★**脚を伸ばし切った長さに対する付け根の高さの比**。
 *
 * 【⚠️ ★0.89 → 0.72 に下げました（★2026-09-03・★検定が落ちて分かりました）】
 *   ★最初 0.89（★ほぼ伸ばした姿勢）にしたところ、★**接地の端で脚が届かなくなりました**
 *   （★`hindFar` の伸び 1.223 = 脚の長さの 1.2 倍を要求）。
 *   ★理由は単純で、★**付け根が高いほど、前後に伸ばせる余地が減る**からです:
 *
 *     ★前後に伸ばせる幅 = √(脚長² − 付け根の高さ²)
 *
 *   ★付け根 0.89 → 前後は 0.46 倍しか取れず、★0.72 なら 0.69 倍取れます。
 *   → ★**短い脚のデフォルメ馬は、しゃがんだ姿勢でなければ歩幅が出ません。**
 *   ⚠️ ★これは造形の趣味ではなく ★**幾何の要求**です。★上げるなら歩幅を詰めること。
 */
export const DEFORMED_STAND_BEND = 0.60;

/** ★宙に浮いている間に胴体が上がる量 [m] */
export const DEFORMED_FLIGHT_RISE_M = 0.05;
/** ★接地して踏ん張っている間に胴体が沈む量 [m] */
export const DEFORMED_STANCE_DIP_M = 0.05;

export function standingTorsoCentreY(contract: DeformedHorseContract): number {
  const fore = contract.legs.foreNear;
  return legReachM(fore) * DEFORMED_STAND_BEND - fore.hip.y;
}
