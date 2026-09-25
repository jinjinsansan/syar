/**
 * 🔴 ★**戦績の数え方が 1 か所しか無いこと**（★D-052）
 *   ★裁定 `REVIEW_MARKET_PUBLIC_VIEW_20260925.md`（2026-09-25・レビュー側の追加条件）
 *   ★移行 `0086_horse_record_one_place.sql`
 *
 * 【★なぜ「突き合わせ」から「1 つ」に変えたか】
 *   ★同じ式が ★**3 か所**に写されていました（`0075` / `0083` / `0085`）。
 *   ★私は ★**突き合わせる網**を書きました（★3 か所の字面が一致するか）。
 *   ★レビュー側の判断: ★**「突き合わせの網より 1 つにするほうが強い」**。
 *   → ★`horse_starts()` / `horse_wins()` を作り、★3 か所が ★**それを呼ぶ**形にしました。
 *   ★前例は同じ作品の中に在ります（★`horse_total_prize_pp`・`0071:18`）。
 *
 * 【★この網が見るもの】
 *   ★① ★関数が在り、★数え方がその中に在る
 *   ★② 🔴 ★**その外で `race_entries` を数えていない**（★これが本命）
 *   ★③ ★読む口が ★関数を呼んでいる
 *
 * 【⚠️ ★除外は理由つきで】
 *   ★`race_entries` を数えてよい所も在ります（★出走資格の判定・馬券の集計など）。
 *   ★**何を数えているか**で分けます（★`finish_pos` の勝敗を数えているものだけが対象）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { lastFunctionBody, lastViewBody, liveFunctionBodies, stripSqlComments } from './lib/sql-source.js';
import { otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'db/migrations');

/**
 * ★**戦績を数えてよい所**（★理由つき）。
 * ⚠️ ★足すときは ★**なぜ別に数えるのか**を書くこと。
 */
const MAY_COUNT: Readonly<Record<string, string>> = {
  '0086_horse_record_one_place.sql':
    '★ここが ★**唯一の置き場所**（★`horse_starts` / `horse_wins` の中身）',
  /**
   * ★**歴史**（★`enter_race` の ★**古い**定義）。★いまは `0088` が効いています。
   *
   * ⚠️ 🔴 ★2026-09-25 の経緯を残します: ★私は最初この 2 つを除外し、
   *    ★理由に ★「★`stable` な関数を書き込みの経路から呼ぶと意味が変わる」と書きました。
   *    → 🔴 ★**誤りでした**（★Postgres では普通のことです）。
   *    ★しかも ★`enter_race` は ★**CL-4 の当事者**（★画面と RPC が食い違う元）で、
   *    ★**いちばん揃えるべき場所**でした。
   *    → ★`0088` で寄せました。★下の「同じ関数を呼んでいる」がそれを固定します。
   * ⚠️ ★この 2 つは ★**過去のファイル**なので直せません（★移行は追記のみ）。
   *    ★網は ★**最後の定義だけ**を見るので、★ここに載っていなくても通りますが、
   *    ★経緯を残すために置いています。
   */
  '0051_announce_fill.sql':
    '★history — ★`enter_race` の古い定義（★いまは `0088`。★2026-09-25 に `horse_wins()` へ寄せた）',
  '0082_jockey_roster_server_side.sql':
    '★history — ★同上（★騎手の名簿を入れた版。★戦績はまだ自分で数えていた）',
};

/**
 * ★`finish_pos` で勝敗を数えている箇所を、★**いま効いている定義だけ**から挙げる。
 *
 * ⚠️ 🔴 ★最初は ★**移行を全部**走査しました。★**歴史まで挙げてしまいました**
 *    （★`0040`・`0074`・`0075`・`0083`・`0085` ＝ ★`0086` が置き換えた前の版）。
 *    ★移行は ★**追記のみ**で、★過去のファイルは直せません（★直すと適用済みの記録と食い違う）。
 *    → ★**同じ名前の最後の定義**だけを見ます（★`lastFunctionBody` / `lastViewBody` と同じ作法）。
 */
function countsRecord(): { readonly where: string; readonly file: string; readonly text: string }[] {
  const out: { where: string; file: string; text: string }[] = [];
  const RE = /count\(\*\)[\s\S]{0,80}from\s+race_entries[\s\S]{0,140}finish_pos/i;

  /** ★いま効いている関数（★同じ名前の最後の定義） */
  for (const [name, { file, body }] of liveFunctionBodies()) {
    if (MAY_COUNT[file] !== undefined) continue;
    if (name === 'horse_starts' || name === 'horse_wins') continue;
    for (const line of body.split('\n')) {
      if (RE.test(line)) out.push({ where: `関数 ${name}`, file, text: line.trim().slice(0, 100) });
    }
  }

  /** ★いま効いている view（★名前を集めて、★最後の定義を読む） */
  const names = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql'))) {
    const sql = stripSqlComments(readFileSync(path.join(MIGRATIONS, f), 'utf8'));
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\s*\.\s*)?([a-z0-9_]+)/gi)) {
      names.add(m[1]!);
    }
  }
  for (const name of [...names].sort()) {
    const { file, body } = lastViewBody(name);
    if (MAY_COUNT[file] !== undefined) continue;
    for (const line of body.split('\n')) {
      if (RE.test(line)) out.push({ where: `view ${name}`, file, text: line.trim().slice(0, 100) });
    }
  }
  return out;
}

