/**
 * 🔴 ★**登録簿を作ったら、★「何を走査して何と突き合わせるか」を書くまで進めない**
 * （★**CK-17**・2026-09-20）。
 *
 * 【★なぜ検査にするか】
 *   ★2026-09-20、★`staleness` だけが ★**両側とも持っていませんでした**。
 *   ★レビュー側は「新しい簿だから」と説明しましたが、★**実測すると外れます**
 *   （★同じ日に作った 3 つのうち 2 つは最初から両側）。
 *   ✅ ★1 つだけ違ったのは ★**「外を走査する目」の有無**でした。
 *   🔴 ★★**走査の無い簿には、★「増えた／減った」を言う根拠が そもそも無い。**
 *
 * ⚠️ ★この検査は ★**中身の質を見ていません**（★`scans` が本当にそう走査しているかは見ない）。
 *    ★見ているのは ★**「決めたか」**だけです。★それでも、★決めずに足すことはできなくなります。
 */
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { NOT_A_REGISTRY, REGISTRIES } from '../../../tools/lib/registries.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const registries = REGISTRIES as Record<string, { scans: string; compares: string }>;
const notRegistries = NOT_A_REGISTRY as Record<string, string>;

/** ★版管理にある `tools/lib/*.mjs` */
const files = execSync('git ls-files tools/lib', { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n')
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => path.basename(f));

describe('🔴 ★CK-17: 登録簿は「何を走査して何と突き合わせるか」を先に決める', () => {
  it('★走査が空でない（★対照: ★走査が壊れていたら 0 件で通ってしまう）', () => {
    expect(files.length, '🔴 ★`tools/lib/*.mjs` が 1 つも見つかりません').toBeGreaterThan(10);
  });

  it('🔴 ① ★どの部品も、★「簿」か「簿でない」かのどちらかに載っている（★増えた側）', () => {
    const missing = files.filter((f) => registries[f] === undefined && notRegistries[f] === undefined);
    expect(
      missing,
      `🔴 ★新しい部品が、★どちらにも載っていません: ${missing.join(' / ')}\n`
        + '   → ★母集団を持つなら `REGISTRIES` に `scans` と `compares` を書いてください。\n'
        + '   → ★持たないなら `NOT_A_REGISTRY` に**理由**を書いてください（★「対象外」も判断の 1 つ）。',
    ).toEqual([]);
  });

  it('🔴 ② ★消えた部品が載ったままになっていない（★減った側・★ゴースト）', () => {
    const live = new Set(files);
    const ghosts = [...Object.keys(registries), ...Object.keys(notRegistries)]
      .filter((f) => !live.has(f));
    expect(ghosts, `★版管理に無いものが載っています: ${ghosts.join(' / ')}`).toEqual([]);
  });

  it('🔴 ③ ★同じ部品を両方に載せない（★どちらつかずにしない）', () => {
    const both = Object.keys(registries).filter((f) => notRegistries[f] !== undefined);
    expect(both, `★「簿」と「簿でない」の両方に載っています: ${both.join(' / ')}`).toEqual([]);
  });

  it('🔴 ④ ★簿は、★`scans` と `compares` を両方 書いている（★CK-17 の本体）', () => {
    const thin: string[] = [];
    for (const [f, e] of Object.entries(registries)) {
      if (!e.scans || e.scans.length < 10) thin.push(`${f}: scans（何を走査するか）が空か短すぎます`);
      if (!e.compares || e.compares.length < 20) {
        thin.push(`${f}: compares（何と突き合わせるか）が空か短すぎます`);
      }
    }
    expect(
      thin,
      `🔴 ★決めずに足された簿があります:\n   ${thin.join('\n   ')}\n`
        + '   ⚠️ ★走査できないなら、★**代わりに何と突き合わせるか**を `compares` に書いてください\n'
        + '   （★`staleness.mjs` の書き方が見本です）。',
    ).toEqual([]);
  });

  it('★「簿でない」には理由がある（★空で逃げない・NT-2）', () => {
    for (const [f, why] of Object.entries(notRegistries)) {
      expect(why.length, `${f}: 理由が短すぎます`).toBeGreaterThan(10);
    }
  });
});
