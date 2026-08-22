/**
 * ★**参考映像（アーケード実機）にあって我々に無かった HUD 3 点**（設計 1-4 / 1-5 / 1-6）
 *
 *   実物: `out/judge/ref-hud.png`（55s / 67s / 69s / 80s / 95s）を拡大して確認しています。
 *
 *   | # | 参考の作り | ここでの名前 |
 *   |---|---|---|
 *   | A | 画面上部。**枠色の帽子型バッジ**に馬番。前後位置の順に横並び。67s と 69s で並びが変わる | `drawFormationBar` |
 *   | B | 画面下部。**枠色の小さな四角＋馬番＋馬名**。x 位置が固定（55s と 95s で同一） | `drawHorseNamePlates` |
 *   | C | 該当馬の頭上を追う**雫型のピン** | `drawOwnHorseMarker` |
 *
 * 【★参考と作りを変えたところ（意図的・理由つき）】
 *   B の「x 位置が固定」は、参考が**筐体に何人も座る**からです（席ごとの枠）。
 *   我々は 1 画面 1 人なので、席の概念がありません。
 *   → **自馬 ＋ 先頭 ＋ 2 番手**を左・中・右の固定枠に置きます。
 *     参考の狙い（★報告③「画面の中の馬と名前が結びついていない」）はこれで満たせます。
 *
 * 【★映像から決められなかったこと】
 *   A の横位置が「絶対進行度」か「先頭との差」かは、参考からは確定できませんでした
 *   （設計 §5 の但し書き）。**先頭との差**にしています — 絶対進行度だと
 *   序盤に全馬が左端へ寄って読めなくなるためです。
 *
 * ⚠️ 乱数・時刻を使いません。表示時刻は引数で受けます（憲法 4）。
 * ⚠️ 順位も位置も**変えません**。渡された位置を読むだけです（憲法 3）。
 */
import { HUD, drawSpacedText, riseAt } from './hud-kit.js';
import { inkOn, type Ctx2D, type FontOf, type Palette } from './oblique-draw.js';

/** ★隊列バーが表す走路の長さ（m）。これより後ろの馬は左端で止まる */
export const FORMATION_BAR_SPAN_M = 60;

export interface FormationBarHorse {
  readonly gate: number;
  /** 走路上の位置（m）。順位ではなく**距離**（重なりがそのまま隊列の詰まり具合になる） */
  readonly s: number;
}

export interface ReferenceHudTiming {
  readonly timeSec?: number | undefined;
  /** 登場アニメの起点からの秒。省略時は登場済み */
  readonly sinceSec?: number | undefined;
}

/**
 * ★A: **隊列バー**（画面上部）
 *
 *   枠色の帽子型バッジを、**先頭からの距離**で横に並べる。順位ではなく距離なので、
 *   馬群が固まれば重なり、ばらければ散る。参考の 67s → 69s で並びが変わるのと同じ挙動。
 *
 * ⚠️ 後ろの馬から描くこと。重なったとき**前の馬が上**に来ないと隊列が読めません。
 */
