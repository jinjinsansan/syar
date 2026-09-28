/**
 * ★**自分の馬が出ていないレースで「あなたの馬」を描かない**（★2026-09-28・観戦・オーナー許可）
 *
 * 【★なぜ】
 *   ★`/race` は ★自分の馬が出たレースだけを出していました（★簿 `REPLAY-NEEDS-OWN-HORSE`・裁定 Q-RACE-6）。
 *   ★理由は ★56 か所が `ownGate` を読み、★居ないレースで開くと ★**どれかの馬を「あなたの馬」と偽る**ことでした。
 *   ★小窓でパドックからリプレイまで流すため（★オーナー依頼）、★自馬の居ないレースも出します。
 *   → ★`ownGate` は ★**カメラの主役**（★自馬 か ★1 着）、★「あなたの馬」と描くのは ★**`mineGate` だけ**に分けました。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★「あなたの馬」の表示が ★`ownGate`（★主役）を読む ＝ ★1 着の馬を自馬と偽る
 *   ② 🔴 ★自馬の居ないレースで ★自馬カード・★自馬の目印・★冒頭の札・★出馬表の「自馬」欄が出る
 *   ③ ★`mineGate` が ★実レースで `ownGate`（主役）に落ちる
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8');
/** ★注記を除いた本文（★注記の中の語で通さない） */
const live = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('★自分の馬が出ていないレースで「あなたの馬」を描かない', () => {
  it('③ ★`mineGate` は ★実レースでは 読む層の `ownGate`（★主役の `focusGate` ではない）', () => {
    expect(live).toContain('useState(real?.focusGate ?? 3)');
    expect(live).toContain('const mineGate: number | undefined = real === null ? ownGate : (real.ownGate ?? undefined);');
  });

  it('🔴 ① ★強調（`isOwn`）と ★金の点（`own:`）は ★`mineGate` を読む', () => {
    expect(live.match(/isOwn:[^,\n]*===\s*ownGate\b/g) ?? [], '★isOwn が主役を読んでいる').toEqual([]);
    expect(live.match(/isOwn:[^,\n]*===\s*mineGate\b/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    /** ★カメラの監督へ渡す `own` だけは ★主役（★カメラが追う馬・★文字は描かない） */
    const ownFlags = live.match(/own:\s*(h|horse)\.gate\s*===\s*ownGate\b/g) ?? [];
    expect(ownFlags).toEqual(['own: horse.gate === ownGate']);
  });

  it('🔴 ① ★自馬の欄・テロップ・馬名プレート・隊列バーは ★`mineGate` を渡す', () => {
    expect(live).toContain('referenceNamePlateRows(rank, mineGate,');
    expect(live.match(/ownGate: mineGate\b/g)?.length ?? 0, '★隊列テロップ・直線カットイン・隊列バー').toBeGreaterThanOrEqual(3);
    expect(live).toContain('gate: mineGate,');
  });

  it('🔴 ② ★自馬カード・★自馬の目印・★冒頭の札・★出馬表の「自馬」欄は ★自馬が居るときだけ', () => {
    expect(live).toMatch(/const startCutInActive = [^;]*mineGate !== undefined;/);
    expect(live).toContain('if (ownMarkerVisible && v2OwnHead !== undefined && mineGate !== undefined) {');
    expect(live).toContain('...(mineGate === undefined ? {} : {');
    expect(live).toContain('mineGate === undefined ? undefined : art.sideHighQuality[mineGate - 1],');
    expect(live).toContain('{mineGate !== undefined && <div className="rm-entry-own">');
  });
});
