/**
 * 🔴 ★**ログアウトする手段が、サイトに在ること**（★2026-09-25・オーナー指摘）
 *
 * ============================================================================
 * 【🔴 ★何が起きていたか】
 *   ★オーナー: ★**「サイトに今ログアウトボタンがありません。そのためキャッシュが残ります」**
 *   ✔ ★`apps/web/src` を走査したら、★`signOut` も「ログアウト」も ★**1 件もありませんでした**。
 *   → ★一度ログインすると ★**別の口座に切り替えられません**。
 *     ★オーナーは ★本番の一周を新しい口座で試したかったのに、★**入り直せませんでした**。
 *
 * 【★なぜ検査にするか】
 *   ★「入る口はあるが、出る口が無い」は ★**作った側からは見えません**（★自分は入ったままなので）。
 *   ★今日の族（★`mechanism-exists-nobody-wired-it` / `SCREEN-WITHOUT-ENTRANCE`）と同じで、
 *   ★**気づき方が「誰かが困る」しかない**形です。
 *
 * ⚠️ ★この検査が見るのは ★**「口が在ること」**だけです。★押して本当に鍵が消えるかは別
 *    （★`signOut()` の中身は Supabase 側）。★出る口が ★**消えていない**ことを見張ります。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'apps/web/src');

function sources(): { readonly file: string; readonly text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (/\.(tsx|ts)$/.test(entry.name)) out.push({ file: p.replace(/\\/g, '/'), text: readFileSync(p, 'utf8') });
    }
  };
  walk(SRC);
  return out;
}
const FILES = sources();

describe('🔴 ★ログアウトする手段', () => {
  it('★走査が空でない（★0 件 通過を合格にしない）', () => {
    expect(FILES.length, '🔴 ★`apps/web/src` を読めていません').toBeGreaterThan(20);
  });

  it('🔴 ★`signOut()` を呼ぶ所が在る', () => {
    const at = FILES.filter((f) => /auth\s*\.\s*signOut\s*\(/.test(f.text)).map((f) => f.file);
    expect(
      at,
      '🔴 ★ログアウトする所がありません。★一度ログインすると別の口座に切り替えられません',
    ).not.toEqual([]);
  });

  it('🔴 ★その口が、★画面から押せる所に置かれている', () => {
    /**
     * ⚠️ ★`signOut` を呼ぶ部品が在っても、★**どの画面も使っていなければ意味がありません**
     *    （★今日 3 度出た「仕組みは在る、誰も繋がなかった」の形）。
     */
    const parts = FILES.filter((f) => /auth\s*\.\s*signOut\s*\(/.test(f.text));
    const names = parts.flatMap((f) => [...f.text.matchAll(/export function (\w+)/g)].map((m) => m[1]!));
    expect(names.length, '🔴 ★ログアウトの部品が名前を持っていません').toBeGreaterThan(0);
    const used = names.some((n) => FILES.some(
      (f) => f.file.includes('/app/') && new RegExp(`<${n}[\\s/>]`).test(f.text),
    ));
    expect(used, `🔴 ★${names.join(' / ')} を、★どの画面も使っていません`).toBe(true);
  });

  it('★人が読める語で出している（★英語だけにしない）', () => {
    const shown = FILES.some((f) => f.text.includes('ログアウト'));
    expect(shown, '🔴 ★「ログアウト」の語が画面に出ていません').toBe(true);
  });
});
