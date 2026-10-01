/**
 * ★**共通の枠（`story-shell.tsx`）が ★どの道でどう振る舞うか**（★2026-09-27 に `story-shell.tsx` から移した）
 *
 * ★移した理由: ★網（`race-strip-sizes.test.ts`）が ★`shellPlacesStripOn` を ★**import して**聞くためです（★写さない・D-052）。
 *   ★`.tsx` は ★ルートの型検査（`--jsx` 無し）から import できないので、★JSX を持たないこのファイルに置きます。
 * ★網 `own-header-coverage.test.ts`・`uma-ui-wiring.test.ts` ④ は ★この原文の `OWN_HEADER` を読みます。
 */
export const INTERIOR: readonly string[] = ['/stable', '/training', '/races', '/entry', '/records', '/prizes', '/login', '/signup', '/setup', '/design-preview'];
/**
 * ★**自前の見出しを持つページ**（★2026-09-13）。★ここには帯を足しません。
 *
 * ⚠️ ★`/lp-preview` に ★**アーケードの「STAR」帯が載っていました**（★本番で実測）。
 *    ★馬物語の LP は自分の `ms-nav` を持っているので、★帯が二重になります。
 *    ★`/` も同じ LP になったので、★両方ここに入れます。
 */
/**
 * ⚠️ ★`/race` もここです（★2026-09-13・オーナー評
 *    ★「★TOP は馬物語というグリーンな感じでした。★中継を押すと、ブルーで STAR と出ていました」）。
 *    ★中継は ★**画面いっぱいの映像**なので、★上に別の帯が載ると玄関と色が食い違います。
 */
/**
 * ⚠️ ★**馬物語 UI（R-14・2026-09-17）の画面もここです。**
 *    ★どの画面も ★**自前の上段バー**（戻る／画面名／停止スイッチ）を持つので、
 *    ★入れないと ★**帯が二重**になります（★引き渡し資料 §4.2 の A-1）。
 *    ★併せて下端 34px の安全領域も、各画面が自分で持ちます。
 */
export const OWN_HEADER: readonly string[] = [
  '/', '/lp-preview', '/race',
  /**
   * ★馬物語 UI（R-14・2026-09-17）。★**画面を足したらここも足す**。
   *
   * 🔴 ★**3 度目の入れ忘れを直しました**（★2026-09-21）: ★`/login` と `/signup`。
   *   ✔ ★**本番の配信 HTML で実測**しました:
   *   ```
   *   /home /mypage /vote /train /exchange … 帯 1 つ（★正しい）
   *   /login /signup                       … 🔴 **帯が二重**（★story-shell ＋ 自前バー）
   *   ```
   *   ★オーナーの ★**「TOP からログインを押すと古いデザインが出る」**は、★これでした。
   *   ★★**世代の混在ではありません。** ★`/login` は新しい部品で描かれているのに、
   *   ★**上に 1 つ古い帯が載っていた**だけです。
   *
   * ✅ ★`/setup` も入れました（★2026-09-21・★オーナーの判断「**B**」）。
   *   ★**既存の部品で組み直した**ので（★`/login` `/signup` と同じ `uma-parts`）、
   *   ★自前バーを持つようになりました。★**新しい意匠は 1 つも作っていません。**
   *
   * ✅ ★**入れ忘れを網で止めます**: `apps/cli/test/own-header-coverage.test.ts`
   *   ★（★`uma-parts` を使う面が ★`OWN_HEADER` に在ること）。★4 度目は起きません。
   */
  '/home', '/howto', '/earn', '/watch-race', '/odds', '/exchange', '/mypage', '/vote', '/train',
  '/login', '/signup', '/forgot-password', '/reset-password', '/setup',
  /** ★デザイン確認の一覧（★2026-09-17）。★自前の見出しを持つので帯を足さない */
  '/design-check',
  /**
   * 🔴 ★**4 度目の入れ忘れ**（★2026-09-24・オーナー指摘
   *   ★「★古いデザインはこの外枠の白のエリア全てです」）。
   *   ★第 2 便の 3 画面（役割・配合・命名）は ★**自前の全画面の枠**を持つのに、
   *   ★`OWN_HEADER` に入れ忘れたため、★**白い旧い枠の中に収まって**いました。
   * ⚠️ ★網（`own-header-coverage.test.ts`）は ★**`uma-parts` を使う面**しか見ておらず、
   *    ★この 3 つは `uma-parts` を使わない（★自前の `Shell`）ので ★**通り抜けました**。
   *    → ★網を「自前の `Shell` を持つ面」にも広げました（★2026-09-24・`own-header-coverage.test.ts`）。
   * ✅ ★`/stable/foal`（★最初の 1 頭を無償で生産する・案 A）も同じ形なので、ここに入れます。
   */
  '/stable/roles', '/stable/breed', '/stable/name', '/stable/foal',
  /** ★2026-10-01: ★馬市場を 馬物語の部品で組み直した（★オーナー「馬を買うをクリックすると 古いデザイン」） */
  '/stable/market',
  /**
   * ★2026-10-01: ★わたしの馬（R-26 D26-3 ①）を 馬物語の部品で組み直した（★自前の上段バー・帯）。
   * ⚠️ ★前方一致なので ★`/stable/[horseId]`・`/stable/retired` も ★ここで枠の外に出ます（★同じ便で両方を移す）。
   */
  '/stable',
  /** ★2026-10-01: ★引退馬の一覧（馬物語帳）も 馬物語の部品へ（★R-26 D26-3 ③・★網は道を そのまま並べることを求める） */
  '/stable/retired',
  /**
   * ★**白い旧い枠から 馬物語 UI へ移した面**（★2026-09-27・オーナー指摘「★この白の間違っているデザインはいつ辞めるのですか」）。
   *   ★引き渡し資料 `design_handoff_uma_monogatari` §5（全ページ共通の骨格）で組み直したので ★自前の上段バーを持ちます。
   */
  '/entry', '/records',
  /** ★2026-09-30: ★レース詳細を uma の画面に作り直した（★デザイナー R-21・自前の上段バー） */
  '/races',
  /** ★2026-10-01: ★投票の履歴・投票の控え（★デザイナー引き渡し ②・自前の上段バー）。★網は道を そのまま並べることを求める */
  '/vote/history',
];

/**
 * ★**この枠が常設帯を置く道か**（★2026-09-27・裁定 ⑤）。★枠が帯を置くのは ★`INTERIOR` で ★`OWN_HEADER` でない道だけ。
 *   ★網 `race-strip-sizes.test.ts` が ★**これを import して**、★表（`race-strip-sizes.ts`）と突き合わせます（★写さない）。
 */
export function shellPlacesStripOn(pathname: string): boolean {
  if (OWN_HEADER.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return INTERIOR.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
