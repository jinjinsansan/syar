import { CROWD_ACCENT_COLORS } from './crowd.js';
import { DISTANCE_POLE_STYLE, type DistancePoleStyle } from './distance-poles.js';
import { FINISH_POST_STYLE, type FinishMarkerStyle } from './finish-post.js';
import type { TracksideFlagStyle } from './trackside-flags.js';
import { MOW_STRIPE_ALPHA, MOW_STRIPE_PERIOD_M } from './mow-stripes.js';
import type { NarratorCast } from './narrator.js';
import { GATE_WORLD_STYLE, type StartingGateStyle } from './starting-gate-world.js';
import type { VenueSceneryKind } from './venue-scenery.js';

/**
 * ★**競馬場ごとの見た目**（★2026-09-15・★オーナー「レース演出を 50 会場に増やす」）
 *
 * 【★何を置くか】★着順に効かない ★**見た目だけ**の値です（★ゲート・ゴールの目印・距離標・芝の刈り模様・観客・実況者・紹介 1 行・コース脇の旗・コース図の色）。
 *   ★走路の形・回り・距離は `@star/scheduler` の `venues.ts` が持ちます（★着順に効くので別の場所）。
 *
 * 【★なぜ 1 か所か】★画面・監査道具・検査が ★**同じ表から引く**ためです（★R-30 / D-052）。
 *   ★レビュー側の回答（`REVIEW_CONSULT_RACE_50_VENUES_ANSWER_20260915.md` §6-2）:
 *   > ★1 つの解決関数で引き、画面・監査道具・検査が共有する。
 *
 * 【★どう決めたか】⚠️ ★**開発側の仮の値**です（★オーナー判断 2026-09-15「デザイナーの回答を待たずに作る」）。
 *   ★場ごとの ★**主題**（`theme`）に合う色を 1 組ずつ選び、★形は 3 通りを散らしました。
 *   ★デザイナー側（R-9 の Q-D2・Q-D3）の数字が届いたら、★この表の値を差し替えます。
 *   ★計画書 `PLAN_RACE_50_VENUES_IDEAS_20260915.md` §2 の V-1〜V-9。
 *   ⚠️ ★主題は ★**名前の文字列から引いていません**（★この表の明示のフィールド・回答 §3-1）。
 *   ⚠️ ★実在の競馬場・団体・メーカーの意匠を写していません（★憲法 §0.1）。★色と簡単な形だけです。
 *      ★「回り＋直線＋主題の組が実在の場を一対一で指させないか」は ★**機械で検査できません** — ★オーナーの確認を経て、ここに日付を残すこと。
 *
 * ⚠️ ★**スターパーク競馬場は既定のまま**です（★既定の 1 鞍の画面を変えない）。★実況者も ★シード 42 で選ばれていた人（d）です。
 *    ★旗も立てません（`flags` を持たない）。
 */

