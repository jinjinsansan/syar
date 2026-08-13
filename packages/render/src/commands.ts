/**
 * 描画コマンド（正典 §12.8）
 *
 * > 描画ロジックを「位置データ → 描画コマンド」の**純粋関数**として切り出す。
 * > レンダラだけを Web（Canvas 2D）と将来のモバイル（`react-native-skia` 等）で
 * > 差し替えられるようにする。**この抽象化は初日からやること** —
 * > 後からの分離は現実的に不可能に近い。
 *
 * 【この層が知らないこと】
 *   ★Canvas も DOM も React も知りません。**数と文字だけ**を返します。
 *   ⚠️ ここに `CanvasRenderingContext2D` を持ち込んだ瞬間、§12.8 は崩れます。
 *      その禁止は `test/purity.test.ts` が機械で見ています。
 *
 * 【なぜ「命令の配列」なのか】
 *   ★**同じ入力から同じ配列が出ること**を、絵を描かずに検査できるからです（C-5）。
 *   画面を比べる検査は、環境（フォント・GPU・色空間）で揺れます。
 *   **配列の比較なら揺れません。**
 */

/** 画面上の位置。★左上が原点・画素単位（レンダラ側で拡大する） */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * スプライトの1枚を指す。
 *
 * ★**シート契約**（フレーム寸法・列数・フレーム数・基準点）は
 *   `DEV_INSTRUCTIONS_P4_ASSETS` A-3 で1頭目に確定させるものです。
 *   ここでは**その契約に対する参照**だけを持ちます。
 */
export interface SpriteRef {
  /** スプライトシートの識別子（`horse-gallop` 等）。ファイル名はレンダラが解決する */
  readonly sheet: string;
  /** シート内のフレーム番号（0始まり） */
  readonly frame: number;
}

/**
 * 色の指定。
 *
 * ★**16進の色値をここに書きません。** アートバイブル §4 が
 *   「具体的な色値は1頭目の試作を見てから確定」としているためです。
 *   ここでは**役割名**で持ち、実際の色はパレットが解決します
 *   （アートバイブル §6「1つのパレットファイルを共有し、全アセットがそこから色を取る」）。
 */
export type PaletteRole =
  | 'turf' | 'dirt' | 'sky' | 'rail' | 'stand' | 'paper' | 'ink'
  /** ★勝負服。個体識別の唯一の手段（アートバイブル §3） */
  | `silk-${number}`;

export type DrawCommand =
  /** 背景の帯（アートバイブル §3「水平の帯で構成する」） */
  | {
    readonly kind: 'band';
    readonly role: PaletteRole;
    readonly y: number;
    readonly height: number;
  }
  /**
   * スプライト1枚。
   * ★`silk` は**色替えの指定**で、同じ `sprite` を共有したまま個体を分けます
   *   （アートバイブル §5 の「馬体は共通スプライトの色替えで足りるか」の受け口）。
   */
  | {
    readonly kind: 'sprite';
    readonly sprite: SpriteRef;
    readonly at: Point;
    readonly silk?: PaletteRole | undefined;
    /** 左右反転（進行方向）。★既定は false */
    readonly flip?: boolean | undefined;
  }
  /**
   * 文字。★UI は「紙」（アートバイブル §3）なので、
   *   文字の意味は**役割**で持ち、書体はレンダラが決めます。
   */
  | {
    readonly kind: 'text';
    readonly text: string;
    readonly at: Point;
    readonly role: PaletteRole;
  }
  /**
   * ★スタミナゲージ（§12.6）。アートバイブル §3 が
   *   「ゲージだけが例外。ここは唯一の『機械』の表現」と定めています。
   *   `ratio` は 0〜1。**自馬にのみ表示**（§12.6）なので、出す/出さないは上位が決めます。
   */
  | {
    readonly kind: 'gauge';
    readonly at: Point;
    readonly width: number;
    readonly ratio: number;
  };

/** 1フレーム分の描画命令 */
export interface Frame {
  /** レース開始からの経過秒。★描画の都合ではなく**レースの時刻** */
  readonly atSec: number;
  readonly commands: readonly DrawCommand[];
}
