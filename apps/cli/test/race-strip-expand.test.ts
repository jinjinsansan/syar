/**
 * ★**小窓 ⇄ 拡大の切り替え**（★2026-10-01・オーナー「PC で拡大ボタンが無い・スマホは拡大したら横向きの全画面・小窓に戻すボタン・バグが発生しないように」）
 *
 * 【★見ている壊れ方】
 *   ① ★拡大・戻すの入口が 何か所にも散る（★全画面や向きの固定を外し忘れる経路ができる）
 *   ② ★全画面を外から抜けた（★端末の戻る・Esc）のに ★画面は拡大のまま（★状態がずれる）
 *   ③ ★拡大で 本編の iframe を作り直す（★読み直し・進行位置が飛ぶ）
 *   ④ ★「拡大」ボタンが ★テレビがあっても出ない（★レースの間に押せない）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const LIVE = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/race-strip.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★小窓 ⇄ 拡大', () => {
  it('🔴 ① ★手で開くのは `openExpanded`・★戻すのは `closeExpanded` だけ', () => {
    /** ★`setExpanded(true)` は ★出入口（openExpanded）と ★横向きの自動拡大（★条件 3）と ★画面からの頼み（EXPAND_EVENT）だけ */
    expect(LIVE.match(/setExpanded\(true\)/g)?.length, '★setExpanded(true) が 出入口の外に増えた').toBe(3);
    expect(LIVE).toMatch(/const openExpanded = \(\): void => \{\s*setExpanded\(true\);/);
    /** ★`setExpanded(false)` は ★closeExpanded の中と ★横向きの自動拡大を縦で閉じる所だけ */
    expect(LIVE.match(/setExpanded\(false\)/g)?.length, '★setExpanded(false) が 出入口の外に増えた').toBe(2);
    expect(LIVE).toMatch(/const closeExpanded = \(\): void => \{\s*autoOpenedRef\.current = false;\s*setExpanded\(false\);/);
    /** ★「小窓に戻す」ボタンは ★closeExpanded を呼ぶ */
    expect(LIVE.match(/onClick=\{closeExpanded\} aria-label="小窓に戻す">小窓に戻す<\/button>/g)?.length).toBe(2);
  });

  it('🔴 ② ★全画面を外から抜けたら ★小窓に戻す（★fullscreenchange）・★戻すときは 全画面と向きの固定を外す', () => {
    expect(LIVE).toMatch(/document\.addEventListener\('fullscreenchange', onChange\)/);
    expect(LIVE).toMatch(/if \(document\.fullscreenElement === null && enteredFullscreenRef\.current\) \{ enteredFullscreenRef\.current = false; closeExpandedRef\.current\(\); \}/);
    const close = LIVE.slice(LIVE.indexOf('const closeExpanded = '), LIVE.indexOf('const closeExpandedRef'));
    expect(close.length, '★closeExpanded を切り出せない').toBeGreaterThan(0);
    expect(close).toContain('screen.orientation.unlock()');
    expect(close).toContain('document.exitFullscreen()');
    /** ★Esc も 同じ出口 */
    expect(LIVE).toMatch(/if \(event\.key === 'Escape'\) closeExpandedRef\.current\(\);/);
  });

  it('🔴 ③ ★本編の iframe は 1 つだけ（★拡大は 同じ箱を広げる）', () => {
    expect(LIVE.match(/<iframe /g)?.length).toBe(1);
  });

  it('④ ★「拡大」は テレビがあれば いつも出す（★PC・スマホ）', () => {
    expect(LIVE).toContain('{(watchable || tvMode !== null) && !expanded && <button type="button" className="u-race-strip-expand" onClick={openExpanded}>拡大</button>}');
    expect(LIVE).toContain('{!expanded && <button type="button" className="u-tvstrip-expand"');
  });

  it('★対照: ★出入口の外で setExpanded(true) を足す変異は ★落ちる', () => {
    const mutated = LIVE.replace('onClick={openExpanded}>拡大</button>', 'onClick={() => { setExpanded(true); }}>拡大</button>');
    expect(mutated).not.toBe(LIVE);
    expect(mutated.match(/setExpanded\(true\)/g)?.length).not.toBe(3);
  });
});
