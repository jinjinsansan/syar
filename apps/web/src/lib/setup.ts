/**
 * ★初回セットアップの表示モデルとデータ層 — 正本 design/hud-ds/components/setup
 *
 * 【今の状態】
 *   Auth（メールのマジックリンク）とセットアップ RPC がまだ無いので、**デモデータ**を返す。
 *   画面は `SetupRepo` だけを見る。RPC が来たら `supabaseSetupRepo` を差し替えるだけにする（画面は触らない）。
 *   本実装ではセットアップ RPC が users 行の作成＋初期 EP 付与＋初期馬の付与を 1 トランザクションで行う（裁定 Q-WEB-04）。
 *   ⚠️ 初期馬は user_id から決定的に導く（D-074）— 画面で抽選しない。付与はサーバー側。
 *   ⚠️ 素質は ★ のみ（数値は本人にも見せない・正典 §5.5・§12.4）。
 *   ⚠️ EP を金銭で買う・増やす導線をここから絶対に生やさない（憲法 §0.2）。
 */

/** 勝負服の配色（アートバイブル §4 の高彩度 16 色）。自由入力は不可 — 芝・ダートと同化する中間色を除いてある */
export interface SilkColor { readonly key: string; readonly label: string; readonly hex: string }
export const SILK_COLORS: readonly SilkColor[] = [
  { key: 'vermilion', label: '朱', hex: '#d62f26' },
  { key: 'orange', label: '橙', hex: '#e0561f' },
  { key: 'amber', label: '山吹', hex: '#f2b012' },
  { key: 'yellow', label: '黄', hex: '#f6e04b' },
  { key: 'chartreuse', label: '若草', hex: '#8ec63f' },
  { key: 'green', label: '緑', hex: '#12a05a' },
  { key: 'teal', label: '青緑', hex: '#0fb0a6' },
  { key: 'blue', label: '青', hex: '#1a6fd4' },
  { key: 'navy', label: '紺', hex: '#1a3fa0' },
  { key: 'violet', label: '紫', hex: '#6b3fc4' },
  { key: 'magenta', label: '紅紫', hex: '#b3306e' },
  { key: 'pink', label: '桃', hex: '#f58fb4' },
  { key: 'brown', label: '茶', hex: '#7b4a1e' },
  { key: 'black', label: '黒', hex: '#111318' },
  { key: 'white', label: '白', hex: '#ffffff' },
  { key: 'silver', label: '銀', hex: '#c9ced6' },
];

/** 袖の 3 択（同じ色／白／黒） */
export type Sleeve = 'same' | 'white' | 'black';
export const SLEEVES: readonly { readonly key: Sleeve; readonly label: string }[] = [
  { key: 'same', label: '同じ色' },
  { key: 'white', label: '白' },
  { key: 'black', label: '黒' },
];
export function sleeveHex(sleeve: Sleeve, bodyHex: string): string {
  return sleeve === 'same' ? bodyHex : sleeve === 'white' ? '#ffffff' : '#111318';
}

/** 名前の最大長（表示名・牧場名とも） */
export const NAME_MAX = 12;

/** 付与される初期馬（サーバーが user_id から決定的に導く・D-074）。素質は ★ のみ */
export interface InitialHorse {
  readonly name: string;
  readonly sexAge: string;
  readonly coat: string;
  readonly stableName: string;
  readonly classLabel: string;
  readonly stars: number;
  readonly strategy: 'nige' | 'senko' | 'sashi' | 'oikomi';
}

export type SetupError = 'duplicate' | 'ngword' | 'network';
export type SetupResult =
  | { readonly ok: true; readonly horse: InitialHorse; readonly grantedEP: number; readonly dailyEP: number }
  | { readonly ok: false; readonly error: SetupError; readonly field?: 'displayName' | 'stableName' };

export interface SetupInput {
  readonly displayName: string;
  readonly stableName: string;
  readonly colorKey: string;
  readonly sleeve: Sleeve;
}

export interface SetupRepo {
  /** users 行の作成＋初期 EP 付与＋初期馬の付与（サーバーでは 1 トランザクション） */
  create(input: SetupInput): Promise<SetupResult>;
}

/** デモ: 常に成功し、見本の初期馬を返す（初期 EP 2,000／デイリー 200 は D-075 の較正定数＝サーバー値） */
export const demoSetupRepo: SetupRepo = {
  create: async () => ({
    ok: true,
    horse: { name: 'ハツユキノオト', sexAge: '牝2', coat: '栗毛', stableName: '高瀬厩舎', classLabel: '新馬', stars: 3.5, strategy: 'senko' },
    grantedEP: 2000,
    dailyEP: 200,
  }),
};
