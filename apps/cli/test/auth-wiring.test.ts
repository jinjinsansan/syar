/**
 * ★認証の配線を構文木で見る — V-19 ⑨ と ⑪（D-113・裁定 REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918 §6 手順 5/6）
 *
 * 【なぜ構文木で見るのか】
 *   V-19 ⑪ は「★**本番経路で固定すること**」——
 *   「純関数の単体テストが全部通っても、**呼び出し側が検証を飛ばす形に書き換えて全緑なら防御はゼロ**」
 *   （I-3／I-4／L-1 で 3 度踏んだ罠）。**実行時の検査だけでは、経路の書き換えを捕まえられない。**
 *
 *   V-19 ⑨ は「★**検証を通らずにセッションが発行できないこと**」。
 *   D-113 ② で **Edge Function を作らない**と決めたので、この経路の発行者は
 *   **Supabase Auth ただ 1 つ**。→ ★**自前の発行口が増えていないこと**を、ここで固定する。
 *
 * 【★禁止語の一覧で書かない】
 *   D-098 の検査で踏んだ穴（正典 D-108 ③）。**「その名前が現れるか」ではなく、
 *   「どこから何を呼んでいるか」**を見る。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const WEB_SRC = path.join(ROOT, 'apps/web/src');

/** `apps/web/src` 配下の .ts / .tsx を全部集める（★手書きの対象リストは必ず漏れる） */
function allWebSources(dir = WEB_SRC, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) allWebSources(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

/** 註記を落とす（★自分の註記に当たって落ちる罠を避ける — 同型を 3 回踏んだ） */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('★V-19 ⑨ セッションの発行口が Supabase Auth ただ 1 つであること', () => {
  it('★apps/web に service_role キーを読む口が無い（RLS を素通りする）', () => {
    const offenders: string[] = [];
    for (const f of allWebSources()) {
      const src = strip(readFileSync(f, 'utf8'));
      // ★環境変数から service_role を引く形だけを見る（註記で言及するのは可）
      if (/process\.env\[?['"`][A-Z_]*SERVICE_ROLE/.test(src)) {
        offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders, `★service_role をフロントで読んでいます: ${offenders.join(', ')}`).toEqual([]);
  });

  it('★JWT を自前で組み立てる口が無い（D-113 ①）', () => {
    const offenders: string[] = [];
    for (const f of allWebSources()) {
      const src = strip(readFileSync(f, 'utf8'));
      // ★署名・発行のライブラリを取り込んでいないこと
      if (/from\s+['"`](jsonwebtoken|jose|jws|jwt-simple)['"`]/.test(src)) {
        offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders, `★JWT を自前で扱っています: ${offenders.join(', ')}`).toEqual([]);
  });

  it('★createClient を直に呼ぶのは lib/supabase.ts だけ（口を 1 か所に保つ・D-052）', () => {
    const offenders: string[] = [];
    for (const f of allWebSources()) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (rel === 'apps/web/src/lib/supabase.ts') continue;
      const src = strip(readFileSync(f, 'utf8'));
      if (/\bcreateClient\s*\(/.test(src)) offenders.push(rel);
    }
    expect(offenders, `★createClient を直に呼んでいます（lib/supabase.ts 経由にしてください）: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('★V-19 ⑪ 本番経路で固定すること', () => {
  const supabaseTs = (): string => strip(readFileSync(path.join(WEB_SRC, 'lib/supabase.ts'), 'utf8'));

  it('★読み取り用とセッション用の器が分かれている', () => {
    const src = supabaseTs();
    expect(src, '★readClient が無い').toMatch(/export function readClient\s*\(/);
    expect(src, '★authClient が無い').toMatch(/export function authClient\s*\(/);
  });

  it('★readClient はセッションを持たない（読み取りにセッションを紛れ込ませない）', () => {
    const src = supabaseTs();
    /**
     * 🔴 ⚠️ ★**切り出しが空だと、下の「入っていない」は素通しで緑になります**（★CK-3・2026-09-19）。
     *    ★否定の表明（`not.toMatch`）は ★**空文字にも当たりません**。
     *    → ★**切り出せたことを先に確かめます**（R-21）。
     */
    const from = src.indexOf('export function readClient');
    const to = src.indexOf('export function authClient');
    expect(from, '★readClient の宣言が見つからない').toBeGreaterThan(-1);
    expect(to, '★authClient の宣言が readClient より後に無い').toBeGreaterThan(from);
    const readBody = src.slice(from, to);
    expect(readBody.length, '★切り出しが空（★否定の表明が素通しになる）').toBeGreaterThan(20);
    expect(readBody, '★readClient に persistSession が入っています').not.toMatch(/persistSession/);
  });

  it('★authClient は寿命管理をライブラリに任せる（D-113 ②・自前で抱えない）', () => {
    const src = supabaseTs();
    const at = src.indexOf('export function authClient');
    expect(at, '★authClient の宣言が見つからない').toBeGreaterThan(-1);
    const authBody = src.slice(at);
    expect(authBody.length, '★切り出しが空').toBeGreaterThan(20);
    expect(authBody, '★autoRefreshToken の指定が無い').toMatch(/autoRefreshToken:\s*true/);
    expect(authBody, '★persistSession の指定が無い').toMatch(/persistSession:\s*true/);
  });

  it('★どちらの器も未設定を黙って通さない（設定漏れを「データが無い」に見せない）', () => {
    const src = supabaseTs();
    const throws = src.match(/throw new Error\('NEXT_PUBLIC_SUPABASE_URL \/ ANON_KEY が未設定です'\)/g) ?? [];
    expect(throws.length, '★未設定の検査が両方の器にありません').toBe(2);
  });
});
