/**
 * ★**常設レース表示の ★画面ごとの大きさ ── 表が正本・画面が従**（★2026-09-27・裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` ⑤・§5-1）
 *
 * ★正本: ★`apps/web/src/components/uma/race-strip-sizes.ts` の `STRIP_SIZE_BY_ROUTE`（★確定仕様 §3 の表）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**貼り忘れ** … ★表で出す画面（big / mini / text）が ★帯を置いていない
 *   ② 🔴 ★**貼り過ぎ** … ★表で出さない画面（hidden）・★表に無い画面が ★帯を置いている
 *   ③ ★**表の載せ忘れ** … ★本番の画面なのに ★表に行が無い（★判定基準で決めて足す）
 *   ④ ★**表の古い行** … ★表に在るのに ★画面が無い
 *   ⑤ 🔴 ★**画面が大きさを自分で決める** … ★`RaceStrip` に `compact` などの引数を渡す（★表を迂回する）
 *
 * ⚠️ ★網は ★§3 の「判定基準」（★フォーム ＝ 極小…）を ★**写しません**。★写すのは表だけで、★表と画面を突き合わせます。
 * ★「置いている」は ★画面の原文と、★その画面が相対で読む部品（★1 段）に ★`<RaceStrip` が在るか、
 *   ★または ★共通の枠（`story-shell.tsx`）が置く道か（★`shellPlacesStripOn` を ★import して聞く・★写さない）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { STRIP_SIZE_BY_ROUTE, routeKeyOf, stripSizeOf, type StripSize } from '../../web/src/components/uma/race-strip-sizes.js';
import { shellPlacesStripOn } from '../../web/src/components/shell-routes.js';
import { DEV_ONLY_ROUTES } from '../../web/src/middleware.js';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');

function routesOnDisk(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, `${prefix}/${e.name}`); continue; }
      if (e.name === 'page.tsx') out.push(prefix === '' ? '/' : prefix);
    }
  };
  walk(APP, '');
  return out.sort();
}

const pageFileOf = (route: string): string => path.join(APP, route === '/' ? 'page.tsx' : `${route.slice(1)}/page.tsx`);
/** ★本番で 404 の画面: ★`middleware.ts` が塞ぐ ／ ★画面が自分で `notFound()` する（★`/rig-lab`・`/gait-review`・`/design-preview`） */
const SELF_GATED = /if \(process\.env\.NODE_ENV (?:=== 'production'|!== 'development')\) notFound\(\);/;
const isDev = (route: string): boolean => DEV_ONLY_ROUTES.some((d) => route === d || route.startsWith(`${d}/`))
  || SELF_GATED.test(readFileSync(pageFileOf(route), 'utf8'));
const PRODUCT_ROUTES = routesOnDisk().filter((r) => !isDev(r));

/** ★画面の原文 ＋ ★相対で読む部品（★1 段）に `<RaceStrip` が在るか */
function pagePlacesStrip(route: string): boolean {
  const file = path.join(APP, route === '/' ? 'page.tsx' : `${route.slice(1)}/page.tsx`);
  const src = readFileSync(file, 'utf8');
  if (src.includes('<RaceStrip')) return true;
  for (const m of src.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
    const base = path.resolve(path.dirname(file), m[1]!);
    const local = ['.tsx', '.ts'].map((ext) => `${base}${ext}`).find((f) => existsSync(f));
    if (local !== undefined && readFileSync(local, 'utf8').includes('<RaceStrip')) return true;
  }
  return false;
}

/** ★道の見本（★`[id]` を ★実際の道の形に。★枠の判定は実際の道で聞く） */
const sampleOf = (route: string): string => route.replace(/\[[^\]]+\]/g, 'x1');

const placedOn = (route: string): boolean => pagePlacesStrip(route) || shellPlacesStripOn(sampleOf(route));

/** ★突き合わせ（★表と「置いている」の集合から ★違反を返す）。★対照でも同じ関数を通す */
function violations(
  routes: readonly string[],
  table: Readonly<Record<string, StripSize>>,
  placed: (route: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const r of routes) {
    const size = table[r];
    if (size === undefined) {
      out.push(`③ ${r}: 表に行が無い`);
      if (placed(r)) out.push(`② ${r}: 表に無いのに帯を置いている`);
      continue;
    }
    if (size === 'hidden' && placed(r)) out.push(`② ${r}: hidden なのに帯を置いている`);
    if (size !== 'hidden' && !placed(r)) out.push(`① ${r}: ${size} なのに帯を置いていない`);
  }
  return out;
}

