/**
 * ★**芝とカメラの監査の集計**（★`/race?audit=ground`・★2026-10-02・オーナー「芝・ダートが 逆回転・超高速」「最後の直線で カメラがどんどん離れていく」）。
 *   ★画面（`page.tsx` の `noteAuditGround`）が 1/60 秒ずつ残した全コマから ★場面ごとのまとめと ★見つけたものを作る。
 *   ★集計の式は ★ここ 1 か所（★`tools/audit-race-ground.mjs` は 画面が作ったまとめを読むだけ）。
 *   ★実レースは ★ログインした人の画面でしか開けない → ★オーナーの画面で `?race=<id>&audit=ground` を開くと ★コンソールに出る。
 */
export interface AuditGroundFrame {
  readonly d: number; readonly shot: string; readonly persp: boolean;
  /** ★描いた芝の見かけの速さ（★走る向き m/秒・★正が普通・★負が逆回転）。★場面の最初のコマは null */
  readonly groundMps: number | null;
  /** ★先頭の馬の 本当の速さ（★レース秒あたり）と ★画面の秒あたり（★時間の圧縮の分 違う） */
  readonly trueMps: number | null; readonly shownMps: number | null;
  /** ★馬の高さ ÷ 画面の高さ・★カメラから注視点までの距離（m） */
  readonly horseRatio: number; readonly camDistM: number;
}

export interface AuditShotSummary {
  readonly shot: string; readonly persp: boolean; readonly from: number; readonly to: number;
  /** ★芝 ÷ 本当の速さ（★10%・中央・90%）。★1 が普通 */
  readonly ratioP10: number | null; readonly ratioMed: number | null; readonly ratioP90: number | null;
  readonly horseStart: number; readonly horseEnd: number; readonly horseMin: number;
  readonly camStart: number; readonly camEnd: number;
}
export interface AuditFinding {
  readonly kind: '逆回転' | '超高速' | '超スロー' | '急変' | '離れる' | 'コマ落ち';
  readonly raceSec: number; readonly raceSecTo: number; readonly frames: number;
  readonly shot: string; readonly persp: boolean; readonly detail: string;
}

/**
 * ★**場面の種類**（★芝が止まって見えて正しい据え置きのカメラは ★超スローに数えない）。
 *   ★発走のゲート（`start-gate-*`）は カメラが据え置きで 馬が画面を横切る（★芝は動かない）。
 */
const FIXED_CAMERA_SHOTS = /^start-gate/;

const r2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * ★**1 コマの判定**（★監査と 普段の見張り `RaceGroundWatch` の ★両方がここを通る・★式は 1 か所）。
 *   ★同じ場面の 前のコマ `p` と 今のコマ `f` から。★止まっている馬（★発走前・ゴール後）は見ない。
 */
export function groundFrameKinds(p: AuditGroundFrame, f: AuditGroundFrame): { readonly kind: AuditFinding['kind']; readonly detail: string }[] {
  if (f.groundMps === null || f.trueMps === null || f.shot !== p.shot) return [];
  const v = f.groundMps, t = f.trueMps;
  if (t < 3) return [];
  const out: { kind: AuditFinding['kind']; detail: string }[] = [];
  if (v < -0.5) out.push({ kind: '逆回転', detail: `芝 ${v.toFixed(1)} m/秒・馬 ${t.toFixed(1)}` });
  else if (v > t * 1.6) out.push({ kind: '超高速', detail: `芝 ${v.toFixed(1)} m/秒・馬 ${t.toFixed(1)}（${(v / t).toFixed(2)} 倍）` });
  else if (v < t * 0.4 && !FIXED_CAMERA_SHOTS.test(f.shot)) out.push({ kind: '超スロー', detail: `芝 ${v.toFixed(1)} m/秒・馬 ${t.toFixed(1)}（${(v / t).toFixed(2)} 倍）` });
  if (p.groundMps !== null && Math.abs(v - p.groundMps) > Math.max(5, Math.abs(p.groundMps) * 0.5)) {
    out.push({ kind: '急変', detail: `芝 ${p.groundMps.toFixed(1)} → ${v.toFixed(1)} m/秒` });
  }
  return out;
}

