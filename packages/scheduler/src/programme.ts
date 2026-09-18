/**
 * 番組表（正典 §10.3）— 1日144R の内訳
 *
 * 【決定論】時計を持たず、サイクル番号だけから「その枠が何のレースか」を決めます。
 *   ★これが A-2（再起動しても二重生成しない）の前提です。番組表を乱数や
 *     「前回どこまで作ったか」に依存させると、再起動で番組が変わります。
 */

import { CYCLE_MS } from './cycle.js';

/** クラス（正典 §10.3） */
export type RaceClass = 'maiden' | 'win1' | 'win2' | 'win3' | 'open' | 'graded';

/** 重賞の格 */
export type Grade = 'G1' | 'G2' | 'G3';

/** 1 日（実時間 24 時間）のミリ秒 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ★1 日のレース数 ＝ **1 サイクル 1 レース × 1 日のサイクル数**（★`CYCLE_MS` から導出）。
 *
 * 【★なぜ直書きをやめたか】（★AL-9・D-100 が既に指示していたもの・2026-09-18）
 *   ★以前は `= 144` と**直に書いて**あり、註記が「10 分サイクル × 24 時間」と**由来だけ**を述べていました。
 *   ★**サイクルの長さを変えたとき、この値は黙って古いまま残ります**（★D-052「同じ量を 2 か所で持たない」）。
 *   ★10 分なら 144、★3 分なら 480 が**自動で出ます**。
 *
 * ⚠️ ★**`RACES_BY_CLASS` の合計はまだ 144 のままです**（★下の表）。
 *    ★サイクルを変える便（T-13）では、★**この表も一緒に振り直す必要があります**
 *    — ★合計の一致は検査が見ているので、★**気づかずに進むことはありません**。
 *
 * ⚠️ ★割り切れない長さのサイクルを入れたら**止めます**（R-27「既定と縮退は狭い側・安全な側へ」）。
 *    ★端数のまま進むと、`classOf` の枠割りが 1 日の途中でずれます。
 */
export const RACES_PER_DAY = ((): number => {
  const n = DAY_MS / CYCLE_MS;
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`RACES_PER_DAY: 1 日が CYCLE_MS で割り切れません（CYCLE_MS=${CYCLE_MS}・n=${n}）`);
  }
  return n;
})();

/**
 * クラス別のレース数（正典 §10.3 の写し）。
 * ⚠️ 合計が RACES_PER_DAY と一致することを ★テストが検査します
 *    （どれかを増やしたら別のどれかを減らす必要がある）。
 */
export const RACES_BY_CLASS: Readonly<Record<RaceClass, number>> = {
  /** ★デビュー直後の受け皿。正典が「常時空きを確保」と明記している */
  maiden: 42,
  win1: 36,
  win2: 24,
  win3: 18,
  open: 15,
  graded: 9,
};

/** 重賞の週次頻度（正典 §10.3）。1日9R × 7日 = 63R を G1/G2/G3 に割る */
export const GRADED_PER_WEEK: Readonly<Record<Grade, number>> = {
  G1: 3,
  G2: 8,
  G3: 20,
};

/**
 * ★G1 を置くサイクル（1日144枠のうちの位置）。
 * 正典 §10.3「G1 は視聴の集まる時間帯に固定し告知を打つ」。
 * 朝・昼・夜の目玉枠。144枠 = 24時間なので 1枠 = 10分。
 *   枠 54 = 09:00 / 枠 78 = 13:00 / 枠 120 = 20:00
 */
export const G1_SLOTS: readonly number[] = [54, 78, 120];

/**
 * ★G1 を打つ曜日（0=起点日）。正典 §10.3 は **G1 を週3回**と定めるので、
 *   毎日3枠すべてを G1 にすると週21回になってしまう（当初そう書いていました）。
 *   人が集まる週末に寄せ、3回に収めます。
 *   ⚠️ 曜日の割り当ては正典に規定が無いので、これは解釈です（照会に出します）。
 */
export const G1_DAYS: readonly { dayOfWeek: number; slot: number }[] = [
  { dayOfWeek: 5, slot: 78 },
  { dayOfWeek: 6, slot: 78 },
  { dayOfWeek: 6, slot: 120 },
];

/**
 * その日のうち何番目の枠か（0〜143）。
 * サイクル番号は起点からの通し番号なので、日をまたいでも連続する。
 */
export function slotOfDay(cycleIndex: number): number {
  const s = cycleIndex % RACES_PER_DAY;
  return s < 0 ? s + RACES_PER_DAY : s;
}

