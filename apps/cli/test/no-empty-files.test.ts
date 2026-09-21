/**
 * 🔴 ★**版管理に、★0 バイトのファイルが無いこと**（★**CK-14**・2026-09-21）
 *
 * ============================================================================
 * 【🔴 ★なぜ在るか — ★500 行を消しました】
 *   ★2026-09-21、★`tools/verify-pool-supply.mjs`（★500 行・**未コミット**）を
 *   ★機械編集で ★**0 バイト**にしました。
 *   ✔ ★原因: ★Python の `open(p, 'w')` は ★**開いた時点で切り詰めます**。
 *     ★その後 `write()` が文字コード（サロゲート）で落ち、★**空のまま残りました**。
 *
 *   🔴 ★そして ★**気づけませんでした**:
 *   ```
 *   node --check tools/verify-pool-supply.mjs  →  ✅ 合格
 *   ```
 *   ★★**空のファイルは、★構文として正しい。**
 *   → ★★**「構文エラーが無い」は「中身が在る」ではありません**（★`CK-14` そのもの）。
 *   ★気づいたのは ★`wc -l` が **0** を返したときでした。
 *
 * 【★この検査が守るもの】
 *   ★**版管理に入っている**ファイルが空になったら落とします。
 *   ⚠️ ★未コミットのものは守れません（★そこは `MD-6`「未コミットの大きな変更を抱えたまま
 *     ★機械編集しない」という作法の側）。★**ここは最後の砦**です。
 *
 * 【⚠️ ★空でよいものが在るなら】
 *   ★`ALLOWED_EMPTY` に ★**理由付きで**書いてください。★空にしておくのも判断の 1 つです。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/** ★空でよいと決めたもの（★理由付き）。★いまは 0 件 */
const ALLOWED_EMPTY: Readonly<Record<string, string>> = {};

/** ★見るのは ★**中身が要る種類**だけ（★画像などは対象外） */
const WATCHED = /\.(ts|tsx|mjs|js|sql|json|md|yml|yaml|css)$/;

describe('🔴 ★版管理に 0 バイトのファイルが無い（★CK-14）', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((l) => l.length > 0);
  const watched = tracked.filter((f) => WATCHED.test(f));

  it('★対象を読めている（★0 件 通過を合格にしない）', () => {
    expect(tracked.length, '🔴 ★git が 1 件も返しません').toBeGreaterThan(100);
    expect(watched.length, '🔴 ★見る種類のファイルが 0 件。★探し方が壊れています')
      .toBeGreaterThan(100);
  });

  it('🔴 ★0 バイトのファイルが 1 つも無い', () => {
    const empty: string[] = [];
    let measured = 0;
    for (const f of watched) {
      if (f in ALLOWED_EMPTY) continue;
      let size: number;
      try {
        size = statSync(path.join(ROOT, f)).size;
      } catch {
        continue;                    // ★消したが index に残っている等は、別の検査の仕事
      }
      measured += 1;
      if (size === 0) empty.push(f);
    }
    /** ★対照: ★1 件も測っていないなら、★この検査は何も見ていません */
    expect(measured, '🔴 ★1 件も大きさを測れていません').toBeGreaterThan(100);
    expect(empty, `🔴 ★0 バイトのファイル:\n  ${empty.join('\n  ')}\n`
      + '  ★機械編集で消えていませんか（★`open(p, "w")` は書く前に切り詰めます）。'
      + '  ★空でよいなら `ALLOWED_EMPTY` に理由を書いてください').toEqual([]);
  });

  it('🔴 ★`ALLOWED_EMPTY` に挙げたものが、★実在して空である（★見張り続けない）', () => {
    for (const [f, why] of Object.entries(ALLOWED_EMPTY)) {
      expect(why.length, `★${f} の理由が空`).toBeGreaterThan(0);
      expect(tracked.includes(f), `★${f} は版管理にありません（★名前が変わった？）`).toBe(true);
      expect(statSync(path.join(ROOT, f)).size, `★${f} は空ではありません（★登録を外して）`).toBe(0);
    }
  });
});
