/**
 * 🔴 ★**「進む語」を出している所は、★押せること**（★2026-09-25・レビュー側の提案）
 *
 * ============================================================================
 * 【🔴 ★何が起きていたか】
 *   ★`/entry` の「登録する（200 EP）」は ★**`<span>`** で、★`onClick` がありませんでした。
 *   ★`title="サーバー接続まで押せません"` と書かれたまま、★**押しても何も起きません**。
 *   ★登録の関数（`supabaseEntryRepo.enter`）は在るのに、★**誰も呼んでいません**でした。
 *   ✔ ★本番の実測: ★持ち主の居る馬の登録 ★**0 件**（★誰も一度も登録できていない）。
 *
 * 【★私は「機械では捕まえられない」と言いました。★それは誤りでした】
 *   ★レビュー側の指摘: ★**「進む語を持つ要素は `button` か `onClick` を持つ」は機械で言える**。
 *   ★「押したら何が起きるべきか」は機械に分かりませんが、
 *   ★**「押す気にさせる語を出しておいて、押せない」**なら分かります。
 *
 * ⚠️ ★これは ★**当て推量の網**です。★誤検知はありえます。
 *    ★見つけたものが「本当に押せなくてよい」なら、★簿に理由を書いて外します。
 * ⚠️ ★**件数を釘付け**します（★黙って増えない）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src');

/**
 * ★**進む語**（★押すと状態が変わる、と読める語）。
 * ⚠️ ★これは ★**「表示文字の全部がこの語」**のときだけ見ます（★下の `isLabel`）。
 *    ★最初に緩く（★語を含む）作ったら、★地の文（「確定した走破タイム」）と
 *    ★見出し（「最初の 1 頭を生産する」）で ★**誤検知 14 件**。★語は札のときだけ札です。
 */
const ACTION_WORDS = [
  '登録する', '購入する', '交換する', '命名する', '生産する',
  '確定する', '申し込む', '投票する', '送信する', '保存する', 'この名前にする',
];

/**
 * ★**押せる形になっていないが、それでよい所**（★理由つき）。
 * ⚠️ ★足すときは ★**なぜ押せなくてよいか**を書くこと（★空欄で足さない）。
 */
const NOT_PRESSABLE: Readonly<Record<string, string>> = {
  'apps/web/src/app/watch/page.tsx': '★開発用の検分の画面（★オーナーの導線に無い）',
};

/**
 * ★表示文字が ★**札**か（★語そのもの＋括弧・記号だけ）。
 * ★`登録する（{race.feeEP} EP）` → ✔ 札。★`投票するにはログインが必要です` → ✘ 地の文。
 */
function isLabel(text: string): string | null {
  const bare = text
    .replace(/\{[^{}]*\}/g, '')          // ★`{race.feeEP}` を落とす
    .replace(/[（）()[\]{}・…→\s\d]|EP|PP/g, '') // ★括弧・記号・数字・単位を落とす
    .trim();
  return ACTION_WORDS.find((w) => bare === w) ?? null;
}

interface Hit { readonly file: string; readonly tag: string; readonly text: string; readonly word: string; }

function hits(): Hit[] {
  const out: Hit[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!entry.name.endsWith('.tsx')) continue;
      const src = readFileSync(p, 'utf8');
      /**
       * ★開きタグ → 中身（`<` を含まない） → 次のタグ、を拾う。
       * ⚠️ ★入れ子の中身は拾えません（★部品に渡す `label="登録する"` も別に見ます）。
       */
      for (const m of src.matchAll(/<([a-z][\w.]*)((?:[^<>]|\{[^{}]*\})*)>([^<{]*(?:\{[^{}]*\}[^<{]*)*)</g)) {
        const [, tag, attrs, text] = m;
        if (tag === undefined || attrs === undefined || text === undefined) continue;
        const word = isLabel(text);
        if (word === null) continue;
        // ★押せる形か（★`button` / `a` / `onClick` を持つ）
        if (tag === 'button' || tag === 'a') continue;
        if (/\bonClick\b/.test(attrs)) continue;
        const file = p.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, '');
        if (file in NOT_PRESSABLE) continue;
        out.push({ file, tag, text: text.trim().slice(0, 40), word });
      }
    }
  };
  walk(APP);
  return out;
}

describe('🔴 ★進む語を出している所は、押せる', () => {
  it('★走査が空でない（★0 件 通過を合格にしない）', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.tsx')) files.push(p);
      }
    };
    walk(APP);
    expect(files.length, '🔴 ★tsx を 1 つも読めていません').toBeGreaterThan(20);
    expect(Object.keys(NOT_PRESSABLE).length, '★簿が空（★形だけ確かめる）').toBeGreaterThan(0);
  });

  /**
   * 🔴 ★**当時の実物を検体にする**（★手で壊す検査は残らない・★これは残る）
   * ★下の 1 行目は ★2026-09-25 まで `/entry` に在った本物です。
   */
  it('🔴 ★網が「あの `<span>登録する`」を噛む（★噛まない網を合格にしない）', () => {
    const 当時の実物 = '<span style={{ opacity: .5 }} title="サーバー接続まで押せません">登録する（{race.feeEP} EP）</span>';
    const 直した形 = '<button onClick={() => void submit(race)} style={{ fontWeight: 900 }}>登録する（{race.feeEP} EP）</button>';
    const 地の文 = '<p>出馬表は閲覧できます。投票するにはログインしてください。</p>';
    const 見出し = '<div style={{ fontWeight: 900 }}>最初の 1 頭を生産する</div>';

    const bites = (src: string): boolean => {
      for (const m of src.matchAll(/<([a-z][\w.]*)((?:[^<>]|\{[^{}]*\})*)>([^<{]*(?:\{[^{}]*\}[^<{]*)*)</g)) {
        const [, tag, attrs, text] = m;
        if (tag === undefined || attrs === undefined || text === undefined) continue;
        if (isLabel(text) === null) continue;
        if (tag === 'button' || tag === 'a') continue;
        if (/\bonClick\b/.test(attrs)) continue;
        return true;
      }
      return false;
    };

    expect(bites(`${当時の実物}<`), '🔴 ★網が本物の欠陥を見逃します（★網の意味がない）').toBe(true);
    expect(bites(`${直した形}<`), '🔴 ★直した形まで落とします（★直せなくなる）').toBe(false);
    expect(bites(`${地の文}<`), '🔴 ★地の文を落とします（★誤検知で網が外される）').toBe(false);
    expect(bites(`${見出し}<`), '🔴 ★見出しを落とします（★誤検知で網が外される）').toBe(false);
  });

  it('🔴 ★押せない形で「進む語」を出していない', () => {
    const found = hits();
    expect(
      found,
      '🔴 ★押す気にさせる語を出しているのに、★`button` でも `onClick` でもありません。\n'
      + '   ★2026-09-25: ★`/entry` の「登録する」が `<span>` のままで、'
      + '★**本番で誰も一度もレースに登録できていません**でした:\n'
      + `  ${found.map((h) => `${h.file} <${h.tag}> "${h.text}"`).join('\n  ')}`,
    ).toEqual([]);
  });
});
