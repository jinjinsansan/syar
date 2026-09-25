/**
 * 🔴 ★**毛色の出どころは `coat.ts` だけ**（★裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §9-1 の条件 ①）
 *
 * 【🔴 ★なぜ要るか — ★月毛と白毛が 1 度も画面に出ていません】
 *   ✔ ★焼きは済んでいます（★2026-09-24・**9 毛色 91 枚**・簿 `COAT-PALOMINO-WHITE-NOT-BAKED`）。
 *   🔴 ★しかし ★`/race` は ★**枠番から毛色を引いています**（`COAT_BY_GATE`・18 枠の表）。
 *     ★その表に ★**月毛（palomino）と白毛（white）が入っていません**。
 *     → ★★**焼いてあるのに、★引く側が 7 色しか呼びません**（★簿 `asset-baked-is-not-asset-loaded` の形）。
 *
 * 【★この網が見るもの】
 *   ★① ★`COAT_WEIGHTS` を ★**`coat.ts` の外に写していないか**（★D-052・重みが 2 か所になる）
 *   ★② ★毛色名を並べた表が ★**登録簿に無いまま**増えていないか
 *   ★③ ★`coat.ts` 自身が ★**9 色すべて**持っているか（★走査が空振りしていない）
 *
 * ⚠️ ★**`COAT_BY_GATE` を いま消しません。** ★`/race` は ★まだ実レースを読んでいないので
 *    （★`horseId: String(i + 1)` ＝ ★枠番。★`DESIGN_LIVE_RACE_DATA_CONTRACT_20260921.md`）、
 *    ★渡せる馬 ID が在りません。★**登録簿に「見本だけ」として載せ、★期限を付けます。**
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { COAT_WEIGHTS } from '../../../packages/render/src/coat.js';
import { otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');
const COAT_TS = 'packages/render/src/coat.ts';

const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

/** ★註記を空白にする（★行の位置を保つ・★註記の中の語で判定しない） */
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/**
 * ★**毛色名を並べているのに、`coat.ts` から引いていない表**（★理由つき）。
 * ⚠️ 🔴 ★足すときは ★**いつ消えるか**を書くこと（★「見本だから」で永久に残さない）。
 */
const COAT_LIST_EXEMPT: Readonly<Record<string, string>> = {
  'apps/web/src/app/race/page.tsx: COAT_BY_GATE':
    '🔴 ★**見本の 18 枠の表**（★月毛・白毛を含まない）。'
    + '★`/race` は まだ ★**実レースを読んでいません** — ★`horseId: String(i + 1)` は ★枠番そのもので、'
    + '★`coatOfHorseId` に渡せる馬 ID が在りません（★`DESIGN_LIVE_RACE_DATA_CONTRACT_20260921.md`）。'
    + '✅ ★**消す条件**: ★`0089` の `horse_id` を読む経路が `/race` に入った日。'
    + '★そのとき ★`coatOfHorseId(entrant.horseId)` に替え、★この行を消すこと。'
    + '★簿 `COAT-PALOMINO-WHITE-NOT-BAKED` の ③ が同じことを追っています',
};

/** ★毛色名（★`coat.ts` の重みの表から導く。★ここに写さない） */
const COAT_NAMES = COAT_WEIGHTS.map(([name]) => name);

const sources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
    }
  };
  walk('apps/web/src');
  walk('packages/render/src');
  return out;
};

