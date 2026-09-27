/**
 * 🔴 ★**作った画面に、★辿り着く道が在ること**（★2026-09-24）
 *
 * ============================================================================
 * 【🔴 ★何が起きたか】
 *   ★`/stable/foal`（★案 A の「無償の生産 1 頭」）を作り、★本番にも出しました。
 *   ★ところが ★**リンクが 1 本もありませんでした**。★URL を直接打った人しか到達しません。
 *   → ★登録した人は ★**受け取れるはずの馬に辿り着けません**。
 *
 *   ★これは今日 ★**3 度目**の同じ形です:
 *     ★① `fetchOnboardingState` … 書かれていたのに、どこからも呼ばれていなかった
 *     ★② `buy_horse` / `sell_horse` / `unlock_stable_grade` … 本番に在るのに画面が呼ばない
 *     ★③ `/stable/foal` … 画面は在るのに、入口が無い
 *   ★簿 `mechanism-exists-nobody-wired-it` の族です。
 *
 * 【★この検査が見るもの】
 *   ★`app/**​/page.tsx` の道のうち、★**どこからもリンクされていない**ものを挙げる。
 *   ★`href="/…"` と `href={'/…'}` の両方を見る（★`OWN_HEADER` の一覧は ★**道ではない**ので数えない）。
 *
 * ⚠️ ★**入口が無くてよい画面**は在ります（★開発用・実験・LP の分身）。
 *    ★それは ★**簿に理由を書いて**外します。★「黙って外す」は禁止（★R-24 と同じ作法）。
 * ⚠️ ★この検査は ★**「リンクの文字列が在るか」**しか見ません。★押せるか・出るかは別です
 *    （★`FoalInvite` は段階が合うときだけ描きます）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');
const SRC = path.join(ROOT, 'apps/web/src');

/**
 * 🔴 ★**入口が要るのに、まだ無い道**（★簿 `SCREEN-WITHOUT-ENTRANCE`）。
 *
 * ⚠️ ★ここは ★**「要らない」ではありません**。★**「要るが、まだ無い」**です。
 *    ★`NO_ENTRANCE` に混ぜると ★**要らないことにして隠す**ことになります。
 * ⚠️ ★足したら ★**簿にも載せる**こと。★下の検査が「簿に在るか」までは見られないので、
 *    ★ここに書いた理由がそのまま申し送りです。
 */
const ENTRANCE_MISSING: Readonly<Record<string, string>> = {
  /**
   * ✅ ★2026-09-27 に ★0 件になりました（★裁定 §6-2 の 2・3）。
   *   ★`/stable/market` … ★2026-09-26 に実データへ結線済み（★見本の値段は消えた）。★`/stable` のショートカットに入口を置いた
   *   ★`/odds` … ★入口が要らない道だったので ★`NO_ENTRANCE` へ移した（★理由はそちら）
   */
};

/**
 * ★**入口が無くてよい道**（★理由つき）。
 * ⚠️ ★足すときは ★**なぜ入口が要らないか**を書くこと。★書けないなら入口を作る側が正しい。
 */
const NO_ENTRANCE: Readonly<Record<string, string>> = {
  '/': '★玄関そのもの（★LP）。★リンクされる側',
  '/design-preview/odds': '★意匠の下見（★同上）',
  '/rig-lab': '★素材の実験台。★製品の導線に載せない',
  '/rig-lab/sprite': '★同上',
  '/rig-lab/blender': '★同上',
  '/rig-lab/compare': '★同上',
  '/rig-lab/rig': '★同上',
  '/gait-review': '★歩様の見比べ（★同上）',
  '/reset-password': '★メールのリンクから来る（★画面にリンクは置かない）',
  '/forgot-password': '★`/login` から行く。★`/login` 側に在る',
  '/odds': '★**転送口**（★2026-09-27・裁定 §6-2 の 3）。★発売中があれば ★`/odds/<id>` へ転送し、'
    + '★無いときは「★いま発売中のレースがありません」を出すだけ（★`odds/page.tsx`）。'
    + '★利用者が辿る先は ★`/odds/<id>` で、★そこは `/vote` から入口が在る',
};

/** ★`app/**​/page.tsx` の道（★動的な道と組は除く） */
function routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string, route: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('[') || entry.name.startsWith('(') || entry.name === 'api') continue;
      const here = path.join(dir, entry.name);
      const r = `${route}/${entry.name}`;
      if (existsSync(path.join(here, 'page.tsx'))) out.push(r);
      walk(here, r);
    }
  };
  walk(APP, '');
  if (existsSync(path.join(APP, 'page.tsx'))) out.push('/');
  return out.sort();
}

