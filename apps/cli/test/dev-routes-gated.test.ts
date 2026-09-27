/**
 * 🔴 ★**開発用の画面は 本番で塞がれている**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md`「オーナー決裁」③）
 *
 * 【★見るもの（★原文）】
 *   ① ★`middleware.ts` の `DEV_ONLY_ROUTES` と ★`config.matcher` が ★1 対 1（★`matcher` は文字どおりでないと働かない）
 *   ② ★判定は ★サーバー側（★middleware）で、★本番では ★誰も通さない（★秘密の URL・クエリで通す口が無い）
 *   ③ ★利用者の観戦の入口 `/watch-race` に ★関門が掛からない（★`/watch` と前方一致で取り違えない）
 *   ④ ★`/design-check` も塞ぐ（★案 (iii)・★条件 (d) はサーバーがログインを知る口が要るので ★当面は例外なく塞ぐ）
 *
 * ⚠️ ★実際に 404 が返ることは ★`next start` で確かめました（★2026-09-27・塞いだ 5 本 404／`/watch-race`・`/`・`/home` 200・
 *    ★404 の中身は存在しない URL と同じ大きさ）。★この網は ★原文の側を釘付けします。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(__dirname, '../../web/src/middleware.ts'), 'utf8');
const listOf = (re: RegExp): string[] => {
  const m = SRC.match(re);
  if (m === null) throw new Error('★middleware.ts が読めない（★走査が壊れている）');
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
};
const ROUTES = listOf(/export const DEV_ONLY_ROUTES[^=]*=\s*\[([\s\S]*?)\];/);
const MATCHER = listOf(/matcher:\s*\[([\s\S]*?)\]/);
/** ★`matcher` の 1 本が その道に当たるか（★`/x/:path*` は `/x` と `/x/...` だけ） */
const hits = (pattern: string, route: string): boolean => {
  const base = pattern.replace(/\/:path\*$/, '');
  return route === base || route.startsWith(`${base}/`);
};

describe('🔴 ★開発用の画面は 本番で塞がれている', () => {
  it('★走査が空振りしていない', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(10);
  });

  it('🔴 ① ★DEV_ONLY_ROUTES と matcher が 1 対 1', () => {
    expect(MATCHER.map((m) => m.replace(/\/:path\*$/, '')).sort()).toEqual([...ROUTES].sort());
    expect(MATCHER.every((m) => m.endsWith('/:path*')), '★下の階層も塞ぐ').toBe(true);
  });

  it('🔴 ② ★本番では誰も通さない（★サーバー側・★抜け道が無い）', () => {
    expect(SRC).toContain("if (process.env.NODE_ENV !== 'production') return NextResponse.next();");
    expect(SRC).toMatch(/return NextResponse\.rewrite\(new URL\('\/__not-found__', request\.url\), \{ status: 404 \}\);/);
    /** ★クエリ・ヘッダ・cookie で通す口を作らない（★秘密の URL に頼らない） */
    expect(SRC).not.toMatch(/searchParams|headers\.get|cookies\.get/);
  });

  it('🔴 ③ ★利用者の観戦の入口に 関門が掛からない（★対照つき）', () => {
    for (const r of ['/watch-race', '/', '/home', '/race', '/records', '/entry']) {
      expect(MATCHER.some((m) => hits(m, r)), `🔴 ★利用者の画面 ${r} が塞がれている`).toBe(false);
    }
    expect(MATCHER.some((m) => hits(m, '/watch')), '★対照: /watch は塞がれている').toBe(true);
    expect(MATCHER.some((m) => hits(m, '/watch/x')), '★対照: /watch の下も塞がれている').toBe(true);
  });

  /** ★2026-09-27（裁定 追記 `41b34b3`・案 (iii)）: ★`/design-check` も ★同じ規則で塞ぐ（★例外を作らない） */
  it('🔴 ④ ★/design-check も塞いでいる（★例外を作らない）', () => {
    expect(ROUTES).toContain('/design-check');
    expect(ROUTES.length, '★開発用 11 本').toBe(11);
  });
});
