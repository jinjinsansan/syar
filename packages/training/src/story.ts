/**
 * ★**生涯の記録（イベントログ）**（★ゲーム本体 第 2 便・2026-09-16・正典 **§18 LR-1〜LR-8**・D-102 の相談 HL-2）
 *
 * 【★この層が守る約束】（★正典 §18）
 *   LR-4 ★**文章は定型で作る**（★AI の生成に依存しない）。★実在の人名・団体名を入れない（§0.1）
 *   LR-5 ★**着順にも経済にも効かない**（★読み取り専用の記録）。★だからゲートの取り直しは要りません
 *   LR-7 ★**発見度を物語に書くのはレースが終わった後**（★ゴールより前に結果を読む値を出さない・D-098 の家族）
 *   LR-1 ★**消さない**（★所有が切れても残る）。LR-2 ★**所有ではない**（★§6.7 の上限に数えない）
 *   LR-3 ★**週送りの対象にしない**（★記録だけの馬は週進行のクエリから外す）
 *
 * 【★この層の約束】★依存ゼロ・純粋関数。★`Date.now()` も乱数も持ちません（★憲法 4）。
 *   ★時刻は**ゲーム内の週**で持ちます（★実時刻を書くのは保存する側）。
 */

/** ★出来事の種類（★§18 の例） */
export type StoryEventType =
  | 'birth'            // 誕生
  | 'first-training'   // 初めての調教
  | 'debut'            // デビュー
  | 'first-win'        // 初勝利
  | 'trait-discovered' // 適性が判明した（★D-108・LR-7: レースの後）
  | 'injury'           // 故障
  | 'comeback'         // 復帰
  | 'graded-win'       // 重賞を勝った
  | 'top-grade-win'    // 最高格を勝った
  | 'jockey-bond'      // 名コンビになった
  | 'career-high'      // 自己最高の走り
  | 'final-race'       // ラストラン
  | 'retirement'       // 引退
  | 'first-offspring'  // 初めての産駒
  | 'offspring-win'    // 産駒が大きいレースを勝った
  | 'breeding-role-changed'; // 引退後の役割が変わった（★I-1 段 3・種牡馬入り／繁殖入り／功労馬）

export const STORY_EVENT_TYPES: readonly StoryEventType[] = [
  'birth', 'first-training', 'debut', 'first-win', 'trait-discovered', 'injury', 'comeback',
  'graded-win', 'top-grade-win', 'jockey-bond', 'career-high', 'final-race', 'retirement',
  'first-offspring', 'offspring-win', 'breeding-role-changed',
];

/**
 * ★出来事 1 件。
 * ⚠️ ★**持ち主の個人情報を持ちません**（★LR-6。★表示名・牧場名までは画面が別に出す）。
 * ⚠️ ★`detail` に入れてよいのは ★**ゲームの中の値だけ**（★着順・馬名・レース名・騎手名・週）。
 */
export interface StoryEvent {
  readonly type: StoryEventType;
  /** ★ゲーム内の週（★実時刻ではない・憲法 4） */
  readonly week: number;
  /** ★そのときのレース（★無ければ null） */
  readonly raceName?: string | undefined;
  /** ★着順（★無ければ null） */
  readonly finishPosition?: number | undefined;
  /** ★騎手の名前（★架空・§0.1） */
  readonly jockeyName?: string | undefined;
  /** ★判明した適性の名前（★`trait-discovered` のとき） */
  readonly traitLabel?: string | undefined;
  /** ★産駒の馬名（★`first-offspring`・`offspring-win` のとき） */
  readonly offspringName?: string | undefined;
  /** ★変わった後の役割（★`breeding-role-changed` のとき） */
  readonly roleTo?: 'stallion' | 'broodmare' | 'honored' | undefined;
  /** ★誰が変えたか（★`owner` ＝ 持ち主・`lifetime_foals` ＝ 生涯の産駒数に達して自動で。★裁定 I-1 段 3 Q-C） */
  readonly roleReason?: 'owner' | 'lifetime_foals' | undefined;
}

/**
 * ★**定型文**（★LR-4）。
 * ⚠️ ★**ここに実在の人名・団体名を書かないこと**（§0.1）。
 * ⚠️ ★**値が無い項目は文から落とします**（★「undefined 着」のような文を作らない）。
 */
