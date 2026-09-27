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
    expect(clocksOf(LIVE)).toEqual({ dateNow: 0, perfNow: 0, newDate: 2, setNow: 2 });
    /** ★帯と拡大が ★同じ `replayRows` を描く（★拡大が自分で位置を計算し直さない） */
    const runs = [...LIVE.matchAll(/<RaceRun rows=\{([A-Za-z]+)\}/g)].map((m) => m[1]);
    expect(runs, '★帯と拡大が別の行を描いている').toEqual(['replayRows', 'replayRows']);
    expect(LIVE.match(/const replayRows = /g)?.length, '★進行位置の計算が 2 つある').toBe(1);
  });

  it('★対照 ①: ★別の時計を使う変異は ★落ちる', () => {
    const mutated = LIVE.replace('<RaceRun rows={replayRows} distance={recent.distance}',
      '<RaceRun rows={rowsAt(Date.now())} distance={recent.distance}');
    expect(mutated, '★変異が当たっていない').not.toBe(LIVE);
    expect(clocksOf(mutated).dateNow).toBeGreaterThan(0);
    expect([...mutated.matchAll(/<RaceRun rows=\{([A-Za-z]+)\}/g)].map((m) => m[1])).not.toEqual(['replayRows', 'replayRows']);
  });

  it('🔴 ② ★拡大で ページを移らない（★入力が残る）', () => {
    for (const nav of ['window.location', 'location.href', 'location.assign', 'location.replace', 'useRouter', 'router.push', 'history.pushState']) {
      expect(LIVE, `★拡大の部品が ${nav} を使っている`).not.toContain(nav);
    }
    /** ★開くのは ★状態だけ（★同じ React の木の中の重ね表示） */
    expect(LIVE).toMatch(/if \(step === 'open' && replayingRef\.current\) \{ autoOpenedRef\.current = true; setExpanded\(true\); \}/);
    expect(LIVE).toMatch(/\{expanded && replaying && recent && <div className="u-race-replay-overlay"/);
  });

  it('★対照 ②: ★ページを移る変異は ★落ちる', () => {
    const mutated = LIVE.replace('setExpanded(true); }', "window.location.href = '/race'; }");
    expect(mutated).not.toBe(LIVE);
    expect(mutated).toContain('window.location');
  });

  it('④ ★本編と名乗らない・★音を付けない', () => {
    expect(LIVE, '★録画であることを言っていない').toContain('録画・結果から再現');
    expect(LIVE, '★本編と名乗っている').not.toMatch(/本編/);
    expect(LIVE, '★音を鳴らしている').not.toMatch(/new Audio|AudioContext|\.play\(/);
  });

  it('⑤ ★動きを止める設定が ★拡大後にも効く（★1 コマ目で止まる）', () => {
    expect(LIVE).toMatch(/<RaceRun rows=\{replayRows\} distance=\{recent\.distance\} motionReduced=\{motionReduced\} tall \/>/);
    expect(LIVE).toMatch(/animation: motionReduced \? 'none'/);
  });
});
