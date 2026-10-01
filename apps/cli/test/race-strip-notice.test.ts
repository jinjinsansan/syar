/**
 * ★**常設帯の ④ 結果の強調 ／ ⑦ 通信断 ／ ⑥ タブ復帰**（★2026-09-27・裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` ④⑦⑥・仕様 §2 / §5）
 *
 * 【★見ている壊れ方】
 *   ④ ★結果の強調が ★出ない ／ ★帯へ戻らない ／ ★6〜8 秒から外れる ／ ★着順を記録でなく画面で決める
 *   ⑦ 🔴 ★読めなかったとき ★表示を消す・★黙る（★仕様: 最後の表示を保持し「更新できません」の注記だけ）
 *   ⑥ ★タブに戻ったとき ★止まっていた時計のまま進む ／ ★読み直さない
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPLAY_DISPLAY_MS, REPLAY_RESULT_MS, REPLAY_START_DELAY_MS, replayDisplayProgress, replayResultShowing } from '../../web/src/components/uma/race-replay.js';

const ROOT = path.resolve(__dirname, '../../..');
const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-theme.css'), 'utf8');
const LIVE = STRIP.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★④ 結果の一時強調', () => {
  const at = '2026-09-27T09:00:00.000Z';
  const end = new Date(at).getTime() + REPLAY_START_DELAY_MS + REPLAY_DISPLAY_MS;

  it('★長さは仕様の 6〜8 秒', () => {
    expect(REPLAY_RESULT_MS).toBeGreaterThanOrEqual(6_000);
    expect(REPLAY_RESULT_MS).toBeLessThanOrEqual(8_000);
  });

  it('🔴 ★録画が終わった直後だけ出て ★帯へ戻る（★境界の両側）', () => {
    expect(replayResultShowing(at, end - 1), '★録画中に出ている').toBe(false);
    expect(replayDisplayProgress(at, end - 1), '★対照: 直前は録画中').not.toBeNull();
    expect(replayResultShowing(at, end), '★終わった瞬間に出ない').toBe(true);
    expect(replayDisplayProgress(at, end), '★録画と結果が重なっている').toBeNull();
    expect(replayResultShowing(at, end + REPLAY_RESULT_MS - 1)).toBe(true);
    expect(replayResultShowing(at, end + REPLAY_RESULT_MS), '★帯へ戻らない').toBe(false);
  });

  it('★着順は記録の値（★`finishPosition === 1`）・★直近の 1 本だけ・★枠は EP 色', () => {
    expect(LIVE).toMatch(/data\?\.runners\.find\(\(runner\) => runner\.finishPosition === 1\)/);
    expect(LIVE, '★録画中にも結果を出している').toMatch(/const resulting = !replaying && /);
    expect(LIVE).toMatch(/replayResultShowing\(recent\.scheduled_at, nowMs\)/);
    expect(CSS).toMatch(/\.u-race-strip-result \{ border-color: var\(--u-ep\); \}/);
    expect(CSS).toMatch(/--u-ep: #57c8a8;/);
  });
});

describe('★④ ★誤った「あなたの馬」を言わない（★09-27 §6-2 の目的・★2026-10-01 から 段 3 を開けて「正しい口からしか読まない」）', () => {
  /**
   * 🔴 ★**主は構造側**（★2026-09-27・レビュー側の提案）: ★帯は ★**誰の馬かを知りようがない**。
   *   ★語の一覧（下）は ★「君の馬」「オーナーの馬」を書いた日に素通りします（★R-29・列挙は必ず漏れる）。
   *   ★知らないものは ★言いようがないので、★こちらは語が腐っても効きます。
   */
  /**
   * 🔴 ★**2026-10-01 に書き換えた**（★オーナー決定「あなたの馬が出走します は絶対に必要」・裁定 `REVIEW_R28_STAGE1_QUERIES_VERDICT_20261001.md` §1）。
   *   ★旧: 「帯は `is_mine` を読まない」（★09-27 §6-2）。★守っていた目的は ★**誤った「あなたの馬」を言わない**こと（★読まないのは その手段）。
   *   ★新: ★`is_mine` を読むのは ★`channel-feed.ts` の `fetchMyGates` **1 か所**で ★ログインの口を通す／★未ログインの口は `is_mine` も `*` も選ばない／
   *        ★自分の馬の言葉は ★`isMine`（★`myGates`）が真のときだけ出る。★目的は ★この 3 つが引き継ぐ。
   */
  const FEED = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/channel-feed.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const CHANNEL = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/strip-channel.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');
  /** ★`is_mine` を選ぶ `.select(...)` の数（★帯・番組の部品・出走馬の口 すべて） */
  const isMineSelects = (src: string): number => [...src.matchAll(/\.select\(([^)]*)\)/g)].filter((m) => m[1]!.includes('is_mine')).length;
  /** ★`readClient` の問い合わせ（★`readClient()` から次の `;` まで）が `is_mine` か `*` を選んでいるか */
  const readClientSelectsMine = (src: string): boolean => {
    for (const m of src.matchAll(/readClient\(\)[\s\S]*?;/g)) {
      if (/\.select\([^)]*is_mine/.test(m[0]) || /\.select\(\s*['"`]\s*\*\s*['"`]/.test(m[0])) return true;
    }
    return [...src.matchAll(/\bclient\.from\([^)]*\)\s*\.select\(([^)]*)\)/g)].some((x) => x[1]!.includes('is_mine') || /['"`]\s*\*\s*['"`]/.test(x[1]!))
      && !/authClient\(\)/.test(src.slice(0, src.indexOf('is_mine')));
  };

  it('🔴 ★帯そのものは ★ログインの口を使わず ★`is_mine` を選ばない（★未ログインの経路）', () => {
    const selects = [...LIVE.matchAll(/\.select\(([^)]*)\)/g)].map((m) => m[1]!);
    expect(selects.length, '★問い合わせを 1 つも読めていない').toBeGreaterThanOrEqual(3);
    for (const cols of selects) {
      expect(cols, '★帯が is_mine を選んでいる').not.toContain('is_mine');
      expect(cols, '★帯が列を名指ししていない（★`*` は is_mine を連れてくる）').not.toMatch(/['"`]\s*\*\s*['"`]/);
    }
    expect(LIVE, '★帯がログインの口を使っている').not.toContain('authClient');
    expect(LIVE).toContain("import { readClient } from '../../lib/supabase';");
  });

  it('🔴 ★`is_mine` を読むのは `fetchMyGates` の 1 か所・★ログインの口・★未ログインは空', () => {
    expect(isMineSelects(LIVE) + isMineSelects(FEED) + isMineSelects(CHANNEL), '★is_mine を読む口が 1 か所でない').toBe(1);
    expect(FEED.indexOf('export async function fetchMyGates'), '★fetchMyGates が見つからない').toBeGreaterThan(-1);
    const fn = FEED.slice(FEED.indexOf('export async function fetchMyGates'));
    expect(fn).toMatch(/const client = authClient\(\);/);
    expect(fn, '★セッションが無いのに読んでいる').toMatch(/if \(session\.session === null\) return new Set\(\);/);
    expect(fn).toMatch(/\.select\('race_id,gate,is_mine'\)/);
    /** ★出走馬の詳しい形（★未ログインの口）は ★is_mine を選ばない */
    expect(FEED.indexOf('export async function fetchFieldProfiles'), '★出走馬の口が見つからない').toBeGreaterThan(-1);
    const profiles = FEED.slice(FEED.indexOf('export async function fetchFieldProfiles'), FEED.indexOf('export async function fetchMyGates'));
    expect(profiles.length, '★切り出せていない').toBeGreaterThan(0);
    expect(profiles).toContain(".select('gate,strategy,weight,popularity,horse_id')");
    expect(profiles).not.toContain('is_mine');
    expect(profiles).not.toContain('authClient');
  });

  it('🔴 ★自分の馬の言葉は `myGates` が在って その馬番が入っているときだけ（★わからなければ出さない）', async () => {
    const { ownRecentLine } = await import('../../web/src/components/uma/broadcast-program.js');
    const runners = [
      { gate: 3, name: 'ウマC', strategy: 'senko' as const, finishSec: 96, finishPosition: 2, horseId: 'h3' },
      { gate: 5, name: 'ウマE', strategy: 'sashi' as const, finishSec: 95, finishPosition: 1, horseId: 'h5' },
    ];
    expect(ownRecentLine(runners, 'R1', null), '★わからないのに言っている').toBeNull();
    expect(ownRecentLine(runners, 'R1', new Set()), '★出ていないのに言っている').toBeNull();
    expect(ownRecentLine(runners, 'R1', new Set(['R2:3'])), '★別のレースの馬番で言っている').toBeNull();
    expect(ownRecentLine(runners, 'R1', new Set(['R1:3']))).toBe('あなたの馬 3番 ウマC は 2着');
    /** ★番組の「あなたの馬」は ★`isMine` から（★`myGates` で作る） */
    expect(CHANNEL).toMatch(/isMine: next !== null && p\.myGates\?\.has\(`\$\{next\.id\}:\$\{r\.gate\}`\) === true/);
  });

  it('★対照 ①: ★未ログインの口に is_mine を足す変異は ★落ちる', () => {
    const mutated = LIVE.replace(".select('gate,horse_name,strategy,finish_pos,finish_time,horse_id')", ".select('gate,horse_name,strategy,finish_pos,finish_time,horse_id,is_mine')");
    expect(mutated).not.toBe(LIVE);
    expect(isMineSelects(mutated) + isMineSelects(FEED) + isMineSelects(CHANNEL)).toBe(2);
    const feedMut = FEED.replace(".select('gate,strategy,weight,popularity,horse_id')", ".select('gate,strategy,weight,popularity,horse_id,is_mine')");
    expect(feedMut).not.toBe(FEED);
    expect(readClientSelectsMine(feedMut) || isMineSelects(feedMut) === 2).toBe(true);
  });

  it('★対照 ②: ★isMine を見ずに「あなたの馬」を出す変異は ★落ちる', () => {
    const mutated = CHANNEL.replace('isMine: next !== null && p.myGates?.has(`${next.id}:${r.gate}`) === true', 'isMine: true');
    expect(mutated).not.toBe(CHANNEL);
    expect(mutated).not.toMatch(/isMine: next !== null && p\.myGates\?\.has\(`\$\{next\.id\}:\$\{r\.gate\}`\) === true/);
  });

  it('★帯の画面の文字に ★自馬を指す語が無い（★従・語の一覧）', () => {
    /** ★画面に出る文字（★JSX の地の文と文字列）だけを見る。★註記は `LIVE` で除いてある */
    for (const word of ['あなた', '自分の馬', '自馬', 'わたしの馬', '私の馬', 'あなたの']) {
      expect(LIVE, `★帯が「${word}」と言っている`).not.toContain(word);
    }
    /** ★札は ★「1着」＋馬番・馬名まで */
    expect(LIVE).toMatch(/<span className="u-race-result-place">1着<\/span>\s*<span className="u-race-result-name">\{winner\.gate\}番 \{winner\.name\}<\/span>/);
    expect(LIVE).toMatch(/<span>1着 \{winner\.gate\}番 \{winner\.name\}<\/span>/);
  });
});

describe('★「いま走っていません」に ★直前の結果 1 行（★R-18 回答 §3-6）', () => {
  it('★帯が ★記録の 1 着から 1 行を作り ★`/watch-race` が添える', () => {
    /** ★2026-09-29（★0098）: ★1 着の 1 行は ★確定してから（★発走時刻から着順が見えるので 映像より先に勝ち馬を出さない） */
    expect(LIVE).toContain("const lastWinner = recent?.status === 'settled' ? data?.runners.find((runner) => runner.finishPosition === 1) ?? null : null;");
    expect(LIVE).toMatch(/publishStripState\(\{ replaying, nextAt, lastResult \}\)/);
    const WATCH = readFileSync(path.join(ROOT, 'apps/web/src/app/watch-race/page.tsx'), 'utf8');
    expect(WATCH, '★直前の結果を添えていない').toMatch(/直前のレース: \$\{strip\.lastResult\}/);
  });
});

describe('★⑦ 読めなかったとき（★最後の表示を保持し「更新できません」だけ）', () => {
  it('🔴 ★失敗で ★表示を消さない（★data / focus を空にしない）', () => {
    expect(LIVE, '★失敗で表示を消している').not.toMatch(/setData\(null\)|setFocus\(null\)/);
    const onFail = /\.catch\(\(\) => \{([\s\S]*?)\}\)/.exec(LIVE);
    expect(onFail, '★失敗を受け取っていない').not.toBeNull();
    expect(onFail![1]!.trim(), '★失敗で注記以外のことをしている').toBe('if (active) setError(true);');
  });

  it('★注記を出す（★黙らない）', () => {
    /** ★2026-10-01: ★スマホの小窓テレビ（R-28）にも 1 つ（★帯・1 行・テレビの 3 か所） */
    expect(LIVE.match(/\{error && <span className="u-race-strip-error">更新できません<\/span>\}/g)?.length, '★帯・1 行・スマホのテレビ').toBe(3);
  });
});

describe('★⑥ タブ復帰', () => {
  it('🔴 ★戻った瞬間に ★時計を今に合わせて ★読み直す', () => {
    const onVisible = /const onVisible = \(\): void => \{([\s\S]*?)\n {4}\};/.exec(LIVE);
    expect(onVisible, '★タブ復帰を受けていない').not.toBeNull();
    expect(onVisible![1], '★時計を合わせていない').toContain('setNowMs(new Date().getTime());');
    expect(onVisible![1], '★読み直していない').toContain('refresh();');
    expect(LIVE).toContain("document.addEventListener('visibilitychange', onVisible);");
  });
});
