/**
 * ★**viewport は ★明示で 1 か所**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md` 追記）
 *
 * 【★見ている壊れ方】
 *   ① ★暗黙の既定に頼る … ★誰かが別の値を書いた日に ★**全画面が黙って組み替わる**
 *   ② ★画面ごとに ★別の viewport を書く … ★画面によって描く幅が変わる（★`.show-narrow` などの前提が崩れる）
 *   ③ ★拡大を禁じる（`user-scalable=no` / `maximumScale: 1`）… ★読めない人が拡大できない
 *
 * ✔ ★値は ★Next の既定と同じ（★`width=device-width, initial-scale=1`）。★明示の前後で ★配信された `<head>` が同じことを確かめた。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');
const LAYOUT = readFileSync(path.join(APP, 'layout.tsx'), 'utf8');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p));
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('★viewport の宣言', () => {
  it('🔴 ① ★根の layout が ★既定と同じ値を明示している', () => {
    expect(LAYOUT).toContain("export const viewport = { width: 'device-width', initialScale: 1 };");
  });

  it('🔴 ② ★viewport を書くのは ★根の layout だけ', () => {
    const others = filesUnder(APP)
      .filter((f) => f !== path.join(APP, 'layout.tsx'))
      .filter((f) => /export const viewport\b|export (async )?function generateViewport\b|name="viewport"/.test(readFileSync(f, 'utf8')));
    expect(others.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('③ ★拡大を禁じていない', () => {
    expect(LAYOUT).not.toMatch(/maximumScale|userScalable|user-scalable/);
  });
});
