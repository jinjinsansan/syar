/**
 * NPC 厩舎（牧場）の定義 — 正典 §10.5 / DEV_INSTRUCTIONS_P15 N-1
 *
 * 【何のためにあるか】
 *   §10.5 は NPC に**個性**と**冠名**を求める。冠名があると
 *   「あの牧場の血は買い」というプレイヤー知識＝メタが生まれる。
 *   個性が無いと 40 厩舎が同じ馬を作り、種牡馬プールが一系統に潰れる（N-4 の分散基準に落ちる）。
 *
 * 【憲法 §0.1】
 *   冠名はすべて**この場で造語したもの**。実在の牧場名・実在の冠名・他社製品の固有名称から取らない。
 *   音節を機械的に並べただけの語で、意味を持たせていない。
 *
 * 【R-15】
 *   この表は「入っているが使われない」状態で先に入れる。プリシード（N-2）から参照する前に
 *   一度コミットしておくと、接続の前後で対照が取れる。
 */

import type { AbilityKey } from './types.js';

/** 厩舎が狙う距離帯。プリシードの配合と調教方針の両方に効く */
export type DistanceBias = 'sprint' | 'mile' | 'middle' | 'stayer';

/** 厩舎が狙う馬場。'both' は特化しない */
export type SurfaceBias = 'turf' | 'dirt' | 'both';

/** 成長型。⚠️ P1.5 時点でエンジンに成長曲線は無い（正典 §7 未確定）。方針として保持だけする */
export type GrowthBias = 'early' | 'normal' | 'late';

export interface StablePolicy {
  /** 冠名（馬名の接頭辞）。プレイヤーが血統を見分ける手掛かりになる */
  readonly prefix: string;
  readonly distance: DistanceBias;
  readonly surface: SurfaceBias;
  readonly growth: GrowthBias;
  /** 道悪巧者を志向するか（heavy_aptitude を選抜基準に含める） */
  readonly heavy: boolean;
  /**
   * 調教で伸ばす能力。null は「バランス型」。
   * 正典 §10.5「厩舎方針は調教AIの選択に反映される」の入力。
   */
  readonly emphasis: AbilityKey | null;
}

export interface Stable extends StablePolicy {
  /** 安定した識別子。冠名を変えても血統の追跡が切れないよう分離する */
  readonly id: string;
}

/** 距離方針 → 狙う距離適性の中心値（m）。正典 §8.2 の距離帯に合わせる */
export const DISTANCE_BIAS_CENTER: Readonly<Record<DistanceBias, number>> = {
  sprint: 1300,
  mile: 1700,
  middle: 2100,
  stayer: 2900,
};

/**
 * NPC 厩舎 40。
 * 【分散の設計】距離4 × 馬場3 = 12 の組を一巡させたうえで、成長型・道悪・調教方針をずらす。
 *   一系統に偏らせないための**設計上の意図**であって、実際に分散したかは N-4 で測る（R-16）。
 */
