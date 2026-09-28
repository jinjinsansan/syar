/**
 * ★**常設帯の走行**（★2026-09-27・裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` ①②・`RACE_NOTICE_HANDOFF.md` §2）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**走行が枠番の数字だけに戻る**（★裁定時点の実装。★絵を 1 度も読んでいなかった）
 *   ② 🔴 ★**オーナーが差し戻した絵に戻る**（★`horse-gallop.webp`・★「絵柄が別系統」・2026-09-17。
 *        ★2026-09-27 にオーナーが ★side-v8（本編と同じ）を選んだ）
 *   ③ 🔴 ★**全頭が 1 つの塊になる**（★1600m を枠 1 枚に収めると ★数馬身が 3px。★カメラが先頭を追う）
 *   ④ ★**「大」150px と「極小」22×16px の寸法が資料から外れる**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const STRIP = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-theme.css'), 'utf8');
const LIVE = STRIP.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

import { RUN_VIEW_M, runCamera } from '../../web/src/components/uma/race-camera.js';

describe('★常設帯の走行（①②）', () => {
  it('🔴 ★本編と同じ side-v8 の 8 コマを読む（★差し戻した horse-gallop に戻らない）', () => {
    expect(LIVE, '★side-v8 を読んでいない').toContain('/art/horse-jockey-side-v8-pose0');
    expect(LIVE, '★8 コマでない').toMatch(/\[1, 2, 3, 4, 5, 6, 7, 8\]\.map\(\(n\) => `\/art\/horse-jockey-side-v8-pose0\$\{n\}\.webp`\)/);
    expect(LIVE, '🔴 ★差し戻した絵に戻っている').not.toContain('horse-gallop');
  });

  /**
   * 🔴 ★**簡易版の走行（side-v8 の横並び）は 帯に出さない**（★2026-09-28・オーナー「この間違っているレース映像が未だに流れています」）。
   *   ★本編の用意ができるまでは ★箱を出さず、★できたら ★本編だけ。★拡大も ★本編（★同じ iframe）だけ。
   *   ★「極小」の 22×16px の馬は ★映像ではなく印なので 残す。
   */
  /**
   * ★2026-09-28（★レビュー側の決定・決裁 ④）: ★本編を流す面（表 `STRIP_EMBED_ROUTES`）では ★簡易版を出さず、★それ以外の「大」は ★簡易版の走行に戻す。
   */
  it('🔴 ★本編の面では 簡易版を出さず、★それ以外の「大」は 簡易版の走行（★1 か所だけ）', () => {
    expect(LIVE.match(/<RaceRun /g)?.length, '★簡易版の走行は 1 か所だけ').toBe(1);
    expect(LIVE).toMatch(/\{big && !embedsHere && <div className="u-race-strip-stage">\s*<RaceRun rows=\{replayRows\}/);
    expect(LIVE).toContain("const big = size === 'big' && (embedsHere ? embedLive : replaying);");
    expect(LIVE, '★「極小」が馬を描いていない').toMatch(/u-race-run-mini[\s\S]{0,200}<RunningHorse/);
  });

  it('🔴 ★絵を読むのは ★極小の馬だけ・★本編は 確定を見てから 窓が閉じるまでに読み始める', () => {
    /** ★8 コマ（★約 450KB）は ★`RunningHorse` の中でしか使わない（★先読みしない） */
    expect(LIVE.match(/RUN_FRAMES/g)?.length, '★RUN_FRAMES を別の所でも使っている').toBe(2);
    expect(LIVE, '★先読みしている').not.toMatch(/new Image\(|rel=["']preload/);
    /**
     * ★2026-09-28（★オーナー依頼・承知の上で 1 レース約 4MB）: ★本編を ★読み始めるのは ★確定が見えてから ★窓が閉じるまで
     *   （★窓の 75 秒前から・★本編の用意が 24〜27 秒かかるため）・★「大」と「極小」（★極小は拡大のためだけ）・★動きを減らす設定でないときだけ。
     *   ★窓が閉じても ★まだ流れ始めていなければ ★やめる。
     */
    expect(LIVE, '★本編を 窓の後・表の面以外で開く').toMatch(/if \(!embedsHere \|\| motionReduced\) \{ setEmbed\(null\); return; \}\s*if \(!windowOver && recentId !== null && embeddedIdRef\.current !== recentId\)/);
    expect(LIVE, '★窓が閉じても 始まっていない本編を読み続ける').toMatch(/if \(!windowOver \|\| e === null \|\| e\.live\) return;[\s\S]{0,200}setEmbed\(null\);/);
    /** ★同じ箱のまま ★窓の前・極小は画面の外・★拡大で画面いっぱい（★箱を差し替えると 読み込みが最初からになる） */
    expect(LIVE).toContain("{embed !== null && <div className={`u-race-strip-stage${big || expanded ? '' : ' u-race-strip-stage-offscreen'}${embedLive ? ' u-race-strip-stage-live' : ''}${expanded ? ' u-race-strip-stage-full' : ''}`}");
    /** ★本編が流れている間は ★箱を 16:9 に（★枠いっぱい・★引き伸ばさない・2026-09-28 オーナー指示） */
    expect(CSS).toMatch(/\.u-race-strip-stage-live \{[^}]*aspect-ratio: 16 \/ 9;/);
    expect(LIVE, '★「極小」が録画の窓の外で出る').toMatch(/\(replaying \|\| embedLive\) && recent && data \? <>[\s\S]{0,300}u-race-run-mini/);
    expect(LIVE, '★拡大の口が 本編の無いときに出る').toContain('{watchable && <button type="button" className="u-race-strip-expand"');
  });

  it('🔴 ★.webp を読む（★同名の .png は 1 枚 467KB・裁定 §5 条件 2 (b)）', () => {
    expect(LIVE).toMatch(/side-v8-pose0\$\{n\}\.webp`/);
    expect(LIVE, '★.png を読んでいる').not.toMatch(/side-v8-pose0[^`'"]*\.png/);
  });

  it('★寸法は資料の値（★大 150px ／ 極小 22×16px）', () => {
    expect(CSS).toMatch(/\.u-race-run \{[\s\S]{0,120}height: 150px/);
    expect(CSS).toMatch(/\.u-race-run-mini \{[\s\S]{0,80}width: 22px; height: 16px/);
  });

  it('★動きを止める設定では ★1 コマ目だけが残る（★重なって濁らない）', () => {
    expect(LIVE).toMatch(/opacity: i === 0 \? 1 : 0/);
    expect(LIVE).toMatch(/animation: motionReduced \? 'none'/);
  });
});

describe('★カメラ（③）', () => {
  it('🔴 ★式は 1 か所（★帯が部品を import している・★写していない。裁定 §5 条件 1・D-052）', () => {
    expect(LIVE).toContain("from './race-camera'");
    expect(LIVE, '★帯が式を自分で持っている').not.toMatch(/function runCamera/);
    expect(RUN_VIEW_M).toBe(60);
  });

  it('🔴 ★数馬身の差が ★枠の幅の 1 割以上に開く（★1 枚に収めると 1% 未満）', () => {
    /** ★1600m で先頭と 3 馬身（約 7.5m）差 */
    const lead = 0.5;
    const back = lead - 7.5 / 1600;
    const cam = runCamera([lead, back], 1600);
    const gap = (lead - back) / (cam.right - cam.left);
    expect(gap, '★差が画面で見えない').toBeGreaterThan(0.1);
    expect(lead - back, '★対照: 全体を 1 枚にすると 1% 未満').toBeLessThan(0.01);
  });

  it('★発走前は ★先頭が枠の中・★ゴール前は ★ゴールが枠の中', () => {
    const start = runCamera([0, 0], 1600);
    expect(start.left).toBeCloseTo(0);
    const end = runCamera([1, 0.99], 1600);
    expect(end.right).toBeGreaterThan(1);
    expect(end.left).toBeLessThan(1);
  });
});
