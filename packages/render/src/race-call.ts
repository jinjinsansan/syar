/**
 * ★**実況の文を作る**（馬名で呼ぶ）
 *
 * 【なぜ要るか（2026-08-22）】
 *   これまで実況は**常に自馬の枠番**だけを語っていました（「3番 は前と 1.2 馬身」）。
 *   ★オーナー評「ナレーターの内容が 3 番の馬をずっと語っていますが、
 *     本来の競馬レースのナレーターは**馬の名前を実況中継する**はずです」。
 *
 *   実際の実況は「**いま誰が先頭で、誰が来ているか**」を名前で言い、
 *   自馬はときどき触れる程度です。
 *
 * 【設計】
 *   ★**純粋な関数**にします。状態（位置・名前・局面）を受け取り、文と鍵を返すだけ。
 *   ⚠️ `Date.now()` も乱数も使いません（憲法 4）。同じ状態からは必ず同じ文が出ます。
 *   ⚠️ **着順や位置を作りません。** 受け取った値を読むだけです（憲法 3）。
 *
 *   鍵（`key`）は「同じことを言い続けない」ための札で、
 *   節（局面）と話題が変わったときだけ新しい文を出します（`shouldEmitRaceCall`）。
 */

export interface RaceCallPart {
  readonly text: string;
  /** 枠色の役割名（馬名・枠番を色分けする）。省略すると地の色 */
  readonly role?: string | undefined;
}

export interface RaceCallHorse {
  readonly gate: number;
  readonly name: string;
  /** 走った距離（m）。★エンジンの値をそのまま渡すこと */
  readonly meters: number;
}

export interface RaceCallContext {
  readonly horses: readonly RaceCallHorse[];
  readonly distanceMeter: number;
  /** 区間名（「第3コーナー」など）。局面が変わった文は、ここから入る */
  readonly phaseLabel: string;
  /** 自馬の枠番。ときどき触れる */
  readonly ownGate: number;
  /** 何本目の発言か。★自馬に触れる間隔を決めるのに使う（乱数の代わり） */
  readonly lineIndex: number;
  /** 枠色の役割名を引く */
  readonly frameRoleOf: (gate: number) => string;
}

export interface RaceCallLine {
  readonly parts: readonly RaceCallPart[];
  /** 同じことを言い続けないための札 */
  readonly key: string;
}

/** 馬身（正典 §8.7 と同じ 2.4m） */
const HORSE_LENGTH_M = 2.4;

/** 差を言葉にする */
function marginWord(lengths: number): string {
  if (lengths < 0.15) return 'ハナ';
  if (lengths < 0.4) return 'アタマ';
  if (lengths < 0.8) return 'クビ';
  if (lengths < 1.2) return '半馬身';
  return `${lengths.toFixed(1)} 馬身`;
}

/**
 * ★いまの状態から実況の 1 文を作る。
 *
 *   優先順位（実際の中継の重み）:
 *     ① ゴール前  … 抜け出したか、並んでいるか
 *     ② 直線      … 先頭と、伸びてきた馬
 *     ③ 道中      … 先頭と、番手
 *   自馬は **4 本に 1 本**触れる（`lineIndex`）。★乱数は使わない。
 */
export function raceCallAt(ctx: RaceCallContext): RaceCallLine | undefined {
  if (ctx.horses.length === 0) return undefined;
  const order = [...ctx.horses].sort((a, b) => b.meters - a.meters);
  const lead = order[0];
  if (lead === undefined) return undefined;
  const second = order[1];
  const metersLeft = Math.max(0, ctx.distanceMeter - lead.meters);
  const gapLengths = second === undefined ? Infinity : (lead.meters - second.meters) / HORSE_LENGTH_M;

  const nameOf = (h: RaceCallHorse): RaceCallPart => ({ text: h.name, role: ctx.frameRoleOf(h.gate) });
  const parts: RaceCallPart[] = [];
  let topic: string;

  /** ★自馬の話をする番か（4 本に 1 本）。先頭が自馬なら、そもそも先頭の話が自馬の話 */
  const ownTurn = ctx.lineIndex % 4 === 3 && lead.gate !== ctx.ownGate;
  const own = ctx.horses.find((h) => h.gate === ctx.ownGate);
  const ownRank = own === undefined ? undefined : order.findIndex((h) => h.gate === ctx.ownGate) + 1;

  if (ownTurn && own !== undefined && ownRank !== undefined) {
    parts.push(nameOf(own));
    parts.push({ text: ` は ${ownRank} 番手` });
    const ahead = order[ownRank - 2];
    if (ahead !== undefined) {
      const d = (ahead.meters - own.meters) / HORSE_LENGTH_M;
      parts.push({ text: d < 0.4 ? '、並びかけています' : `、${marginWord(d)} 差` });
    }
    topic = `own${ownRank}`;
  } else if (metersLeft <= 120) {
    // ★ゴール前
    if (gapLengths < 0.4) {
      parts.push(nameOf(lead));
      if (second !== undefined) { parts.push({ text: 'と' }); parts.push(nameOf(second)); }
      parts.push({ text: '、並んでゴールへ！' });
      topic = 'photo';
    } else {
      parts.push(nameOf(lead));
      parts.push({ text: gapLengths >= 2 ? '、抜け出した！' : '、粘るか！' });
      topic = gapLengths >= 2 ? 'clear' : 'hold';
    }
  } else if (metersLeft <= 400) {
    // ★直線: 先頭と、伸びてきた馬
    parts.push({ text: '先頭は' });
    parts.push(nameOf(lead));
    const closer = order[1];
    if (closer !== undefined && gapLengths < 3) {
      parts.push({ text: '、' });
      parts.push(nameOf(closer));
      parts.push({ text: 'が迫る' });
      topic = `chase${closer.gate}`;
    } else {
      parts.push({ text: '、後続を離す' });
      topic = 'lead-clear';
    }
  } else {
    // ★道中: 先頭と番手
    parts.push({ text: '先頭は' });
    parts.push(nameOf(lead));
    if (second !== undefined) {
      parts.push({ text: '、2 番手に' });
      parts.push(nameOf(second));
    }
    topic = `lead${lead.gate}`;
  }

  return { parts, key: `${ctx.phaseLabel}/${topic}` };
}

/**
 * ★局面が変わったときは、区間名から入る（「第3コーナー、先頭は…」）。
 *   ⚠️ 同じ局面で毎回言うとくどいので、**変わったときだけ**。
 */
export function withPhasePrefix(
  line: RaceCallLine, previousKey: string, phaseLabel: string,
): RaceCallLine {
  const previousPhase = previousKey.split('/')[0] ?? '';
  if (previousPhase === phaseLabel) return line;
  return { ...line, parts: [{ text: `${phaseLabel}、` }, ...line.parts] };
}
