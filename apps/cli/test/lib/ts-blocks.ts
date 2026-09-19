/**
 * ★**波括弧で切り出す**（★**CK-7**・2026-09-19・裁定はレビュー側の指摘）
 *
 * 【🔴 ★なぜ要るか — ★同じ直しを 4 回しました】
 *   ★配線の検査は「★A の呼び出しから ★B の呼び出しまで」を `indexOf` で切り出していました。
 *   ★これは ★**B が動くと壊れます**。★しかも**落ちるとは限りません** — ★切り出しが広がると
 *   ★外側の `try/catch` を拾って ★**別の理由で緑**になります（★`green-for-the-wrong-reason`）。
 *
 *   ✔ 実績:
 *     ① 2026-09-17 … 始点が **import 行**に当たっていた（★数十文字しか見ていなかった）
 *     ② 2026-09-19 … DL-2 で `await 〜(` が消えて落ちた（★意図は満たされたまま）
 *     ③ 2026-09-19 … T11-1 ④ で終点（出品）が枠の外へ動いた → ★**終点を差し替えた**
 *     ④ 2026-09-19 … その差し替え先（厩舎の格の値段）も ★**同じ便で枠の外へ出た**
 *   🔴 ★③ が「3 回目の同じ直し」で、★④ が ★**その日のうちに来た 4 回目**です。
 *
 * 【★どう変えるか】★**2 つの呼び出しの間を切り出すのをやめます。**
 *   ★代わりに ★**構文の入れ子**（`{` と `}`）で切り出します。
 *   → ★中の並び順が変わっても、★隣が外へ出ても、★**切り出しは同じもの**を指し続けます。
 *
 * ⚠️ ★これは構文解析ではありません（★文字列とコメントの中の括弧は数えません）。
 *    ★だから ★**註記を剥がしてから渡すこと**。★剥がし漏れは `stripComments` が担います。
 * ⚠️ ★見つからないときは ★**投げます**（★空文字を返して「該当なし」にしない・R-21）。
 */

/** ★註記を剥がす（★註記に書いた語で緑にしないため） */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

/**
 * ★`marker` を含む行から始まるブロックの ★**中身**を返す。
 *
 * ★`marker` の後ろで最初に現れる `{` を開き括弧とみなし、★対応する `}` まで数えます。
 * @throws ★見つからない・閉じていないときは投げる（★黙って空を返さない・R-21）
 */
export function blockBodyAfter(src: string, marker: string): string {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`★切り出しの目印が見つかりません: ${marker}`);
  if (src.indexOf(marker, at + marker.length) >= 0) {
    throw new Error(`★目印が 2 か所以上にあります（★どちらを指すか決まりません）: ${marker}`);
  }
  const open = src.indexOf('{', at + marker.length);
  if (open < 0) throw new Error(`★目印の後ろに { がありません: ${marker}`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`★ブロックが閉じていません: ${marker}`);
}

/**
 * ★`needle` が、★**自分専用の `try { ... } catch`** の中に在るか。
 *
 * ★`block` の中の `try {` を 1 つずつ波括弧で切り出し、
 * ★`needle` を含むものがあるかを見ます。
 * 🔴 ★**外側の try を拾いません** — ★これが「別の理由で緑」を止める要です。
 */
export function isInOwnTry(block: string, needle: string): boolean {
  /**
   * ⚠️ ★`indexOf('try')` は ★**`entry` / `entries` / `country` に当たります**。
   *    ★語として拾います（★`race_entries` を try と読むと、切り出しが 1 つずれます）。
   */
  const TRY = /(?<![A-Za-z0-9_$])try(?![A-Za-z0-9_$])/g;
  TRY.lastIndex = 0;
  for (;;) {
    const m = TRY.exec(block);
    if (m === null) return false;
    const at = m.index;
    const open = block.indexOf('{', at);
    if (open < 0) return false;
    let depth = 0;
    let close = -1;
    for (let i = open; i < block.length; i += 1) {
      const ch = block[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close < 0) return false;
    const body = block.slice(open + 1, close);
    // ★その try が catch で閉じていること（★try/finally だけでは「巻き込まない」にならない）
    const tail = block.slice(close, close + 40);
    if (body.includes(needle) && /^\}\s*catch/.test(tail)) return true;
  }
}
