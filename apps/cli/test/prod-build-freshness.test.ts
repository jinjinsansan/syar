/**
 * 🔴 ★**「本番がどの版か」を、★誰も見ていない期間を作らない**（★**DP-1** / 正典 §17 **O-6**）
 *
 * 【★DP-1 — ★レビュー側・2026-09-20】
 *   > ★**「ある行為をしたときだけ走る検査」は、★その行為をしない期間は 無検査である。**
 *   → ★**時計で落ちる検査を対にする。**
 *
 * 【★これは 3 回 起きています。★回を追うごとに長くなりました】
 *   ★**8 日**   … 2026-08-20 頃・D-055/D-056 が本番未配備（★**偶然** 発見）
 *   ★**13 日**  … 2026-09-02・`main` が凍結（★**オーナーが「絵が古い」と言って**気づいた）
 *   ★**1 か月** … 2026-09-20・DB/ワーカー側が凍結（★移行 33 件 未適用）
 *
 *   ⚠️ ★3 回とも ★**検定は全部 緑**でした。★測っていたのはリポジトリであって、本番ではありません（R-28）。
 *
 * 【🔴 ★なぜ「検定が本番を叩く」形にしないか】
 *   ★検定は本番へ出られません（★出てはいけない）。★CI に本番の URL も鍵も置きません。
 *   → ★**叩くのは人（または別の仕組み）。★検定が見るのは「叩いた記録の新しさ」だけ**です。
 *   ★`npx tsx tools/verify-deployed-build.mjs --base <URL> --record`
 *
 * 【★`MAX_AGE_DAYS = 7` の根拠 — ★決め打ちではありません】
 *   🔴 ★2026-09-19 まで「★材料が 1 点しか無いので N を決めない」としていました（★**R-29**）。
 *   ✔ ★2026-09-20 に ★**材料が 3 点**になりました（★上の 8 日 / 13 日 / 1 か月）。
 *   → ★★**いちばん短い 8 日より短いこと。** ★それが下限の根拠です。
 *   ★7 日を採ったのは ★**8 日より短い、いちばん自然な区切り**（★週 1 回）だからです。
 *   ⚠️ ★**「7 日なら安全」と言っているのではありません。** ★**8 日は既に痛かった**、と言っています。
 *
 * 【⚠️ ★この検査が見ないもの】
 *   ★**本番が正しいこと**を見ていません。★**見に行った日付**しか見ていません。
 *   ★食い違っていても記録は残ります（★食い違いを隠すために記録を止めさせないため）。
 *   → ★**「緑 ＝ 本番が最新」ではありません。「緑 ＝ 7 日以内に誰かが確かめた」です。**
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import nodePath from 'node:path';

/** ★リポジトリの根 */
const ROOT = nodePath.resolve(__dirname, '../../..');
const RECORD = nodePath.join(ROOT, 'evidence/prod-build/last-check.json');

/** ★この日数を過ぎたら落ちる（★根拠は冒頭） */
export const MAX_AGE_DAYS = 7;

const HOW = '★直し方: `npx tsx tools/verify-deployed-build.mjs'
  + ' --base https://star-two-chi.vercel.app --record`';

describe('🔴 ★本番の版を、★7 日より長く見ないでいない（DP-1 / O-6）', () => {
  it('★記録が在る', () => {
    expect(existsSync(RECORD), `★${RECORD} が在りません。${HOW}`).toBe(true);
  });

  it('🔴 ★記録が **7 日** より古くない（★時計で落ちる）', () => {
    const raw = JSON.parse(readFileSync(RECORD, 'utf8')) as { checkedAt?: unknown };
    expect(typeof raw.checkedAt, '★checkedAt が文字列でない').toBe('string');
    const at = Date.parse(raw.checkedAt as string);
    expect(Number.isFinite(at), `★checkedAt を時刻として読めない: ${String(raw.checkedAt)}`).toBe(true);
    const ageDays = (Date.now() - at) / 86_400_000;
    expect(
      ageDays,
      `★本番の版を ${ageDays.toFixed(1)} 日 確かめていません（上限 ${MAX_AGE_DAYS} 日）。${HOW}`,
    ).toBeLessThan(MAX_AGE_DAYS);
  });

  it('⚠️ ★未来の日付を受け付けない（★時計をずらして黙らせられないように）', () => {
    const raw = JSON.parse(readFileSync(RECORD, 'utf8')) as { checkedAt: string };
    const at = Date.parse(raw.checkedAt);
    /** ★1 時間ぶんは時計のずれとして許す */
    expect(at, '★記録の時刻が未来です').toBeLessThan(Date.now() + 3_600_000);
  });

  it('★記録に、★どの URL の何を見たかが入っている（★中身の無い記録で緑にしない）', () => {
    const raw = JSON.parse(readFileSync(RECORD, 'utf8')) as Record<string, unknown>;
    expect(typeof raw['base'], '★base が無い').toBe('string');
    expect(String(raw['base'])).toMatch(/^https?:\/\//);
    const prod = raw['prod'] as Record<string, unknown> | undefined;
    expect(prod, '★prod が無い').toBeTruthy();
    /**
     * 🔴 ★**`sha` が null の記録は通しません**（★R-3: ★判定不能は FAIL へ）。
     *    ★本番が SHA を出していないなら、★それ自体が直すべきことです。
     */
    expect(typeof prod?.['sha'], '★本番の sha が記録されていない（判定不能）').toBe('string');
  });

  it('🔴 ★道具の側に `--record` の口が在る（★検査だけ残って口が消えない）', () => {
    const src = readFileSync(nodePath.join(ROOT, 'tools/verify-deployed-build.mjs'), 'utf8');
    const live = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(live, '★--record が消えている').toContain('--record');
    expect(live, '★記録の書き出し先が変わっている')
      .toContain('evidence/prod-build/last-check.json');
  });
});