export interface VenueLook {
  readonly venueId: string;
  /** ★景色の主題（★人が読むための 1 語。★描画はこれを読みません） */
  readonly theme: string;
  /**
   * ★**景色の主題**（★タイトルカードの遠景・場の紋・霧・2026-09-15・計画書 V-13 / V-15）。★描画はこちらを読みます（★`theme` の文字列からは引かない）。
   * ⚠️ ★スターパークは `default`（★何も描かない）。
   */
  readonly scenery: VenueSceneryKind;
  /**
   * ★**イントロの場紹介の 1 行**（★数値は画面が `venues.ts` から付けるので、★ここは言葉だけ）。
   * ⚠️ ★「いちばん長い直線」などの最上級は ★`apps/cli/test/venue-look.test.ts` が `VENUES` の数値と突き合わせます。
   * ⚠️ ★回り（左回り・右回り）は書きません（★画面が `venues.ts` から付けるので二重になる）。
   */
  readonly feature: string;
  /** ★実況者（★場ごとに固定・「この場はこの声」） */
  readonly cast: NarratorCast;
  readonly gate: StartingGateStyle;
  readonly finish: {
    /**
     * ★横視点のゴールの目印を ★**板の絵**（全場共有の審判塔）で出すか、★**コードの形**で出すか。
     * ⚠️ ★`code` のとき、画面は板の絵の `finish-tower` を読みません（★二重に立たないように）。
     */
    readonly sideView: 'bitmap' | 'code';
    readonly style: FinishMarkerStyle;
  };
  readonly poles: DistancePoleStyle;
  /** ★芝の刈り模様（★縞 1 本の実寸 m と濃さ） */
  readonly mow: { readonly periodM: number; readonly alpha: number };
  /** ★観客の服の差し色 4 色 */
  readonly crowdAccents: readonly string[];
  /** ★コース脇の旗（★内ラチの内側に 40m ごと・省くと立てない） */
  readonly flags?: TracksideFlagStyle | undefined;
  /** ★コース図カットイン（★コーナーの覆い）の走路の色と決勝線の色（★省くと従来） */
  readonly courseMap?: { readonly track: string; readonly goal: string } | undefined;
  /**
   * ★**ダートの砂の色味**（★計画書 V-12・2026-09-15）。★ダート戦のときだけ地面の層に重ねます。★省くと従来の砂色。
   * ⚠️ ★濃さは `ATMOSPHERE_TINT_MAX` の 2 倍まで（★砂の色そのものを変えるので季節より強い・検査で固定）。
   */
  readonly dirtTint?: { readonly color: string; readonly alpha: number } | undefined;
}