export function storyLineOf(event: StoryEvent): string {
  const at = `${event.week} 週`;
  const race = event.raceName === undefined ? '' : `${event.raceName}で`;
  const place = event.finishPosition === undefined ? '' : `${event.finishPosition}着`;
  const jockey = event.jockeyName === undefined ? '' : `${event.jockeyName}騎手と`;
  switch (event.type) {
    case 'birth': return `${at}　生まれました。`;
    case 'first-training': return `${at}　初めての調教に出ました。`;
    case 'debut': return `${at}　${race}デビュー。${place === '' ? '' : `${place}でした。`}`;
    case 'first-win': return `${at}　${race}${jockey}初勝利を挙げました。`;
    case 'trait-discovered': return `${at}　${event.traitLabel ?? '適性'}が分かってきました。`;
    case 'injury': return `${at}　故障し、休養に入りました。`;
    case 'comeback': return `${at}　休養から戻ってきました。`;
    case 'graded-win': return `${at}　${race}${jockey}重賞を勝ちました。`;
    case 'top-grade-win': return `${at}　${race}${jockey}最高格を制しました。`;
    case 'jockey-bond': return `${at}　${jockey}名コンビと呼ばれるようになりました。`;
    case 'career-high': return `${at}　${race}自己最高の走りを見せました。`;
    case 'final-race': return `${at}　${race}最後のレースを走りました。${place === '' ? '' : `${place}。`}`;
    case 'retirement': return `${at}　引退しました。`;
    case 'first-offspring': return `${at}　初めての産駒${event.offspringName === undefined ? '' : `（${event.offspringName}）`}が生まれました。`;
    case 'offspring-win': return `${at}　産駒${event.offspringName === undefined ? '' : `（${event.offspringName}）`}が大きなレースを勝ちました。`;
    case 'breeding-role-changed':
      if (event.roleTo === 'stallion') return `${at}　種牡馬になりました。`;
      if (event.roleTo === 'broodmare') return `${at}　繁殖牝馬になりました。`;
      if (event.roleTo === 'honored') {
        return event.roleReason === 'lifetime_foals' ? `${at}　繁殖を終え、功労馬になりました。` : `${at}　功労馬になりました。`;
      }
      return `${at}　役割が変わりました。`;
    default: { const never: never = event.type; throw new Error(String(never)); }
  }
}

/**
 * ★**生涯の物語**（★出来事を週の順に並べて、定型文にする）。
 * ⚠️ ★**並べ替えは安定**（★同じ週の出来事は渡された順のまま）。★保存の順を物語の順にします。
 */
export function storyOf(events: readonly StoryEvent[]): readonly string[] {
  return storyLinesOf(events).map((l) => l.text);
}

/**
 * ★**物語の 1 行**（★文 ＋ 種類 ＋ 週）。
 *
 * ⚠️ ★`storyOf` は ★**文だけ**を返すので、★**種類が落ちます**
 *    （★2026-09-16 に気づきました。★デザイナーのカード `components/horse-story` は
 *    ★**種類ごとに色分けしたラベル**を出すので、★文だけでは作れません）。
 * ⚠️ ★画面が文から種類を**推測**する形にはしないこと（★「初勝利」という語を含むか、等）。
 *    ★文言を直した日に色が外れます。
 * ★`sameWeekAsPrev` … ★**同じ週の続きの行か**（★カードは「同じ週の最初の行だけ週番号を出す」）。
 */
export interface StoryLine {
  readonly type: StoryEventType;
  readonly week: number;
  readonly text: string;
  readonly sameWeekAsPrev: boolean;
}

/**
 * ★**物語を「行」で返す**（★並べ替えは `storyOf` と同じ・安定）。
 * ⚠️ ★`storyOf` はこれを呼んで文だけを取り出します（★並べ替えを 2 本持たない）。
 */
export function storyLinesOf(events: readonly StoryEvent[]): readonly StoryLine[] {
  const sorted = [...events]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.week - b.e.week) || (a.i - b.i))
    .map(({ e }) => e);
  return sorted.map((e, i) => ({
    type: e.type,
    week: e.week,
    text: storyLineOf(e),
    sameWeekAsPrev: i > 0 && sorted[i - 1]!.week === e.week,
  }));
}

/**
 * ★**種類の短い名前**（★カードの色分けラベルに出す語）。
 * ⚠️ ★**文そのものではありません**（★文は `storyLineOf`）。★ラベルは短く、文は説明です。
 */
export const STORY_EVENT_LABEL: Readonly<Record<StoryEventType, string>> = {
  birth: '誕生',
  'first-training': '初調教',
  debut: 'デビュー',
  'first-win': '初勝利',
  'trait-discovered': '適性判明',
  injury: '故障',
  comeback: '復帰',
  'graded-win': '重賞勝ち',
  'top-grade-win': '最高格勝ち',
  'jockey-bond': '名コンビ',
  'career-high': '自己最高',
  'final-race': 'ラストラン',
  retirement: '引退',
  'first-offspring': '初産駒',
  'offspring-win': '産駒の勝利',
  'breeding-role-changed': '役割の変更',
};

