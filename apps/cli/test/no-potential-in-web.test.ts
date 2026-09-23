/**
 * ★**素質（`potential`）と段を、画面の層に渡す口が無いこと**（★**D-114 ②** / T-10・AL-2・2026-09-18）
 *
 * 【★正典が求めている検査の形】
 *   ★D-114 ②: 「★**段を外に出す口を塞ぐ** — 画面・API・ビュー・`horse_market_listing.stars` の
 *   ★どこにも出さない。★**検査は「入力の形」で書く**（`potential` も段も画面の層へ渡す口が無いことを
 *   ★構文木で見る。★**禁止語の一覧で書かない**・D-108 ③ の作法）」
 *
 * 【★なぜ禁止語の一覧では駄目か】✔ ★この便で実際に踏みました
 *   ★`/\bband\b/` で見たら ★**`className="a-band"`（見出しの帯）に当たりました。**
 *   ★逆に、★語を避けて `p.band` を `p.b` と書けば、★一覧はすり抜けます。
 *   → ★**語ではなく「どの口を引いているか」**を見ます。
 *
 * 【★この検査の形】★`0034` の `my-horses-view.test.ts` と同じ「★**全数分類**」です。
 *   ① ★`@star/sim-engine` の ★**公開されている名前を全部数え上げる**（★実物から。★手書きの一覧にしない・R-19）
 *   ② ★1 つ残らず ★**LEAKS（素質・段を出す）／ SAFE（出さない）**に分類する。★**理由を必ず書く**
 *   ③ ★分類されていない名前があれば ★**落ちる**（★新しい export を足した日に、ここで気づく）
 *   ④ ★画面の層（`apps/web/src`）が ★**LEAKS の名前を 1 つも引いていない**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const ENGINE_SRC = path.join(ROOT, 'packages/sim-engine/src');
const WEB_SRC = path.join(ROOT, 'apps/web/src');

/** ★`index.ts` が再輸出しているファイル（★実物から引く・手書きにしない） */
function reexportedFiles(): string[] {
  const index = readFileSync(path.join(ENGINE_SRC, 'index.ts'), 'utf8');
  const out = [...index.matchAll(/export \* from '\.\/([\w-]+)\.js'/g)].map((m) => `${m[1]!}.ts`);
  expect(out.length, '★`index.ts` から再輸出のファイルを読めていない（★走査が空・R-21）').toBeGreaterThan(5);
  return out;
}

/** ★そのファイルが公開している名前（★関数・定数・型・インタフェース） */
function exportedNames(file: string): string[] {
  const src = readFileSync(path.join(ENGINE_SRC, file), 'utf8');
  return [...src.matchAll(/^export (?:declare )?(?:async )?(?:function|const|let|class|interface|type|enum) (\w+)/gm)]
    .map((m) => m[1]!);
}

/**
 * ★**素質・段を出す名前**（★LEAKS）と、★その理由。
 *
 * ⚠️ ★ここに載せるのは ★**「呼ぶと素質か段が手に入る」**名前だけです。
 *    ★`potential` を**受け取る**だけの型（★`HorseRecord` など）も、★画面に渡れば同じことなので載せます。
 */
