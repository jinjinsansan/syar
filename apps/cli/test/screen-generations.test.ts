/**
 * 🔴 ★**画面 1 枚ずつの始末が記録されていて、旧世代が増えないこと**
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §3（2026-09-25）
 *
 * 【🔴 ★なぜ要るか】
 *   ★オーナーの「★白の古いデザインがまだ残っている」は ★**何度も再発**していました。
 *   ★私は「帯が二重」だけを直し、★**画面そのものが旧世代である**ことを見ていませんでした。
 *   ★裁定: ★「同じ役割の画面が 2 つ在ると必ず再発する。★1 枚ずつ決めて記録し、★件数を釘付けする」
 *
 * 【★この網が見るもの】
 *   ★① ★実物の `page.tsx` と簿が ★**1 対 1**（★黙って画面を増やせない・消せない）
 *   ★② ★旧世代の数が ★**増えていない**
 *   ★③ ★`redirected` は ★**ファイルが無く、転送が在る**（★「転送した」が本当か）
 *   ★④ ★どの行にも `why` が在る
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { OLD_GENERATION_MAX, SCREENS } from '../src/screen-generations.js';
import { REBUILD_PINS } from '../src/screen-rebuild-pins.js';
import { screenDeps, screenRoutes } from '../src/screen-deps.js';
import { otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');
const SELF = 'apps/cli/src/screen-generations.ts の SCREENS';

/** ★実物の `page.tsx` から経路を作る（★`/` からの道） */
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

/**
 * ★**簿の経路 → Next の転送の書き方**。
 * ⚠️ ★`[id]` は ★**ファイル名の書き方**で、★転送の `source` は ★**`:id`** です。
 *    ★ここを揃えないと、★動的な転送を入れた日に ★**網が「転送が無い」と嘘をつきます**。
 */
function nextSource(route: string): string {
  return route.replace(/\[([a-zA-Z]+)\]/g, ':$1');
}

/** ★その画面が新世代の部品を読んでいるか */
function usesUma(route: string): boolean {
  const rel = route === '/' ? 'page.tsx' : `${route.slice(1)}/page.tsx`;
  const p = path.join(APP, rel);
  if (!existsSync(p)) return false;
  return readFileSync(p, 'utf8').includes('components/uma');
}