export const NPC_STABLES: readonly Stable[] = [
  { id: 'NPC01', prefix: 'ヴェルナ', distance: 'sprint', surface: 'turf', growth: 'early', heavy: false, emphasis: 'sp' },
  { id: 'NPC02', prefix: 'コルニス', distance: 'sprint', surface: 'dirt', growth: 'early', heavy: true, emphasis: 'pw' },
  { id: 'NPC03', prefix: 'ミラハト', distance: 'sprint', surface: 'both', growth: 'normal', heavy: false, emphasis: 'sp' },
  { id: 'NPC04', prefix: 'テュレム', distance: 'mile', surface: 'turf', growth: 'normal', heavy: false, emphasis: null },
  { id: 'NPC05', prefix: 'ゾフィラ', distance: 'mile', surface: 'dirt', growth: 'normal', heavy: true, emphasis: 'pw' },
  { id: 'NPC06', prefix: 'ネアルド', distance: 'mile', surface: 'both', growth: 'late', heavy: false, emphasis: 'iq' },
  { id: 'NPC07', prefix: 'クヴァン', distance: 'middle', surface: 'turf', growth: 'normal', heavy: false, emphasis: null },
  { id: 'NPC08', prefix: 'リュゼル', distance: 'middle', surface: 'dirt', growth: 'late', heavy: true, emphasis: 'st' },
  { id: 'NPC09', prefix: 'ハルミナ', distance: 'middle', surface: 'both', growth: 'early', heavy: false, emphasis: 'gt' },
  { id: 'NPC10', prefix: 'ドルガス', distance: 'stayer', surface: 'turf', growth: 'late', heavy: false, emphasis: 'st' },
  { id: 'NPC11', prefix: 'セフィナ', distance: 'stayer', surface: 'dirt', growth: 'late', heavy: true, emphasis: 'st' },
  { id: 'NPC12', prefix: 'ボレアト', distance: 'stayer', surface: 'both', growth: 'normal', heavy: false, emphasis: null },
  { id: 'NPC13', prefix: 'アグニル', distance: 'sprint', surface: 'turf', growth: 'normal', heavy: true, emphasis: 'gt' },
  { id: 'NPC14', prefix: 'ユスティ', distance: 'sprint', surface: 'dirt', growth: 'late', heavy: false, emphasis: 'sp' },
  { id: 'NPC15', prefix: 'メルヴィ', distance: 'mile', surface: 'turf', growth: 'early', heavy: true, emphasis: 'sp' },
  { id: 'NPC16', prefix: 'ラウゼン', distance: 'mile', surface: 'dirt', growth: 'early', heavy: false, emphasis: 'gt' },
  { id: 'NPC17', prefix: 'ティグラ', distance: 'middle', surface: 'turf', growth: 'late', heavy: true, emphasis: 'iq' },
  { id: 'NPC18', prefix: 'ノルディ', distance: 'middle', surface: 'dirt', growth: 'normal', heavy: false, emphasis: 'pw' },
  { id: 'NPC19', prefix: 'シャルカ', distance: 'stayer', surface: 'turf', growth: 'normal', heavy: true, emphasis: 'iq' },
  { id: 'NPC20', prefix: 'グレンツ', distance: 'stayer', surface: 'dirt', growth: 'early', heavy: false, emphasis: 'pw' },
  { id: 'NPC21', prefix: 'エルミナ', distance: 'sprint', surface: 'both', growth: 'late', heavy: true, emphasis: null },
  { id: 'NPC22', prefix: 'ヴァトス', distance: 'mile', surface: 'both', growth: 'early', heavy: true, emphasis: 'gt' },
  { id: 'NPC23', prefix: 'キリオン', distance: 'middle', surface: 'both', growth: 'late', heavy: true, emphasis: 'st' },
  { id: 'NPC24', prefix: 'ザナルヴ', distance: 'stayer', surface: 'both', growth: 'early', heavy: true, emphasis: 'gt' },
  { id: 'NPC25', prefix: 'プレシオ', distance: 'sprint', surface: 'turf', growth: 'late', heavy: false, emphasis: 'iq' },
  { id: 'NPC26', prefix: 'ムーレン', distance: 'sprint', surface: 'dirt', growth: 'normal', heavy: false, emphasis: null },
  { id: 'NPC27', prefix: 'フェルガ', distance: 'mile', surface: 'turf', growth: 'late', heavy: false, emphasis: 'st' },
  { id: 'NPC28', prefix: 'オルテナ', distance: 'mile', surface: 'dirt', growth: 'late', heavy: false, emphasis: 'iq' },
  { id: 'NPC29', prefix: 'ヒスイラ', distance: 'middle', surface: 'turf', growth: 'early', heavy: false, emphasis: 'sp' },
  { id: 'NPC30', prefix: 'ダルシェ', distance: 'middle', surface: 'dirt', growth: 'early', heavy: true, emphasis: null },
  { id: 'NPC31', prefix: 'ヴィオラ', distance: 'stayer', surface: 'turf', growth: 'early', heavy: false, emphasis: 'iq' },
  { id: 'NPC32', prefix: 'ヤグルド', distance: 'stayer', surface: 'dirt', growth: 'normal', heavy: false, emphasis: 'gt' },
  { id: 'NPC33', prefix: 'ソレイナ', distance: 'sprint', surface: 'both', growth: 'early', heavy: false, emphasis: 'gt' },
  { id: 'NPC34', prefix: 'ブランデ', distance: 'mile', surface: 'both', growth: 'normal', heavy: false, emphasis: 'sp' },
  { id: 'NPC35', prefix: 'クレイオ', distance: 'middle', surface: 'both', growth: 'normal', heavy: true, emphasis: 'pw' },
  { id: 'NPC36', prefix: 'ロンバル', distance: 'stayer', surface: 'both', growth: 'late', heavy: true, emphasis: 'pw' },
  { id: 'NPC37', prefix: 'アヴェル', distance: 'sprint', surface: 'turf', growth: 'normal', heavy: false, emphasis: 'pw' },
  { id: 'NPC38', prefix: 'ニシェル', distance: 'mile', surface: 'dirt', growth: 'normal', heavy: false, emphasis: 'st' },
  { id: 'NPC39', prefix: 'トワルデ', distance: 'middle', surface: 'turf', growth: 'normal', heavy: false, emphasis: 'iq' },
  { id: 'NPC40', prefix: 'ペルシャ', distance: 'stayer', surface: 'dirt', growth: 'late', heavy: true, emphasis: null },
] as const;