/**
 * ★**レースが終わったときに残す出来事**（★(a) 第 5 便-4・2026-09-16・§18 LR-7）
 *
 * 【★この関数の約束】
 *   ★**決定論**（★確定した着順と、その馬のそれまでの戦績から導く。★乱数も時刻も読まない・憲法 4）。
 *   ★**着順にも経済にも効きません**（★LR-5。★読み取り専用の記録を作るだけ）。
 *   ⚠️ ★**ゴールより前に呼びません**（★D-098 の家族。★呼ぶ側は確定の後で呼ぶ）。
 *
 * 【★なぜ「文」を返さないか】
 *   ★保存するのは ★**種類と値**だけです（★`0024` の註記どおり）。★文は `storyLineOf` が組み立てます。
 *   ★文を保存すると、★文言を直した日に ★**過去の行だけ古い文のまま**残ります。
 */
export type RaceGrade = 'G1' | 'G2' | 'G3';

export interface RaceStoryInput {
  /** ★このレースの着順（1 着 = 1） */
  readonly finishPosition: number;
  /** ★このレースの格（★重賞でなければ null） */
  readonly grade: RaceGrade | null;
  /** ★このレースより**前**の出走回数（★0 ならデビュー戦） */
  readonly runsBefore: number;
  /** ★このレースより**前**の勝ち数（★0 で 1 着なら初勝利） */
  readonly winsBefore: number;
  /** ★このレースより**前**の、同じ騎手での騎乗回数（★親密度の上限に届いた回で「名コンビ」） */
  readonly ridesWithJockeyBefore: number;
  /** ★親密度が頭打ちになる騎乗回数（★`JOCKEY_BOND_MAX` を呼ぶ側が渡す・★二重帳簿にしない） */
  readonly bondMaxRides: number;
  /** ★ゲーム内の週 */
  readonly week: number;
  readonly raceName: string;
  readonly jockeyName?: string | undefined;
}

/**
 * ★出来事を ★**`STORY_EVENT_TYPES` の順**で返します（★同じ入力なら同じ並び）。
 * ⚠️ ★**同じレースで複数の出来事が出ます**（★例: 初勝利かつ重賞勝ち）。
 * ⚠️ ★**最高格（G1）を勝った回は `graded-win` と `top-grade-win` の両方**を残します
 *    （★物語は「重賞を勝った」ことも「最高格を勝った」ことも語るため）。
 */
export function raceStoryEvents(input: RaceStoryInput): readonly StoryEvent[] {
  const base = {
    week: input.week,
    raceName: input.raceName,
    finishPosition: input.finishPosition,
    ...(input.jockeyName === undefined ? {} : { jockeyName: input.jockeyName }),
  };
  const out: StoryEvent[] = [];
  const won = input.finishPosition === 1;
  if (input.runsBefore === 0) out.push({ type: 'debut', ...base });
  if (won && input.winsBefore === 0) out.push({ type: 'first-win', ...base });
  if (won && input.grade !== null) out.push({ type: 'graded-win', ...base });
  if (won && input.grade === 'G1') out.push({ type: 'top-grade-win', ...base });
  /** ★親密度が頭打ちに「達した回」だけ残す（★以後は毎回残さない） */
  if (input.jockeyName !== undefined
    && input.ridesWithJockeyBefore + 1 === input.bondMaxRides) {
    out.push({ type: 'jockey-bond', ...base });
  }
  return out;
}

/**
 * ★**記録だけの馬か**（★LR-2・LR-3）。
 *   ★引退して、繁殖にも種牡馬にも上がらなかった馬（★功労馬）は ★**記録だけ**です。
 *   → ★**所有上限に数えない**（LR-2）・★**週送りの対象にしない**（LR-3）。
 * ⚠️ ★**繁殖入り・種牡馬入りした馬は「所有」です**（★記録と所有を混ぜない）。
 */
export interface RecordOnlyInput {
  readonly retired: boolean;
  /** ★繁殖牝馬・種牡馬に上がったか（★上がっていれば所有） */
  readonly breeds: boolean;
}

export function isRecordOnly(h: RecordOnlyInput): boolean {
  return h.retired && !h.breeds;
}

/** ★週送りの対象（★記録だけの馬を外す・LR-3。★検査がこの関数で固定します） */
export function weeklyAdvanceTargets<T extends RecordOnlyInput>(horses: readonly T[]): T[] {
  return horses.filter((h) => !isRecordOnly(h));
}

/**
 * ★**行の増え方**（★LR-8「増え方を測って報告する」）。
 *   ★1 頭が生涯に残す出来事の数の見積り（★削除しないので、これが積み上がります）。
 */
export interface StoryGrowth {
  readonly horses: number;
  readonly events: number;
  readonly perHorse: number;
}

export function storyGrowthOf(counts: readonly number[]): StoryGrowth {
  const events = counts.reduce((a, b) => a + b, 0);
  return { horses: counts.length, events, perHorse: counts.length === 0 ? 0 : events / counts.length };
}
