/**
 * 🔴 ★**正典が額を決めた項目に、渡す側／引く側の実装が在るか**
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §7 ③（2026-09-25・レビュー側の指示）
 *
 * 【★これが捕まえる形】★**D-119 の族**（★決めた・画面は出す・★渡す側が無い）
 *   ★実例（2026-09-25 に本番で露出）: ★D-075 は 2026-08-20 に「デイリー 200 EP」と決め、
 *   ★`/earn` に枠も在ったのに、★**渡す実装が 1 つも在りませんでした**。
 *   ★調教が EP を吸うので、★オーナーの口座は残高 0 になり ★**何もできなくなりました**。
 *   ★`calibration-registry.test.ts` は ★「定数が登録簿に在るか」は見ますが
 *   ★**「使われているか」は見ません**。★その隙間を埋めます。
 *
 * 【⚠️ ★この検査は「額が正しいか」を見ません】
 *   ★額の突き合わせは ★`ep-grant-sql.test.ts`（★SQL ↔ TS の定数）。★役割を分けます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CANON_AMOUNTS } from '../src/canon-amounts.js';
import { lastFunctionBody } from './lib/sql-source.js';
import { otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');
const CANON = path.join(ROOT, 'STAR_SPEC_v2.0.md');

const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * 🔴 ★**「まだ届かない」を機械で確かめる**（★`kind: 'not-yet-reachable'` の番人）。
 *
 * ★戻り値は ★**開いてしまった理由**（★`null` なら ★まだ閉じています）。
 * ⚠️ ★名前だけ書いて番人が無い、を許しません（★下の検査が ★対応を見ます）。
 */
const GUARDS: Readonly<Record<string, () => string | null>> = {
  /**
   * ★**種牡馬は NPC からしか引けない**（★D-107 ③ の移転が未実装なので、★開くと全額焼却になる）。
   *
   * ★配合の画面が ★種牡馬を引く口を ★数えます。★`npc_stallion_facts` 以外が出たら ★開いた合図です。
   * ⚠️ ★註記の中の語では判定しません（★`rpc('…')` の形だけを見ます）。
   */
  'stallion-sources-are-npc-only': () => {
    const ALLOWED = new Set(['npc_stallion_facts']);
    const found = new Set<string>();
    for (const rel of ['apps/web/src/lib/breed-screen.ts', 'apps/web/src/lib/initial-breed-screen.ts']) {
      const src = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      for (const m of src.matchAll(/(?:rpc|from)\('([a-z_]+)'\)/g)) {
        const name = m[1]!;
        /** ★種牡馬らしい名前だけを見ます（★`users` や `world_state_public` は関係ありません） */
        if (/stallion|sire|stud/.test(name) && !ALLOWED.has(name)) found.add(`${rel}: ${name}`);
      }
    }
    return found.size === 0 ? null : [...found].join(' / ');
  },
};

