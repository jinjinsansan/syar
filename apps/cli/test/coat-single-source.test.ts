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
 * ✅ ★**2026-09-27（段 2 D・裁定 Q-RACE-8 (b)）**: ★実レースは ★`coatOfHorseId(horse_id)` を読むようになりました。
 *    ★見本の表は ★`DEMO_COATS`（★見本専用・★重複なしの 8 色・★月毛と白毛を含む）に作り直し、
 *    ★★実レースの道がこの表を読まないことを ★下の ④ が見ます。
 *   ★④ ★見本の表の中身と、★実レースの道が見本の表を読まないこと
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
  /**
   * ★2026-09-27（★裁定 Q-RACE-8 (b)）: ★旧 `COAT_BY_GATE`。★実レースは `coatOfHorseId(horse_id)` を読む道が入った（段 2 D）。
   *   ★見本の馬は ID を持たないので ★表を残し、★見本専用の名前・★重複なしの 8 色（★月毛・白毛を含む）に作り直した。
   */
  'apps/web/src/app/race/page.tsx: DEMO_COATS':
    '★**見本（`?venue=`）専用の 8 色**（★重複なし・★月毛と白毛を含む・★重みは使わない）。'
    + '★見本の馬は ID を持たないので ★`coatOfHorseId` に渡せません（★偽の ID を置くと「その馬」が居るように見える・裁定 (c) 不採用）。'
    + '🔴 ★実レースの道は ★この表を読みません（★下の網が見ます）。'
    + '✅ ★**消す条件**: ★**見本の道が無くなった日**（★`/race` が実レースだけを出すようになった日）。★そのとき ★表ごと消すこと',
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

  /**
   * 🔴 ★④ **見本の表は見本だけ**（★2026-09-27・裁定 Q-RACE-8 (b)）。
   *   ★中身: ★8 色・★重複なし・★月毛と白毛を含む・★すべて `coat.ts` の毛色。
   *   ★使い方: ★見本の表（`coatOf`）を読むのは ★`venuePageSetup()` の中だけ。★実レース（`realPageOf`）は ★`coatOfHorseId` だけ。
   */
  describe('🔴 ④ 見本の毛色表（DEMO_COATS）', () => {
    const RACE_PAGE = 'apps/web/src/app/race/page.tsx';
    const bodyOf = (src: string, head: RegExp): string => {
      const m = src.match(new RegExp(`${head.source}[\\s\\S]*?\\n\\}\\n`));
      expect(m, `★${head.source} が切り出せない（★走査が壊れている）`).not.toBeNull();
      return m![0];
    };
    /** ★`coatOf(` を読んでいる所（★定義の行を除く） */
    const coatOfCalls = (src: string): number => (src.match(/(?<![A-Za-z0-9_])coatOf\(/g) ?? []).length;

    it('★8 色・重複なし・月毛と白毛を含む・すべて coat.ts の毛色', () => {
      const src = strip(read(RACE_PAGE));
      const m = src.match(/const DEMO_COATS: readonly CoatName\[\] = \[([\s\S]*?)\];/);
      expect(m, '🔴 ★`DEMO_COATS` が見つからない').not.toBeNull();
      const names = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
      expect(names, '★見本は 8 頭').toHaveLength(8);
      expect(new Set(names).size, '🔴 ★見本の 8 色に重複があります').toBe(8);
      expect(names, '🔴 ★月毛が入っていません（★焼いたのに出ない色を残さない）').toContain('palomino');
      expect(names, '🔴 ★白毛が入っていません').toContain('white');
      expect(names.filter((n) => !COAT_NAMES.includes(n as (typeof COAT_NAMES)[number])), '★`coat.ts` に無い毛色').toEqual([]);
    });

    it('🔴 ★見本の表を読むのは venuePageSetup だけ・実レースは coatOfHorseId だけ', () => {
      const src = strip(read(RACE_PAGE));
      const venue = bodyOf(src, /function venuePageSetup\(\): PageSetup \{/);
      const real = bodyOf(src, /function realPageOf\(/);
      /** ★旧名が戻っていない */
      expect(/\bCOAT_BY_GATE\b/.test(src), '🔴 ★旧名 `COAT_BY_GATE` が戻っています（★「毛色は枠から引く」に見える）').toBe(false);
      /** ★`DEMO_COATS` を読むのは `coatOf` の定義だけ（★宣言 1 ＋ 定義の中 2） */
      expect((src.match(/\bDEMO_COATS\b/g) ?? []).length, '🔴 ★`DEMO_COATS` を ★`coatOf` の外で読んでいます').toBe(3);
      /** ★`coatOf(` の呼び出しは ★すべて見本の組み立ての中 */
      expect(coatOfCalls(src), '🔴 ★見本の表（`coatOf`）を ★見本の組み立ての外で読んでいます').toBe(coatOfCalls(venue));
      expect(coatOfCalls(venue), '★走査が空振り（★見本の組み立てが `coatOf` を読んでいない）').toBeGreaterThan(0);
      /** ★実レースは ★馬 ID から */
      expect(real, '🔴 ★実レースが `coatOfHorseId(r.horseId)` を読んでいません').toContain('coat: coatOfHorseId(r.horseId),');
      expect(coatOfCalls(real) + (real.match(/\bDEMO_COATS\b/g) ?? []).length, '🔴 ★実レースが見本の表を読んでいます').toBe(0);
    });

    it('🔴 ★対照: 見本の組み立ての外で coatOf を読むと 上の判定が落ちる', () => {
      const venue = 'function venuePageSetup(): PageSetup {\n  coat: coatOf(i + 1),\n}\n';
      const leaked = `${venue}function realPageOf(d) {\n  coat: coatOf(r.gate),\n}\n`;
      expect(coatOfCalls(leaked)).not.toBe(coatOfCalls(venue));
      expect(coatOfCalls('coatOfHorseId(r.horseId)'), '★`coatOfHorseId` を誤って数える').toBe(0);
    });
  });
});