const LEAKS: Readonly<Record<string, string>> = {
  // ── 段を出すもの（`stars.ts`・D-114 ①②）──
  STAR_STEPS: '★段の数。★段の粒度が分かる',
  STAR_BAND_FROM: '★段の下端',
  STAR_BAND_WIDTH: '★1 段の幅',
  STAR_THRESHOLDS: '★段の境目。★素質の平均をこれと比べれば、画面でも段が出せる',
  bandOfPotential: '★素質 → 段。★段そのものを返す',
  bandOf: '★馬 → 段',
  sameBand: '★2 頭が同じ帯か。★段の比較を画面でできてしまう',

  // ── 遺伝子型そのもの（§12.4「本人にも見せない」）──
  Genotype: '★遺伝子型',
  AllelePair: '★対立遺伝子の対',
  CategoricalAllelePair: '★同上（質的形質）',
  SkillGene: '★スキル遺伝子',
  getAllelePair: '★遺伝子型から 1 対を取り出す',
  setAllelePair: '★同上（書き込み）',
  cloneGenotype: '★遺伝子型を複製する',

  // ── 素質を持つ／返すもの（§5.5）──
  HorseRecord: '★`potential` と `genotype` を持つ記録。★画面に渡れば素質がそのまま出る',
  HorseLookup: '★id → `HorseRecord`。★上と同じ',
  BreedingRecord: '★配合の記録。★`HorseRecord` を辿れる',
  PedigreeCache: '★血統の索引。★`HorseRecord` を辿れる',
  Phenotype: '★素質の生成結果そのもの',
  expressPhenotype: '★遺伝子型 → 素質',
  ExpressionModifiers: '★素質の出方を変える入力',
  expressStrategyAptitude: '★脚質適性を遺伝子型から出す（★素質と同じ層）',
  expressNumeric: '★数量形質を遺伝子型から出す',
  ResolvedMutation: '★突然変異の解決結果（★遺伝子型の値）',
  resolveMutation: '★同上',
  mutateAllele: '★対立遺伝子を変える',
  InheritOutcome: '★継承の結果（★遺伝子型）',
  inheritGenotype: '★親 2 頭 → 子の遺伝子型',
  inheritSkillGenes: '★同上（スキル遺伝子）',
  breed: '★配合。★子（★素質つき）を返す',
  BreedParams: '★配合の入力（★`HorseRecord` を取る）',
  createFounderGenotype: '★初代の遺伝子型を作る',
  createFounder: '★初代の馬（★素質つき）を作る',
  FounderParams: '★その入力',
  buildPedigreeCache: '★`HorseRecord` の集合を受け取る',
  calcInbreedCoefficient: '★同上（★血統から近交係数）',
  AncestorContribution: '★近交の内訳（★血統の形）',
  InbreedResult: '★同上',
};

/**
 * ★**LEAKS ではない公開名**と、★その理由（★③ の全数分類が成立するため）。
 *
 * ⚠️ ★「SAFE」＝ ★**呼んでも、ある馬の素質・遺伝子型・段は手に入らない**という意味です。
 *    ★「画面に置いてよい」という意味ではありません（★それは D-116 の 4 層の話）。
 */
