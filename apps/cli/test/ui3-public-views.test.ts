/**
 * ★**UI-3 の公開ビュー 3 本**（`0043`・2026-09-19）
 *   ★裁定 `REVIEW_ANON_EXPOSURE_VERDICT_20260918.md` が予告した「次の番」
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**実体テーブルに列を足したとき、黙ってビューに入る／黙って落ちる**
 *      → ★`0034` の `my-horses-view.test.ts` と同じ「★**全列の分類**」で見ます（R-29）
 *   ② 🔴 ★**素質が漏れる**（★`horse_market_listing` は `0036` で `stars` 列ごと落とした・D-114 ②）
 *   ③ 🔴 ★**実時刻が混ざる**（★§18 はゲーム内の週で語るもの・憲法 4）
 *   ④ 🔴 ★**持ち主の情報が物語に混ざる**（★LR-6）
 *
 * ⚠️ ★**禁止語の一覧では書きません**（D-108 ③）。★**列を足した人が、分類するまで通れない**形です。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlOf = (f: string): string => readFileSync(path.join(DIR, f), 'utf8');
/** ★`--` のコメントを同じ長さの空白に（★位置を保つ・コメントの語を拾わない） */
const blank = (s: string): string => s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
const ALL = files.map((f) => blank(sqlOf(f))).join('\n');

/**
 * ★**そのビューを最後に定義した移行**（★`create or replace` は重なる・R-19）。
 * ⚠️ ★**ファイル名を名指しで固めません**（★2026-09-19 に 3 件踏んだ形）。
 */
function lastViewBody(view: string): { file: string; body: string } {
  let found: { file: string; body: string } | null = null;
  for (const f of files) {
    const sql = blank(sqlOf(f));
    const re = new RegExp(`create or replace view ${view} as([\\s\\S]*?);`, 'i');
    const m = re.exec(sql);
    if (m !== null) found = { file: f, body: m[1]! };
  }
  if (found === null) throw new Error(`★${view} の定義がありません（★走査が空・R-21）`);
  return found;
}

