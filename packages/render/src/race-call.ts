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
  /**
   * ★**この少し前でいちばん詰めた馬の枠番**（★2026-09-11・★オーナー ⑧）。
   *   ★`raceSurgeGate` が出したものを渡してください。★ここで探しません。
   *
   * ⚠️ ★**「今」と「少し前」は同じ入力から取ること**（★R-30）。
   *    ★最初、★「今」を画面の位置・★「少し前」を真の位置で比べる形に書きました。
   *    ★その差（最後の直線の攻防の表示ずらし）が混ざるので ★**一度も発火しません**でした。
   */
  readonly surgingGate?: number | undefined;
  /**
   * ★（★廃止予定）★少し前の走った距離。★`surgingGate` を使ってください。
   *
   * 【★なぜ要るか】
   *   ★オーナー評「★真横カメラワークをここまで使うので、★最後の直線のせめぎ合い、
   *   ★**差し、追い込み馬**、逃げ馬、激しい展開などが必要です」。
   *
   *   ★実測（`tools/audit-real-overtakes.mjs`・8 seed）で、★直線の追い抜きは
   *   ★**3〜8 回**実在し、★上位 5 頭の伸びは 17〜25m → 1.3〜14.7m に詰まります。
   *   ★カメラも映せています（`audit-contest-focus.mjs`: 主役 2 頭以上が 100%）。
   *   ⚠️ ★足りていなかったのは ★**実況**でした。★「迫る馬」として名指ししていたのは
   *      ★**常に 2 着馬**で、★後方から上がってきた馬の名前は ★**一度も出ません**でした。
   *
   * ⚠️ ★渡さなければ従来どおりです（★1 文字も変わりません）。
   * ⚠️ ★**着順を作りません。** ★位置モデルを 2 秒前の時刻で読むだけです（★決定論・憲法 4）。
   */
  readonly metersAgoOf?: ((gate: number) => number | undefined) | undefined;
}

/** ★「上がってくる」と言うときに振り返る長さ（秒）。★呼ぶ側はこの値を読むこと（★R-31） */
export const RACE_SURGE_WINDOW_SEC = 4;
/**
 * ★「上がってくる」と言える詰め量（m・★上の窓の間に、先頭との差が縮んだ量）。
 *
 * 【★測って分かったこと — ★当初の設計は成り立ちませんでした】
 *   ★最初は「★**急に詰めた瞬間**を捕まえて『上がってきた！』と叫ぶ」つもりでした。
 *   ★実測（6 seed・★残り 400〜120m ＝ この文が使われる区間だけ）:
 *
 *       窓 2 秒 … 詰め量の ★中央値 0.95〜1.67m ／ ★最大 1.26〜2.95m
 *       窓 4 秒 … ★中央値 1.88〜3.41m ／ ★最大 2.49〜5.68m
 *       窓 8 秒 … ★中央値 3.68〜6.69m ／ ★最大 4.84〜9.19m
 *
 *   ⚠️ ★**どの窓でも「中央値 ≒ 上位 1 割 ≒ 最大」**です。★つまり ★**詰め方は一定**で、
 *      ★「ここで動いた」という ★**瞬間が存在しません**。★閾値では場面を選べません。
 *   ⚠️ ★最初に置いた 2.5m は、★**ゴール後の見かけの詰め**（先頭が止まって他馬が進む）を
 *      ★分布に混ぜて決めた値でした。★区間を絞ると ★**6 seed で 1 標本**しか超えませんでした。
 *
 * 【★どう変えたか】
 *   ★叫ぶのをやめ、★**いちばん詰めている馬の名前を言う**ことにしました。
 *   ★線は「詰めていない馬を名指ししない」ためだけの下限（★窓 4 秒で 2.0m ＝ 0.5m/秒）です。
 *   ★言う相手は ★**3 番手以降**に限ります（★2 番手は既存の「◯◯が迫る」が担当）。
 */
export const RACE_SURGE_MIN_GAIN_M = 2.0;

