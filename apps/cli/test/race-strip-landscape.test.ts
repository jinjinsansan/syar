/**
 * ★**横にしたら その場で全画面（③ 段 A）**（★2026-09-27・裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` §6・仕様 §4 の読み替え）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**頭出しになる** … ★拡大の前後で ★別の時計を使う（★拡大した瞬間に進行位置が変わる）
 *   ② 🔴 ★**入力が消える** … ★拡大で ★ページを移る（★`location` を変える・★転送する）
 *   ③ 🔴 ★**PC で勝手に全画面** … ★触る端末でなくても ★横向きで開く（★条件 3）
 *   ④ ★**本編と名乗る** ／ ★**音が鳴る**（★条件 1・2）
 *   ⑤ ★**動きを止める設定が 拡大後に効かない**（★条件 4）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
const LIVE = STRIP.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** ★判定は原文から取り出して ★そのまま動かす（★写さない）。★JSX を含まない関数なので取り出せる */
function loadAutoExpandOf(src: string): (a: boolean, b: boolean, c: boolean) => 'open' | 'close' | null {
  const m = /export function autoExpandOf\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/.exec(src);
  if (m === null) throw new Error('★autoExpandOf が見つかりません');
  const params = m[1]!.split(',').map((p) => p.split(':')[0]!.trim());
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...params, m[2]!) as (a: boolean, b: boolean, c: boolean) => 'open' | 'close' | null;
}

/** ★時計の数（★`nowMs` を作る所）。★拡大の前後で 1 本の時計を通すこと */
function clocksOf(src: string): { dateNow: number; perfNow: number; newDate: number; setNow: number } {
  return {
    dateNow: (src.match(/Date\.now\(/g) ?? []).length,
    perfNow: (src.match(/performance\.now\(/g) ?? []).length,
    newDate: (src.match(/new Date\(\)\.getTime\(\)/g) ?? []).length,
    setNow: (src.match(/setNowMs\(/g) ?? []).length,
  };
}

describe('★③ 段 A ── 横にしたら その場で全画面', () => {
  it('🔴 ③ ★触る端末で・縦 → 横 のときだけ開く（★PC は自動で開かない）', () => {
    const f = loadAutoExpandOf(LIVE);
    expect(f(false, true, true), '★携帯を横にした').toBe('open');
    expect(f(true, false, true), '★携帯を縦に戻した').toBe('close');
    expect(f(false, true, false), '🔴 ★PC（触る端末でない）で開いた').toBeNull();
    expect(f(true, true, true), '★向きが変わっていないのに開いた（★横で読み込んだだけ）').toBeNull();
    expect(LIVE, '★触る端末かを見ていない').toContain("window.matchMedia('(pointer: coarse)')");
  });

  it('🔴 ① ★拡大の前後で ★同じ時計・同じ行（★頭出しにならない）', () => {
    /** ★時計は ★`nowMs` 1 本（★`new Date().getTime()` を ★`setNowMs` に入れる 2 か所だけ） */
    /** ★⑥ タブ復帰でも ★同じ時計を今に合わせる（★2026-09-27）。★数でなく ★「全部が同じ時計」を見る */
    const c = clocksOf(LIVE);
    expect({ dateNow: c.dateNow, perfNow: c.perfNow }).toEqual({ dateNow: 0, perfNow: 0 });
    expect(c.setNow, '★setNowMs に別の値を入れている').toBe(c.newDate);
    expect(LIVE.match(/setNowMs\(new Date\(\)\.getTime\(\)\)/g)?.length, '★時計以外を nowMs に入れている').toBe(c.setNow);
    expect(c.setNow, '★時計が 1 か所も無い').toBeGreaterThan(0);
    /**
     * ★2026-09-28: ★拡大は ★帯の中の ★同じ iframe（本編）を ★画面いっぱいに広げるだけ（★読み直さない ＝ ★同じ進行位置のまま）。
     *   ★iframe は ★帯に 1 つだけ・★拡大の印は ★その iframe を持つ箱の class（★別の箱・別の映像を作らない）。
     */
    expect(LIVE.match(/<iframe /g)?.length, '★拡大が 別の iframe を作っている（★頭出しになる）').toBe(1);
    expect(LIVE).toMatch(/\$\{stageFull \? ' u-race-strip-stage-full' : ''\}`\}[\s\S]{0,200}<iframe ref=\{iframeRef\}/);
  });

  it('★対照 ①: ★拡大で 別の iframe を作る変異は ★落ちる', () => {
    /** ★2026-10-01: ★「拡大」は テレビがあれば いつも出す（★`(watchable || tvMode !== null) && !expanded`） */
    const mutated = LIVE.replace('{(watchable || tvMode !== null) && !expanded && <button', '{expanded && <iframe src="/race" />}{(watchable || tvMode !== null) && !expanded && <button');
    expect(mutated, '★変異が当たっていない').not.toBe(LIVE);
    expect(mutated.match(/<iframe /g)?.length).toBe(2);
  });

  it('🔴 ② ★拡大で ページを移らない（★入力が残る）', () => {
    for (const nav of ['window.location', 'location.href', 'location.assign', 'location.replace', 'useRouter', 'router.push', 'history.pushState']) {
      expect(LIVE, `★拡大の部品が ${nav} を使っている`).not.toContain(nav);
    }
    /** ★開くのは ★状態だけ（★同じ React の木の中の重ね表示） */
    expect(LIVE).toMatch(/if \(step === 'open' && replayingRef\.current && !expandedRef\.current\) \{ autoOpenedRef\.current = true; setExpanded\(true\); \}/);
    expect(LIVE).toContain("{embed !== null && <div className={`u-race-strip-stage${big || stageFull ? '' : ' u-race-strip-stage-offscreen'}");
  });

  it('★対照 ②: ★ページを移る変異は ★落ちる', () => {
    const mutated = LIVE.replace('setExpanded(true); }', "window.location.href = '/race'; }");
    expect(mutated).not.toBe(LIVE);
    expect(mutated).toContain('window.location');
  });

  it('④ ★本編と名乗らない・★音を付けない', () => {
    /** ★2026-09-30: ★「録画」→「中継」（★オーナー「録画はそもそも不要ですよね？全て生中継であるべきです。なので中継という言葉にしてください」） */
    expect(LIVE, '★中継であることを言っていない').toContain(' · 中継</strong>');
    expect(LIVE, '★本編と名乗っている').not.toMatch(/本編/);
    expect(LIVE, '★音を鳴らしている').not.toMatch(/new Audio|AudioContext|\.play\(/);
  });

  /**
   * ⑤ ★動きを止める設定が ★拡大後にも効く（★2026-09-28・本編を拡大する形に変えた）:
   *   ★「動きを減らす」では ★本編を開かない（★拡大の口も出ない）・★停止スイッチは ★本編へ「止めて」を知らせる。
   */
  it('⑤ ★動きを止める設定が ★拡大後にも効く（★本編を開かない・★本編も止める）', () => {
    expect(LIVE).toContain('if (!embedsHere || motionReduced || canPlay !== true) { setEmbed(null); return; }');
    expect(LIVE).toContain('const watchable = embed !== null && (replaying || embedLive);');
    expect(LIVE).toContain("iframeRef.current?.contentWindow?.postMessage(stripControlMessage(sitePaused ? 'pause' : 'resume'), window.origin);");
    expect(LIVE).toContain("useEffect(() => { setSitePaused(sectionRef.current?.closest('.u-paused') != null); }, [nowMs]);");
  });
});