const SAFE_REASONS: Readonly<Record<string, string>> = {
  // ★語彙（§5 の公開情報）
  AbilityKey: '★能力の名前の型', ABILITY_KEYS: '★能力の名前の並び', Strategy: '★脚質', STRATEGIES: '★同上',
  GrowthType: '★成長型の名前', GROWTH_TYPES: '★同上', Sex: '★性', LineId: '★系統の id', HorseId: '★馬の id',
  NUMERIC_TRAITS: '★数量形質の**名前**の並び（★値ではない）', NumericTraitKey: '★その型',
  // ★乱数（憲法 4。★注入するもの）
  splitmix32: '★乱数', Rng: '★同上', deriveSeed: '★同上', deriveRng: '★同上',
  // ★世界の較正値（★ある馬の素質ではない）
  BalanceGenetics: '★遺伝の較正の型', BALANCE: '★同上（値）', DEFAULT_BALANCE: '★同上',
  BalanceConfig: '★同上', TraitBound: '★形質の値域の型', TRAIT_BOUNDS: '★同上（値）',
  TraitMutationSpec: '★突然変異の率の型', TRAIT_MUTATION: '★同上（値）', buildTraitMutation: '★同上（構築）',
  MUTATION_CLAMP_RATIO: '★同上', clampTruncationFactor: '★同上',
  SKILL_GENE_POOL: '★スキル遺伝子の**名前**の池', FoundersConfig: '★初代生成の設定の型', FOUNDERS: '★同上（値）',
  NicksGenConfig: '★ニックス生成の設定の型', NICKS_GEN: '★同上（値）',
  clamp: '★数を範囲に収める一般の道具',
  // ★配合の可否（★素質を返さない）
  MateRejection: '★断る理由', MateCheck: '★可否', stallionCoveringLimit: '★種付け上限', canMate: '★可否の判定',
  applyMatingCounters: '★回数の更新',
  // ★相手を決める前の「選べない」（★第 2 便 B-1 / B-2・★2026-09-23）。★**素質は 1 つも含まない**
  //   ★`MateCandidate` は ★性別・誕生年・産駒数・今年産んだか・今年の種付数・最高格の勝ち数 の 7 つだけ。
  //   ★これらは ★既に画面に出している事実です（★`my_retired_horses` / `npc_stallion_facts`）。
  MateCandidate: '★可否を見るのに要る事実だけの型（★素質を含まない）',
  damBlockOf: '★この母が選べるか', sireBlockOf: '★この父が選べるか',
  // ★ニックス（★相性の倍率。★個体の素質は出ない）
  NicksTable: '★系統の相性表', nicksKey: '★その鍵', getNicksMultiplier: '★倍率', makeLineIds: '★系統 id の生成',
  generateNicksTable: '★表の生成',
  // ★名前（§9）
  NAME_SYLLABLES: '★音の素材', NAME_TAILS: '★同上', NameShape: '★形の型', DEFAULT_NAME_SHAPE: '★既定',
  NAME_TAIL_RATE: '★率', composeName: '★組み立て', normalizeName: '★正規化', NameBlocklist: '★禁止語の型',
  ALLOW_ALL_NAMES: '★全許可', NameGenerationResult: '★結果の型', NAME_MAX_ATTEMPTS: '★試行上限',
  generateHorseName: '★馬名の生成',
  // ★利用者が付ける馬名の形（★D-120「命名の規則（暫定）」・PLAN I-3。★文字列だけを見る・素質に触れない）
  PLAYER_NAME_MIN_CHARS: '★文字数の下限', PLAYER_NAME_MAX_CHARS: '★文字数の上限',
  PlayerNameRejection: '★弾いた理由の型', PlayerNameCheck: '★判定の型', checkPlayerHorseName: '★名前の形の判定',
  // ★運営が付ける仮の名前（★裁定 REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md P-1。★ID から決まる文字列・素質に触れない）
  PROVISIONAL_NAME_PREFIX: '★仮の名前の接頭辞', provisionalHorseName: '★仮の名前の生成',
  // ★NPC 厩舎の方針（★素質ではない）
  DistanceBias: '★距離の傾き', SurfaceBias: '★馬場の傾き', GrowthBias: '★成長型の傾き',
  StablePolicy: '★方針の型', Stable: '★厩舎の型', DISTANCE_BIAS_CENTER: '★中心', NPC_STABLES: '★名簿',
  // ★発見度（D-108 ③ で `stats`・`potential` を入力に取らない）
  DiscoveryStage: '★段の型', DISCOVERY_STAGES: '★段の並び', DISCOVERY_STEPS: '★回数の刻み',
  discoveryStageOf: '★「試された回数」→ 段', discoveryLabelOf: '★段 → 言葉', discoveryAdvanced: '★段が上がったか',
  // ★個性（D-109）
  InnateTrait: '★先天個性の型', LearnedTrait: '★後天特性の型', TraitId: '★id',
  INNATE_TRAITS: '★名簿', LEARNED_TRAITS: '★同上', TRAIT_LABEL: '★表示名', TRAIT_EFFECT: '★効果の説明',
  traitEffectOf: '★効果を引く', INNATE_THRESHOLDS: '★先天個性の閾値', InnateInput: '★入力の型（★素質を含まない）',
  innateTraitsOf: '★先天個性を導く', LONG_DISTANCE_M: '★長距離の線', LEARNED_STEPS: '★後天の刻み',
  CareerInput: '★戦績の入力の型', careerInputOf: '★戦績から入力を作る', learnedTraitsOf: '★後天特性を導く',
  traitsOf: '★両方をまとめて導く', learnedTraitsGained: '★新たに得たもの',
  // ★成長の層のうち、★**能力の側**（D-116 ②③。★段階は `@star/scheduler` にあります）
  GROWTH_TELL_MIN: '★この幅より小さい変化は言わない（D-116 ③）。★幅であって素質ではない',
  ABILITY_GROWTH_LABEL: '★能力の言い換え（★名前だけ。§5 の公開情報）',
  /**
   * ⚠️ ★`growthTellsOf` は ★**`stats` を 2 つ受け取ります**が、★**返すのは能力の名前だけ**です
   *    （★数値も差も返しません・D-116 ②）。★`potential` を受け取らないので、★**開放率を作れません**。
   * 🔴 ★ただし ★**呼ぶ側が `stats` を持っていること**が前提です —
   *    ★画面は `stats` を読めません（`my_horses` に無い）ので、
   *    ★**これを使えるのはサーバー側だけ**です。
   */
  growthTellsOf: '★前と今を比べて「伸びた能力の名前」だけを返す。★数値を返さない',
  // ★乱数の流れの登録簿（憲法 4）
  GENETICS_STREAM: '★流れの id', RACE_STREAM: '★同上', VERIFY_RACE_STREAM: '★同上',
  VERIFY_PAYOUT_STREAM: '★同上', PRESEED_STREAM: '★同上', DIAGNOSTIC_STREAM: '★同上',
  VERIFY_BAND_STREAM: '★同上', LINEAGE_SIM_STREAM: '★同上（★Q-2 の模擬）', ALL_STREAM_TABLES: '★登録簿', duplicateStreamIds: '★重複の検出',
  // ★決定論（憲法 §1-4）の部品。★id を符号位置順で比べるだけ
  compareIds: '★文字列を 2 つ 比べて -1/0/1 を返すだけ。★素質も段も触りません'
    + '（★`localeCompare` の代わり。★da-DK / nb-NO が `aa` を `å` として並べ替えるのを防ぐ）',
};

