/**
 * ★**画面が（子部品を辿って）何に依存しているか**を測る
 *   ★裁定 `REVIEW_SCREEN_GENERATIONS_20260925.md`（★「rebuild の 15 枚も 1 枚ずつ・網を先に」）
 *
 * 【🔴 ★なぜ子部品を辿るのか — ★同じ形で何度も外している】
 *   ★`/entry` の登録の実体は ★`lib/entry-screen.ts` に在り、★`page.tsx` だけ見ると分かりません。
 *   ★2026-09-25、★`entry-repo.ts` を直して「直した」と報告したのに、
 *   ★**画面は別のファイル（`entry-screen.ts`）を使っていました。**
 *   ★`/records` も `page.tsx` は `records-view.tsx` に渡すだけです。
 *   → ★**同じディレクトリの相対 import を辿ります**（★既定 2 段）。
 *
 * 【⚠️ ★それでも浅いことを書いておきます】
 *   ★`../../components/uma/...` のような ★**共有の部品は辿りません**。
 *   ★だから「★依存が 0 件」＝「★何もしていない」ではありません。
 *   ★この測りが言えるのは ★**「この画面のすぐ下に在る依存」**だけです。
 *
 * 【★何のための測りか】
 *   ★`rebuild` の画面を ★作り直したとき、★**前は呼んでいた口が静かに消えていないか**を見ます。
 *   ✔ ★2026-09-25 の実害: ★`/training` → `/train` の転送で
 *     ★**`rpc('set_training_order')` が消えました**（★`/train` は見た目だけだった）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface ScreenDeps {
  /** ★画面から辿れる範囲で呼んでいる RPC の名前（★並びは固定） */
  readonly rpcs: readonly string[];
  /** ★読んでいる `lib/` の名前（★並びは固定） */
  readonly libs: readonly string[];
  /** ★取り込んでいる「見本」の名前（★`demoStableRepo` / `DEMO_HORSES` など・★並びは固定） */
  readonly demoSymbols: readonly string[];
  /**
   * 🔴 ★**見本だけで出来ているか**（★中身の無い画面）。
   *
   * ⚠️ 🔴 ★**最初これを「`lib` の名前に demo が入っているか」で見ていました。★漏れました。**
   *    ✔ ★2026-09-25 の実例: ★`/stable/[horseId]` は ★`lib/stable` から
   *      ★**`demoStableRepo`** を取り込んでいます。★モジュール名は `stable` なので ★**素通り**し、
   *      ★私の網は「見本だけの画面は `/stable/market` だけ」と言っていました。
   *    → ★**取り込んでいる名前**（`demoXxx` / `DEMO_*`）も見ます。
   */
  readonly demoOnly: boolean;
}

/** ★相対 import を辿って、★読んだ全部のソースを 1 本に繋ぐ */
function bundle(file: string, depth: number, seen: Set<string>): string {
  if (seen.has(file) || !existsSync(file) || depth < 0) return '';
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  let all = src;
  for (const m of src.matchAll(/from '(\.\/[^']+)'/g)) {
    for (const ext of ['.tsx', '.ts']) {
      const p = path.join(path.dirname(file), `${m[1]!}${ext}`);
      if (existsSync(p)) { all += `\n${bundle(p, depth - 1, seen)}`; break; }
    }
  }
  return all;
}

/** ★`apps/web/src/app` の下の経路を全部挙げる */
export function screenRoutes(appDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, `${prefix}/${e.name}`);
      else if (e.name === 'page.tsx') out.push(prefix === '' ? '/' : prefix);
    }
  };
  walk(appDir, '');
  return out.sort();
}

export function screenDeps(appDir: string, route: string): ScreenDeps {
  const file = path.join(appDir, route === '/' ? 'page.tsx' : `${route.slice(1)}/page.tsx`);
  const src = bundle(file, 2, new Set());
  const rpcs = [...new Set([...src.matchAll(/rpc\('([a-z_]+)'/g)].map((m) => m[1]!))].sort();
  const libs = [...new Set([...src.matchAll(/from '(?:\.\.\/)+lib\/([a-z0-9-]+)'/g)].map((m) => m[1]!))].sort();
  /**
   * ★取り込んでいる「見本」の名前（★`demoStableRepo` / `DEMO_HORSES`）。
   *
   * ⚠️ 🔴 ★**`DEMO_` で始まるだけでは見本データとは限りません。**
   *    ✔ ★2026-09-25 の実例: ★`/race` の ★**`DEMO_CONTEST_GAMMA`** は ★ガンマ値（★描画の数）で、
   *      ★`DEMO_WIN_ODDS` は ★オッズ板の下見用の配列です。★どちらも「中身が空」の印ではありません。
   *    → ★**名前で当てるのはここまで**にし、★除外は ★`screen-generations.test.ts` の
   *      ★**理由つきの簿**に置きます（★正規表現を足して当てにいかない）。
   */
  const demoSymbols = [...new Set([...src.matchAll(/\b(demo[A-Z]\w*|DEMO_\w+)\b/g)].map((m) => m[1]!))].sort();
  /**
   * ★本物に繋がっている印（★`rpc(` を呼ぶか、★見本でない `lib` を読むか）。
   * ⚠️ ★`lib/stable` のように ★**名前では分からない**モジュールが在るので、
   *    ★「見本の名前を取り込んでいて、★かつ本物の印が無い」を ★見本だけ とします。
   */
  const realLibs = libs.filter((l) => !l.includes('demo'));
  /**
   * ★本物に繋がっている印。
   * ⚠️ 🔴 ★最初 ★`-repo` / `-screen` の lib だけを印にしたら、
   *    ★`/race`（★DB 呼び出し 17 か所）と ★`/odds/[id]`（★4 か所）を ★**見本だけ**と誤検知しました。
   *    ★どちらも ★**`supabase` を直に叩いています**（★lib を通していないだけ）。
   * → ★**DB を叩いているか**も印にします（★`.from(` / `readClient()` / `authClient()`）。
   */
  /**
   * ⚠️ 🔴 ★`\.from\(` だけだと ★**`Array.from({ length: n })`** に一致します。
   *    ✔ ★2026-09-25 の実例: ★`/stable/market` が「本物」に見え、★**真の陽性を落としました**。
   * → ★表の名前の ★**引用符まで**見ます（★`.from('races')`）。
   */
  const hitsDb = /\.from\('|readClient\(\)|authClient\(\)/.test(src);
  const looksReal = rpcs.length > 0 || hitsDb
    || realLibs.some((l) => l.endsWith('-repo') || l.endsWith('-screen'));
  return {
    rpcs, libs, demoSymbols,
    demoOnly: demoSymbols.length > 0 && !looksReal,
  };
}