export function analyzeAuditGround(frames: readonly AuditGroundFrame[], raceStart: number): {
  readonly shots: readonly AuditShotSummary[]; readonly findings: readonly AuditFinding[];
} {
  const raw: { kind: AuditFinding['kind']; f: AuditGroundFrame; detail: string }[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    for (const k of groundFrameKinds(frames[i - 1]!, frames[i]!)) raw.push({ ...k, f: frames[i]! });
  }
  const shots: AuditShotSummary[] = [];
  for (let i = 0; i < frames.length;) {
    let j = i;
    while (j < frames.length && frames[j]!.shot === frames[i]!.shot) j += 1;
    const seg = frames.slice(i, j);
    const ratios = seg.filter((f) => f.groundMps !== null && f.trueMps !== null && f.trueMps >= 3)
      .map((f) => f.groundMps! / f.trueMps!).sort((a, b) => a - b);
    const q = (k: number): number | null => (ratios.length === 0 ? null : r2(ratios[Math.min(ratios.length - 1, Math.floor(k * ratios.length))]!));
    const first = seg[0]!, last = seg[seg.length - 1]!;
    const hMin = Math.min(...seg.map((f) => f.horseRatio));
    shots.push({
      shot: first.shot, persp: first.persp, from: r2(first.d - raceStart), to: r2(last.d - raceStart),
      ratioP10: q(0.1), ratioMed: q(0.5), ratioP90: q(0.9),
      horseStart: Math.round(first.horseRatio * 1000) / 1000, horseEnd: Math.round(last.horseRatio * 1000) / 1000,
      horseMin: Math.round(hMin * 1000) / 1000,
      camStart: Math.round(first.camDistM * 10) / 10, camEnd: Math.round(last.camDistM * 10) / 10,
    });
    /** ★離れる: ★場面の中で 馬が 始めの 6 割より小さくなる */
    if (first.horseRatio > 0.02 && hMin < first.horseRatio * 0.6) {
      raw.push({ kind: '離れる', f: last, detail: `馬の大きさ ${first.horseRatio.toFixed(3)} → 最小 ${hMin.toFixed(3)}・カメラ ${first.camDistM.toFixed(0)}m → ${last.camDistM.toFixed(0)}m` });
    }
    i = j;
  }
  /** ★同じ種類が続くコマは 1 件に束ねる */
  const findings: AuditFinding[] = [];
  for (const x of raw) {
    const sec = r2(x.f.d - raceStart);
    /** ★間に別の種類（★急変など）が挟まっても ★同じ種類の直前の 1 件へ束ねる */
    let k = findings.length - 1;
    while (k >= 0 && findings[k]!.kind !== x.kind) k -= 1;
    const lastF = k >= 0 ? findings[k] : undefined;
    if (lastF !== undefined && lastF.shot === x.f.shot && sec - lastF.raceSecTo < 0.1) {
      findings[k] = { ...lastF, raceSecTo: sec, frames: lastF.frames + 1 };
      continue;
    }
    findings.push({ kind: x.kind, raceSec: sec, raceSecTo: sec, frames: 1, shot: x.f.shot, persp: x.f.persp, detail: x.detail });
  }
  return { shots, findings };
}

/** ★コンソールに出す文（★オーナーが そのまま貼れる形） */
export function auditGroundText(url: string, summary: ReturnType<typeof analyzeAuditGround>): string {
  const lines = [`[race-audit] ${url}`, '[race-audit] 場面 秒 芝/本当(10%/中央/90%) 馬の大きさ 始→終(最小) カメラ距離'];
  for (const s of summary.shots) {
    lines.push(`[race-audit] ${s.persp ? '透' : '板'} ${s.shot} ${s.from}〜${s.to} ${s.ratioP10}/${s.ratioMed}/${s.ratioP90} ${s.horseStart}→${s.horseEnd}(${s.horseMin}) ${s.camStart}→${s.camEnd}m`);
  }
  lines.push(`[race-audit] 見つけたもの ${summary.findings.length} 件`);
  for (const f of summary.findings) {
    lines.push(`[race-audit] ${f.kind} レース ${f.raceSec}〜${f.raceSecTo}秒（${f.frames} コマ） ${f.persp ? '透' : '板'} ${f.shot}: ${f.detail}`);
  }
  return lines.join('\n');
}

/**
 * ★**普段の見張り**（★2026-10-02・オーナー「どのレースかなんて その時でないと分からない」）。
 *   ★本番の観戦（★小窓の中継も）で ★毎コマ `groundFrameKinds` を当て、★見つけたら ★この端末に書き残す（★直近 `GROUND_LOG_MAX` 件）。
 *   ★後で `/race?groundlog=1` を開くと ★コンソールに まとめて出る（`[race-ground-log]`）→ ★そのレース ID を `?race=<id>&audit=ground` で調べる。
 *   ⚠️ ★実時間のコマ（★コマ落ちあり）なので ★急変は コマの間が 0.1 秒を超えるコマでは数えない（★コマ落ちそのものは `[race-ground]` が別に出す）。
 *   ⚠️ ★端末の保存領域が使えない（★非公開の窓など）ときは ★黙って残さない（★画面は止めない）。
 */