/**
 * ★**この窓でいちばん詰めた馬**（★先頭以外）。★居なければ `undefined`。
 *
 * ⚠️ ★`now` と `ago` は ★**同じ入力**から取ってください（★画面の位置なら両方とも画面の位置）。
 * ⚠️ ★着順を作りません。★位置を 2 点読んで引き算するだけです（★憲法 3）。
 */
export function raceSurgeGate(
  now: readonly RaceCallHorse[],
  ago: ReadonlyMap<number, number>,
  minGainM: number = RACE_SURGE_MIN_GAIN_M,
): number | undefined {
  const order = [...now].sort((a, b) => b.meters - a.meters);
  const lead = order[0];
  if (lead === undefined) return undefined;
  const leadAgo = ago.get(lead.gate);
  if (leadAgo === undefined) return undefined;
  let bestGate: number | undefined;
  let bestGain = minGainM;
  for (let i = 1; i < order.length; i += 1) {
    const h = order[i]!;
    const a = ago.get(h.gate);
    if (a === undefined) continue;
    /** ★先頭との差が、この窓でどれだけ縮んだか */
    const gained = (leadAgo - a) - (lead.meters - h.meters);
    if (gained >= bestGain) { bestGain = gained; bestGate = h.gate; }
  }
  return bestGate;
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
/**
 * ★**この 2 秒でいちばん詰めた馬**（★先頭より後ろにいる馬だけ）。
 *
 * ★「詰めた」は ★**先頭との差が縮んだ量**（m）で測ります。★順位の増減では測りません
 *   （★団子だと 1 頭抜くだけで 3 つ動き、★離れていれば 5m 詰めても 0 のままだからです）。
 * ⚠️ ★線は ★**2 秒で 2.0m**（★≒0.8 馬身）。★これ以下は「詰めている」と言えるほど動いていません。
 *    ★実測から決めた線ではなく、★言い過ぎない側へ置いた目安です（★R-27）。
 * ⚠️ ★先頭自身は返しません（★先頭が「上がってきた」は日本語として成り立ちません）。
 */
function surgingHorse(
  ctx: RaceCallContext, order: readonly RaceCallHorse[],
): { readonly horse: RaceCallHorse; readonly rank: number } | undefined {
  /** ★渡された枠番を優先。★無ければ（旧経路）その場で探す */
  const gate = ctx.surgingGate ?? (ctx.metersAgoOf === undefined ? undefined
    : raceSurgeGate(order, new Map(order.flatMap((h) => {
      const m = ctx.metersAgoOf?.(h.gate);
      return m === undefined ? [] : [[h.gate, m] as const];
    }))));
  if (gate === undefined) return undefined;
  const rank = order.findIndex((h) => h.gate === gate) + 1;
  const horse = order[rank - 1];
  /** ⚠️ ★先頭は返しません（★「先頭が上がってきた」は日本語として成り立ちません） */
  if (horse === undefined || rank <= 1) return undefined;
  return { horse, rank };
}

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
    /**
     * ★直線。
     * ⚠️ ★**まず「上がってきた馬」を探します**（★2026-09-11・★オーナー ⑧）。
     *    ★以前はここで ★**2 着馬**を「迫る馬」と呼んでいました。★ところが実際に湧いている
     *    ★差し・追い込みは ★**もっと後ろから**来ます。★名前が出ないので、
     *    ★見ている側には「何が起きたのか」が分かりませんでした。
     */
    /**
     * ⚠️ ★**3 番手以降のときだけ**言います。★2 番手なら、下の「◯◯が迫る」が同じ馬を指すので、
     *    ★同じことを 2 通りの言い方で繰り返すだけになります。
     */
    const surging = surgingHorse(ctx, order);
    if (surging !== undefined && surging.rank >= 3) {
      parts.push({ text: `${surging.rank} 番手` });
      parts.push(nameOf(surging.horse));
      parts.push({ text: '、後方から上がってくる' });
      topic = `surge${surging.horse.gate}`;
    } else {
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