describe('🔴 ★正典が額を決めた項目 ↔ 実装', () => {
  it('★表が空でない（★0 行 通過を合格にしない）', () => {
    expect(CANON_AMOUNTS.length, '★表が空（★走査の意味がない）').toBeGreaterThanOrEqual(10);
  });

  /**
   * 🔴 ★**本命**。★`implementation` が `null` の行が在ったら落ちます。
   * ⚠️ ★落ちたときに ★**表から消して通さないこと。** ★消すと、また「決めたのに渡す側が無い」に戻ります。
   *    ★実装するか、★オーナー／レビュー側の判断を仰いで ★`KNOWN_RED` に理由つきで載せてください。
   */
  it('🔴 ★渡す側／引く側が無い項目が 1 つも無い', () => {
    const missing = CANON_AMOUNTS
      .filter((r) => r.implementation === null)
      .map((r) => `${r.decision} ${r.amount}\n      → ${r.missingWhy ?? '★理由が書かれていません'}`);
    expect(
      missing,
      '🔴 ★正典が額を決めているのに、★その額を動かす実装が在りません（★D-119 の族）:\n    '
      + missing.join('\n    ')
      + otherRegistriesHint('apps/cli/src/canon-amounts.ts の CANON_AMOUNTS'),
    ).toEqual([]);
  });

  it('★`null`／「まだ届かない」の行には理由が書かれている（★空欄で未実装にしない）', () => {
    const silent = CANON_AMOUNTS
      .filter((r) => (r.implementation === null || r.implementation.kind === 'not-yet-reachable')
        && (r.missingWhy ?? '').length < 20)
      .map((r) => `${r.decision} ${r.amount}`);
    expect(silent, '🔴 ★未実装なのに理由が書かれていません').toEqual([]);
  });

  /**
   * 🔴 ★**表が嘘をつけないようにする**。★書いた実装が ★本当に在るかを見ます。
   *   ★これが無いと ★「在ることにしておく」で通ってしまい、★表そのものが飾りになります。
   */
  it('🔴 ★書かれた実装が実在する（★SQL の関数・TS の名前）', () => {
    const bogus: string[] = [];
    for (const r of CANON_AMOUNTS) {
      const impl = r.implementation;
      if (impl === null) continue;
      if (impl.kind === 'not-yet-reachable') continue;   // ★★番人は下の検査が回します
      if (impl.kind === 'sql') {
        try {
          const { body } = lastFunctionBody(impl.fn);
          if (body.length < 20) bogus.push(`${r.decision}: SQL 関数 ${impl.fn} の本文が空`);
        } catch {
          bogus.push(`${r.decision}: SQL 関数 ${impl.fn} が移行に見つからない`);
        }
      } else {
        const p = path.join(ROOT, impl.file);
        if (!existsSync(p)) { bogus.push(`${r.decision}: ${impl.file} が無い`); continue; }
        if (!readFileSync(p, 'utf8').includes(impl.symbol)) {
          bogus.push(`${r.decision}: ${impl.file} に ${impl.symbol} が無い`);
        }
      }
    }
    expect(bogus, '🔴 ★表に書いた実装が実在しません（★書き換えたか、消えたか）').toEqual([]);
  });

  /**
   * 🔴 ★**「まだ届かない」と書いた項目が、★本当に まだ届かないこと**。
   *   ★これが ★**開いた日に落ちる**ための検査です（★通す／落とすの 2 つでは足りない・★第 3 の判定）。
   */
  it('🔴 ★「まだ届かない」項目の口が、まだ閉じている', () => {
    const opened: string[] = [];
    for (const r of CANON_AMOUNTS) {
      const impl = r.implementation;
      if (impl === null || impl.kind !== 'not-yet-reachable') continue;
      const why = GUARDS[impl.guard]!();
      if (why !== null) {
        opened.push(`${r.decision} ${r.amount}\n      → ★口が開きました: ${why}\n`
          + `      → ★開く条件として書いてあったこと: ${impl.opensWhen}\n`
          + `      → 🔴 ★**いま実装しないと、★${r.decision} の額が黙って消えます**（★${r.missingWhy ?? ''}）`);
      }
    }
    expect(opened, '🔴 ★「まだ届かない」としていた口が ★**開きました**。\n    '
      + opened.join('\n    ')
      + otherRegistriesHint('apps/cli/src/canon-amounts.ts の CANON_AMOUNTS')).toEqual([]);
  });

  /**
   * 🔴 ★**番人の名前が嘘をつけないこと**。★名前だけ書いて検査が無いのを許しません。
   *   ⚠️ ★これが無いと ★`guard: 'なんとか'` と書くだけで ★**何も確かめずに緑**になります。
   */
  it('🔴 ★書かれた番人が実在する・★使われない番人が残っていない', () => {
    const named = CANON_AMOUNTS
      .map((r) => r.implementation)
      .filter((i): i is { kind: 'not-yet-reachable'; guard: string; opensWhen: string } =>
        i !== null && i.kind === 'not-yet-reachable')
      .map((i) => i.guard);
    expect(named.filter((g) => GUARDS[g] === undefined), '🔴 ★表に書いた番人が実在しません').toEqual([]);
    expect(Object.keys(GUARDS).filter((g) => !named.includes(g)),
      '★使われていない番人が残っています（★消すか、★表から引いてください）').toEqual([]);
    expect(named.length, '★番人が 0 件（★この検査の意味がない）').toBeGreaterThan(0);
  });

  /**
   * 🔴 ★**在りもしない決定を引かない**。★`D-999` と書いても通るなら、★出どころが確かめられません。
   */
  it('🔴 ★引いている正典の決定が実在する', () => {
    const canon = readFileSync(CANON, 'utf8');
    const ghosts = [...new Set(CANON_AMOUNTS.map((r) => r.decision))].filter((d) => !canon.includes(d));
    expect(ghosts, '🔴 ★正典に無い決定を引いています').toEqual([]);
  });
});
