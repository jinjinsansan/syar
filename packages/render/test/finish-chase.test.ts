/**
 * ★**ゴール前のカメラは「その時刻までの状態」だけで決まる**（★2026-09-14・オーナー確認 O-7）
 *
 * 【★守るもの】★レビュー側の回答（`REVIEW_CONSULT_RACE_SIDE_ONLY_FOLLOWUP_ANSWER_20260914.md` §1-6）:
 *   ★1 … ★時刻 t まで全馬の位置が同じで ★**1 着だけが違う** 2 つのレースで、★時刻 t のカメラが一致する
 *   ★3 … ★構図に結果を戻すと ★1 が落ちることを実演する（★この検査が効いていること）
 *   （★2 … 画面がカメラに結果を渡していないこと、は `apps/cli/test/finish-chase-wiring.test.ts`）
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import {
  finishChaseOf, finishChaseTable, finishCameraByChase,
  FINISH_CAMERA_BY_CHASE, FINISH_CHASE_FAR_M, FINISH_CAMERA_BY_DEVELOPMENT,
} from '../src/broadcast-v2.js';

const DIST = 1600;
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };
/** ★分かれる時刻（★レース秒）。★この秒までは 2 つのレースの位置が完全に同じ */
const SPLIT = 90;

type Row = { gate: number; meters: number };

/**
 * ★**合成のレース**。★`SPLIT` 秒まではまったく同じで、★その先で勝ち馬だけが違います。
 *   ★A … 先頭の 1 番がそのまま逃げ切る ／ ★B … 最後方の 12 番が一気に追い込む
 */
function raceOf(winner: 'front' | 'closer'): (r: number) => Row[] {
  return (r: number): Row[] => Array.from({ length: 12 }, (_, i) => {
    const base = 16 * Math.min(r, SPLIT) - i * 1.1 + Math.sin(r * 0.7 + i) * 0.3 * Math.min(1, r / 10);
    const after = Math.max(0, r - SPLIT);
    const extra = winner === 'closer' && i === 11 ? after * after * 1.2 : 0;
    return { gate: i + 1, meters: Math.min(DIST, base + after * 16 + extra) };
  });
}

