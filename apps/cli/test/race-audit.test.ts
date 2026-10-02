/**
 * ★**芝とカメラの監査の集計**（`apps/web/src/app/race/race-audit.ts`・★2026-10-02）。
 *   ★普通のレース（★対照）は 0 件・★逆回転・超高速・急変・離れるを 1 件ずつ見つける・★据え置きのゲートは 超スローに数えない。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeAuditGround, RaceGroundWatch, readGroundLog, groundLogText, GROUND_LOG_KEY, type AuditGroundFrame } from '../../web/src/app/race/race-audit';

const frame = (d: number, shot: string, groundMps: number | null, opts: Partial<AuditGroundFrame> = {}): AuditGroundFrame => ({
  d, shot, persp: false, groundMps, trueMps: 16, shownMps: 40, horseRatio: 0.25, camDistM: 44, ...opts,
});
const run = (shot: string, from: number, n: number, v: (i: number) => number, opts: (i: number) => Partial<AuditGroundFrame> = () => ({})): AuditGroundFrame[] =>
  Array.from({ length: n }, (_, i) => frame(from + i / 60, shot, i === 0 ? null : v(i), opts(i)));

describe('★芝とカメラの監査の集計', () => {
  it('★対照: ★本当の速さで流れる芝・★同じ大きさの馬は 0 件', () => {
    const fr = [...run('side-drive', 34, 120, () => 16), ...run('homestretch-side', 36, 120, () => 16.3)];
    const { findings, shots } = analyzeAuditGround(fr, 33);
    expect(findings).toEqual([]);
    expect(shots.map((s) => s.ratioMed)).toEqual([1, 1.02]);
  });

  it('🔴 ★逆回転・超高速・急変を見つけ ★続くコマは 1 件に束ねる', () => {
    const fr = run('homestretch-side', 34, 120, (i) => (i >= 40 && i < 46 ? -3 : i >= 80 && i < 83 ? 40 : 16));
    const kinds = analyzeAuditGround(fr, 33).findings.map((f) => `${f.kind}:${f.frames}`);
    expect(kinds).toContain('逆回転:6');
    expect(kinds).toContain('超高速:3');
    expect(kinds.some((k) => k.startsWith('急変'))).toBe(true);
  });

  it('🔴 ★直線で 馬が どんどん小さくなる（★カメラが離れる）を見つける', () => {
    const fr = run('finish-line', 50, 180, () => 16, (i) => ({ horseRatio: 0.27 * (1 - i / 300), camDistM: 44 + i / 3 }));
    const f = analyzeAuditGround(fr, 33).findings.find((x) => x.kind === '離れる');
    expect(f?.detail).toContain('カメラ 44m');
  });

  it('★据え置きのゲートで 芝が止まるのは 正しい（★超スローに数えない）・★対照: 追うカメラなら数える', () => {
    expect(analyzeAuditGround(run('start-gate-side', 33, 60, () => 0.1), 33).findings).toEqual([]);
    expect(analyzeAuditGround(run('side-drive', 33, 60, () => 0.1), 33).findings.map((f) => f.kind)).toContain('超スロー');
  });

  describe('★普段の見張り（★観戦中に この端末へ書き残す）', () => {
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    const feed = (w: RaceGroundWatch, fr: readonly AuditGroundFrame[], gap = 1 / 60): void => { for (const f of fr) w.step(f, gap); w.flush(); };

    it('★対照: ★普通のレースは 何も残さない', () => {
      feed(new RaceGroundWatch('r1', 33), run('side-drive', 34, 120, () => 16));
      expect(readGroundLog()).toEqual([]);
      expect(groundLogText(readGroundLog())).toContain('記録はまだありません');
    });

    it('🔴 ★逆回転を レース ID つきで 1 件に束ねて残す・★後で まとめて読める', () => {
      feed(new RaceGroundWatch('abc', 33), run('homestretch-side', 50, 120, (i) => (i >= 40 && i < 46 ? -3 : 16)));
      const log = readGroundLog();
      expect(log.filter((e) => e.kind === '逆回転')).toEqual([expect.objectContaining({ race: 'abc', frames: 6, shot: 'homestretch-side', raceSec: 17.67 })]);
      expect(store.get(GROUND_LOG_KEY)).toContain('"race":"abc"');
      expect(groundLogText(log)).toContain('race=abc 逆回転');
    });

    it('★コマ落ちのコマ（★間 0.1 秒超）の急変は数えない・★超高速は数える', () => {
      const fr = run('side-drive', 34, 60, (i) => (i === 30 ? 40 : 16));
      feed(new RaceGroundWatch('r2', 33), fr, 0.2);
      expect(readGroundLog().map((e) => e.kind)).toEqual(['超高速']);
    });

    it('🔴 ★コマ落ち（★100ms 超）を 場面つきで残し ★ブラウザ側か 描画が重いかを分ける・★対照: 100ms 以下は残さない', () => {
      const w = new RaceGroundWatch('r4', 33);
      for (const f of run('homestretch-side', 50, 10, () => 16)) w.step(f, 1 / 60);
      w.stall(50.2, 80, 5);
      w.stall(50.3, 240, 6);
      w.stall(50.4, 180, 150);
      w.flush();
      const log = readGroundLog().filter((e) => e.kind === 'コマ落ち');
      expect(log.map((e) => e.detail)).toEqual(['止まり 240ms・描画処理 6ms（★ブラウザ側）', '止まり 180ms・描画処理 150ms（★描画が重い）']);
      expect(log[0]).toEqual(expect.objectContaining({ shot: 'homestretch-side', raceSec: 17.3 }));
    });

    it('🔴 ★場面の中で 馬が 6 割より小さくなったら ★離れる（★場面が変わった所で残す）', () => {
      const w = new RaceGroundWatch('r3', 33);
      feed(w, [...run('finish-line', 50, 180, () => 16, (i) => ({ horseRatio: 0.27 * (1 - i / 300) })), ...run('winner-follow', 53, 10, () => 16)]);
      expect(readGroundLog().map((e) => e.kind)).toContain('離れる');
    });
  });

  it('🔴 ★スマホ（★コンソールの無い iPhone）でも読める: ★`?groundlog=1` は 記録を画面に出し コピーできる', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync(new URL('../../web/src/app/race/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain("const GROUND_LOG_VIEW = QS?.get('groundlog') === '1';");
    expect(page).toContain('if (GROUND_LOG_VIEW) return <GroundLogView />;');
    expect(page).toContain('useEffect(() => { setText(groundLogText(readGroundLog())); }, []);');
    expect(page).toContain('navigator.clipboard?.writeText(text)');
  });
});