export const VENUE_LOOKS: readonly VenueLook[] = [
  {
    venueId: 'star-park', theme: '基準', scenery: 'default', feature: '基準のコース', cast: 'd',
    gate: GATE_WORLD_STYLE,
    finish: { sideView: 'bitmap', style: FINISH_POST_STYLE },
    poles: DISTANCE_POLE_STYLE,
    mow: { periodM: MOW_STRIPE_PERIOD_M, alpha: MOW_STRIPE_ALPHA },
    crowdAccents: CROWD_ACCENT_COLORS,
  },
  {
    venueId: 'tenga', theme: '星空と川', scenery: 'stars-river', feature: '10場でいちばん長い直線。長い追い比べ', cast: 'b',
    gate: {
      colors: {
        frame: '#cfd8e8', frameShade: '#7c8aa6', panel: '#aab6cc', panelShade: '#6d7a94',
        door: '#e8eef8', plate: '#1d2b4f', plateText: '#f4f1e2', base: '#3b4458', accent: '#e2c46a', canopy: '#2a3a62',
      },
      canopy: true,
    },
    finish: { sideView: 'code', style: { shape: 'disc', colors: { post: '#dfe6f2', postShade: 'rgba(20,28,52,.45)', board: '#1d2b4f', line: '#f2f5ee', accent: '#e2c46a' } } },
    poles: { pole: '#eef1f7', poleShade: 'rgba(20,28,52,.45)', plate: '#1d2b4f', plateText: '#f4f1e2', band: '#e2c46a' },
    mow: { periodM: 12, alpha: 0.11 },
    crowdAccents: ['#2a3a62', '#e2c46a', '#3d648f', '#7c8aa6'],
    flags: { pole: '#dfe6f2', colors: ['#1d2b4f', '#e2c46a'] },
    courseMap: { track: '#3a4a6e', goal: '#e2c46a' },
  },
  {
    venueId: 'aone', theme: '山並み', scenery: 'mountains', feature: '山あいのコース。短めの直線で小気味よい攻防', cast: 'c',
    gate: {
      colors: {
        frame: '#d3e0dc', frameShade: '#7f9892', panel: '#a9c2bb', panelShade: '#6e8a83',
        door: '#eaf2ef', plate: '#f2f2ee', plateText: '#1d3a33', base: '#44524e', accent: '#3f7a6b',
      },
      plateScale: 1.2,
    },
    finish: { sideView: 'code', style: { shape: 'board', colors: { post: '#e3ece8', postShade: 'rgba(18,40,34,.4)', board: '#1d3a33', line: '#f2f5ee', accent: '#8fc2b3' } } },
    poles: { pole: '#eef3f1', poleShade: 'rgba(18,40,34,.45)', plate: '#1d3a33', plateText: '#eef3f1', band: '#3f7a6b' },
    mow: { periodM: 8, alpha: 0.10 },
    crowdAccents: ['#3f7a6b', '#48664a', '#8fc2b3', '#a04a44'],
    flags: { pole: '#e3ece8', colors: ['#3f7a6b', '#f2f2ee'] },
    courseMap: { track: '#3f6b5e', goal: '#8fc2b3' },
  },
  {
    venueId: 'shirasuna', theme: '白い砂', scenery: 'white-dunes', feature: 'ダートの本場。10場でいちばん短い直線', cast: 'a',
    gate: {
      colors: {
        frame: '#efe6d2', frameShade: '#a8987a', panel: '#dccfb2', panelShade: '#9e8e70',
        door: '#f7f1e3', plate: '#b4552f', plateText: '#fbf4e6', base: '#6a5b48', accent: '#b4552f', canopy: '#d9c9a6',
      },
      canopy: true,
    },
    finish: { sideView: 'code', style: { shape: 'gantry', colors: { post: '#f3ead8', postShade: 'rgba(80,60,36,.4)', board: '#b4552f', line: '#f2f5ee', accent: '#fbf4e6' } } },
    poles: { pole: '#f7f1e3', poleShade: 'rgba(80,60,36,.4)', plate: '#b4552f', plateText: '#fbf4e6', band: '#b4552f' },
    mow: { periodM: 10, alpha: 0.08 },
    crowdAccents: ['#b4552f', '#d9c9a6', '#b2882f', '#6a5b48'],
    flags: { pole: '#f3ead8', colors: ['#b4552f', '#f7f1e3'] },
    courseMap: { track: '#8a6a48', goal: '#fbf4e6' },
    /** ★「白い砂」の主題（★ダート戦だけ・砂を白っぽく） */
    dirtTint: { color: '#f3ead6', alpha: 0.22 },
  },
  {
    venueId: 'shiokaze', theme: '海', scenery: 'sea', feature: '海沿いのコース。短い直線で粘り合い', cast: 'a',
    gate: {
      colors: {
        frame: '#e9eef2', frameShade: '#8d9aa6', panel: '#c1ccd6', panelShade: '#7f8c99',
        door: '#f4f7fa', plate: '#1f4e79', plateText: '#ffffff', base: '#3d4a57', accent: '#1f4e79',
      },
    },
    finish: { sideView: 'code', style: { shape: 'disc', colors: { post: '#eef3f7', postShade: 'rgba(20,40,64,.4)', board: '#1f4e79', line: '#f2f5ee', accent: '#ffffff' } } },
    poles: { pole: '#f4f7fa', poleShade: 'rgba(20,40,64,.4)', plate: '#1f4e79', plateText: '#ffffff', band: '#1f4e79' },
    mow: { periodM: 9, alpha: 0.10 },
    crowdAccents: ['#1f4e79', '#3d8fb8', '#e9eef2', '#a04a44'],
    flags: { pole: '#eef3f7', colors: ['#1f4e79', '#ffffff'] },
    courseMap: { track: '#2f5f86', goal: '#ffffff' },
  },
  {
    venueId: 'tsukimi', theme: '丘と月', scenery: 'hill-moon', feature: '10場でいちばん小さい小回りコース', cast: 'b',
    gate: {
      colors: {
        frame: '#d9d6e4', frameShade: '#8a86a0', panel: '#b7b2cc', panelShade: '#77728f',
        door: '#eeecf5', plate: '#2c2a4a', plateText: '#f1d98a', base: '#45425a', accent: '#caa84a', canopy: '#3a3760',
      },
      canopy: true, plateScale: 1.15,
    },
    finish: { sideView: 'code', style: { shape: 'disc', colors: { post: '#e4e1ee', postShade: 'rgba(36,32,64,.45)', board: '#2c2a4a', line: '#f2f5ee', accent: '#caa84a' } } },
    poles: { pole: '#eeecf5', poleShade: 'rgba(36,32,64,.45)', plate: '#2c2a4a', plateText: '#f1d98a', band: '#caa84a' },
    mow: { periodM: 7, alpha: 0.10 },
    crowdAccents: ['#2c2a4a', '#caa84a', '#77728f', '#a04a44'],
    flags: { pole: '#e4e1ee', colors: ['#2c2a4a', '#caa84a'] },
    courseMap: { track: '#4a4670', goal: '#f1d98a' },
  },
  {
    venueId: 'ginrei', theme: '雪山', scenery: 'snow-peaks', feature: '雪山を望む大きめのコース', cast: 'c',
    gate: {
      colors: {
        frame: '#e4eaee', frameShade: '#9aa6ae', panel: '#cad3da', panelShade: '#8c98a1',
        door: '#f6f9fb', plate: '#f6f9fb', plateText: '#2a3a48', base: '#56616a', accent: '#6f9fc4', canopy: '#dfe8ef',
      },
      canopy: true,
    },
    finish: { sideView: 'code', style: { shape: 'gantry', colors: { post: '#eef3f6', postShade: 'rgba(40,58,72,.4)', board: '#6f9fc4', line: '#f2f5ee', accent: '#ffffff' } } },
    poles: { pole: '#f6f9fb', poleShade: 'rgba(40,58,72,.4)', plate: '#2a3a48', plateText: '#f6f9fb', band: '#6f9fc4' },
    mow: { periodM: 14, alpha: 0.09 },
    crowdAccents: ['#6f9fc4', '#dfe8ef', '#3d648f', '#9aa6ae'],
    flags: { pole: '#eef3f6', colors: ['#6f9fc4', '#f6f9fb'] },
    courseMap: { track: '#5f7f9a', goal: '#ffffff' },
  },
  {
    venueId: 'youkou', theme: '高台の日差し', scenery: 'highland-sun', feature: '高台のコース。10場でいちばん深いコーナー', cast: 'd',
    gate: {
      colors: {
        frame: '#f1e3c8', frameShade: '#b08e5a', panel: '#e3c796', panelShade: '#a98450',
        door: '#fbf3e2', plate: '#e08a2e', plateText: '#ffffff', base: '#6e5436', accent: '#e08a2e',
      },
    },
    finish: { sideView: 'code', style: { shape: 'board', colors: { post: '#f6ead2', postShade: 'rgba(96,66,30,.4)', board: '#e08a2e', line: '#f2f5ee', accent: '#ffffff' } } },
    poles: { pole: '#fbf3e2', poleShade: 'rgba(96,66,30,.4)', plate: '#8a4d12', plateText: '#fbf3e2', band: '#e08a2e' },
    mow: { periodM: 11, alpha: 0.12 },
    crowdAccents: ['#e08a2e', '#d9a441', '#a04a44', '#b2882f'],
    flags: { pole: '#f6ead2', colors: ['#e08a2e', '#fbf3e2'] },
    courseMap: { track: '#8a6a3a', goal: '#ffd28a' },
  },
  {
    venueId: 'kirigahara', theme: '霧', scenery: 'fog', feature: '霧の立つコース。長めの直線', cast: 'a',
    gate: {
      colors: {
        frame: '#cfd6cf', frameShade: '#869186', panel: '#aeb8ad', panelShade: '#758074',
        door: '#e6ebe5', plate: '#3e5a48', plateText: '#eef2ea', base: '#474f47', accent: '#6c8a62',
      },
      plateScale: 1.1,
    },
    finish: { sideView: 'code', style: { shape: 'board', colors: { post: '#dde3dc', postShade: 'rgba(30,44,34,.4)', board: '#3e5a48', line: '#f2f5ee', accent: '#b9cdb0' } } },
    poles: { pole: '#e6ebe5', poleShade: 'rgba(30,44,34,.45)', plate: '#3e5a48', plateText: '#eef2ea', band: '#6c8a62' },
    mow: { periodM: 10, alpha: 0.07 },
    crowdAccents: ['#6c8a62', '#b9cdb0', '#48664a', '#869186'],
    flags: { pole: '#dde3dc', colors: ['#3e5a48', '#b9cdb0'] },
    courseMap: { track: '#56705c', goal: '#e6ebe5' },
  },
  {
    venueId: 'ookawara', theme: '大河', scenery: 'great-river', feature: '10場でいちばん大きいコース。長距離の舞台', cast: 'b',
    gate: {
      colors: {
        frame: '#d6e4e4', frameShade: '#7f9b9b', panel: '#b0c9c9', panelShade: '#6f8d8d',
        door: '#edf5f5', plate: '#1f6a6a', plateText: '#ffffff', base: '#3f5252', accent: '#1f6a6a', canopy: '#cfe0e0',
      },
      canopy: true,
    },
    finish: { sideView: 'code', style: { shape: 'gantry', colors: { post: '#e3eeee', postShade: 'rgba(20,60,60,.4)', board: '#1f6a6a', line: '#f2f5ee', accent: '#ffffff' } } },
    poles: { pole: '#edf5f5', poleShade: 'rgba(20,60,60,.4)', plate: '#1f6a6a', plateText: '#ffffff', band: '#1f6a6a' },
    mow: { periodM: 16, alpha: 0.10 },
    crowdAccents: ['#1f6a6a', '#3d8f8f', '#b2882f', '#3d648f'],
    flags: { pole: '#e3eeee', colors: ['#1f6a6a', '#edf5f5'] },
    courseMap: { track: '#2f7272', goal: '#ffffff' },
  },
];