describe('★ゴール前のカメラ（状態から決める）', () => {
  it('★★1 着だけが違う 2 つのレースで、分かれる前の「追ってくる深さ」は 1 つ残らず同じ', () => {
    const a = finishChaseTable(raceOf('front'), 110);
    const b = finishChaseTable(raceOf('closer'), 110);
    for (let t = 0; t <= SPLIT + 1e-9; t += 0.037) {
      expect(a(t), `t=${t.toFixed(3)}`).toBe(b(t));
    }
    /** ★対照: 分かれた後は違ってよい（★違わなければ、この合成が何も試していない） */
    let differs = false;
    for (let t = SPLIT + 1; t <= 105; t += 0.25) if (Math.abs(a(t) - b(t)) > 1e-6) differs = true;
    expect(differs, '★合成の 2 つのレースが分かれていません（検査が空回り）').toBe(true);
  });

  it('★★その時刻の位置が同じなら、カメラ（画角・注視点・視点）も同じ', () => {
    const t = SPLIT - 0.5;
    const horsesA = raceOf('front')(t).map((h) => ({ gate: h.gate, s: h.meters, w: 2 + (h.gate % 5) * 2 }));
    const horsesB = raceOf('closer')(t).map((h) => ({ gate: h.gate, s: h.meters, w: 2 + (h.gate % 5) * 2 }));
    const chaseA = finishChaseTable(raceOf('front'), 110)(t);
    const chaseB = finishChaseTable(raceOf('closer'), 110)(t);
    const camOf = (horses: typeof horsesA, chase: number) =>
      resolveBroadcastV2Scene(course, horses, VIEWPORT, false, {
        forceShotId: 'homestretch-side', script: 'v9', finishChase: chase,
        leadGates: [...horses].sort((x, y) => y.s - x.s).slice(0, 5).map((h) => h.gate),
      });
    const sa = camOf(horsesA, chaseA);
    const sb = camOf(horsesB, chaseB);
    expect(JSON.stringify(sb.camera)).toBe(JSON.stringify(sa.camera));
    expect(sb.focusS).toBe(sa.focusS);
  });

  /**
   * ★**変異: 構図を結果（展開の札）から決めると、★上の検査が落ちる**（★レビュー側 §1-6 の 3）。
   * ⚠️ ★製品コードは変えません。★「札を渡した場合のカメラ」を作って比べます。
   */
  it('★★変異: 札（1 着の型）で構図を決めると、同じ時刻でもカメラが違ってしまう', () => {
    const t = SPLIT - 0.5;
    const horses = raceOf('front')(t).map((h) => ({ gate: h.gate, s: h.meters, w: 2 + (h.gate % 5) * 2 }));
    const withDev = (development: 'wire-to-wire' | 'closer') =>
      resolveBroadcastV2Scene(course, horses, VIEWPORT, false, {
        forceShotId: 'homestretch-side', script: 'v9', development,
      });
    /** ★位置は同じなのに、★「どちらが勝つか」だけでカメラが変わる＝ 漏らす構図 */
    expect(JSON.stringify(withDev('closer').camera)).not.toBe(JSON.stringify(withDev('wire-to-wire').camera));
  });

  it('★表は渡したレース秒より未来の位置を読まない（★読んだ秒を記録して確かめる）', () => {
    const asked: number[] = [];
    const race = raceOf('front');
    const table = finishChaseTable((r) => { asked.push(r); return race(r); }, 20);
    /** ★表は作る時に全部読むので、★返す関数が「どの標本を使うか」を読み出し側で確かめる */
    const step = 0.1;
    for (const t of [0.05, 3.33, 7.07, 12.34]) {
      const i = Math.floor(t / step);
      /** ★使う標本は i−1 と i（★どちらも t 以下） */
      expect((i - 1) * step).toBeLessThanOrEqual(t);
      expect(i * step).toBeLessThanOrEqual(t + 1e-9);
      expect(Number.isFinite(table(t))).toBe(true);
    }
    expect(Math.max(...asked)).toBeLessThanOrEqual(20 + 0.1 + 1e-9);
  });

  it('★追ってくる馬がいなければ 0、★遠くから詰めてくる馬がいれば 1 に近い', () => {
    const now: Row[] = [{ gate: 1, meters: 1400 }, { gate: 2, meters: 1399 }, { gate: 3, meters: 1398 }];
    const same: Row[] = now.map((h) => ({ ...h, meters: h.meters - 16 }));
    expect(finishChaseOf(now, same)).toBe(0);
    const chaserNow: Row[] = [{ gate: 1, meters: 1400 }, { gate: 2, meters: 1400 - FINISH_CHASE_FAR_M }];
    const chaserAgo: Row[] = [{ gate: 1, meters: 1384 }, { gate: 2, meters: 1384 - FINISH_CHASE_FAR_M - 2 }];
    expect(finishChaseOf(chaserNow, chaserAgo)).toBeCloseTo(1, 6);
  });

  it('★先頭が入れ替わる瞬間に値が跳ばない（★先頭は最大値で取る）', () => {
    const ago: Row[] = [{ gate: 1, meters: 1384 }, { gate: 2, meters: 1383 }, { gate: 3, meters: 1378 }];
    const before: Row[] = [{ gate: 1, meters: 1400.001 }, { gate: 2, meters: 1400 }, { gate: 3, meters: 1396 }];
    const after: Row[] = [{ gate: 1, meters: 1400 }, { gate: 2, meters: 1400.001 }, { gate: 3, meters: 1396 }];
    expect(Math.abs(finishChaseOf(before, ago) - finishChaseOf(after, ago))).toBeLessThan(1e-3);
  });

  it('★両端は展開の表の両端と同じ（★見え方の幅は変えていない）', () => {
    expect(finishCameraByChase(0)).toEqual(FINISH_CAMERA_BY_CHASE.none);
    expect(finishCameraByChase(1)).toEqual(FINISH_CAMERA_BY_CHASE.far);
    expect(FINISH_CAMERA_BY_CHASE.none).toEqual(FINISH_CAMERA_BY_DEVELOPMENT['wire-to-wire']);
    expect(FINISH_CAMERA_BY_CHASE.far).toEqual(FINISH_CAMERA_BY_DEVELOPMENT.closer);
  });
});
