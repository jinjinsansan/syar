import { authClient } from './supabase';

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

/**
 * ★**付与される初期馬**（★サーバーが選ぶ・D-074／`0037`）。
 *
 * ⚠️ ★**素質は持ちません**（★2026-09-18・**D-114 ②**・T-10・AL-2）。
 * 🔴 ★**毛色・脚質・年齢も持ちません**（★2026-09-19・UI1-8）—
 *    ★`horses` に **毛色の列が無く**、★脚質は **出走登録のたびに選ぶもの**、
 *    ★年齢は **今が何週か**を画面が知らないと出せないためです。
 *    ★**無い列を作って埋めません**（★デモの「栗毛」「先行」は画面の作り物でした）。
 */
export interface InitialHorse {
  readonly name: string;
  readonly sex: string;
  readonly classLabel: string;
}

export type SetupError = 'duplicate' | 'ngword' | 'network' | 'other';
export type SetupResult =
  | { readonly ok: true; readonly horse: InitialHorse; readonly grantedEP: number; readonly dailyEP: number }
  | {
      readonly ok: false;
      readonly error: SetupError;
      readonly field?: 'displayName' | 'stableName';
      /** ★`other` のときの原文（★推測で言い換えない） */
      readonly message?: string;
    };

export interface SetupInput {
  readonly displayName: string;
  readonly stableName: string;
  readonly colorKey: string;
  readonly sleeve: Sleeve;
  /**
   * ★**冪等キー**（★`create_account` の `p_client_token`）。
   * ⚠️ ★**再送のたびに作り直さないこと** — ★作り直すと ★**2 回目も通ってしまいます**（V-19 ⑭ の穴）。
   *    ★画面は 1 回だけ作って持ち続けます。
   */
  readonly clientToken: string;
}

export interface SetupRepo {
  /** users 行の作成＋初期 EP 付与＋初期馬の付与（サーバーでは 1 トランザクション） */
  create(input: SetupInput): Promise<SetupResult>;
}

/** ★登録時に受け取る EP（★D-075 の較正定数。★**サーバーが持つ値の写し**で、画面では決めません） */
export const SETUP_GRANT_EP = 2000;
/** ★デイリーの EP（★同上） */
export const SETUP_DAILY_EP = 200;

/** デモ: 常に成功し、見本の初期馬を返す */
export const demoSetupRepo: SetupRepo = {
  create: async () => ({
    ok: true,
    horse: { name: 'ハツユキノオト', sex: '牝', classLabel: '新馬' },
    grantedEP: SETUP_GRANT_EP,
    dailyEP: SETUP_DAILY_EP,
  }),
};

/**
 * ★**本番のセットアップ**（★UI1-8・2026-09-19）。
 *
 * 【★1 本の RPC で済みます】★`create_account` が ★**初期馬まで中で選びます**（`0037`・案 A）。
 *   ★画面は `horses` を読めないので id を渡せません（★照会 `QUESTIONS_UI_SETUP_HORSE_20260918.md`）。
 *   ★`p_horse_id` は省略します（★既定 null）。
 *
 * 【★付いた馬は、そのあと `my_horses` から読みます】
 *   ★`create_account` は利用者 id しか返しません。★馬の名前は ★**自分の馬のビュー**から読みます。
 *
 * 🔴 ★**画面に出せない項目があります**（★2026-09-19 に判明・報告済み）:
 *   ★**毛色** … ★`horses` に列がありません（★デモの「栗毛」は画面の作り物でした）
 *   ★**脚質** … ★`horses` にありません。★脚質は ★**出走登録のたびに選ぶもの**（`race_entries.strategy`）
 *   ★**年齢** … ★`birth_year` / `birth_week` はありますが、★**今が何週か**を画面が知りません
 *   → ★**無い列を作って埋めません。** ★出せるもの（名前・性・格）だけ出します。
 */
export const supabaseSetupRepo: SetupRepo = {
  async create(input) {
    try {
      const client = authClient();
      const { error } = await client.rpc('create_account', {
        p_display_name: input.displayName,
        p_stable_name: input.stableName,
        p_silk_color: input.colorKey,
        p_silk_sleeve: input.sleeve,
        p_client_token: input.clientToken,
      });
      if (error !== null) {
        // ★当てはまるものだけ言い換え、★それ以外は原文のまま（UI1-9）
        const m = error.message ?? '';
        if (m.includes('duplicate key') || m.includes('users_pkey')) {
          return { ok: false, error: 'duplicate' };
        }
        return { ok: false, error: 'other', message: m === '' ? '登録できませんでした（理由が返っていません）' : m };
      }

      /**
       * ★付いた馬を読む（★`my_horses` は `owner_id = auth.uid()` で絞られています）。
       * ⚠️ ★**読めなくても、口座の作成は成功しています。** ★そこを失敗にすると
       *    ★**利用者はやり直し、2 回目は冪等で何も起きず、画面だけが止まります。**
       */
      const { data, error: readError } = await client
        .from('my_horses')
        .select('name, sex')
        .limit(1);
      if (readError !== null || data === null || data.length === 0) {
        return {
          ok: false,
          error: 'other',
          message: '牧場は作れましたが、最初の 1 頭を読めませんでした。牧場の画面を開いてください',
        };
      }
      const row = data[0]!;
      return {
        ok: true,
        horse: { name: String(row.name), sex: String(row.sex), classLabel: '新馬' },
        grantedEP: SETUP_GRANT_EP,
        dailyEP: SETUP_DAILY_EP,
      };
    } catch (e) {
      return { ok: false, error: 'network', message: e instanceof Error ? e.message : String(e) };
    }
  },
};
