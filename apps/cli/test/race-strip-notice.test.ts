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

describe('★④ の札は ★「あなたの馬」と読めない（★裁定 §6-2・帯は誰の馬かを知らない＝自馬の表示は段 3）', () => {
  it('🔴 ★帯の画面の文字に ★自馬を指す語が無い', () => {
    /** ★画面に出る文字（★JSX の地の文と文字列）だけを見る。★註記は `LIVE` で除いてある */
    for (const word of ['あなた', '自分の馬', '自馬', 'わたしの馬', '私の馬', 'あなたの']) {
      expect(LIVE, `★帯が「${word}」と言っている`).not.toContain(word);
    }
    /** ★札は ★「1着」＋馬番・馬名まで */
    expect(LIVE).toMatch(/<span className="u-race-result-place">1着<\/span>\s*<span className="u-race-result-name">\{winner\.gate\}番 \{winner\.name\}<\/span>/);
    expect(LIVE).toMatch(/<span>1着 \{winner\.gate\}番 \{winner\.name\}<\/span>/);
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
    expect(LIVE.match(/\{error && <span className="u-race-strip-error">更新できません<\/span>\}/g)?.length, '★帯と 1 行の両方').toBe(2);
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
