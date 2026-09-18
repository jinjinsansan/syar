/**
 * ★**履歴書型の馬詳細の配線**（★D13-2・2026-09-16・正典 §18・D-108・D-109・D-105）
 *
 * 【★なぜ要るか】★2026-09-16 に ★**道具を作ったのに繋いでいなかった**ことが 2 回ありました
 *   （★`settle-races.mjs` が `epochMs` を渡さず物語が 0 行／★`raceWeekMarkOf` の 4 値のうち 2 値が死んでいた）。
 *   → ★正典 §18 **LR-9**「道具の結線は検査する」。★この検査は ★**画面が本当に引いているか**を見ます。
 *
 * 【★見ている壊れ方】
 *   ① ★**どの個性が付くかを画面が決める**（★D-109。★境目を動かした日に画面だけ古くなる）
 *   ② ★**発見度の段を画面で決める**（★D-108。★段を決めるのは `discoveryStageOf`）
 *   ③ ★**物語の文を画面で組み立てる**（★§18 LR-4）
 *   ④ ★**素質の数値**が出る（★§5.5・§12.4）
 *   ⑤ ★**騎手に強さの差**を匂わせる（★D-105 ③。★親密度の言葉も組み直さない）
 *   ⑥ ★**個性が着順に効くと読める**（★この便は `TRAIT_EFFECT` が 0）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TRAIT_LABEL, innateTraitsOf, learnedTraitsOf, careerInputOf } from '@star/sim-engine';
import { JOCKEYS } from '@star/scheduler';
/**
 * ★**デモの値そのものを通します**（★文字列で見るだけにしない・R-16）。
 * ⚠️ ★相対で引きます（★`worker → cli` の `race-field.js` と同じ作法）。
 *    ★ここで値を写すと ★**二重帳簿**になります（★見本を直した日に検査だけ古くなる）。
 */
import { DEMO_INNATE_INPUT, DEMO_CAREER_RUNS } from '../../web/src/lib/horse-resume-demo.js';

const ROOT = path.resolve(__dirname, '../../..');
/** ★コメントを空白にしてから見る（★註記の語を拾わない） */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const read = (rel: string): string => strip(readFileSync(path.join(ROOT, rel), 'utf8'));
const CODE = read('apps/web/src/components/horse-resume.tsx');
const DEMO = read('apps/web/src/lib/horse-resume-demo.ts');
const PAGE = read('apps/web/src/app/stable/[horseId]/page.tsx');