/** ★実体テーブルの全列（★`create table` ＋ 後から足した `alter table`） */
function tableColumns(table: string): Set<string> {
  const out = new Set<string>();
  const create = new RegExp(`create table if not exists ${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(ALL);
  if (create !== null) {
    for (const line of create[1]!.split('\n')) {
      const m = /^\s{2}([a-z0-9_]+)\s+[a-z]/.exec(line);
      if (m !== null && !/^(constraint|primary|unique|check|foreign)$/.test(m[1]!)) out.add(m[1]!);
    }
  }
  for (const m of ALL.matchAll(new RegExp(`alter table ${table}\\s+add column(?:\\s+if not exists)?\\s+([a-z0-9_]+)`, 'gi'))) {
    out.add(m[1]!);
  }
  /** ★落とした列は外す（★`0036` の `stars` など） */
  for (const m of ALL.matchAll(new RegExp(`alter table ${table}\\s+drop column(?:\\s+if exists)?\\s+([a-z0-9_]+)`, 'gi'))) {
    out.delete(m[1]!);
  }
  return out;
}

/** ★ビューが選んでいる列（★`<別名>.<列>` の形で書く約束） */
function viewColumns(view: string, alias: string): Set<string> {
  const { body } = lastViewBody(view);
  return new Set([...body.matchAll(new RegExp(`\\b${alias}\\.([a-z0-9_]+)`, 'g'))].map((m) => m[1]!));
}

/**
 * ★**出さないと決めた列**と、★その理由。
 * ⚠️ ★これは「禁止語」ではなく ★**分類簿**です — ★下の検査が「全列がどちらかに入っていること」を要求します。
 */
const EXCLUDED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  horse_market_listing: {
    id: '★内部の識別子。★画面に要らない',
    created_at: '★実時刻。★出品の並びは価格で足りる',
    active: '★**行の有無で表す**（★ビューが `where l.active` で絞る。★false の行は返さない）',
  },
  stable_grade_price: {
    updated_at: '★いつ書き換わったかは運用の記録。★画面に要らない',
  },
  horse_story_event: {
    id: '★内部の識別子。★並びは game_week と race_id で足りる',
    created_at: '🔴 ★**実時刻**。★§18 はゲーム内の週で語るもので、★出すと実時刻が混ざる（憲法 4）',
  },
};

const VIEWS: readonly { readonly view: string; readonly table: string; readonly alias: string }[] = [
  { view: 'horse_market_listing_public', table: 'horse_market_listing', alias: 'l' },
  { view: 'stable_grade_price_public', table: 'stable_grade_price', alias: 'p' },
  { view: 'horse_story_event_public', table: 'horse_story_event', alias: 'e' },
];

describe('★UI-3 の公開ビュー（`0043`）', () => {
  it('★走査が空振りしていない（R-21）', () => {
    expect(files.length).toBeGreaterThan(30);
    for (const { view, table, alias } of VIEWS) {
      expect(tableColumns(table).size, `★${table} の列が読めていない`).toBeGreaterThan(2);
      expect(viewColumns(view, alias).size, `★${view} の列が読めていない`).toBeGreaterThan(1);
    }
  });

  it('🔴 ① ★実体の全列が「出す」か「出さない」かに分類されている（★列を足したら止まる・R-29）', () => {
    for (const { view, table, alias } of VIEWS) {
      const all = tableColumns(table);
      const shown = viewColumns(view, alias);
      const excluded = EXCLUDED[table] ?? {};
      const unclassified = [...all].filter((c) => !shown.has(c) && excluded[c] === undefined);
      /**
       * ⚠️ ★**ここが赤くなったら、名前を消して通してはいけません。**
       *    ★ビューに足すか、★`EXCLUDED` に**理由つき**で載せてください。
       *    ★迷ったら出さない側（★R-27: 分からないなら狭い側）。
       */
      expect(unclassified, `★${table} に分類されていない列があります`).toEqual([]);
    }
  });

  it('★「出さない」に挙げた列が実在する（★消えた列を見張り続けない・R-19）', () => {
    for (const { table } of VIEWS) {
      const all = tableColumns(table);
      for (const [col, why] of Object.entries(EXCLUDED[table] ?? {})) {
        expect(why.length, `★${table}.${col} の理由が空`).toBeGreaterThan(0);
        expect(all.has(col), `★${table}.${col} が実体にありません`).toBe(true);
      }
    }
  });

  it('🔴 ② ★素質を 1 ビットも出していない（D-114 ②）', () => {
    /**
     * ★`horse_market_listing` は `0036` で ★**`stars` 列ごと落としました**。
     * ★**列が無いこと**を、★`drop column` を辿って確かめます（★走査が追従している証拠）。
     */
    expect(tableColumns('horse_market_listing').has('stars'), '★stars 列が残っている').toBe(false);
    for (const { view, alias } of VIEWS) {
      const shown = viewColumns(view, alias);
      for (const bad of ['stars', 'potential', 'genotype', 'stats', 'unlock_rate']) {
        expect(shown.has(bad), `★${view} に ${bad} が出ている`).toBe(false);
      }
    }
  });

  it('🔴 ③ ★実時刻を出していない（★§18 はゲーム内の週・憲法 4）', () => {
    expect(viewColumns('horse_story_event_public', 'e').has('created_at'), '★実時刻が出ている').toBe(false);
    expect(viewColumns('horse_story_event_public', 'e').has('game_week'), '★ゲーム内の週が出ていない').toBe(true);
  });

  it('🔴 ④ ★物語に持ち主の情報が入らない（LR-6）', () => {
    /**
     * ★`detail` は jsonb なので、★**列の分類だけでは中身を縛れません**。
     * → ★**書く側の型**（`packages/training/src/story.ts` の `StoryEvent`）に
     *   ★持ち主の欄が無いことを見ます（★D-108 ③: 入力の形で見る）。
     */
    const story = readFileSync(path.join(ROOT, 'packages/training/src/story.ts'), 'utf8');
    const iface = /export interface StoryEvent \{([\s\S]*?)\n\}/.exec(story);
    expect(iface, '★StoryEvent の型が読めない').not.toBeNull();
    const fields = [...iface![1]!.matchAll(/^\s*readonly (\w+)/gm)].map((m) => m[1]!);
    expect(fields.length, '★欄が読めていない').toBeGreaterThan(3);
    for (const f of fields) {
      expect(
        /owner|user|display|stable|email|account/i.test(f),
        `★持ち主の情報が入っています: ${f}`,
      ).toBe(false);
    }
  });

  it('★3 本とも anon にも開いている（★LR-6「他人の馬の物語も見える」／★番組表と同じ扱い）', () => {
    for (const { view } of VIEWS) {
      expect(ALL, `★${view} を anon に開いていない`)
        .toMatch(new RegExp(`grant select on ${view} to anon, authenticated`, 'i'));
    }
  });

  it('🔴 ★実体テーブルは閉じたまま（★`0032` を開け直していない）', () => {
    for (const { table } of VIEWS) {
      /** ★`0032` より後に `grant select on <表> to anon` が無いこと */
      const after = ALL.slice(ALL.indexOf('0032') >= 0 ? 0 : 0);
      const re = new RegExp(`grant[^;]*\\bselect\\b[^;]*on ${table}\\b[^;]*anon`, 'i');
      const hits = [...after.matchAll(new RegExp(re.source, 'gi'))];
      /**
       * ⚠️ ★`0024`/`0025`/`0027` の**古い grant** は残っています（★ファイルは書き換えない）。
       *    ★効いているのは ★**`0032` の `revoke all`（★後勝ち）**です。
       *    → ★**「最後に何が効いているか」は V-20 が生きている DB で測ります**（★静的な検査で保証しない）。
       */
      expect(hits.length, `★${table} の grant が想定より多い（★新しく開け直していないか）`).toBeLessThanOrEqual(1);
    }
  });
});