export const GROUND_LOG_KEY = 'star.raceGroundLog';
export const GROUND_LOG_MAX = 300;
export interface GroundLogEntry {
  readonly race: string; readonly kind: AuditFinding['kind']; readonly raceSec: number; readonly raceSecTo: number;
  readonly frames: number; readonly shot: string; readonly persp: boolean; readonly detail: string;
}
export function readGroundLog(): GroundLogEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(GROUND_LOG_KEY);
    const v: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw);
    return Array.isArray(v) ? v as GroundLogEntry[] : [];
  } catch { return []; }
}
function writeGroundLog(list: readonly GroundLogEntry[]): void {
  try { globalThis.localStorage?.setItem(GROUND_LOG_KEY, JSON.stringify(list.slice(-GROUND_LOG_MAX))); } catch { /* ★残せない端末では残さない */ }
}
export class RaceGroundWatch {
  private prev: AuditGroundFrame | null = null;
  private shotStart: AuditGroundFrame | null = null;
  private shotMinHorse = Infinity;
  private pending: GroundLogEntry[] = [];
  constructor(private readonly race: string, private readonly raceStart: number) {}
  /** ★1 コマ。★`gapSec` は 実時間のコマの間（★コマ落ちの判定） */
  step(f: AuditGroundFrame, gapSec: number): void {
    const p = this.prev;
    this.prev = f;
    if (p === null || p.shot !== f.shot || f.d < p.d) { this.endShot(p); this.shotStart = f; this.shotMinHorse = f.horseRatio; return; }
    this.shotMinHorse = Math.min(this.shotMinHorse, f.horseRatio);
    for (const k of groundFrameKinds(p, f)) {
      if (k.kind === '急変' && gapSec > 0.1) continue;
      this.note(k.kind, f, k.detail);
    }
  }
  /** ★場面の終わり: ★馬が 始めの 6 割より小さくなったら ★離れる */
  private endShot(last: AuditGroundFrame | null): void {
    const s = this.shotStart;
    if (s !== null && last !== null && s.horseRatio > 0.02 && this.shotMinHorse < s.horseRatio * 0.6) {
      this.note('離れる', last, `馬の大きさ ${s.horseRatio.toFixed(3)} → 最小 ${this.shotMinHorse.toFixed(3)}・カメラ ${s.camDistM.toFixed(0)}m → ${last.camDistM.toFixed(0)}m`);
    }
    this.shotStart = null;
  }
  private note(kind: AuditFinding['kind'], f: AuditGroundFrame, detail: string): void {
    const sec = r2(f.d - this.raceStart);
    let i = this.pending.length - 1;
    while (i >= 0 && this.pending[i]!.kind !== kind) i -= 1;
    const last = i >= 0 ? this.pending[i] : undefined;
    if (last !== undefined && last.shot === f.shot && sec - last.raceSecTo < 0.5) {
      this.pending[i] = { ...last, raceSecTo: sec, frames: last.frames + 1 };
    } else {
      this.pending.push({ race: this.race, kind, raceSec: sec, raceSecTo: sec, frames: 1, shot: f.shot, persp: f.persp, detail });
      console.warn(`[race-ground-log] ${kind} race=${this.race} レース ${sec}秒 ${f.persp ? '透' : '板'} ${f.shot}: ${detail}`);
    }
  }
  /**
   * ★**コマ落ち**（★2026-10-03・オーナー「最後の直線で カクつく・縞が逆に見える」・手元では再現しない）: ★`gapMs` 止まったコマを ★場面つきで残す。
   *   ★`renderMs` は そのコマの こちらの描画処理の時間。★短いのに長く止まったなら ★ブラウザ側（★絵の展開・メモリの片付け・描画の転送）。
   */
  stall(raceDisplaySec: number, gapMs: number, renderMs: number): void {
    if (gapMs <= 100) return;
    const shot = this.prev?.shot ?? '?';
    const sec = r2(raceDisplaySec - this.raceStart);
    this.pending.push({
      race: this.race, kind: 'コマ落ち', raceSec: sec, raceSecTo: sec, frames: 1, shot, persp: this.prev?.persp ?? false,
      detail: `止まり ${Math.round(gapMs)}ms・描画処理 ${Math.round(renderMs)}ms${renderMs < gapMs * 0.5 ? '（★ブラウザ側）' : '（★描画が重い）'}`,
    });
    console.warn(`[race-ground-log] コマ落ち race=${this.race} レース ${sec}秒 ${shot}: 止まり ${Math.round(gapMs)}ms・描画処理 ${Math.round(renderMs)}ms`);
  }
  /** ★書き残す（★数秒に 1 回・★ページを離れるとき） */
  flush(): void {
    if (this.pending.length === 0) return;
    writeGroundLog([...readGroundLog(), ...this.pending]);
    this.pending = [];
  }
}
/** ★`/race?groundlog=1` で出す文 */
export function groundLogText(list: readonly GroundLogEntry[]): string {
  if (list.length === 0) return '[race-ground-log] 記録はまだありません（★この端末で見たレースだけが残ります）';
  const races = [...new Set(list.map((e) => e.race))];
  return [
    `[race-ground-log] ${list.length} 件・レース ${races.length} 本（★新しい順）`,
    ...[...list].reverse().map((e) => `[race-ground-log] race=${e.race} ${e.kind} レース ${e.raceSec}〜${e.raceSecTo}秒（${e.frames} コマ） ${e.persp ? '透' : '板'} ${e.shot}: ${e.detail}`),
  ].join('\n');
}
