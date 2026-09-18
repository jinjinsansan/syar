/**
 * ★**`/entry` の結線**（★UI1・2026-09-19・裁定 `REVIEW_EF_AND_WEEK_VERDICT_20260919.md`）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**画面がサーバーの持ちもの（出走料・斤量・締切・R 番号・週）を自分で持つ**
 *      → ★TypeScript・SQL・画面の**三重帳簿**（★実際そうなりかけていました）
 *   ② 🔴 ★**デモデータに戻る**（★`DEMO_ENTRY_RACES` を読み直す）
 *   ③ 🔴 ★**読み込み中・失敗を出さない**（★失敗が黙って消える・R-16。★UI1-9）
 *   ④ ★**画面が時計を持つ**（★正典 §14。★週も締切もサーバーから）
 *
 * ⚠️ ★**見た目は見ません**（★UI1-8: 並べ方はデザイナー便）。★「あるか無いか」だけです。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENTRY_FEE_EP } from '@star/scheduler';
import { formatRemaining, toEntryRaceView, toEntryHorseView } from '../../web/src/lib/entry-screen.js';
import type { EntryRaceRow } from '../../web/src/lib/entry-repo.js';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/entry/page.tsx'), 'utf8');
const SCREEN = readFileSync(path.join(ROOT, 'apps/web/src/lib/entry-screen.ts'), 'utf8');
/** ★註記の中の語は拾わない */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const LIVE_PAGE = strip(PAGE);
const LIVE_SCREEN = strip(SCREEN);

const NOW = 1_700_000_000_000;
const row = (over: Partial<EntryRaceRow> = {}): EntryRaceRow => ({
  id: 'r1',
  scheduledAtMs: NOW + 10 * 60 * 1000,
  classRank: 2,
  surface: 'turf',
  distance: 1600,
  trackCondition: 'good',
  courseId: 'ookawara',
  minWins: 1,
  maxWins: 1,
  status: 'scheduled',
  entryDeadlineAtMs: NOW + 5 * 60 * 1000,
  entryFeeEP: 200,
  weightKg: 55,
  cycleIndex: 12,
  ...over,
});

describe('★① 画面がサーバーの持ちものを自分で持たない', () => {
  it('🔴 ★出走料・斤量を画面で決めていない（★行の値を出す）', () => {
    const v = toEntryRaceView(row(), 8, 1, NOW);
    expect(v.feeEP, '★行の出走料を出していない').toBe(200);
    expect(v.weightKg, '★行の斤量を出していない').toBe(55);
    /** ★行に無ければ 0（★勝手に既定値を作らない。★`enter_race` はその行を通さない） */
    expect(toEntryRaceView(row({ entryFeeEP: null, weightKg: null }), 8, 1, NOW).feeEP).toBe(0);
  });

  it('🔴 ★画面が出走料の定数を引いていない（★EF-3）', () => {
    for (const gate of ['ENTRY_FEE_EP', 'BASE_WEIGHT_KG']) {
      expect(LIVE_PAGE, `★画面が ${gate} を引いている`).not.toContain(gate);
      expect(LIVE_SCREEN, `★変換の層が ${gate} を引いている`).not.toContain(gate);
    }
    /** ★参考: 定数そのものは動いていない（★EF-4） */
    expect(ENTRY_FEE_EP).toBe(200);
  });

  it('🔴 ★R 番号は `slotOfDay()` から導く（★DB に数を持たせない・EF-5）', () => {
    expect(LIVE_SCREEN, '★slotOfDay を呼んでいない').toContain('slotOfDay');
    /** ★`cycleIndex` 12 → その日の 13 本目 */
    expect(toEntryRaceView(row({ cycleIndex: 12 }), 8, 1, NOW).raceNo).toBe('13R');
    /** ★日をまたいでも 1 から数え直す（★`slotOfDay` は剰余） */
    expect(toEntryRaceView(row({ cycleIndex: 240 }), 8, 1, NOW).raceNo).toBe('1R');
  });
});

