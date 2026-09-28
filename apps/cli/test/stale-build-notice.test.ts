/**
 * ★**古い版を開いたままの人に 気づかせる**（★2026-09-28・レビュー側・簿 STALE-CLIENT-NO-NOTICE）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★同じ版なのに「新しい版があります」と出る（★嘘の知らせ）
 *   ② 🔴 ★違う版なのに 出ない（★今回の画面写しの件が また推測で止まる）
 *   ③ 🔴 ★healthz が失敗・値が読めない・手元の版が分からない のに「古い」と言う
 *   ④ 🔴 ★healthz を 定期に叩き続ける（★見えるようになったとき だけ）
 *   ⑤ 🔴 ★知らせを 全画面に散らす（★帯の上の 1 か所だけ）・★新しい意匠を作る（★既存の NoticeBar）
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './lib/ts-blocks.js';
import { isStaleBuild, readServedSha } from '../../web/src/components/uma/stale-build';

const ROOT = path.resolve(__dirname, '../../..');
const src = (p: string): string => stripComments(readFileSync(path.join(ROOT, p), 'utf8'));
const okJson = (body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('★出すか（`isStaleBuild`）', () => {
  it('🔴 ① 対照: 同じ版なら 出ない', () => {
    expect(isStaleBuild('abc123', 'abc123')).toBe(false);
  });
  it('🔴 ② 違う版なら 出る', () => {
    expect(isStaleBuild('abc123', 'def456')).toBe(true);
  });
  it('🔴 ③ どちらかが分からなければ 出ない', () => {
    for (const [c, s] of [[undefined, 'def'], ['abc', null], ['', 'def'], ['abc', ''], [null, null]] as const) {
      expect(isStaleBuild(c, s), `${String(c)} / ${String(s)}`).toBe(false);
    }
  });
});

describe('★いま配っている版を読む（`readServedSha`）', () => {
  it('★読めれば sha', async () => {
    expect(await readServedSha(okJson({ sha: 'def456', worker: null }))).toBe('def456');
  });
  it('🔴 ③ healthz が失敗したら null（★だから 出ない）', async () => {
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const s500 = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    const notJson = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    for (const f of [down, s500, notJson, okJson({ sha: null }), okJson({}), okJson([])]) {
      const served = await readServedSha(f);
      expect(served).toBeNull();
      expect(isStaleBuild('abc123', served), '★失敗なのに「古い」と言った').toBe(false);
    }
  });
});

describe('★知らせの出し方', () => {
  const NOTICE = src('apps/web/src/components/uma/stale-build-notice.tsx');
  it('🔴 ④ 見えるようになったときだけ（★初回・visibilitychange）・★定期に問い合わせない', () => {
    expect(NOTICE).toContain("document.addEventListener('visibilitychange', check)");
    expect(NOTICE).toContain("document.visibilityState !== 'visible'");
    expect(NOTICE, '★定期に問い合わせている').not.toMatch(/setInterval|setTimeout/);
  });
  it('★手元の版は ★束に焼かれた Vercel の値（★人が設定する変数でない）', () => {
    expect(NOTICE).toContain('process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA');
    expect(NOTICE).not.toContain('BUILD_STAMP');
  });
  it('🔴 ⑤ 部品は既存の NoticeBar（★新しい意匠を作らない）', () => {
    expect(NOTICE).toContain('<NoticeBar ');
    expect(NOTICE, '★自前の見た目を持っている').not.toMatch(/style=\{\{/);
  });
  it('🔴 ⑥ NoticeBar は 芝（Backdrop・absolute）より上に描く（★無いと 赤い点しか見えない・本番で実測）', () => {
    const PARTS = src('apps/web/src/components/uma/uma-parts.tsx');
    const at = PARTS.indexOf('export function NoticeBar(');
    expect(at, '★NoticeBar が見つからない').toBeGreaterThan(0);
    const body = PARTS.slice(at, PARTS.indexOf('\n}\n', at));
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain("position: 'relative', zIndex: 1,");
    /** ★芝は absolute（★前提が変わったら この網も見直す） */
    const bd = PARTS.slice(PARTS.indexOf('export function Backdrop('));
    expect(bd).toContain("position: 'absolute', inset: 0");
  });

  it('🔴 ⑤ 出すのは 帯の上の 1 か所だけ', () => {
    const users: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && /<StaleBuildNotice\b/.test(readFileSync(path.join(ROOT, rel), 'utf8'))) users.push(rel);
      }
    };
    walk('apps/web/src');
    expect(users).toEqual(['apps/web/src/components/uma/race-strip.tsx']);
    expect(src('apps/web/src/components/uma/race-strip.tsx')).toContain('return <><StaleBuildNotice /><RaceStripBody /></>;');
  });
});
