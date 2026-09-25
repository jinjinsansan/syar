/**
 * 🔴 ★**本人スコープの口を読む前に、セッションを見ること**
 *   ★裁定 `REVIEW_IDLE_WORK_20260925.md` (A)（★「機械では無理」と書いた網を ★1 回 試す）
 *
 * 【🔴 ★なぜ要るか — ★同じ欠陥が 2 つの画面に生きていました】
 *   ★`my_*` の view / RPC は ★`where owner_id = auth.uid()` で本人に絞ります。
 *   ★`anon`（未ログイン）は ★**権限が無い**ので、★読むと ★`permission denied for view my_*` が返ります。
 *
 *   ✔ ★① `/entry`（★2026-09-25 に直した）… ★`my_horses` の拒否が ★**公開のレース一覧まで道連れ**にし、
 *     ★「★今週は出走できるレースがありません」と ★**嘘**を出していました。
 *   ✔ ★② `/records`（★**この網が見つけた**）… ★`my_runs` を ★セッション確認なしで読み、
 *     ★`permission denied for view my_runs` が ★**そのまま画面に出ていました**（★`/mypage` から来られます）。
 *     ★staging で実測: ★`anon` → ★拒否／★`authenticated`（セッションなし）→ ★0 行（★「戦績がありません」と嘘）。
 *
 * 【★私は最初「機械では捕まえにくい」と書きました】
 *   ★§4 の表に ★④ として ★**「無い」**と書き、★レビュー側に ★**「試さずに『無い』と書かない」**と
 *   ★言われて作りました。→ ★**すぐ 1 件（`/records`）出ました**。
 *   ⚠️ ★広く「生の `error.message` を画面に出していないか」は ★**作れませんでした**
 *      （★`lib/` に 42 か所 在り、★前置きつきで投げるのが この作品の作法。★全部 挙げる網は使われなくなります）。
 *      → ★**実害の形に絞りました**: ★「本人スコープの口を、セッションを見ずに読んでいないか」。
 *
 * ⚠️ 🔴 ★**画面の一覧を手で書きません。** ★最初 4 枚を手で並べたら ★`/entry` を外しました
 *    （★あちらは ★`SignInRequiredError` ではなく ★帯で伝える形でした）。★導きます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(ROOT, 'apps/web/src/lib');

const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

/** ★註記を空白にする（★行の位置を保つ・★註記の中の文字列で判定しない） */
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const tsFiles = (dir: string): string[] => readdirSync(dir).filter((x) => x.endsWith('.ts'));

/**
 * ★**`catch` の中身を ★波括弧の対応で切り出す**。
 *
 * 🔴 ⚠️ ★**文字数の窓で書いて 1 度 外しました**（★2026-09-25）。
 *   ★最初は ★`/catch\s*\([\s\S]{0,400}?(DEMO_HORSES|…)/` と ★**`catch` から 400 字**で見ていました。
 *   ★`/training` を直したとき ★`catch` の頭に ★長い註記を書いたので、
 *   ★`DEMO_HORSES` が ★**400 字の外**へ出て、★見本に戻しても ★**緑のまま**でした
 *   （★`strip` が註記を ★**同じ長さの空白**に替えるので、★註記のぶんも字数を食います）。
 *   ✔ ★対照で捕まえました（★`setLoaded(DEMO_HORSES)` に戻したのに 7 件 通過）。
 *   → ★**距離で測るのをやめました。** ★`catch` の本体そのものを読みます。
 */
function catchBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/catch\s*(?:\([^)]*\))?\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
    }
    out.push(src.slice(m.index + m[0].length, i));
  }
  return out;
}

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

// ───────────────────────────────── ★① lib 側 ─────────────────────────────────

/**
 * ★**セッションを見なくてよい所**（★理由つき）。
 * ⚠️ ★足すときは ★**なぜ拒否が画面に出ないか**を書くこと。
 */
const NO_SESSION_NEEDED: Readonly<Record<string, string>> = {
  'entry-repo.ts: readEntryError':
    '★これは ★**読む関数ではありません** — ★返ってきた失敗を画面の言葉に写す関数です'
    + '（★`my_` を含むのは ★語の対応表のため）。★DB に触りません',
};

interface Hit { readonly where: string; readonly port: string; }