describe('★履歴書型の馬詳細の配線（D13-2）', () => {
  it('★★画面が本当に差し込まれている（★部品を作っただけで終わらせない・LR-9）', () => {
    expect(PAGE).toMatch(/HorseResume/);
    /** ★スマホ縦にだけ出す（★PC 版は残す） */
    expect(PAGE).toContain('show-narrow');
    expect(PAGE).toContain('hide-narrow');
  });

  it('① ★個性は導かれる（★どの個性が付くかを画面もデモも書いていない）', () => {
    expect(CODE).toMatch(/innateTraitsOf/);
    expect(CODE).toMatch(/learnedTraitsOf/);
    expect(CODE).toMatch(/careerInputOf/);
    expect(CODE).toMatch(/TRAIT_LABEL\[/);
    /** ★個性の名前を画面に写していない（★「繊細」「大舞台経験」等） */
    for (const label of Object.values(TRAIT_LABEL)) {
      expect(CODE, `★個性の名前が画面に写っている: ${label}`).not.toContain(label);
      expect(DEMO, `★個性の名前がデモに写っている: ${label}`).not.toContain(label);
    }
    /** ★境目（`INNATE_THRESHOLDS`・`LEARNED_STEPS`）を画面にもデモにも持たない */
    for (const src of [CODE, DEMO]) {
      expect(src).not.toMatch(/INNATE_THRESHOLDS|LEARNED_STEPS/);
    }
  });

  it('① ★デモの入力は境目の両側を含む（★「通るだけ」の見本にしない・R-2・R-16）', () => {
    /**
     * ★この見本は ★**付く個性と付かない個性の両方**を持ちます。
     * ⚠️ ★全部付く／全部付かない見本だと、★境目を壊しても画面が同じに見えます。
     */
    const demoModule = DEMO;
    expect(demoModule).toMatch(/DEMO_INNATE_INPUT/);
    expect(demoModule).toMatch(/DEMO_CAREER_RUNS/);
  });

  it('② ★発見度の段は `discoveryStageOf` が決める（★刻みを画面に持たない）', () => {
    expect(CODE).toMatch(/discoveryStageOf/);
    expect(CODE).toMatch(/discoveryLabelOf/);
    expect(CODE).not.toMatch(/DISCOVERY_STEPS/);
    /** ★回数の比較を画面で書いていない */
    expect(CODE).not.toMatch(/runs\s*>=/);
  });

  it('③ ★物語の文は `storyLinesOf` から来る（★画面で組み立てない・LR-4）', () => {
    expect(CODE).toMatch(/storyLinesOf/);
    expect(CODE).toMatch(/\{l\.text\}/);
    expect(CODE).toMatch(/STORY_EVENT_LABEL\[l\.type\]/);
    /** ★文の中身で分岐していない */
    expect(CODE).not.toMatch(/l\.text\.(includes|indexOf|match)/);
    /** ★デモにも文を書いていない（★種類と値だけ） */
    expect(DEMO).not.toMatch(/しました。|勝ちました|生まれました/);
  });

  it('🔴 ④ ★素質を一切出していない（★数値も段も）', () => {
    /**
     * 【★2026-09-18・**D-114 ②**・T-10・AL-2 で向きが反転しました】
     *   ★旧: ★**数値は出さず、★だけ出す**（★`<Stars` を**要求**していました）。
     *   ★新: ★**段も出しません**。★強さの手がかりは★**オッズと戦績だけ**。
     */
    for (const bad of ['potential', '素質の数値', '上限まで', 'unlockRate', 'capRatio']) {
      expect(CODE, `★素質が漏れている: ${bad}`).not.toContain(bad);
      expect(DEMO, `★素質が漏れている（デモ）: ${bad}`).not.toContain(bad);
    }
    expect(CODE, '★★の部品が戻っている').not.toMatch(/<Stars/);
  });

  it('⑤ ★騎手に強さの差を匂わせない（★親密度の言葉も組み直さない）', () => {
    for (const bad of ['勝率', '得意', '勝ちやすい', '成績', '実績', '上手']) {
      expect(CODE, `★誤読を招く語がある: ${bad}`).not.toContain(bad);
    }
    /** ★名簿は `@star/scheduler` が正（★名前を画面に書かない） */
    expect(CODE).toMatch(/JOCKEYS\.find/);
    for (const j of JOCKEYS) {
      expect(CODE, `★騎手の名前が画面に写っている: ${j.name}`).not.toContain(j.name);
    }
    /** ★抑えの強さ（`calm`）は出さない */
    expect(CODE).not.toContain('calm');
    /** ★親密度も言葉も引く（★`bondLabel` は騎手の画面と同じ関数） */
    expect(CODE).toMatch(/jockeyBondAfterRides/);
    expect(CODE).toMatch(/bondLabel\(/);
  });

  it('⑥ ★個性が着順に効くと読めない（★この便は効果 0）', () => {
    expect(CODE).toContain('いまは着順に影響しません');
    for (const bad of ['強い', '有利', '強化', 'パワーアップ']) {
      expect(CODE, `★強さと読める語がある: ${bad}`).not.toContain(bad);
    }
  });

  it('★子孫は 2 代まで（★空の世代は 1 行だけ・カードの指定）', () => {
    expect(DEMO).toMatch(/OFFSPRING_GENERATION_LABEL/);
    expect(CODE).toContain('まだいません');
    /** ★世代の見出しは 2 つ（★画面が深さを決めない） */
    const labels = DEMO.match(/OFFSPRING_GENERATION_LABEL[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect((labels.match(/'/g) ?? []).length / 2, '★世代の見出しが 2 つではない').toBe(2);
  });

  it('★個性の導出そのものが両側を返す（★見本が片側に寄っていない）', () => {
    /**
     * ★**デモの値を実際に通します**（★文字列で見るだけにしない・R-16）。
     * ★先天・後天とも ★**付くものと付かないものの両方**がある見本であること。
     */
    const innate = innateTraitsOf(DEMO_INNATE_INPUT);
    const learned = learnedTraitsOf(careerInputOf(DEMO_CAREER_RUNS));
    expect(innate.length, '★先天が 1 つも付かない見本').toBeGreaterThan(0);
    expect(innate.length, '★先天が全部付く見本（★付かない側が見えない）').toBeLessThan(4);
    expect(learned.length, '★後天が 1 つも付かない見本').toBeGreaterThan(0);
    expect(learned.length, '★後天が全部付く見本（★付かない側が見えない）').toBeLessThan(3);
  });
});
