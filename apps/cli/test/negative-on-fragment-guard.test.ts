/**
 * ★**切り出した断片への「否定の表明」に、番人が付いているか**（★**CK-4**・2026-09-19）
 *
 * 【🔴 ★これは CK-3 とは別の壊れ方です】
 *   ★CK-3 は「★切り出しが空になったら落ちる」を守りました。
 *   🔴 ★**しかし、落ちるのは肯定の表明だけ**です:
 *
 *   | ★肯定 `expect(frag).toMatch(/x/)` | ★空なら ★**落ちる**（★うるさいが、気づける） |
 *   |---|---|
 *   | 🔴 ★**否定** `expect(frag).not.toMatch(/x/)` | ★★**空なら素通しで緑**（★空文字には何も当たらない） |
 *
 *   ✔ ★実際に踏みました: `auth-wiring.test.ts` の
 *     ★`expect(readBody).not.toMatch(/persistSession/)` は ★**番人なし**でした。
 *     → ★`readClient` の宣言名が変わるだけで、★**「セッションを持たない」が永久に緑**になります。
 *
 * 【★今日の「緑の理由が違う」7 例との違い】
 *   ★7 例は ★**何かに一致していた**（★別のものに当たっていた）。
 *   🔴 ★これは ★**何も無いところに、一致しなかった**。★**対象が消えたことに気づけない**形です。
 *
 * 【★この検査が見るもの】
 *   ★`slice` で作った断片に `not.toMatch` / `not.toContain` を当てているなら、
 *   ★**その断片が空でないこと**を、同じ `it` の中で確かめていること。
 *
 * ⚠️ ★**全文に対する否定は安全**なので数えません（★全文が空ならファイルが無く、別の形で落ちます）。
 *    ✔ ★否定の表明は全体で **284 箇所**ありますが、★**危ないのは断片に当てている 3 箇所だけ**でした。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/** ★註記を外す（★行数を保つため、中身を空白に置き換える） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

interface Risky {
  readonly file: string;
  readonly line: number;
  readonly frag: string;
  readonly guarded: boolean;
}

function scan(): Risky[] {
  const files = execFileSync('git', ['ls-files', '*.test.ts'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.length > 0);
  const out: Risky[] = [];
  for (const f of files) {
    const src = stripComments(readFileSync(path.join(ROOT, f), 'utf8'));
    const lines = src.split('\n');
    /** ★`slice` で作った断片の変数名 */
    const frags = new Set<string>();
    for (const l of lines) {
      const m = /const\s+(\w+)\s*=\s*[\w.]+\.slice\(/.exec(l);
      if (m !== null) frags.add(m[1]!);
    }
    if (frags.size === 0) continue;
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i]!;
      if (!l.includes('not.toMatch') && !l.includes('not.toContain')) continue;
      for (const frag of frags) {
        if (!new RegExp(`\\bexpect\\(\\s*${frag}\\b`).test(l)) continue;
        /**
         * ★番人 ＝ ★**同じファイルの中で、その断片について**
         *   ★① 長さを確かめている（`frag.length` を `expect` に渡している）か
         *   ★② ★**肯定**の表明の対象にもなっている（★空なら肯定が落ちるので守られる）
         */
        const whole = lines.join('\n');
        const hasLength = new RegExp(`expect\\(\\s*${frag}\\.length`).test(whole);
        const hasPositive = new RegExp(
          `expect\\(\\s*${frag}\\b[^\\n]*\\)[\\s\\S]{0,120}?\\.to(Match|Contain)\\(`,
        ).test(whole.replace(new RegExp(`expect\\(\\s*${frag}\\b[^\\n]*\\)[^\\n]*\\.not\\.to\\w+\\(`, 'g'), ''));
        out.push({ file: f, line: i + 1, frag, guarded: hasLength || hasPositive });
      }
    }
  }
  return out;
}

const RISKY = scan();

describe('CK-4 切り出した断片への否定の表明', () => {
  it('★走査が効いている（★1 件以上 見つかる・R-21）', () => {
    /**
     * ⚠️ ★0 件なら「危ない箇所が無い」ではなく ★**走査が壊れている**ほうを疑います。
     *    ★`slice` で断片を作り、★それに否定を当てる形は repo に実在します。
     */
    expect(RISKY.length, '★1 件も見つからない＝走査が壊れている').toBeGreaterThan(0);
  });

  it('🔴 ★断片への否定は、すべて「断片が空でない」ことを確かめている', () => {
    const ng = RISKY.filter((r) => !r.guarded);
    expect(
      ng.map((r) => `${r.file}:${r.line}  断片 ${r.frag}`).join('\n'),
      '★番人の無い否定の表明があります（★対象が消えても素通しで緑）',
    ).toBe('');
  });

  /**
   * 🔴 ★**CK-6**（★2026-09-19・★CK-4 の規則を差し替え）
   *
   * ★CK-4 は「★断片が空でないこと」を見ていました。🔴 ★**それでは足りません。**
   * ✔ ★`bet-limits.test.ts` で実際に踏んだ形:
   *   ```js
   *   const at = worker.indexOf('insert into bet_limits');   // ★見つからないと −1
   *   const before = worker.slice(Math.max(0, at - 400), at); // ★slice(0, −1)
   *   ```
   *   → ★★**空になりません。★「ファイル全体から最後の 1 文字を除いたもの」**です。
   *   → ★**空ではなく「まったく別のもの」を見ながら通ります。**
   *
   * ⚠️ ★`Math.max(0, …)` は「負の添字を防ぐ」つもりの書き方ですが、
   *    ★**実際には「見つからなかった」を隠します**。★**親切な既定が、失敗を消している**形（R-27 の家族）。
   *
   * → ★**見るのは「空か」ではなく「`indexOf` が見つけたか」。** ★`=== -1` を先に弾くこと。
   */
  it('🔴 ★CK-6 `indexOf` の結果を `Math.max(0, …)` で救うなら、★先に −1 を弾いている', () => {
    const files = execFileSync('git', ['ls-files', '*.test.ts'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter((f) => f.length > 0);
    const ng: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(path.join(ROOT, f), 'utf8'));
      for (const m of src.matchAll(/\.slice\([^)\n]*Math\.max\(\s*0\s*,\s*(\w+)/g)) {
        const v = m[1]!;
        /** ⚠️ ★ループの添字（`for (let i = 0; …)`）は `indexOf` 由来ではないので数えません */
        const fromIndexOf = new RegExp(`(const|let)\\s+${v}\\s*=\\s*[\\w.]+\\.indexOf\\(`).test(src);
        if (!fromIndexOf) continue;
        const guarded = new RegExp(`expect\\(\\s*${v}\\b[^\\n]*\\)[^\\n]*toBeGreaterThan\\(\\s*-1\\s*\\)`).test(src);
        if (!guarded) ng.push(`${f}: 「${v}」が −1 のまま Math.max(0, …) で救われています`);
      }
    }
    expect(ng.join('\n'), '★見つからなかったことを、Math.max が隠しています').toBe('');
  });

  it('★全文への否定は数えない（★安全なので・★対照）', () => {
    /**
     * ✔ ★否定の表明は全体で 280 を超えますが、★**危ないのは断片に当てているものだけ**です。
     *   ★この検査が 280 全部を挙げていたら、★**選り分けが効いていません**。
     */
    expect(RISKY.length, '★全文への否定まで拾っている（★選り分けが効いていない）').toBeLessThan(30);
  });
});