describe('🔴 ★戦績の数え方は 1 か所（★D-052）', () => {
  it('★走査が空振りしていない', () => {
    expect(readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).length, '★移行が読めていない')
      .toBeGreaterThan(80);
    expect(Object.keys(MAY_COUNT).length, '★除外簿が空（★形だけ確かめる）').toBeGreaterThan(0);
  });

  it('★関数が在り、数え方がその中に在る', () => {
    const starts = lastFunctionBody('horse_starts');
    const wins = lastFunctionBody('horse_wins');
    expect(starts.file, '★最後の定義が 0086 ではない').toBe('0086_horse_record_one_place.sql');
    expect(starts.body, '★出走数は finish_pos is not null で数えること').toMatch(/finish_pos\s+is\s+not\s+null/i);
    expect(wins.body, '★勝数は finish_pos = 1 で数えること').toMatch(/finish_pos\s*=\s*1/);
  });

  /**
   * 🔴 ★**本命**。★関数の外で数えていたら落ちます。
   */
  it('🔴 ★関数の外で戦績を数えていない', () => {
    const found = countsRecord();
    expect(
      found,
      '🔴 ★戦績を ★**関数の外**で数えています。★`horse_starts()` / `horse_wins()`（`0086`）を呼んでください。\n'
      + '  ★出走資格の判定のように ★**別に数えるのが正しい**なら、'
      + '★`MAY_COUNT` に ★**理由つき**で載せてください:\n  '
      + found.map((h) => `${h.where}（${h.file}）  ${h.text}`).join('\n  ')
      + otherRegistriesHint('apps/cli/test/horse-record-one-place.test.ts の MAY_COUNT'),
    ).toEqual([]);
  });

  it('🔴 ★読む口が関数を呼んでいる（★3 か所）', () => {
    const sql = stripSqlComments(readFileSync(path.join(MIGRATIONS, '0086_horse_record_one_place.sql'), 'utf8'));
    for (const view of ['retired_horses_public', 'horse_market_listing_public']) {
      const m = sql.match(new RegExp(`create or replace view ${view} as([\\s\\S]*?);`, 'i'));
      expect(m, `★${view} の定義が読めない`).not.toBeNull();
      expect(m![1], `★${view} が horse_wins を呼んでいない`).toMatch(/horse_wins\(h\.id\)/);
      expect(m![1], `★${view} が horse_starts を呼んでいない`).toMatch(/horse_starts\(h\.id\)/);
    }
    const { body } = lastFunctionBody('my_retired_horses');
    expect(body, '★my_retired_horses が horse_wins を呼んでいない').toMatch(/horse_wins\(h\.id\)/);
    expect(body, '★my_retired_horses が horse_starts を呼んでいない').toMatch(/horse_starts\(h\.id\)/);
  });

  /**
   * 🔴 ★**画面と RPC が同じ関数を呼んでいること**（★正典 **CL-4**・裁定の条件 ③）
   *
   * 【★なぜこれが要るか】
   *   ★`my_horses.wins`（★画面が読む）と ★`enter_race` の出走資格の判定が ★**別々に数えていました**。
   *   ★`my_horses` の註記自身がこう書いています:
   *     「★違う数え方にすると、★**画面が「出られる」と言った馬が RPC に弾かれます**」
   *   → ★**どちらも `horse_wins()` を呼ぶ**ことを固定します。
   * ⚠️ ★片方だけ寄せた状態が ★**いちばん危ない**（★レビュー側の言葉）。★だから 1 本の検査で両方を見ます。
   */
  it('🔴 ★画面（my_horses）と RPC（enter_race）が同じ関数を呼んでいる（★CL-4）', () => {
    const view = lastViewBody('my_horses');
    const rpc = lastFunctionBody('enter_race');
    expect(view.body, '🔴 ★my_horses が horse_wins を呼んでいません').toMatch(/horse_wins\(h\.id\)/);
    expect(rpc.body, '🔴 ★enter_race が horse_wins を呼んでいません（★画面と食い違います）')
      .toMatch(/horse_wins\(p_horse_id\)/);
    // ★どちらも「自分で数える」に戻っていないこと
    for (const [label, body] of [['my_horses', view.body], ['enter_race', rpc.body]] as const) {
      expect(body, `🔴 ★${label} が自分で数えに戻っています`)
        .not.toMatch(/count\(\*\)[\s\S]{0,60}race_entries[\s\S]{0,80}finish_pos\s*=\s*1/i);
    }
    expect(rpc.file, '★enter_race の最後の定義が 0088 ではない（★寄せ替えが漏れた）')
      .toBe('0088_enter_race_record_one_place.sql');
  });

  it('★除外簿の理由が空でない', () => {
    const silent = Object.entries(MAY_COUNT).filter(([, why]) => why.length < 10).map(([f]) => f);
    expect(silent, '★理由が書かれていない除外').toEqual([]);
  });
});