/** ★`export function` ごとに切り、★本人スコープの口を読んでいるものを挙げる */
function ownerScopedReaders(): { readonly all: Hit[]; readonly unguarded: Hit[] } {
  const all: Hit[] = [];
  const unguarded: Hit[] = [];
  for (const f of tsFiles(LIB)) {
    const src = strip(readFileSync(path.join(LIB, f), 'utf8'));
    for (const part of src.split(/(?=\nexport\s+(?:async\s+)?function\s)/)) {
      const m = part.match(/export\s+(?:async\s+)?function\s+(\w+)/);
      if (m === null) continue;
      const ports = [...part.matchAll(/(?:rpc|from)\('(my_[a-z_]+)'\)/g)].map((x) => x[1]!);
      if (ports.length === 0) continue;
      const where = `${f}: ${m[1]!}`;
      all.push({ where, port: [...new Set(ports)].join(' ') });
      if (NO_SESSION_NEEDED[where] !== undefined) continue;
      if (!/getSession\(\)|SignInRequiredError/.test(part)) {
        unguarded.push({ where, port: [...new Set(ports)].join(' ') });
      }
    }
  }
  return { all, unguarded };
}

// ───────────────────────────────── ★② 画面 側 ─────────────────────────────────

/** ★`SignInRequiredError` を投げる lib を ★導きます（★手で並べない） */
function throwerLibs(): string[] {
  return tsFiles(LIB)
    .filter((f) => /throw new SignInRequiredError/.test(readFileSync(path.join(LIB, f), 'utf8')))
    .map((f) => f.replace(/\.ts$/, ''));
}

/**
 * ★**投げる lib を読むのに、受け止めていない画面**（★理由つき）。
 * ⚠️ 🔴 ★ここに足すのは ★「★未ログインでも ★**嘘を出さない**」と言える場合だけです。
 */
const SCREEN_EXEMPT: Readonly<Record<string, string>> = {
  'apps/web/src/components/uma/foal-invite.tsx':
    '★読めないときは ★**何も出しません**（★`.catch(() => {})`・★玄関を壊さない）。'
    + '★誘いの帯なので、★出ないことが ★嘘になりません',
};

/**
 * 🔴 ★**失敗すると「見本の馬」を出す画面**（★R-16 の類・★別の網では捕まりません）。
 *
 * ⚠️ ★これは ★**生の文を出す**より ★悪い形です:
 *    ★未ログインの人に ★**他人（見本）の馬を「あなたの厩舎」として見せます**。
 *
 * ✅ ★**2026-09-25 に 2 件とも直しました。★いまは空です**
 *   （★裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §2）。
 *   ★起票時は ★`/stable`（`demoStableRepo.stable()`）と ★`/training`（`DEMO_HORSES`）の 2 件でした。
 *   ★私は ★「旧世代・デザイナー待ち」として ★**置いておく**と報告しましたが、
 *   ★レビュー側の裁定は ★**「これは見た目ではなく ★誰のデータを見せるかという ★振る舞い」**
 *   ★だから ★いま直す、でした。★意匠は作らず ★`/records` の字と `a-panel` に寄せました。
 *
 * ⚠️ 🔴 ★**空でも この簿を消さないこと。** ★下の検査が ★「増えたら落ちる」を見ています。
 */
const DEMO_FALLBACK: Readonly<Record<string, string>> = {};

/** ★画面が その lib を ★**値として**読んでいるか（★`import type` は数えない） */
function importsValue(src: string, lib: string): boolean {
  const re = new RegExp(`import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+'[^']*${lib}'`, 'g');
  for (const m of src.matchAll(re)) {
    if (m[1] !== undefined) continue;                       // ★`import type { ... }` は型だけ
    const names = (m[2] ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
    if (names.some((n) => !n.startsWith('type '))) return true;  // ★`{ type X }` 混在も除く
  }
  return false;
}

function screensMissingBranch(): string[] {
  const libs = throwerLibs();
  const out: string[] = [];
  for (const abs of [...walk(path.join(ROOT, 'apps/web/src/app')), ...walk(path.join(ROOT, 'apps/web/src/components'))]) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const src = strip(readFileSync(abs, 'utf8'));
    if (!libs.some((l) => importsValue(src, l))) continue;
    if (/SignInRequiredError/.test(src)) continue;
    if (SCREEN_EXEMPT[rel] !== undefined) continue;
    out.push(rel);
  }
  return out;
}

