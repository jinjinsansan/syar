/**
 * ★**「0 件 通過」を合格として返せない部品**（★**CK-14**・2026-09-20）
 *
 * 【🔴 ★なぜ部品にするか — ★作った本人が 10 分後に踏みました】
 *   ★私は `CK-14`（★「0 だった」を「合格」と読ませない対照を対で置く）を ★**自分で作り**、
 *   ★`C-6` の検査では ★**ちゃんと対照を置きました**。
 *   🔴 ★その ★**10 分後**、★`verify-race-recompute` に 5 つ目の箱を足した直後にこうなりました:
 *   ```
 *   照合して一致 0 本 ／ 食い違い 0 本 ／ 版不明 20 本 → ★終了コード **0**
 *   ```
 *   ★★**1 本も照合していないのに「合格」。** ★★機能が消えた状態が満点です。
 *
 *   → ★★**「気をつける」は効きませんでした。** ★規則を作った本人が守れないなら、
 *     ★★**部品にするしかありません**（★`broad-deletes` / `printed-defaults` / `write-never` /
 *     ★`staleness` に続く 5 つ目）。
 *
 * 【★この部品の主張】
 *   ★★**通す／落とす の 2 つでは足りません。** ★3 つ目が要ります:
 *   ```
 *   0 … ✅ 合格（★**数えたうえで**、★不合格が 0）
 *   1 … 🔴 不合格（★数えて、★不合格が 1 以上）
 *   2 … ⚠️ ★**判定不能**（★★そもそも 1 件も数えられなかった）
 *   ```
 *   ⚠️ ★`2` を `0` に丸めないこと。★★**それが `CK-14` の穴そのもの**です。
 */

/** ★終了コードの意味（★呼ぶ側が数字を書き写さないように） */
export const VERDICT = { PASS: 0, FAIL: 1, UNDECIDABLE: 2 };

/**
 * ★数えた結果から判定を作る。
 *
 * @param checked ★**実際に判定できた件数**（★「対象だった件数」ではありません）
 * @param failed  ★そのうち不合格だった件数
 * @param label   ★何を数えたか（★出力に出ます）
 * @param skipped ★数えられなかった内訳（★任意・★出力に出すだけ）
 */
export function verdictOf({ checked, failed, label, skipped = {} }) {
  if (!Number.isInteger(checked) || checked < 0) {
    throw new Error(`counted-verdict: checked が 0 以上の整数ではありません（${checked}）`);
  }
  if (!Number.isInteger(failed) || failed < 0) {
    throw new Error(`counted-verdict: failed が 0 以上の整数ではありません（${failed}）`);
  }
  if (failed > checked) {
    // 🔴 ★数えた数より不合格が多いのは、★数え方が壊れています
    throw new Error(`counted-verdict: failed(${failed}) が checked(${checked}) を超えています`);
  }
  const lines = [];
  if (checked === 0) {
    lines.push(`🔴🔴 ★**1 件も判定できませんでした（${label}）。★これは「合格」ではありません。**`);
    const why = Object.entries(skipped).filter(([, n]) => Number(n) > 0);
    if (why.length > 0) {
      lines.push(`   ★数えられなかった内訳: ${why.map(([k, n]) => `${k} ${n}`).join(' / ')}`);
    }
    lines.push('   ⚠️ ★**0 件 通過は、★満点に見えます**（★**CK-14**）。★判定不能として返します。');
    return { code: VERDICT.UNDECIDABLE, lines };
  }
  if (failed > 0) {
    lines.push(`🔴 ★不合格 ${failed} 件 / ★判定できた ${checked} 件（${label}）`);
    return { code: VERDICT.FAIL, lines };
  }
  lines.push(`✅ ★合格（${label}）— ★判定できた ${checked} 件 すべて`);
  return { code: VERDICT.PASS, lines };
}

/**
 * ★判定を印刷して終了する。
 * ⚠️ ★`process.exit` はここでしか呼びません（★呼ぶ側が数字を書き写さないため）。
 */
export function exitWithVerdict(v) {
  console.log('');
  for (const l of v.lines) console.log(l);
  process.exit(v.code);
}
