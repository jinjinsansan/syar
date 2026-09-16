/**
 * ★**出走登録の RPC・§9.5 の是正・生涯の記録の移行**（★ゲーム本体 第 3 便・2026-09-16・移行 `0024`）
 *
 * 【★見ている壊れ方】
 *   ① ★`place_bet` が「自馬のどれか 1 頭を含めばよい」に戻る（★2 頭出したときに**片方だけを含む買い目**が通る）
 *      → ★裁定 `REVIEW_GAME_BODY_1_VERDICT_20260916.md` §5: **八百長利得の遮断装置**が緩む
 *   ② ★出走登録が**同じレースに 3 頭目**を通す（D-104・T-7'）
 *   ③ ★騎手の凍結・料金の記帳が抜ける（D-105 ②④）
 *   ④ ★生涯の記録が**利用者から書ける**（LR-1「消さない」を、利用者の delete で破れる形にしない）
 *
 * 【★見方】★移行の SQL を**最後の定義**で見ます（★同じ関数が再定義されるため・`rpc-guard.test.ts` と同じ作法）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlOf = (file: string): string => readFileSync(path.join(DIR, file), 'utf8');
/** ★`--` のコメントを空白に（★コメントの中の語を拾わない。位置は保つ） */
const blank = (sql: string): string => sql.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

/** ★その関数の「最後の定義」の本文 */
function lastDefinitionOf(name: string): { file: string; body: string } {
  let found: { file: string; body: string } | undefined;
  for (const file of files) {
    const sql = sqlOf(file);
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\(`, 'gi');
    const hits = [...blank(sql).matchAll(re)];
    for (let i = 0; i < hits.length; i += 1) {
      const start = hits[i]!.index!;
      const next = [...blank(sql).matchAll(/create\s+(?:or\s+replace\s+)?function\s/gi)]
        .map((m) => m.index!)
        .find((idx) => idx > start);
      found = { file, body: sql.slice(start, next ?? sql.length) };
    }
  }
  if (found === undefined) throw new Error(`${name} の定義が見つかりません`);
  return found;
}

const MIGRATION = '0024_entry_rpc_and_story.sql';

describe('★第 3 便の移行（0024）', () => {
  it('① ★place_bet の最後の定義は「自馬を全頭含む」になっている（§9.5-3）', () => {
    const def = lastDefinitionOf('place_bet');
    expect(def.file, '★最後の定義は 0024').toBe(MIGRATION);
    /** ★「含まない自馬が 1 頭でもあれば拒否」の形（★どれか 1 頭でよい形では無いこと） */
    expect(def.body).toMatch(/not\s*\(\s*p_selection\s*@>\s*to_jsonb\(e\.gate\)\s*\)/i);
    expect(def.body).toMatch(/自馬を全頭含む/);
    /** ★D-080: 先頭のセットアップ判定が残っている（★土台から写しているか） */
    expect(def.body).toMatch(/assert_setup_complete\(\)/);
    /** ★上限の検査も残っている（★土台を写さずに書くと消える） */
    for (const cap of ['30000', '50000', '500000', '5000']) {
      expect(def.body, `★上限 ${cap} が消えている`).toContain(cap);
    }
  });

  it('② ★出走登録は同じレースに 2 頭まで（3 頭目を拒否）・引退馬と締切を見る', () => {
    const def = lastDefinitionOf('enter_race');
    expect(def.file).toBe(MIGRATION);
    expect(def.body).toMatch(/assert_setup_complete\(\)/);
    /** ★2 頭まで（★`>= 2` で 3 頭目を拒否） */
    expect(def.body).toMatch(/v_mine\s*>=\s*2/);
    expect(def.body).toMatch(/2 頭まで/);
    /** ★引退した馬は登録できない */
    expect(def.body).toMatch(/retired_at_week\s+is\s+not\s+null/i);
    /** ★発走 60 分前で締め切る（§10.4） */
    expect(def.body).toMatch(/60 minutes/);
  });

  it('③ ★騎手は凍結して保存し、料金は EP の台帳の語で記帳する（D-105 ②④）', () => {
    const def = lastDefinitionOf('enter_race');
    /** ★凍結をそのまま列へ */
    expect(def.body).toMatch(/jockey_frozen/);
    /** ★料金は登録料 ＋ 騎手の料金 */
    expect(def.body).toMatch(/feeEP/);
    /** ★記帳は EP の台帳の閉じた語（`0001` の CHECK にある語） */
    expect(def.body).toMatch(/'entry_fee'/);
    /** ★PP に触れない（★賞金からの差し引きにしない） */
    expect(def.body).not.toMatch(/pp_ledger|prize_points/);
  });

  it('④ ★生涯の記録は利用者から書けない（読み取りだけ・LR-1/LR-6）', () => {
    const sql = sqlOf(MIGRATION);
    expect(sql).toMatch(/create table if not exists horse_story_event/i);
    /** ★書き込みは剥がす（★利用者の delete で記録が消えない） */
    expect(sql).toMatch(/revoke\s+insert,\s*update,\s*delete,\s*truncate\s+on\s+horse_story_event\s+from\s+anon,\s*authenticated/i);
    /** ★読み取りは誰でも（LR-6「他人の馬の物語も見える」） */
    expect(sql).toMatch(/grant\s+select\s+on\s+horse_story_event\s+to\s+anon,\s*authenticated/i);
    /** ★文章そのものは保存しない（★種類と値だけ。文は storyLineOf が組み立てる・LR-4） */
    expect(sql).not.toMatch(/\btext_ja\b|\bsentence\b|\bstory_text\b/i);
  });

  it('⑤ ★厩舎の格は既定がブロンズ（★格を入れる前と同じ振る舞い・D-103）', () => {
    const sql = sqlOf(MIGRATION);
    expect(sql).toMatch(/add column if not exists stable_grade text not null default 'bronze'/i);
    expect(sql).toMatch(/check \(stable_grade in \('bronze', 'silver', 'gold'\)\)/i);
    /** ★素質（potential）に触っていない */
    expect(sql).not.toMatch(/update horses set potential/i);
  });
});