// ───────────────────────────────── ★検査 ─────────────────────────────────

describe('🔴 ★本人スコープの口は、セッションを見てから読む', () => {
  it('★走査が空振りしていない（★0 件 通過を合格にしない）', () => {
    expect(ownerScopedReaders().all.length, '🔴 ★本人スコープの口を読む関数が 0 件（★走査が壊れている）')
      .toBeGreaterThan(3);
    expect(throwerLibs().length, '🔴 ★`SignInRequiredError` を投げる lib が 0 件（★走査が壊れている）')
      .toBeGreaterThan(3);
  });

  /** 🔴 ★**本命**。★これが ★`/records` を見つけました。 */
  it('🔴 ★セッションを見ずに my_* を読んでいる関数が無い', () => {
    expect(
      ownerScopedReaders().unguarded.map((h) => `${h.where}（${h.port}）`),
      '🔴 ★**未ログインの人に `permission denied for view my_*` が そのまま出ます**。\n'
      + '  ★DB に触る前に ★`getSession()` を見て、★`SignInRequiredError` にしてください。\n'
      + '  ★2026-09-25 の実害: ★`/entry`（★公開のレース一覧まで道連れ・「今週は出走できるレースがありません」と嘘）\n'
      + '  ★と ★`/records`（★`permission denied for view my_runs` が画面に出ていた）。\n'
      + '  ★読む関数でないなら ★`NO_SESSION_NEEDED` に ★**理由つき**で載せてください'
      + otherRegistriesHint('apps/cli/test/owner-scoped-needs-session.test.ts の NO_SESSION_NEEDED'),
    ).toEqual([]);
  });

  /**
   * 🔴 ★**lib が投げたものを、画面が受け止めていること**。
   *   ⚠️ ★投げるだけでは足りません。★画面が他の失敗と混ぜると ★同じことが起きます。
   */
  it('🔴 ★投げる lib を読む画面が、未ログインを受け止めている', () => {
    expect(
      screensMissingBranch(),
      '🔴 ★`SignInRequiredError` を投げる lib を読んでいるのに、★分岐がありません。\n'
      + '  ★未ログインが ★「読めませんでした」と混ざります。\n'
      + '  ★出さない・帯で伝える など ★嘘にならない形なら ★`SCREEN_EXEMPT` に ★理由つきで'
      + otherRegistriesHint('apps/cli/test/owner-scoped-needs-session.test.ts の SCREEN_EXEMPT'),
    ).toEqual([]);
  });

  /**
   * 🔴 ★**見本に落ちる画面が、簿のとおりであること**（★増えたら落ちる／★直したら落ちる）。
   *   ⚠️ ★「落ちる」ほうが目的です。★作り直したら ★簿から消すのが条件です。
   */
  it('🔴 ★見本の馬に落ちる画面が 増えていない・減ったら簿を直す', () => {
    const falls: string[] = [];
    for (const abs of walk(path.join(ROOT, 'apps/web/src/app'))) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      const src = strip(readFileSync(abs, 'utf8'));
      if (catchBlocks(src).some((b) => /DEMO_HORSES|demoStableRepo/.test(b))) falls.push(rel);
    }
    expect(falls.sort(), '🔴 ★**未ログインの人に「見本の馬」を あなたの厩舎として見せます**。\n'
      + '  ★増えたなら ★止めてください（★`/records` の形に寄せる: ★未ログインはそう言う・★失敗は失敗と言う）。\n'
      + '  ★直したなら ★`DEMO_FALLBACK` から消してください。\n'
      + '  ★2026-09-25 に ★`/stable`・`/training` の 2 件を直し、★簿は ★**空**になりました（★裁定 §2）')
      .toEqual(Object.keys(DEMO_FALLBACK).sort());
  });

  /** ★簿に載っているものが 旧世代の簿と食い違っていないこと（★空なら何も見ません） */
  it('★見本に落ちる画面は 旧世代の「作り直し」として登録済み', () => {
    const gens = strip(read('apps/cli/src/screen-generations.ts'));
    for (const rel of Object.keys(DEMO_FALLBACK)) {
      const route = `/${rel.replace(/^apps\/web\/src\/app\//, '').replace(/\/page\.tsx$/, '')}`;
      expect(gens, `🔴 ★${route} が ★`+'`screen-generations.ts` に在りません').toContain(`'${route}'`);
    }
  });

  /**
   * 🔴 ★**使われない除外が残っていないこと**（★直したのに簿が残ると、★次の欠陥を隠します）。
   *   ⚠️ ★これが無いと ★`/stable` を直したあとも ★除外が効き続け、
   *      ★**もう一度 見本に落としても 緑**になります。
   */
  it('🔴 ★使われていない除外が残っていない', () => {
    const libs = throwerLibs();
    const stale: string[] = [];
    for (const rel of Object.keys(SCREEN_EXEMPT)) {
      const src = strip(read(rel));
      /** ★もう その lib を読んでいない、★または ★自分で分岐を持つようになった */
      if (!libs.some((l) => importsValue(src, l))) stale.push(`${rel}（★もう投げる lib を読んでいません）`);
      else if (/SignInRequiredError/.test(src)) stale.push(`${rel}（★自分で分岐を持つようになりました）`);
    }
    expect(stale, '🔴 ★要らなくなった除外が残っています（★消してください。★次の欠陥を隠します）'
      + otherRegistriesHint('apps/cli/test/owner-scoped-needs-session.test.ts の SCREEN_EXEMPT')).toEqual([]);
  });

  /**
   * 🔴 ★**網が本物を噛むこと**（★当時の形を ★検体として埋めます）。
   *   ⚠️ ★手で壊す検査は残りません。★これは残ります。
   */
  it('🔴 ★網が「当時の形」を噛む（★噛まない網を合格にしない）', () => {
    /** ★2026-09-25 に直す前の `loadRecordsScreen`（★実物から写しました） */
    const 当時 = "export async function loadRecordsScreen(period) {\n"
      + "  const auth = authClient();\n"
      + "  const runsRes = await auth.from('my_runs').select('*');\n"
      + "  if (runsRes.error !== null) throw new Error('my_runs: ' + runsRes.error.message);\n}";
    const 直した形 = "export async function loadRecordsScreen(period) {\n"
      + "  const auth = authClient();\n"
      + "  const { data: s } = await auth.auth.getSession();\n"
      + "  if (s.session === null) throw new SignInRequiredError();\n"
      + "  const runsRes = await auth.from('my_runs').select('*');\n}";
    const bites = (src: string): boolean =>
      /(?:rpc|from)\('my_[a-z_]+'\)/.test(src) && !/getSession\(\)|SignInRequiredError/.test(src);
    expect(bites(当時), '🔴 ★当時の形を見逃します（★網の意味がない）').toBe(true);
    expect(bites(直した形), '🔴 ★直した形まで落とします（★直せなくなる）').toBe(false);

    /**
     * 🔴 ★**長い註記を挟んだ `catch` を見逃さないこと**（★私が 1 度 外した形・★上の `catchBlocks` の註記）。
     *   ⚠️ ★`strip` は註記を ★**同じ長さの空白**にするので、★距離で測ると ★静かに外れます。
     */
    const 註記で押し出した形 = `
      try { await repo.stable(); } catch (e) {
        /* ${'あ'.repeat(500)} */
        setLoaded(DEMO_HORSES);
      }`;
    expect(
      catchBlocks(strip(註記で押し出した形)).some((b) => /DEMO_HORSES/.test(b)),
      '🔴 ★註記で押し出された `DEMO_HORSES` を見逃します（★距離で測っていませんか）',
    ).toBe(true);
    /** ★`catch` の外の `DEMO_HORSES` は数えないこと（★読み込み中の置き換えは別の話） */
    expect(
      catchBlocks(strip('const h = loaded ?? DEMO_HORSES;')).some((b) => /DEMO_HORSES/.test(b)),
      '🔴 ★`catch` の外まで拾います（★偽の赤が出ます）',
    ).toBe(false);

    /** ★型だけの読み込みを ★画面側の網が数えないこと（★`horse-resume.tsx` で外しました） */
    expect(importsValue("import type { DiscoveryRow } from '../lib/discovery-screen';", 'discovery-screen'),
      '🔴 ★`import type` を「読んでいる」と数えます（★偽の赤が出ます）').toBe(false);
    expect(importsValue("import { fetchDiscoveryRuns } from '../lib/discovery-screen';", 'discovery-screen'),
      '🔴 ★本当に読んでいるのを見逃します').toBe(true);
  });
});
