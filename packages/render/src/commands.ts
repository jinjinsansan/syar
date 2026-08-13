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

/** ★倍率は整数のみ。型で縛ります（0.5 や 1.5 を渡せない） */
export type Zoom = 1 | 2;

export type DrawCommand =
  /** 背景の帯（アートバイブル §3「水平の帯で構成する」） */
  | {
    readonly kind: 'band';
    readonly role: PaletteRole;
    readonly y: number;
    readonly height: number;
  }
  /**
   * ★**多層パララックス**（アートバイブル §3「奥行きは速度差だけで作る」）。
   *
   *   同じ模様を横に繰り返し、層ごとに違う速さで流します。
   *   `offset` は**その層が左へずれた画素数**（レンダラは `offset % tileWidth` で敷き詰める）。
   *
   *   ⚠️ **線遠近を描き込みません**（アートバイブル §3）。奥行きは**速度差だけ**で作ります。
   */
  | {
    readonly kind: 'parallax';
    readonly role: PaletteRole;
    readonly y: number;
    readonly height: number;
    /** 繰り返す模様の1枚の幅 */
    readonly tileWidth: number;
    /** ★左へずれた画素数（0 以上。レンダラが剰余を取る） */
    readonly offset: number;
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
    /**
     * ★**描く倍率**（整数のみ）。
     *
     *   ⚠️ これが無いと、**レンダラがカメラを知らないと馬を大きく描けません**。
     *      実際、寄っても位置だけ変わって**馬の大きさが変わらない**状態になりました。
     *   ★§12.8 は「レンダラを差し替えられること」を求めています。
     *     レンダラがカメラを参照した瞬間、その約束が崩れます。
     *     **必要な情報は、すべて描画コマンドに載せます。**
     */
    readonly scale: Zoom;
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
  }
  /**
   * ★**仕掛けの合図**（§8b の局面が変わったこと）。
   *   ★これも画面の座標系。**カメラが隠せません**。
   *   反応時間制限ボットは**これを見て**押すので、C-6 の測定対象そのものです。
   */
  | {
    readonly kind: 'cue';
    readonly at: Point;
    /** §8b の局面 */
    readonly phase: 'start' | 'cruise' | 'spurt' | 'straight';
    /** ★合図が「出ている」か。出ていない間は描かない、ではなく false を出す */
    readonly active: boolean;
  }
  /**
   * ★**各馬の余力**（REVIEW_P4_QUALITY_VERDICT Q-P4-13）。
   *
   * 【なぜ要るか — 測って分かったこと】
   *   画面に**位置しか無い**とき、勝負所の見た目の順位から3着以内を当てる能力は
   *   ★**AUC 0.431**（＝**何も見ないより悪い**）でした。
   *   逃げ馬が前にいるのは「強いから」ではなく「先に行ったから」で、
   *   **位置だけを読むと必ず騙されます。**
   *
   *   > 「あと何頭抜けば足りるか」「**まだ余力があるか**」が読めること（裁定）
   *
   *   ★これは自馬のゲージ（§12.6）とは**別のもの**です。
   *     ゲージは「自分が仕掛けられるか」、こちらは「**前の馬が持つか**」。
   *
   * 【★世界の座標系】
   *   馬に付くので、カメラで動きます。**ゲージ・合図とは扱いが違います。**
   */
  | {
    readonly kind: 'effort';
    readonly at: Point;
    /** 0〜1。0 に近いほどバテている */
    readonly ratio: number;
    /** ★馬と同じ倍率で描く（そうしないと寄ったとき馬から離れます） */
    readonly scale: Zoom;
  }
  /**
   * ★**変化**（裁定 Q-P4-14 ①）。
   *
   *   > 実況は「位置」ではなく「変化」を言う（「3番手」ではなく「上がってきた」）
   *   > → 順位の数字ではなく、**前の馬との差がメートルで詰まるのを見せる**
   *
   *   ★だから `rank` を持ちません。持つのは**差**と**詰まる速さ**と
   *     **あと何頭抜けば足りるか**の3つだけです。
   *
   * 【★画面の座標系】ゲージ・合図と同じく、**カメラが隠せません**。
   */
  | {
    readonly kind: 'gap';
    readonly at: Point;
    /** 前の馬との差（m）。先頭なら 0 */
    readonly meters: number;
    /** ★毎秒どれだけ詰めているか（m/s）。**負なら離されている** */
    readonly closingMps: number;
    /** ★あと何頭抜けば「足りる」か。0 なら既に足りている */
    readonly toGo: number;
  };

/**
 * ★スプライトの実寸（正典 §12.1・D-058）。
 *   **表示は整数倍のみ**（引き 1× / 寄り 2×）。
 *   ⚠️ 非整数倍で拡大縮小すると**ピクセルアートが壊れます**（アートバイブルの禁止事項）。
 */
export const SPRITE = { width: 220, height: 140 } as const;

/**
 * ★**カメラが隠してはいけないもの**（アートバイブル §9 の制約）。
 *
 *   勝負所は**プレイヤーが仕掛ける瞬間そのもの**です。
 *   カメラが寄る最中にゲージや合図が消えると、
 *   **V-13 は通り続けたまま、プレイヤーには「仕掛けても何も変わらない」ゲーム**になります。
 *
 *   → これらは**走路の座標系ではなく画面の座標系**に置きます。
 *     ★カメラが動いても位置が変わらないので、**隠しようがありません**。
 */
export const OVERLAY_KINDS = ['gauge', 'cue', 'gap'] as const;
export type OverlayKind = (typeof OVERLAY_KINDS)[number];

/** 1フレーム分の描画命令 */
export interface Frame {
  /** レース開始からの経過秒。★描画の都合ではなく**レースの時刻** */
  readonly atSec: number;
  readonly commands: readonly DrawCommand[];
}