describe('★④ 画面が時計を持たない（★正典 §14）', () => {
  it('🔴 ★締切はサーバーが書いた値（★画面で `scheduledAt - 60 分` を計算しない）', () => {
    expect(LIVE_PAGE, '★画面に締切の計算がある').not.toMatch(/60\s*\*\s*60\s*\*\s*1000/);
    expect(LIVE_SCREEN, '★変換の層に締切の計算がある').not.toMatch(/scheduledAtMs\s*-\s*[0-9]/);
    /** ★締切が来ていれば `closed`・残りは null */
    const past = toEntryRaceView(row({ entryDeadlineAtMs: NOW - 1 }), 8, 1, NOW);
    expect(past.state).toBe('closed');
    expect(past.deadline).toBeNull();
  });

  it('★残り時間の表記（★境界の両側・R-2）', () => {
    expect(formatRemaining(NOW, NOW), '★ちょうどは締切').toBeNull();
    expect(formatRemaining(NOW - 1, NOW)).toBeNull();
    expect(formatRemaining(NOW + 1000, NOW)).toBe('0:01');
    expect(formatRemaining(NOW + 90 * 1000, NOW)).toBe('1:30');
    expect(formatRemaining(NOW + 3600 * 1000, NOW)).toBe('1:00:00');
  });

  it('🔴 ★年齢は「いまの週」から出す（★画面が起点を持たない・UI1-10）', () => {
    const h = (birthWeek: number | null, gameWeek: number) => toEntryHorseView(
      { id: 'h1', name: 'テスト', sex: '牡', condition: 3, fatigue: 0, birthWeek, wins: 0, starts: 0 },
      gameWeek,
    );
    expect(h(0, 104).sexAge, '★104 週 ＝ 2 歳').toBe('牡2');
    expect(h(52, 104).sexAge, '★52 週ぶん若い').toBe('牡1');
    /** ★誕生週が分からなければ年齢を出さない（★推測しない） */
    expect(h(null, 104).sexAge).toBe('牡');
    /** ★負にならない（★週が巻き戻っても 0 歳） */
    expect(h(200, 104).sexAge).toBe('牡0');
  });
});

describe('★② デモに戻っていない／★③ 読み込み中と失敗を出す', () => {
  it('🔴 ★画面がデモのレース・馬を読んでいない', () => {
    for (const demo of ['DEMO_ENTRY_RACES', 'DEMO_HORSES', 'entryCandidates']) {
      expect(LIVE_PAGE, `★デモに戻っている: ${demo}`).not.toContain(demo);
    }
    /** ★本番の入口を引いている */
    expect(LIVE_PAGE).toContain('loadEntryScreen');
  });

  it('🔴 ★読み込み中と失敗を必ず出す（★UI1-9・黙って消さない）', () => {
    /**
     * ⚠️ 🔴 ★**`setLoadError` がどこかにあるだけでは足りません。**
     *    ★変異で確かめたところ、★**`.catch` の中身を空にしても緑のまま**でした
     *    （★`useState` の宣言に名前が残るため）。
     *    → ★**`.catch` が実際に `setLoadError` を呼んでいるか**を見ます。
     */
    expect(LIVE_PAGE, '★catch で失敗を受け取っていない').toMatch(/\.catch\([\s\S]{0,160}setLoadError/);
    expect(LIVE_PAGE, '★失敗を画面に出していない').toMatch(/loadError\s*!==\s*null/);
    /** ★原文をそのまま出す（★推測で言い換えない・`readEntryError` と同じ作法） */
    expect(LIVE_PAGE, '★原文を出していない').toMatch(/\{loadError\}/);
    expect(PAGE, '★失敗の文言を出していない').toContain('読み込めませんでした');
    expect(PAGE, '★読み込み中を出していない').toContain('読み込んでいます');
  });

  it('★ワーカーが止まっていることに気づける（★UI1-10 の `stale_seconds`）', () => {
    expect(LIVE_PAGE).toContain('staleSeconds');
  });

  it('🔴 ★失敗を空配列にしていない（★「レースが無い」に見せない）', () => {
    expect(LIVE_SCREEN).toMatch(/throw new Error\(`races_public/);
    expect(LIVE_SCREEN).toMatch(/throw new Error\(`my_horses/);
    expect(LIVE_SCREEN).toMatch(/throw new Error\(`race_entries_public/);
  });
});

describe('★出走できるかの判定は、選んでいる馬ごとに変わる', () => {
  it('🔴 ★勝利数が違えば結果が違う（★一覧を組み直している）', () => {
    const r = row({ minWins: 1, maxWins: 1 });
    expect(toEntryRaceView(r, 8, 1, NOW).state, '★1 勝なら出られる').toBe('ok');
    expect(toEntryRaceView(r, 8, 0, NOW).state, '★0 勝なら格違い').toBe('class');
    expect(toEntryRaceView(r, 8, 2, NOW).state, '★2 勝なら格違い').toBe('class');
  });

  it('★画面が馬ごとに組み直している（★先頭の馬で固定していない）', () => {
    expect(LIVE_PAGE, '★勝利数を渡して組み直していない').toMatch(/toEntryRaceView\([\s\S]{0,120}wins/);
  });
});