describe('🔴 ★画面の世代と始末（★裁定 §3）', () => {
  it('★走査が空でない', () => {
    expect(routesOnDisk().length, '★page.tsx を 1 つも読めていない').toBeGreaterThan(30);
    expect(SCREENS.length, '★簿が空').toBeGreaterThan(30);
  });

  it('🔴 ★実物の画面が、1 枚残らず簿に在る（★黙って画面を増やせない）', () => {
    const listed = new Set(SCREENS.map((s) => s.route));
    const missing = routesOnDisk().filter((r) => !listed.has(r));
    expect(
      missing,
      '🔴 ★簿に無い画面が在ります。★`apps/cli/src/screen-generations.ts` に\n'
      + '  ★`verdict`（new / redirected / rebuild / dev-only / keep-as-is）と ★`why` を書いてください:\n  '
      + missing.join('\n  ')
      + otherRegistriesHint(SELF),
    ).toEqual([]);
  });

  it('🔴 ★簿に在る画面が実在する（★消えた画面を見張り続けない）', () => {
    const onDisk = new Set(routesOnDisk());
    // ★`redirected` は ★**ファイルが無いのが正しい**
    const ghosts = SCREENS
      .filter((s) => s.verdict !== 'redirected' && !onDisk.has(s.route))
      .map((s) => s.route);
    expect(ghosts, '🔴 ★簿に在るのに実物が無い画面です（★消したなら簿も直す）').toEqual([]);
  });

  /**
   * 🔴 ★**「新版へ送った」が本当か**。
   *   ⚠️ ★ファイルを残したまま簿に `redirected` と書くと、★**画面は 2 つのまま**です。
   *      ★それがまさに ★オーナーの苦情が再発する形です。
   */
  it('🔴 ★redirected はファイルが無く、転送が設定に在る', () => {
    const cfg = readFileSync(path.join(ROOT, 'apps/web/next.config.mjs'), 'utf8');
    const wrong: string[] = [];
    for (const s of SCREENS.filter((x) => x.verdict === 'redirected')) {
      const rel = `${s.route.slice(1)}/page.tsx`;
      if (existsSync(path.join(APP, rel))) wrong.push(`${s.route}: ★ファイルが残っています（★画面が 2 つのまま）`);
      if (!cfg.includes(`source: '${nextSource(s.route)}'`)) {
        wrong.push(`${s.route}: ★転送が next.config.mjs に在りません（★探した形: '${nextSource(s.route)}'）`);
      }
    }
    expect(wrong, '🔴 ★「新版へ送った」が実際には成立していません').toEqual([]);
  });

  /**
   * 🔴 ★**送り先がサーバーを呼んでいること**（★2026-09-25 に実害を出しました）
   *
   * 【★何が起きたか】
   *   ★裁定 §3 の「★新版が在るものはまず新版へ送る」に従って ★`/training` → `/train` の転送を入れ、
   *   ★旧い画面を消しました。
   *   🔴 ★しかし ★**`/train` は「まだ見た目だけ」**でした（★その画面の註記 15 行目が自分でそう書いている）。
   *     ★`/train` … ★`rpc(` も `Repo` も ★**呼ばない**
   *     ★`/training` … ★★**`rpc('set_training_order')` を呼ぶ唯一の画面**
   *   → ★★**転送が「調教の指示を出す口」を消しました。** ★育成のループが止まります。
   *
   * 【⚠️ ★「新版が在る」と「新版が働く」は別】
   *   ★見た目が揃っただけの画面へ送ると、★**機能が静かに消えます**。
   *   ★旧い画面は消えているので、★誰も「前は出来た」と言えません。
   */
  it('🔴 ★転送の送り先が、サーバーを呼んでいる（★見た目だけの画面へ送らない）', () => {
    const wrong: string[] = [];
    for (const s of SCREENS.filter((x) => x.verdict === 'redirected')) {
      const cfg = readFileSync(path.join(ROOT, 'apps/web/next.config.mjs'), 'utf8');
      const m = cfg.match(new RegExp(`source: '${nextSource(s.route)}', destination: '([^']+)'`));
      if (m === null) { wrong.push(`${s.route}: 転送の行が読めない`); continue; }
      // ★送り先の `:id` を ★ファイル名の形（`[id]`）へ戻す
      const dest = m[1]!.replace(/:([a-zA-Z]+)/g, '[$1]');
      const p = path.join(APP, `${dest.slice(1)}/page.tsx`);
      if (!existsSync(p)) { wrong.push(`${s.route} → ${dest}: 送り先が無い`); continue; }
      /**
       * ★送り先が本物に繋がっているかを ★**`screenDeps` に聞きます**。
       *
       * ⚠️ 🔴 ★最初はここで ★`from '../../lib/...'` と ★**階層を決め打ち**していました。
       *    ✔ ★2026-09-25: ★`/odds/[id]` は 3 階層なので `../../../lib/` で、
       *      ★**繋がっているのに「見た目だけ」と嘘をつきました**。
       *    → ★測り方は ★**1 か所（`screen-deps.ts`）**に寄せます（★D-052）。
       *      ★あちらは ★子部品も辿り、★階層も問いません。
       */
      const d = screenDeps(APP, dest);
      const callsServer = d.rpcs.length > 0 || !d.demoOnly;
      if (!callsServer) {
        wrong.push(
          `${s.route} → ${dest}: 🔴 ★送り先が ★**サーバーを呼んでいません**（★見た目だけの画面）。`
          + '★先に繋いでから送ってください',
        );
      }
    }
    expect(wrong, '🔴 ★転送で機能が消えます').toEqual([]);
  });

  it(`🔴 ★旧世代が ${OLD_GENERATION_MAX} 枚以下（★増やさない）`, () => {
    const old = routesOnDisk().filter((r) => !usesUma(r));
    expect(
      old.length,
      `🔴 ★旧世代の画面が増えています（★いま ${old.length} 枚 / 上限 ${OLD_GENERATION_MAX} 枚）。\n`
      + '  ★新しい画面は `components/uma` の部品で作ってください（★R-14）。\n'
      + `  ★いま旧世代のもの: ${old.join(', ')}`,
    ).toBeLessThanOrEqual(OLD_GENERATION_MAX);
  });

  it('★簿の `verdict` と実物の世代が食い違っていない', () => {
    const wrong: string[] = [];
    for (const s of SCREENS) {
      if (s.verdict === 'redirected') continue;
      const isNew = usesUma(s.route);
      if (s.verdict === 'new' && !isNew) wrong.push(`${s.route}: new と書いてあるが components/uma を読んでいない`);
      if (s.verdict === 'rebuild' && isNew) wrong.push(`${s.route}: rebuild と書いてあるが もう新世代（★簿を直す）`);
    }
    expect(wrong, '🔴 ★簿と実物が食い違っています').toEqual([]);
  });

  /**
   * 🔴 ★**作り直しで、いま在る口が静かに消えないこと**
   *   ★裁定 `REVIEW_SCREEN_GENERATIONS_20260925.md`（★「rebuild の 15 枚も 1 枚ずつ・網を先に」）
   *
   * ✔ ★これが在れば、★2026-09-25 の `/training` → `/train` は ★**押す前に止まりました**。
   */
  it('🔴 ★rebuild の画面が、釘付けした口を全部まだ呼んでいる', () => {
    const lost: string[] = [];
    for (const [route, pin] of REBUILD_PINS) {
      const d = screenDeps(APP, route);
      const missingRpcs = pin.rpcs.filter((r) => !d.rpcs.includes(r));
      const missingLibs = pin.libs.filter((l) => !d.libs.includes(l));
      if (missingRpcs.length > 0 || missingLibs.length > 0) {
        lost.push(
          `${route}: ${missingRpcs.length > 0 ? `RPC [${missingRpcs.join(' ')}] ` : ''}`
          + `${missingLibs.length > 0 ? `lib [${missingLibs.join(' ')}]` : ''}`
          + `${pin.note === undefined ? '' : `\n      → ${pin.note}`}`,
        );
      }
    }
    expect(
      lost,
      '🔴 ★作り直しで ★**呼んでいた口が消えています**。\n'
      + '  ★意図して減らしたなら、★`apps/cli/src/screen-rebuild-pins.ts` を直し、'
      + '★**なぜ減らしたか**を書いてください。\n'
      + '  ★2026-09-25: ★`/training` → `/train` の転送で '
      + '★`rpc(\'set_training_order\')` が消え、★育成のループが止まるところでした:\n    '
      + lost.join('\n    '),
    ).toEqual([]);
  });

  it('★釘の一覧が、簿の rebuild と 1 対 1（★片方だけ増えない）', () => {
    const rebuilds = SCREENS.filter((s) => s.verdict === 'rebuild').map((s) => s.route).sort();
    const pinned = [...REBUILD_PINS.keys()].sort();
    expect(pinned, '★簿の rebuild と釘の一覧が食い違っています').toEqual(rebuilds);
  });

  /**
   * 🔴 ★**見本のデータだけの画面を挙げる**（★綺麗にしても中身が空のもの）。
   * ⚠️ ★落とすための網ではありません。★**増えたら**落ちます。
   */
  /**
   * 🔴 ★**見本だけの画面**（★綺麗にしても中身が空のもの）。
   *
   * ⚠️ ★**名前で当てているので誤検知が出ます。** ★除外は ★理由つきでここに書きます
   *    （★正規表現を足して当てにいかない — ★当てにいくと、★次の誤検知で また足すことになります）。
   */
  const NOT_DEMO_DESPITE_NAME: Readonly<Record<string, string>> = {
    '/race': '★`DEMO_CONTEST_GAMMA` は ★**ガンマ値（描画の数）**で、★`DEMO_WIN_ODDS` は'
      + '★オッズ板の下見用の配列。★どちらも「中身が空」の印ではない。'
      + '★レースそのものは `watch-pool.json` と URL の引数から来る（★中継・下見の画面・`keep-as-is`）',
  };

  it('🔴 ★見本だけの画面が増えていない', () => {
    const demo = screenRoutes(APP)
      .filter((r) => screenDeps(APP, r).demoOnly)
      .filter((r) => NOT_DEMO_DESPITE_NAME[r] === undefined);
    /**
     * ★2026-09-25 の ★**実測**（★引き算していません）:
     *   ✅ ★`/stable/[horseId]` … ★2026-09-25 に ★**本物へ絋ぎました**（`stable-repo` + `discovery-screen`）。
     *      ⚠️ ★最初この網は ★**見落としていました** — ★`lib/stable` という名前で、
     *      ★モジュール名だけを見ていたため（★取り込んでいたのは `demoStableRepo`）
     *   ✅ ★`/stable/market` … ★**2026-09-26 に実データへ繋ぎました**（★これで ★見本だけの画面は ★**0 枚**）。
     *      ⚠️ ★空（`[]`）で通すのを ★合格にしないため、★下の「走査が空振りしていない」が ★別に見ています
     */
    expect(
      demo,
      '🔴 ★見本のデータだけの画面が増えています（★本物に繋いでから作り直すこと）。\n'
      + '  ★名前のせいで誤検知なら、★`NOT_DEMO_DESPITE_NAME` に ★**理由つき**で載せてください',
    ).toEqual([]);
  });

  it('★どの行にも why が書かれている（★空欄で決めない）', () => {
    const silent = SCREENS.filter((s) => s.why.length < 4).map((s) => s.route);
    expect(silent, '★理由が書かれていない画面').toEqual([]);
  });

  /**
   * 🔴 ★**本番で開ける開発用の画面を数える**（★オーナー判断の材料）。
   *   ⚠️ ★これは ★**落とすための網ではありません**（★塞ぐかはオーナー判断）。
   *      ★数が ★**増えたら**落ちます（★新しい下見画面を護りなしで足さない）。
   */
  it('🔴 ★護りなしの開発用画面が増えていない', () => {
    const unguarded = SCREENS
      .filter((s) => s.verdict === 'dev-only')
      .filter((s) => {
        const p = path.join(APP, `${s.route.slice(1)}/page.tsx`);
        if (!existsSync(p)) return false;
        return !readFileSync(p, 'utf8').includes("NODE_ENV !== 'development'");
      })
      .map((s) => s.route);
    /** ★2026-09-25 の実測（★`/design-preview/odds` だけが護りを持つ） */
    const PINNED = 18;
    expect(
      unguarded.length,
      `🔴 ★本番で開ける開発用の画面が増えています（★いま ${unguarded.length} / 釘 ${PINNED}）。\n`
      + "  ★新しい下見画面には `if (process.env.NODE_ENV !== 'development') notFound();` を入れてください。\n"
      + `  ★いま護りなし: ${unguarded.join(', ')}`,
    ).toBeLessThanOrEqual(PINNED);
  });
});