describe('🔴 ★毛色の出どころは coat.ts だけ', () => {
  it('★走査が空振りしていない（★9 色 揃っているか）', () => {
    expect(COAT_NAMES.length, '🔴 ★毛色が 9 色でない（★焼きは 9 色で済んでいる）').toBe(9);
    expect(COAT_NAMES, '🔴 ★月毛・白毛が重みの表に無い').toContain('palomino');
    expect(COAT_NAMES, '🔴 ★白毛が重みの表に無い').toContain('white');
    expect(sources().length, '★走査したファイルが 0 件').toBeGreaterThan(50);
  });

  /**
   * 🔴 ★**重みを 2 か所に持たない**（★D-052・★裁定の条件 ①）。
   *   ⚠️ ★重みの数（30 / 16 / 10 …）が ★`coat.ts` の外に並んでいたら落ちます。
   */
  it('🔴 ★COAT_WEIGHTS を coat.ts の外に写していない', () => {
    const copies: string[] = [];
    for (const rel of sources()) {
      if (rel === COAT_TS) continue;
      const src = strip(read(rel));
      if (/COAT_WEIGHTS\s*[:=]/.test(src)) copies.push(`${rel}（★重みの表を自分で定義している）`);
      /** ★名前と数の組が 3 つ以上 並んでいたら、★重みの写しと見ます */
      const pairs = [...src.matchAll(/'(bay|dark-bay|chestnut|grey|liver-chestnut|seal-brown|blue-black|palomino|white)'\s*,\s*\d+/g)];
      if (pairs.length >= 3) copies.push(`${rel}（★毛色と数の組が ${pairs.length} 件 並んでいる）`);
    }
    expect(copies, '🔴 ★**毛色の重みが 2 か所になります**（★D-052）。\n'
      + `  ★重みは ★\`${COAT_TS}\` の ★\`COAT_WEIGHTS\` だけが持ちます。\n`
      + '  ★毛色が要る所は ★`coatOfHorseId(horseId)` を呼んでください'
      + otherRegistriesHint('apps/cli/test/coat-single-source.test.ts の COAT_LIST_EXEMPT')).toEqual([]);
  });

  /**
   * 🔴 ★**毛色名を並べた表は、★登録簿に載っているものだけ**。
   *   ★これが ★`COAT_BY_GATE` を捕まえ、★**消す条件と期限**を読ませます。
   */
  it('🔴 ★毛色名を並べた表が、登録簿に無いまま増えていない', () => {
    const found: string[] = [];
    for (const rel of sources()) {
      if (rel === COAT_TS) continue;
      const src = strip(read(rel));
      /** ★`const 名前: ... = [ 'bay', 'chestnut', … ]` の形（★4 つ以上 並べたら表と見ます） */
      for (const m of src.matchAll(/const\s+(\w+)[^=\n]*=\s*\[([^\]]*)\]/g)) {
        const names = [...(m[2] ?? '').matchAll(/'([a-z-]+)'/g)].map((x) => x[1]!);
        const hits = names.filter((n) => (COAT_NAMES as readonly string[]).includes(n));
        if (hits.length < 4) continue;
        const key = `${rel}: ${m[1]!}`;
        if (COAT_LIST_EXEMPT[key] !== undefined) continue;
        found.push(`${key}（★毛色 ${hits.length} 件）`);
      }
    }
    expect(found, '🔴 ★**毛色名を並べた表が増えています**。\n'
      + '  ★毛色は ★`coatOfHorseId(horseId)` から引いてください（★枠番から引かない）。\n'
      + '  ★見本の表として要るなら ★`COAT_LIST_EXEMPT` に ★**消す条件つき**で載せてください'
      + otherRegistriesHint('apps/cli/test/coat-single-source.test.ts の COAT_LIST_EXEMPT')).toEqual([]);
  });

  /**
   * 🔴 ★**除外は腐る**（★2026-09-25 の作法・`tools/lib/registries.mjs`）。
   *   ★`COAT_BY_GATE` が消えたら、★この除外も消さないと ★**次の表を隠します**。
   */
  it('🔴 ★使われていない除外が残っていない', () => {
    const stale: string[] = [];
    for (const key of Object.keys(COAT_LIST_EXEMPT)) {
      const [rel, name] = key.split(': ');
      const src = strip(read(rel!));
      if (!new RegExp(`const\\s+${name!}\\b`).test(src)) stale.push(`${key}（★もう在りません）`);
    }
    expect(stale, '🔴 ★要らなくなった除外が残っています（★消してください。★次の表を隠します）').toEqual([]);
  });

  /**
   * 🔴 ★**焼いた 9 色が、引く側からも呼べる形であること**。
   *   ⚠️ ★これは「★焼いてある ≠ ★画面が引く」の網（★簿 `asset-baked-is-not-asset-loaded`）。
   */
  it('🔴 ★焼き済みの目録に 9 色すべて在る', () => {
    const dir = path.join(ROOT, 'apps/web/public/art/baked');
    const files = readdirSync(dir);
    const missing = COAT_NAMES.filter((c) => !files.some((f) => f.includes(`-${c}.`)));
    expect(missing, '🔴 ★焼き済みに無い毛色があります（★`tools/bake-race-frames.mjs` を流してください）')
      .toEqual([]);
  });
});