/**
 * ★競馬場の id から見た目を引く。★**知らない id は投げます**（★黙って既定の見た目へ落とさない・R-27）。
 *   ★画面は `raceSetupFromParam` が既に既定の鞍へ落としているので、ここに来る id は常に実在の場です。
 */
export function venueLookOf(venueId: string): VenueLook {
  const look = VENUE_LOOKS.find((v) => v.venueId === venueId);
  if (look === undefined) throw new Error(`競馬場の見た目がありません: ${venueId}`);
  return look;
}

/**
 * ★**格の雰囲気**（★2026-09-15・計画書 R-1 / R-8）。★鍵は `'G1' | 'G2' | 'G3'`（★`@star/scheduler` の `Grade` と同じ文字列）。
 *
 *   ★`emptyRatio`      … 観客席の空席の割合（★G2 は従来の既定 0.1）。★G1 は満員、★G3 はやや空く。
 *   ★`edgeTint`        … 勝ち馬の帯の上縁の色（★G1 は `undefined` ＝ 従来の金のまま）。
 *   ★`roman`           … イントロの英字（GRADE I / II / III）。
 *   ★`fanfareGain`     … ファンファーレの強さの倍率（★`RACE_SOUNDS.fanfare.gain` に掛ける・★G2 は 1＝従来）。
 *   ★`fanfareFadeSec`  … ゲートが開くときに絞る長さ（★G2 は従来の 1.2 秒。★G1 は余韻を長く残す）。
 * ⚠️ ★G3 を寂しく見せすぎないこと（★レビュー側の回答 §5 条件 5）。★数値はすべて開発側の仮置きです。
 * ⚠️ ★賞金ポイントの額を強調しません（★正典 §12.7）。★格・馬名・勝負服で見せます。
 */
export const GRADE_LOOKS: Readonly<Record<'G1' | 'G2' | 'G3', {
  readonly emptyRatio: number; readonly edgeTint: string | undefined; readonly roman: string;
  readonly fanfareGain: number; readonly fanfareFadeSec: number;
}>> = {
  G1: { emptyRatio: 0.03, edgeTint: undefined, roman: 'I', fanfareGain: 1.2, fanfareFadeSec: 2.6 },
  G2: { emptyRatio: 0.10, edgeTint: '#c9d1d9', roman: 'II', fanfareGain: 1.0, fanfareFadeSec: 1.2 },
  G3: { emptyRatio: 0.18, edgeTint: '#c08a5a', roman: 'III', fanfareGain: 0.85, fanfareFadeSec: 0.9 },
};