/** 通算の日数（起点日を 0 とする） */
export function dayIndex(cycleIndex: number): number {
  return Math.floor(cycleIndex / RACES_PER_DAY);
}

/**
 * 枠の割り当て表を1日ぶん作る。
 *
 * ★**クラスをまとめて並べない**。新馬が朝だけ、重賞が夜だけ、という配置にすると
 *   「その時間に来られないプレイヤーは特定クラスに出られない」ことになります。
 *   §10.3 が新馬・未勝利に「常時空きを確保」と書いているのはこの意味だと解釈し、
 *   各クラスを1日の中に均等に散らします。
 *   ⚠️ 正典に配置の規定は無いので、これは解釈です（照会に出します）。
 */
export function dailyProgramme(): RaceClass[] {
  const slots: (RaceClass | null)[] = Array.from({ length: RACES_PER_DAY }, () => null);

  // 1. G1 は時刻固定（§10.3）。ここだけは散らさない
  for (const s of G1_SLOTS) slots[s] = 'graded';

  // 2. 残りの重賞と各クラスを、1日の中へ等間隔に配る
  const order: RaceClass[] = ['graded', 'open', 'win3', 'win2', 'win1', 'maiden'];
  for (const cls of order) {
    const already = slots.filter((x) => x === cls).length;
    const need = RACES_BY_CLASS[cls] - already;
    if (need <= 0) continue;
    // 等間隔に置き、埋まっていたら次の空きへ送る（先に置いたクラスを壊さない）
    const step = RACES_PER_DAY / need;
    for (let i = 0; i < need; i += 1) {
      let at = Math.floor(i * step) % RACES_PER_DAY;
      let guard = 0;
      while (slots[at] !== null) {
        at = (at + 1) % RACES_PER_DAY;
        guard += 1;
        if (guard > RACES_PER_DAY) throw new Error('番組表の枠が足りません（クラス別R数の合計を確認）');
      }
      slots[at] = cls;
    }
  }

  const out = slots.filter((x): x is RaceClass => x !== null);
  if (out.length !== RACES_PER_DAY) {
    // ★埋まらない枠が出たら黙って短い配列を返さない（1日の本数が静かに減る）
    throw new Error(`番組表が ${out.length}/${RACES_PER_DAY} 枠しか埋まりませんでした`);
  }
  return out;
}

/** そのサイクルのクラス */
export function classOf(cycleIndex: number, programme = dailyProgramme()): RaceClass {
  return programme[slotOfDay(cycleIndex)]!;
}

/**
 * そのサイクルが重賞なら格を返す（重賞でなければ null）。
 *
 * ⚠️ **正典に不整合があります。** 重賞は1日9R × 7日 = **週63枠**ですが、
 *    §10.3 の週次頻度は G1=3 + G2=8 + G3=20 = **31** で、倍以上合いません。
 *    ここでは「63枠のうち31枠に格が付き、残りは格付けのない重賞相当」とは解釈せず、
 *    **G2:G3 = 8:20 の比で全枠に格を割り当てて**います（G1 のみ週3回で固定）。
 *    どちらが正典の意図かは照会に出します。
 * ★週内の通し番号で決めるので、**同じ週の同じ位置は必ず同じ格**になります
 *   （再起動しても変わらない = A-2 の前提）。
 */
export function gradeOf(cycleIndex: number, programme = dailyProgramme()): Grade | null {
  if (classOf(cycleIndex, programme) !== 'graded') return null;
  const day = dayIndex(cycleIndex);
  const dayOfWeek = ((day % 7) + 7) % 7;
  const slot = slotOfDay(cycleIndex);
  // ★週3回だけ G1（毎日3枠を G1 にすると週21回になり §10.3 と合わない）
  if (G1_DAYS.some((g) => g.dayOfWeek === dayOfWeek && g.slot === slot)) return 'G1';
  const gradedSlots = programme
    .map((c, i) => (c === 'graded' && !G1_SLOTS.includes(i) ? i : -1))
    .filter((i) => i >= 0);
  const withinDay = gradedSlots.indexOf(slot);
  const nth = dayOfWeek * gradedSlots.length + withinDay;

  // 週の非G1重賞枠を G2:G3 = 8:20 で割る
  const total = GRADED_PER_WEEK.G2 + GRADED_PER_WEEK.G3;
  return nth % total < GRADED_PER_WEEK.G2 ? 'G2' : 'G3';
}