describe('★常設帯の大きさ ── 表と画面の突き合わせ（⑤）', () => {
  it('★走査が空でない', () => {
    expect(PRODUCT_ROUTES.length, '★画面を読めていない').toBeGreaterThan(25);
    expect(Object.keys(STRIP_SIZE_BY_ROUTE).length).toBeGreaterThan(25);
    expect(DEV_ONLY_ROUTES.length, '★開発用の一覧を読めていない').toBeGreaterThan(5);
  });

  it('🔴 ①②③ ★表どおりに置いている（★貼り忘れ・貼り過ぎ・載せ忘れが無い）', () => {
    expect(violations(PRODUCT_ROUTES, STRIP_SIZE_BY_ROUTE, placedOn)).toEqual([]);
  });

  it('🔴 ⑥ ★帯が 2 本にならない（★画面が置く ／ ★枠が置く の ★どちらか一方だけ）', () => {
    const both = PRODUCT_ROUTES.filter((r) => pagePlacesStrip(r) && shellPlacesStripOn(sampleOf(r)));
    expect(both).toEqual([]);
    /** ★対照: ★開発用の見本（`/design-preview/odds`）は ★両方が置く形で、★この網は拾える（★本番は 404 なので対象外） */
    expect(pagePlacesStrip('/design-preview/odds') || shellPlacesStripOn('/design-preview/odds')).toBe(true);
  });

  it('★開発用の判定が ★両方の道を拾う（★塞ぐ一覧 ／ ★自分で 404）', () => {
    expect(isDev('/art-lab'), '★middleware が塞ぐ').toBe(true);
    expect(isDev('/rig-lab/race'), '★自分で notFound()').toBe(true);
    expect(isDev('/home'), '★対照: 本番の画面').toBe(false);
  });

  it('★対照 ①: ★big の画面が ★帯を置かなかったら ★落ちる', () => {
    const v = violations(['/home'], { '/home': 'big' }, () => false);
    expect(v).toEqual(['① /home: big なのに帯を置いていない']);
  });

  it('★対照 ②: ★hidden の画面が ★帯を置いたら ★落ちる', () => {
    const v = violations(['/login'], { '/login': 'hidden' }, () => true);
    expect(v).toEqual(['② /login: hidden なのに帯を置いている']);
  });

  it('★対照: ★実物の「置いている」が ★両方の値を返す（★常に真／常に偽の判定ではない）', () => {
    expect(placedOn('/home'), '★/home は自分で置く').toBe(true);
    expect(placedOn('/stable'), '★/stable は枠が置く').toBe(true);
    expect(placedOn('/login'), '★/login は置かない').toBe(false);
    expect(placedOn('/race'), '★/race は置かない').toBe(false);
  });

  it('④ ★表の行に ★実物の画面が在る（★古い行が無い）', () => {
    const disk = new Set(routesOnDisk());
    expect(Object.keys(STRIP_SIZE_BY_ROUTE).filter((k) => !disk.has(k))).toEqual([]);
    /** ★開発用は載せない（★本番は 404） */
    expect(Object.keys(STRIP_SIZE_BY_ROUTE).filter(isDev)).toEqual([]);
  });

  it('🔴 ⑤ ★画面が大きさを渡さない（★`<RaceStrip />` だけ・★表を迂回しない）', () => {
    const offenders: string[] = [];
    const scan = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { scan(p); continue; }
        if (!/\.tsx$/.test(e.name)) continue;
        for (const m of readFileSync(p, 'utf8').matchAll(/<RaceStrip\b([^>]*)\/?>/g)) {
          if (m[1]!.replace('/', '').trim() !== '') offenders.push(`${path.relative(ROOT, p)}: ${m[0]}`);
        }
      }
    };
    scan(path.join(ROOT, 'apps/web/src'));
    expect(offenders).toEqual([]);
    const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
    expect(STRIP, '★帯が表を引いていない').toMatch(/const size = stripSizeOf\(pathname, \{ intro \}\);/);
    expect(STRIP, '★帯が引数を受け取っている').toMatch(/export function RaceStrip\(\): React\.ReactElement \| null/);
  });

  it('🔴 ★初回導入の間は ★導入の道に帯を出さない（★R-18 回答 🔴 #2・★段階はサーバーから）', () => {
    for (const p of ['/stable/foal', '/stable/name']) {
      expect(stripSizeOf(p, { intro: true }), `★${p}: 導入中に出している`).toBe('hidden');
      expect(stripSizeOf(p, { intro: null }), `★${p}: 段階が分からない間に出している`).toBe('hidden');
      expect(stripSizeOf(p, { intro: false }), `★${p}: ★対照: 導入を終えたら 表の値`).toBe(STRIP_SIZE_BY_ROUTE[p]);
    }
    /** ★第 2 便の配合は ★導入に関わらず ★表の値（★導入の道ではない） */
    expect(stripSizeOf('/stable/breed', { intro: true })).toBe('mini');
    /** ★他の画面は ★導入中でも ★表の値（★ホームなどを巻き込まない） */
    expect(stripSizeOf('/home', { intro: true })).toBe('big');
    /** ★段階の出どころは ★画面がサーバーから読んだ値（★帯は推測しない・★ログインの口を使わない） */
    const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
    expect(STRIP).toContain('const size = stripSizeOf(pathname, { intro });');
    const STRIP_LIVE = STRIP.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(STRIP_LIVE, '★帯が段階を自分で読んでいる').not.toMatch(/fetchOnboardingState|lib\/onboarding/);
    const FOAL = readFileSync(path.join(APP, 'stable/foal/page.tsx'), 'utf8');
    const NAME = readFileSync(path.join(APP, 'stable/name/page.tsx'), 'utf8');
    expect(FOAL, '★/stable/foal が段階を渡していない').toMatch(/fetchOnboardingState\(\)\.then\(async \(fresh\) => \{[\s\S]{0,200}reportOnboardingStage\(fresh\.stage\);/);
    expect(NAME, '★/stable/name が段階を渡していない').toMatch(/fetchOnboardingState\(\)\.then\(\(s\) => \{ if \(active\) reportOnboardingStage\(s\.stage\); \}\)/);
  });

  it('★道の当て方（★`[id]` は 1 区切り・★表に無い道は hidden）', () => {
    expect(routeKeyOf('/races/abc')).toBe('/races/[id]');
    expect(routeKeyOf('/races/abc/bet')).toBe('/races/[id]/bet');
    expect(routeKeyOf('/home/')).toBe('/home');
    expect(stripSizeOf('/stable/abc')).toBe('big');
    expect(stripSizeOf('/train')).toBe('mini');
    expect(stripSizeOf('/races/abc')).toBe('text');
    expect(stripSizeOf('/no-such-screen'), '★表に無い道に ★黙って帯を出さない').toBe('hidden');
    expect(stripSizeOf('/'), '★TOP は出さない（§3）').toBe('hidden');
  });
});
