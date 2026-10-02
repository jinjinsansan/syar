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
  readonly kind: '逆回転' | '超高速' | '超スロー' | '急変' | '離れる';
  readonly raceSec: number; readonly raceSecTo: number; readonly frames: number;
  readonly shot: string; readonly persp: boolean; readonly detail: string;
}

/**
 * ★**場面の種類**（★芝が止まって見えて正しい据え置きのカメラは ★超スローに数えない）。
 *   ★発走のゲート（`start-gate-*`）は カメラが据え置きで 馬が画面を横切る（★芝は動かない）。
 */
const FIXED_CAMERA_SHOTS = /^start-gate/;

const r2 = (v: number): number => Math.round(v * 100) / 100;

export function analyzeAuditGround(frames: readonly AuditGroundFrame[], raceStart: number): {
  readonly shots: readonly AuditShotSummary[]; readonly findings: readonly AuditFinding[];
} {
  const raw: { kind: AuditFinding['kind']; f: AuditGroundFrame; detail: string }[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    const f = frames[i]!, p = frames[i - 1]!;
    if (f.groundMps === null || f.trueMps === null || f.shot !== p.shot) continue;
    const v = f.groundMps, t = f.trueMps;
    /** ★止まっている（★発走前・ゴール後）は見ない */
    if (t < 3) continue;
    if (v < -0.5) raw.push({ kind: '逆回転', f, detail: `芝 ${v.toFixed(1)} m/秒・馬 ${t.toFixed(1)}` });
    else if (v > t * 1.6) raw.push({ kind: '超高速', f, detail: `芝 ${v.toFixed(1)} m/秒・馬 ${t.toFixed(1)}（${(v / t).toFixed(2)} 倍）` });
    else if (v < t * 0.4 && !FIXED_CAMERA_SHOTS.test(f.shot)) raw.push({ kind: '超スロー', f, detail: `芝 ${v.toFixed(1)} m/秒・馬 ${t.toFixed(1)}（${(v / t).toFixed(2)} 倍）` });
    if (p.groundMps !== null && Math.abs(v - p.groundMps) > Math.max(5, Math.abs(p.groundMps) * 0.5)) {
      raw.push({ kind: '急変', f, detail: `芝 ${p.groundMps.toFixed(1)} → ${v.toFixed(1)} m/秒` });
    }
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