/** ★`apps/web/src` の全部の原文（★`href` を探すため） */
function corpus(): string {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (/\.(tsx|ts)$/.test(entry.name)) parts.push(readFileSync(p, 'utf8'));
    }
  };
  walk(SRC);
  return parts.join('\n');
}

const ALL = corpus();

/**
 * ★**本番で塞いだ開発用の画面**（★`apps/web/src/middleware.ts` の `DEV_ONLY_ROUTES` を ★原文から読む・★写しを持たない）。
 *   ★2026-09-27: ★裁定「オーナー決裁」③ (e)「★塞いだ画面は簿の対象から落とす（★入口が要らない理由が『本番に無い』に変わる）」。
 */
const GATED: readonly string[] = (() => {
  const src = readFileSync(path.join(SRC, 'middleware.ts'), 'utf8');
  const m = src.match(/export const DEV_ONLY_ROUTES[^=]*=\s*\[([\s\S]*?)\];/);
  if (m === null) throw new Error('★middleware.ts の DEV_ONLY_ROUTES が読めない（★走査が壊れている）');
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
})();
const isGated = (r: string): boolean => GATED.some((g) => r === g || r.startsWith(`${g}/`));
/** ★`href="/x"` / `href={'/x'}` / `href={\`/x\`}` を拾う（★`OWN_HEADER` のような裸の一覧は数えない） */
const linked = new Set(
  [...ALL.matchAll(/href=(?:"([^"]+)"|\{'([^']+)'\}|\{`([^`]+)`\})/g)]
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').split('?')[0]!)
    .filter((h) => h.startsWith('/')),
);

describe('🔴 ★画面に辿り着く道が在る', () => {
  it('★走査が空でない（★0 件 通過を合格にしない）', () => {
    expect(routes().length, '🔴 ★画面を 1 つも見つけられていません').toBeGreaterThan(10);
    expect(linked.size, '🔴 ★リンクを 1 つも見つけられていません').toBeGreaterThan(5);
  });

  it('🔴 ★どこからもリンクされていない画面が無い（★在るなら簿に理由を書く）', () => {
    const orphans = routes()
      .filter((r) => !(r in NO_ENTRANCE) && !(r in ENTRANCE_MISSING))
      /** ★本番で塞いだ開発用の画面は ★「本番に無い」ので対象外（★2026-09-27・裁定「オーナー決裁」③ (e)） */
      .filter((r) => !isGated(r))
      .filter((r) => !linked.has(r));
    expect(
      orphans,
      '🔴 ★入口の無い画面が在ります。★URL を打った人しか辿り着けません:\n'
      + `  ${orphans.join('\n  ')}\n`
      + '  → ★リンクを足すか、★`NO_ENTRANCE`（要らない）か `ENTRANCE_MISSING`（要るがまだ無い）に'
      + ' ★**理由を書いて**分けてください',
    ).toEqual([]);
  });

  /**
   * 🔴 ★**「要るがまだ無い」が、★黙って増えない**。
   *   ⚠️ ★この検査は ★**数を釘付け**します。★足すときは数も一緒に上げ、★簿にも載せること。
   *      ★減らすのは自由です（★入口を作った ＝ 良いこと）。
   */
  it('🔴 ★入口待ちの画面が増えていない（★いま 0 件・2026-09-27）', () => {
    const waiting = Object.keys(ENTRANCE_MISSING).filter((r) => !linked.has(r));
    expect(
      waiting.length,
      '🔴 ★入口待ちが増えています。★簿に `SCREEN-WITHOUT-ENTRANCE` を載せ直してください（★2026-09-27 に 0 件で閉じた）:\n'
      + `  ${waiting.join('\n  ')}`,
    ).toBeLessThanOrEqual(0);
  });

  it('⚠️ ★簿に、★もう無い画面が残っていない（★見張り続けない・R-19）', () => {
    const all = new Set(routes());
    const ghosts = [...Object.keys(NO_ENTRANCE), ...Object.keys(ENTRANCE_MISSING)]
      .filter((r) => !all.has(r));
    expect(ghosts, `⚠️ ★もう無い画面が簿に残っています:\n  ${ghosts.join('\n  ')}`).toEqual([]);
  });

  /** ⚠️ ★**入口を作ったのに簿に残っている**、を止める（★`ENTRANCE_MISSING` の掃除） */
  it('⚠️ ★入口ができた画面が `ENTRANCE_MISSING` に残っていない', () => {
    const done = Object.keys(ENTRANCE_MISSING).filter((r) => linked.has(r));
    expect(done, `⚠️ ★入口ができました。★`+`ENTRANCE_MISSING から外してください:\n  ${done.join('\n  ')}`)
      .toEqual([]);
  });
});