describe('★素質と段を画面に渡す口が無い（D-114 ②）', () => {
  const files = reexportedFiles();
  const names = new Set(files.flatMap(exportedNames));

  it('① ★エンジンの公開名を実物から数え上げている（★走査が空でない・R-21）', () => {
    expect(names.size, '★公開名が取れていない').toBeGreaterThan(30);
    expect(names.has('bandOfPotential'), '★段を出す名前が走査に入っていない（★検査が見ていない）').toBe(true);
  });

  it('🔴 ② ★LEAKS に挙げた名前が、実在する（★消えた名前を見張り続けない・R-19）', () => {
    for (const [name, why] of Object.entries(LEAKS)) {
      expect(why.length, `★${name} の理由が空`).toBeGreaterThan(0);
      expect(names.has(name), `★LEAKS の ${name} がエンジンに無い（★名前が変わった？）`).toBe(true);
    }
  });

  it('🔴 ③ ★分類されていない公開名が 1 つも無い（★新しい口に気づく形）', () => {
    const unclassified = [...names].filter((n) => !(n in LEAKS) && !(n in SAFE_REASONS));
    /**
     * ⚠️ ★**ここが赤くなったら、名前を消して通してはいけません。**
     *    ★その名前が ★**素質か段を返すか**を見て、★`LEAKS` か `SAFE_REASONS` に ★**理由付きで**足してください。
     *    ★迷ったら `LEAKS`（★R-27: 分からないなら狭い側）。
     */
    expect(unclassified, '★分類されていないエンジンの公開名').toEqual([]);
  });

  it('🔴 ④ ★画面の層が LEAKS の名前を 1 つも引いていない', () => {
    const webFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const f = path.join(dir, e);
        if (statSync(f).isDirectory()) walk(f);
        else if (/\.tsx?$/.test(e)) webFiles.push(f);
      }
    };
    walk(WEB_SRC);
    expect(webFiles.length, '★画面の走査が空（R-21）').toBeGreaterThan(20);

    const found: string[] = [];
    for (const f of webFiles) {
      const src = readFileSync(f, 'utf8');
      /** ★`@star/sim-engine` から引いている名前だけを見る（★自分で書いた同名の変数は別物） */
      for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@star\/sim-engine'/g)) {
        for (const raw of m[1]!.split(',')) {
          const name = raw.replace(/\btype\b/, '').split(' as ')[0]!.trim();
          if (name !== '' && name in LEAKS) found.push(`${path.relative(ROOT, f)}: ${name}`);
        }
      }
    }
    expect(found, '★画面が素質・段の口を引いている（D-114 ②）').toEqual([]);
  });

  it('🔴 ⑤ ★★の部品（`Stars`）が画面の部品置き場から消えている', () => {
    const ui = readFileSync(path.join(WEB_SRC, 'components/ui.tsx'), 'utf8');
    /** ★註記の中の言及は数えない（★消したことを書き残してあるため） */
    const live = ui.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(live, '★`Stars` の部品が戻っている（★D-114 ② を破る）').not.toMatch(/export function Stars\b/);
  });
});