export function drawFormationBar(
  ctx: Ctx2D<never>, pal: Palette, font: FontOf,
  horses: readonly FormationBarHorse[], fieldSize: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  opts: ReferenceHudTiming & {
    readonly x: number; readonly y: number; readonly width: number;
    readonly spanM?: number | undefined;
    /** 自馬の馬番（あれば金の下線を引く） */
    readonly ownGate?: number | undefined;
  },
): void {
  if (horses.length === 0) return;
  const span = Math.max(1, opts.spanM ?? FORMATION_BAR_SPAN_M);
  const rise = riseAt(opts.sinceSec ?? 1);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * rise.alpha;
  const y = opts.y + rise.dy;

  const BADGE_W = 30, BADGE_H = 26;
  const inner = opts.width - BADGE_W;
  const lead = horses.reduce((max, h) => Math.max(max, h.s), horses[0]!.s);
  const xOf = (s: number): number => {
    const back = Math.max(0, Math.min(span, lead - s));
    return opts.x + BADGE_W / 2 + inner * (1 - back / span);
  };

  // ★バッジが乗る細い線（参考にも明るい 1 本が入っている）
  ctx.fillStyle = HUD.goldHair;
  ctx.fillRect(opts.x, y + BADGE_H + 2, opts.width, 1);

  // ★後ろの馬から描く（前の馬が手前に重なる）
  const ordered = [...horses].sort((a, b) => a.s - b.s);
  for (const h of ordered) {
    const cx = xOf(h.s);
    const role = frameRoleOf(h.gate, fieldSize);
    const color = pal[role] ?? '#fff';
    /**
     * ★**帽子型**（参考の形）: 上が半円、下が平ら。丸バッジでも四角でもありません。
     *   騎手のヘルメットの輪郭で、枠色がそのまま出ます。
     */
    const left = cx - BADGE_W / 2;
    const r = BADGE_W / 2;
    const flat = y + BADGE_H;
    ctx.beginPath();
    ctx.moveTo(left, flat);
    ctx.lineTo(left, y + r);
    ctx.ellipse(cx, y + r, r, r, 0, Math.PI, 0);
    ctx.lineTo(left + BADGE_W, flat);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(4,8,6,.55)'; ctx.lineWidth = 1; ctx.stroke();
    // 馬番
    ctx.font = font(14, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = inkOn(pal, role);
    ctx.fillText(String(h.gate), cx, y + BADGE_H * 0.66);
    ctx.textAlign = 'left';
    if (opts.ownGate === h.gate) {
      ctx.fillStyle = HUD.gold;
      ctx.fillRect(left, flat + 1, BADGE_W, 3);
    }
  }
  ctx.globalAlpha = baseAlpha;
}

export interface HorseNamePlateRow {
  readonly gate: number;
  readonly name: string;
  readonly isOwn?: boolean | undefined;
  /** 見出し（`自馬` / `先頭` など）。省略可 */
  readonly note?: string | undefined;
}

/**
 * ★B: **馬名プレート**（画面下部・固定枠）
 *
 *   参考は**帯を敷かず**、枠色の小さな四角＋馬番＋白抜きの馬名を、地の上に直接置いています
 *   （`out/judge/_plate.png` で確認。芝の上でも読めるよう**濃い縁取り**が付く）。
 *   ★帯を敷くと画面下部が塞がるので、参考と同じく縁取りだけにします。
 */
export function drawHorseNamePlates(
  ctx: Ctx2D<never>, pal: Palette, font: FontOf,
  rows: readonly HorseNamePlateRow[], fieldSize: number,
  frameRoleOf: (gate: number, fieldSize: number) => string,
  opts: ReferenceHudTiming & {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly bottomY?: number | undefined;
    /**
     * ★枠を並べる**横の範囲**（省略すると画面いっぱい）。
     *
     * ⚠️ ★画面いっぱいにしたら、左端の枠が**実況のナレーター立ち絵の裏**に潜り、
     *    ★オーナー評「**下のナレーターのあたりが崩れている**」になりました。
     *    この画面にはコース図（左・y321〜530）と立ち絵（左下）が既にあります。
     *    **空いている範囲を呼び出し側が渡す**こと。ここで画面の都合を決め打ちしません。
     */
    readonly x0?: number | undefined;
    readonly x1?: number | undefined;
  },
): void {
  if (rows.length === 0) return;
  const shown = rows.slice(0, 3);
  const baseAlpha = ctx.globalAlpha;
  const bottom = opts.bottomY ?? opts.viewport.height - 26;
  /** ★左・中・右の固定枠。順位が変わっても枠は動かない（参考の「席」に相当） */
  const left = opts.x0 ?? 0;
  const right = opts.x1 ?? opts.viewport.width;
  const slotW = (right - left) / 3;
  shown.forEach((row, i) => {
    const rise = riseAt(opts.sinceSec ?? 1, i * 0.07);
    ctx.globalAlpha = baseAlpha * rise.alpha;
    const x = left + slotW * i;
    const y = bottom + rise.dy;
    const role = frameRoleOf(row.gate, fieldSize);
    // 枠色の四角＋馬番
    const bw = 22, bh = 20;
    ctx.fillStyle = pal[role] ?? '#fff';
    ctx.fillRect(x, y - bh + 3, bw, bh);
    ctx.strokeStyle = 'rgba(4,8,6,.6)'; ctx.lineWidth = 1;
    ctx.strokeRect?.(x + 0.5, y - bh + 3.5, bw - 1, bh - 1);
    ctx.font = font(13, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = inkOn(pal, role);
    ctx.fillText(String(row.gate), x + bw / 2, y - bh / 2 + 8);
    ctx.textAlign = 'left';
    /**
     * ★馬名は**縁取り**で読ませます。芝の上でも空の上でも成立させるため、
     *   濃い輪郭を先に太く描いてから白を重ねます。
     */
    const nx = x + bw + 9;
    ctx.font = font(19, true);
    if (ctx.strokeText !== undefined) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(3,7,5,.9)';
      ctx.strokeText(row.name, nx, y);
    }
    ctx.fillStyle = row.isOwn === true ? HUD.gold : HUD.paper;
    ctx.fillText(row.name, nx, y);
    if (row.note !== undefined) {
      ctx.font = font(10, true);
      ctx.fillStyle = HUD.paper45;
      drawSpacedText(ctx, row.note, nx, y - 21, 10 * 0.18);
    }
  });
  ctx.globalAlpha = baseAlpha;
}

/**
 * ★名札に載せる 3 行を選ぶ（**自馬 ＋ 上位から詰める**）。
 *
 * 【★この関数が独立している理由（2026-08-22 の実害）】
 *   最初は呼び出し側（画面と監査道具の**両方**）で組み立てていて、見出しを
 *   **枠の順番**で `先頭` / `2番手` と付けていました。自馬が 1 枠目を占めるので、
 *   ★**自馬が先頭のとき、2 着馬に「先頭」と表示**されます。
 *   実測（24 秒・自馬 4 番が先頭）で、隊列バーは 4 番を先頭に置き、
 *   名札は 3 番を「先頭」と呼ぶ、という**同じ画面の中で矛盾した状態**になりました。
 *
 *   → 見出しは**実順位から引く**。そして**1 か所**に置く（2 か所だと必ず離れる・R-30）。
 *
 * @param ranked 着順に並んだ馬（`ranked[0]` が先頭）
 */
export function referenceNamePlateRows(
  ranked: readonly { readonly gate: number }[],
  ownGate: number,
  nameOf: (gate: number) => string,
  limit = 3,
): readonly HorseNamePlateRow[] {
  const labelOf = (gate: number): string => {
    const index = ranked.findIndex((h) => h.gate === gate);
    return index < 0 ? '' : index === 0 ? '先頭' : `${index + 1}番手`;
  };
  const rows: HorseNamePlateRow[] = [];
  const own = ranked.find((h) => h.gate === ownGate);
  if (own !== undefined) rows.push({ gate: own.gate, name: nameOf(own.gate), isOwn: true, note: `自馬・${labelOf(own.gate)}` });
  for (const r of ranked) {
    if (rows.length >= limit) break;
    if (r.gate === ownGate) continue;
    rows.push({ gate: r.gate, name: nameOf(r.gate), note: labelOf(r.gate) });
  }
  return rows;
}

/**
 * ★C: **自馬マーカー**（雫型のピン）
 *
 *   参考は該当馬の**頭上を追従**します（111s）。カメラが寄っても引いても、
 *   「自分の馬はどれか」が一目で分かるのが役目です。
 *
 * ⚠️ ピンの**大きさは画面固定**にします。馬の大きさに比例させると、
 *    寄ったカットで巨大になって画面を塞ぎます。
 *
 * @param head 馬の頭の画面位置（呼び出し側が**馬と同じカメラ**で投影して渡す）
 */
export function drawOwnHorseMarker(
  ctx: Ctx2D<never>, font: FontOf,
  head: { readonly x: number; readonly y: number },
  gate: number,
  opts: ReferenceHudTiming & {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly color?: string | undefined;
    /**
     * ★ピンの上端をここより上へ出さない（既定 0）。
     *
     * ⚠️ ★これが無いと、寄ったカットで**画面上端に張り付き、隊列バーと重なります**
     *    （実測: `homestretch-side` 53% で馬の上端が画面 y=71 に来て、ピンが y=35 に出た）。
     *    寄れば寄るほど馬は画面いっぱいになるので、**寄るほど必ず起きます。**
     */
    readonly topLimitY?: number | undefined;
  },
): void {
  const vp = opts.viewport;
  // 画面外なら描かない（端に張り付くと「そこに馬がいる」と誤読される）
  if (!(head.x > -40 && head.x < vp.width + 40 && head.y > -60 && head.y < vp.height + 40)) return;
  const rise = riseAt(opts.sinceSec ?? 1);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * rise.alpha;
  const R = 15;            // ★画面固定の大きさ
  const GAP = 12;          // 頭とピンの先の間
  // ★上端の制限より上へは出さない（ピンの高さは R*1.7 + R）
  const minTipY = (opts.topLimitY ?? 0) + R * 2.7;
  const tipY = Math.max(minTipY, head.y - GAP + rise.dy);
  const cy = tipY - R * 1.7;
  const color = opts.color ?? '#3ddc7f';
  /**
   * 雫型: 中心 (head.x, cy) の円と、その下の頂点 (head.x, tipY) を接線でつなぐ。
   * 接点の角度は asin(R / d)（d = 中心から頂点までの距離）。
   */
  const d = Math.max(R + 1, tipY - cy);
  const a = Math.asin(R / d);
  ctx.beginPath();
  ctx.moveTo(head.x, tipY);
  // ★`arc` は `Ctx2D` に無い（両環境にはあるが、狭い口だけを持たせている）。
  //   同じ弧を `ellipse` の**時計回りの長い側**として描く: 開始 π/2+a → 終了 π/2−a+2π
  ctx.ellipse(head.x, cy, R, R, 0, Math.PI / 2 + a, Math.PI / 2 - a + Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(3,10,6,.65)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = font(14, true);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#08160d';
  ctx.fillText(String(gate), head.x, cy + 5);
  ctx.textAlign = 'left';
  ctx.globalAlpha = baseAlpha;
}
