/**
 * ★**仕組みの説明の文は ★出どころに縛る**（★2026-09-29・レビュー側・`countedBy` と同じ考え方）
 *
 * 【★なぜ】
 *   ★1 日で 仕組みの説明の嘘が 3 つ出た（★/setup「あとから変えられます」・★/signup「記録もご覧いただけます」・★オッズ「締切まで変わります」）。
 *   ★数字には網が在るのに ★文には無かった。★文は `apps/web/src/lib/claims.ts` に置き、★ここで 1 件ずつ ★裏づけと突き合わせる。
 *
 * 【★登録簿の形】 ★主張（文の定数） → ★裏づけ（★コード・移行を読んで ★真であることを確かめる関数） → ★文を使う画面。
 *   ★裏づけが崩れたら ★落ちる（★文を書き直すか、仕組みを戻す）。★画面が文を写したら ★落ちる（★1 か所から読む）。
 *   ★増やすのは ★次に嘘が見つかった日（★登録簿を先に置いておくのが要点）。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './lib/ts-blocks.js';
import {
  CLAIM_PP_FROM_RACES_ONLY, CLAIM_BREED_RETRY_SAME_YEAR, CLAIM_BREED_TEMP_NO_EP, CLAIM_BREED_PAY_AT_CONFIRM, CLAIM_NAME_NO_SELF_CHANGE,
  CLAIM_NAME_DUP_AFTER_SEND, CLAIM_BROODMARE_FEMALE_ONLY, CLAIM_ROLE_AFTER_RETIRE, CLAIM_ROLE_IMMEDIATE, CLAIM_POTENTIAL_CAP,
  CLAIM_DEFAULT_MENU, CLAIM_POINTS_SEPARATE,
  BET_PER_PICK_EP, CLAIM_BET_PER_PICK, CLAIM_BET_TYPE_RULE, CLAIM_REPEAT_BET, CLAIM_CARD_PUBLISH, CLAIM_DAILY_ONCE, CLAIM_TRAIN_EP_SHORT, CLAIM_ENTRY_CANCEL_WINDOW, CLAIM_SALES_CLOSE, CLAIM_EP_FREE_ONLY, CLAIM_GUEST_CAN_SEE, CLAIM_NO_CHANGE_LATER, CLAIM_ODDS_FIXED, CLAIM_OWN_RACE_BET, CLAIM_STRATEGY,
} from '../../web/src/lib/claims';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

/** ★本番のコードと移行（★テスト・道具は含めない） */
function sources(): { readonly rel: string; readonly text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const walk = (rel: string): void => {
    for (const name of readdirSync(path.join(ROOT, rel))) {
      if (name === 'node_modules' || name === 'test' || name === 'dist' || name === '.next') continue;
      const r = `${rel}/${name}`;
      if (statSync(path.join(ROOT, r)).isDirectory()) walk(r);
      else if (/\.(ts|tsx|sql)$/.test(name)) out.push({ rel: r, text: /\.sql$/.test(name) ? read(r) : stripComments(read(r)) });
    }
  };
  for (const d of ['db/migrations', 'apps/web/src', 'apps/worker/src', 'packages']) walk(d);
  return out;
}
const SRC = sources();
const hits = (re: RegExp): string[] => SRC.filter((f) => re.test(f.text)).map((f) => f.rel);
/** ★関数の ★最後の定義（★移行は後の `create or replace` が勝つ） */
function latestDefinition(fn: string): { readonly rel: string; readonly body: string } | null {
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(public\\.)?${fn}\\s*\\(`, 'i');
  const files = SRC.filter((f) => f.rel.startsWith('db/migrations/') && re.test(f.text)).sort((a, b) => a.rel.localeCompare(b.rel));
  const last = files.at(-1);
  if (last === undefined) return null;
  const at = last.text.search(re);
  /** ★本体は ★次の関数の定義まで（★ドル記号の札は $$・$fn$・$function$ と揃っていない） */
  const next = last.text.slice(at + 1).search(/create\s+or\s+replace\s+function/i);
  return { rel: last.rel, body: next < 0 ? last.text.slice(at) : last.text.slice(at, at + 1 + next) };
}

interface Claim {
  readonly id: string;
  readonly text: string;
  readonly name: string;
  /** ★この文を画面に出す所（★定数を読むこと） */
  readonly usedBy: readonly string[];
  /** ★裏づけ: ★真なら空・★偽なら 理由 */
  readonly backedBy: () => string[];
}

/**
 * ★投票額の制約 `bets_amount_range` の ★最後の定義を読み、★その額が通るかを返す（★2026-09-29・レビュー側「値を持つ文は その値が通るかまで見る」）。
 *   ★読めない形なら 投げる（★読めないを「通る」にしない）。
 */
function betAmountPasses(amount: number): { readonly ok: boolean; readonly rule: string } {
  const defs = SRC.filter((f) => f.rel.startsWith('db/migrations/'))
    .flatMap((f) => [...f.text.matchAll(/constraint\s+bets_amount_range\s+check\s*\(([^;]*?)\)\s*[,)]/gi)].map((m) => ({ rel: f.rel, rule: m[1]! })))
    .sort((a, b) => a.rel.localeCompare(b.rel));
  const rule = defs.at(-1)?.rule;
  if (rule === undefined) throw new Error('★bets_amount_range の定義が見つからない');
  const min = /amount\s*>=\s*(\d+)/.exec(rule);
  const max = /amount\s*<=\s*(\d+)/.exec(rule);
  const step = /amount\s*%\s*(\d+)\s*=\s*0/.exec(rule);
  if (min === null || max === null || step === null) throw new Error(`★bets_amount_range を読めない形: ${rule}`);
  const ok = amount >= Number(min[1]) && amount <= Number(max[1]) && amount % Number(step[1]) === 0;
  return { ok, rule: rule.replace(/\s+/g, ' ') };
}

/** ★ある関数の最後の定義の本体が 形を含むか（★移し替えの 12 文で使う） */
const defHas = (fn: string, re: RegExp): string[] => {
  const d = latestDefinition(fn);
  return d !== null && re.test(d.body) ? [] : [`★${fn}（${d?.rel ?? '無し'}）に ${String(re)} が無い`];
};
const srcHas = (rel: string, needle: string): string[] =>
  stripComments(read(rel)).includes(needle) ? [] : [`★${rel} に「${needle}」が無い`];

/** ★2026-09-29 の点検で「合っている」と判定した 12 文（★移した数と 裏づけの数を 下の網で数える） */
const MOVED: readonly Claim[] = [
  {
    id: '⑬賞金ポイントは レースの結果だけで増える', text: CLAIM_PP_FROM_RACES_ONLY, name: 'CLAIM_PP_FROM_RACES_ONLY',
    usedBy: ['apps/web/src/app/earn/page.tsx'],
    backedBy: () => {
      const adds = hits(/prize_points\s*=\s*prize_points\s*\+/);
      const allowed = ['apps/worker/src/payout.ts', 'apps/worker/src/prize-award.ts'];
      return adds.filter((f) => !allowed.includes(f)).map((f) => `★賞金ポイントを足す所が レース以外に在る: ${f}`)
        .concat(allowed.filter((f) => !adds.includes(f)).map((f) => `★対照: ${f} が賞金ポイントを足していない（★走査が空振り）`));
    },
  },
  {
    id: '⑭配合の失敗は 同じ年にもう一度頼める', text: CLAIM_BREED_RETRY_SAME_YEAR, name: 'CLAIM_BREED_RETRY_SAME_YEAR',
    usedBy: ['apps/web/src/app/stable/breed/page.tsx'],
    backedBy: () => {
      const all = SRC.filter((f) => f.rel.startsWith('db/migrations/')).map((f) => f.text).join('\n');
      const why: string[] = [];
      if (!/foal_requests_one_breed_per_dam_year\s+on\s+foal_requests\s*\(dam_id,\s*breed_year\)\s+where\s+kind\s*=\s*'breed'\s+and\s+status\s*<>\s*'failed'/i.test(all)) why.push('★一意の索引が failed を除いていない');
      if (/drop\s+index\s+(if\s+exists\s+)?foal_requests_one_breed_per_dam_year/i.test(all)) why.push('★一意の索引が落とされた');
      return why;
    },
  },
  {
    id: '⑮処理の途中で落ちたら 参加ポイントは引かれない', text: CLAIM_BREED_TEMP_NO_EP, name: 'CLAIM_BREED_TEMP_NO_EP',
    usedBy: ['apps/web/src/app/stable/breed/page.tsx', 'apps/web/src/app/stable/foal/page.tsx'],
    backedBy: () => [
      ...srcHas('apps/worker/src/player-breeding.ts', "await client.query('rollback to savepoint stud_fee');"),
      /** ★最初の 1 頭（/stable/foal）は 無償: ★種付料を引くのは kind = 'breed' のときだけ */
      ...srcHas('apps/worker/src/player-breeding.ts', "if (req.kind === 'breed') {"),
      /** ★確定の後で落ちたら ★呼ぶ側が取引ごと戻す（★この関数は commit しない） */
      ...(/\bcommit\b/.test(stripComments(read('apps/worker/src/player-breeding.ts')).replace(/'[^']*'/g, '')) ? ['★player-breeding が 自分で commit している（★取引ごと戻らない）'] : []),
    ],
  },
  {
    id: '⑯種付料は 確定のときの額・上限を超えたら生産しない', text: CLAIM_BREED_PAY_AT_CONFIRM, name: 'CLAIM_BREED_PAY_AT_CONFIRM',
    usedBy: ['apps/web/src/app/stable/breed/page.tsx'],
    backedBy: () => [
      ...srcHas('apps/worker/src/player-breeding.ts', 'const fee = npcStudFee(sire.g1Wins, await totalPrizePP(client, sire.id));'),
      ...srcHas('apps/worker/src/player-breeding.ts', "if (req.max_fee_ep === null || fee > Number(req.max_fee_ep)) return fail('fee_above_max');"),
    ],
  },
  {
    id: '⑰馬の名前は 利用者が変えられない', text: CLAIM_NAME_NO_SELF_CHANGE, name: 'CLAIM_NAME_NO_SELF_CHANGE',
    usedBy: ['apps/web/src/app/stable/name/page.tsx'],
    backedBy: () => [
      ...hits(/update\s+horses\s+set[^;]*\bname\s*=/i).map((f) => `★horses.name を書き換える行: ${f}`),
      ...hits(/from\(\s*'horses'\s*\)\s*\.update\(/).map((f) => `★画面から horses を update: ${f}`),
    ],
  },
  {
    id: '⑱同じ名前かは 送った後に分かる', text: CLAIM_NAME_DUP_AFTER_SEND, name: 'CLAIM_NAME_DUP_AFTER_SEND',
    usedBy: ['apps/web/src/app/stable/name/page.tsx'],
    backedBy: () => srcHas('apps/worker/src/player-naming.ts', "if (await nameTaken(client, shape.nameKey)) return fail('name_taken');"),
  },
  {
    id: '⑲繁殖入りは牝馬だけ・牡馬は種牡馬', text: CLAIM_BROODMARE_FEMALE_ONLY, name: 'CLAIM_BROODMARE_FEMALE_ONLY',
    usedBy: ['apps/web/src/app/stable/roles/page.tsx'],
    backedBy: () => defHas('breeding_role_block', /\(p_to_role\s*=\s*'stallion'\s+and\s+p_sex\s*<>\s*'male'\)\s*or\s*\(p_to_role\s*=\s*'broodmare'\s+and\s+p_sex\s*<>\s*'female'\)\s*then\s*'sex_mismatch'/i),
  },
  {
    id: '⑳役割を選べるのは 引退してから', text: CLAIM_ROLE_AFTER_RETIRE, name: 'CLAIM_ROLE_AFTER_RETIRE',
    usedBy: ['apps/web/src/app/stable/roles/page.tsx'],
    backedBy: () => defHas('breeding_role_block', /when\s+p_retired_at_week\s+is\s+null\s+then\s+'not_retired'/i),
  },
  {
    id: '㉑役割は その場で変わる', text: CLAIM_ROLE_IMMEDIATE, name: 'CLAIM_ROLE_IMMEDIATE',
    usedBy: ['apps/web/src/app/stable/roles/page.tsx'],
    backedBy: () => defHas('request_breeding_role', /update\s+horses\s+h\s+set\s+retirement_role\s*=\s*p_to_role\s+where\s+h\.id\s*=\s*p_horse_id/i),
  },
  {
    id: '㉒現在値は 素質を超えない', text: CLAIM_POTENTIAL_CAP, name: 'CLAIM_POTENTIAL_CAP',
    usedBy: ['apps/web/src/app/training/page.tsx'],
    backedBy: () => srcHas('packages/training/src/growth.ts', 'out[key] = next >= pot ? pot : next;'),
  },
  {
    id: '㉓指示の無い週は 既定の献立', text: CLAIM_DEFAULT_MENU, name: 'CLAIM_DEFAULT_MENU',
    usedBy: ['apps/web/src/app/training/page.tsx'],
    backedBy: () => srcHas('apps/worker/src/training-runner.ts', 'let menu = (ordered ?? defaultMenu(age, state.fatigue))'),
  },
  {
    id: '㉔参加ポイントと賞金ポイントは 別の台帳', text: CLAIM_POINTS_SEPARATE, name: 'CLAIM_POINTS_SEPARATE',
    usedBy: ['apps/web/src/app/records/records-view.tsx'],
    backedBy: () => {
      const all = SRC.filter((f) => f.rel.startsWith('db/migrations/')).map((f) => f.text).join('\n');
      const why: string[] = [];
      for (const t of ['ep_ledger', 'pp_ledger']) if (!new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${t}\\b`, 'i').test(all)) why.push(`★${t} の表が無い`);
      /** ★払戻は PP の台帳へ（★EP の台帳へ書かない・憲法 §0.2 の一方通行） */
      const payout = stripComments(read('apps/worker/src/payout.ts'));
      /** ★当たりは PP の台帳（payout）・★中止の返還だけが EP の台帳（refund） */
      if (!/insert into pp_ledger[\s\S]{0,120}'payout'/.test(payout)) why.push('★当たりを PP の台帳に書いていない');
      const epReasons = [...payout.matchAll(/insert into ep_ledger[\s\S]{0,160}?'([a-z_]+)'/g)].map((m) => m[1]);
      if (epReasons.some((r) => r !== 'refund')) why.push(`★払戻の処理が EP の台帳に 返還以外を書いている: ${epReasons.join(',')}`);
      return why;
    },
  },
];

const CLAIMS: readonly Claim[] = [
  ...MOVED,
  {
    id: '㉖続けて投票は 受け付けた直後だけ・同じ券種・同じ額・馬は次のレースで選ぶ・参加ポイントのみ・続けて 3 回まで（★結果を読まない）',
    text: CLAIM_REPEAT_BET, name: 'CLAIM_REPEAT_BET',
    usedBy: ['apps/web/src/app/vote/page.tsx'],
    backedBy: () => {
      const why: string[] = [];
      const rb = stripComments(read('apps/web/src/lib/repeat-bet.ts'));
      if (!/if \(input\.streak >= REPEAT_BET_MAX\) return \{ kind: 'limit' \};/.test(rb)) why.push('★続けた回数の上限が効いていない');
      const vote0 = stripComments(read('apps/web/src/app/vote/page.tsx'));
      /** ★同じ額: ★案内も 次のレースの投票も ★この画面の 1 口（EP_PER_PICK）だけ */
      if (!vote0.includes('betType: justPlaced.betType, amount: EP_PER_PICK,')) why.push('★案内の額が この画面の 1 口でない（★「同じ額」と言えない）');
      /** ★受け付けた直後だけ（★結果の後に出さない・デザイナー R-22・レビュー側裁定） */
      if (/loadLastBet|settled/.test(vote0) || /settled|payout/.test(rb)) why.push('★結果を読んでいる（★「結果を見て、もう一度」の流れになる）');
      if (!/export const REPEAT_BET_MAX = 3;/.test(stripComments(read('apps/web/src/lib/claims.ts')))) why.push('★上限が 3 でない（★文の「3 回」とずれる）');
      const vote = stripComments(read('apps/web/src/app/vote/page.tsx'));
      if ((vote.match(/placeBet\(/g) ?? []).length !== 1) why.push('★/vote が「投票する」以外でも買っている（★自動で買わない・馬は選び直す）');
      /** ★参加ポイントのみ: ★買う口 place_bet は EP の台帳だけを引く（★PP に触れない） */
      const d = latestDefinition('place_bet');
      if (d === null) why.push('★place_bet の定義が見つからない');
      else {
        if (!/ep_ledger/.test(d.body)) why.push(`★${d.rel}: place_bet が EP の台帳を引いていない`);
        if (/pp_ledger/.test(d.body)) why.push(`★${d.rel}: place_bet が PP の台帳に触れている`);
      }
      return why;
    },
  },
  {
    id: '㉕単勝は 1 着・複勝は 3 着以内（7 頭以下は 2 着以内）', text: CLAIM_BET_TYPE_RULE.place, name: 'CLAIM_BET_TYPE_RULE',
    usedBy: ['apps/web/src/app/vote/page.tsx'],
    backedBy: () => {
      const bal = stripComments(read('packages/betting/src/balance.ts'));
      const why: string[] = [];
      if (!/return fieldSize >= PLACE_THREE_MIN_FIELD \? 3 : 2;/.test(bal)) why.push('★placeDepth が「8 頭以上で 3・それ未満で 2」でない');
      if (!/export const PLACE_THREE_MIN_FIELD = 8;/.test(bal)) why.push('★PLACE_THREE_MIN_FIELD が 8 でない（★文の「7 頭以下」とずれる）');
      if (!stripComments(read('apps/web/src/lib/claims.ts')).includes('${PLACE_THREE_MIN_FIELD - 1} 頭以下')) why.push('★文の頭数を 定数から出していない');
      if (!CLAIM_BET_TYPE_RULE.win.includes('1 着')) why.push('★単勝の文が 1 着と言っていない');
      return why;
    },
  },
  {
    id: '⑫調教の費用が残高に足りなければ 次の週は休養（★ST001 → rest・★画面は実際に引かれる額で比べ /earn へ導く）',
    text: CLAIM_TRAIN_EP_SHORT, name: 'CLAIM_TRAIN_EP_SHORT',
    usedBy: ['apps/web/src/app/train/page.tsx'],
    backedBy: () => {
      const why: string[] = [];
      const runner = stripComments(read('apps/worker/src/training-runner.ts'));
      if (!/export const EP_SHORT_SQLSTATE = 'ST001';/.test(runner)) why.push('★ワーカーの EP 不足の SQLSTATE が ST001 でない');
      if (!/if \(classifySpendError\(e\) === 'ep_short'\) \{[\s\S]{0,80}menu = 'rest';/.test(runner)) why.push('★ワーカーが EP 不足で 休養に落としていない（★文が嘘になる）');
      const d = latestDefinition('spend_training_ep');
      if (d === null || !/errcode\s*=\s*'ST001'/i.test(d.body)) why.push(`★spend_training_ep（${d?.rel ?? '無し'}）が 不足で ST001 を出していない`);
      const train = stripComments(read('apps/web/src/app/train/page.tsx'));
      if (!train.includes('const cost = gradeEpCost(spec.id as MenuId, horse.stableGrade);')) why.push('★/train が 実際に引かれる額（格の倍率つき）で比べていない');
      if (!/actionHref="\/earn"/.test(train)) why.push('★/train の警告に 受け取りへの道が無い');
      /** ★旧 /training も ★実際の額（★2026-09-29・レビュー側「ほかの画面にも素の額が残っていないか」→ 3 か所 在った） */
      const old = stripComments(read('apps/web/src/app/training/page.tsx'));
      if (!old.includes('gradeEpCost(menu.id as MenuId, horse.stableGrade)')) why.push('★/training が 実際に引かれる額で出していない');
      if (/\{menu\.ep\}|\$\{menu\.ep\}|\{spec\.ep\}|\$\{spec\.ep\}/.test(old + train)) why.push('★調教の画面が 素の額（menu.ep / spec.ep）を そのまま出している');
      return why;
    },
  },
  {
    id: '⑪デイリーは 1 日 1 回（★その日の始まりで鍵を作り ★台帳の一意で担保）',
    text: CLAIM_DAILY_ONCE, name: 'CLAIM_DAILY_ONCE',
    usedBy: ['apps/web/src/app/earn/page.tsx'],
    backedBy: () => {
      const why: string[] = [];
      const d = latestDefinition('claim_daily_ep');
      if (d === null) return ['★claim_daily_ep の定義が見つからない'];
      if (!/'daily:'\s*\|\|\s*v_user::text\s*\|\|\s*':'\s*\|\|\s*v_day_from::text/.test(d.body)) why.push(`★${d.rel}: 鍵が「利用者 × その日」でない`);
      if (!/day_started_at/.test(d.body)) why.push(`★${d.rel}: 「その日」を world_state.day_started_at から取っていない`);
      const all = SRC.filter((f) => f.rel.startsWith('db/migrations/')).map((f) => f.text).join('\n');
      if (!/create\s+unique\s+index\s+if\s+not\s+exists\s+ep_ledger_dedupe_key_uniq/i.test(all)) why.push('★台帳の鍵の一意（ep_ledger_dedupe_key_uniq）が無い');
      if (/drop\s+index\s+(if\s+exists\s+)?ep_ledger_dedupe_key_uniq/i.test(all)) why.push('★台帳の鍵の一意が 落とされている');
      return why;
    },
  },
  {
    id: '⑩投票の 1 口の額は DB の制約を通る（★2026-09-29 まで 10 EP で 必ず落ちていた）',
    text: CLAIM_BET_PER_PICK, name: 'CLAIM_BET_PER_PICK',
    usedBy: ['apps/web/src/app/vote/page.tsx'],
    backedBy: () => {
      const { ok, rule } = betAmountPasses(BET_PER_PICK_EP);
      const why = ok ? [] : [`★${BET_PER_PICK_EP} EP は bets_amount_range（${rule}）を通らない`];
      const vote = stripComments(read('apps/web/src/app/vote/page.tsx'));
      if (!vote.includes('amount: EP_PER_PICK') || !vote.includes('const EP_PER_PICK = BET_PER_PICK_EP;')) why.push('★/vote が 送る額を BET_PER_PICK_EP から取っていない');
      return why;
    },
  },
  {
    id: '①名前・牧場名・勝負服は あとから変えられない',
    text: CLAIM_NO_CHANGE_LATER, name: 'CLAIM_NO_CHANGE_LATER',
    usedBy: ['apps/web/src/app/setup/page.tsx'],
    backedBy: () => [
      ...hits(/update\s+(public\.)?users\s+set[^;]*\b(display_name|stable_name|silk_color|silk_sleeve)\b/i).map((f) => `★変える口: ${f}`),
      ...hits(/from\(\s*'users'\s*\)\s*\.update\(/).map((f) => `★画面から users を update: ${f}`),
    ],
  },
  {
    id: '②オッズは発売のときに決まり 変わらない（固定オッズ）',
    text: CLAIM_ODDS_FIXED, name: 'CLAIM_ODDS_FIXED',
    usedBy: ['apps/web/src/components/uma/uma-odds-view.tsx', 'apps/web/src/app/races/[id]/race-detail-view.tsx', 'apps/web/src/components/odds-board.tsx'],
    backedBy: () => [
      ...hits(/update\s+(public\.)?race_odds\b/i).map((f) => `★race_odds を update: ${f}`),
      ...hits(/delete\s+from\s+(public\.)?race_odds\b/i).map((f) => `★race_odds を delete: ${f}`),
      ...hits(/truncate\s+(table\s+)?(public\.)?race_odds\b/i).map((f) => `★race_odds を truncate: ${f}`),
      ...hits(/from\(\s*'race_odds'\s*\)\s*\.(update|delete|upsert)\(/).map((f) => `★画面から race_odds を書く: ${f}`),
    ],
  },
  {
    id: '③未ログインで見られるのは 開催情報とオッズ（★録画・記録は ログインが要る）',
    text: CLAIM_GUEST_CAN_SEE, name: 'CLAIM_GUEST_CAN_SEE',
    usedBy: ['apps/web/src/app/signup/page.tsx'],
    backedBy: () => {
      const why: string[] = [];
      const acc = stripComments(read('apps/web/src/lib/race-real-access.ts'));
      const gated = acc.includes('session.data.session !== null');
      /** ★録画がログインを要る間は ★文に「録画」「記録」「レースを」を書かない（★半分だけ本当の文にしない） */
      if (gated && /録画|記録|レースを/.test(CLAIM_GUEST_CAN_SEE)) why.push('★録画はログインが要るのに 文が録画・記録・レースを見られると言う');
      if (!gated) why.push('★canPlayRealRace がログインを見なくなった（★(a) を通した？）→ ★文を書き直す');
      const rec = stripComments(read('apps/web/src/app/records/records-view.tsx'));
      if (/記録/.test(CLAIM_GUEST_CAN_SEE) && /ログインしてください/.test(rec)) why.push('★未ログインの /records はログインを求める');
      return why;
    },
  },
  {
    id: '④自馬出走レースは 自馬を全頭含む買い目だけ・上限まで 投票できる',
    text: CLAIM_OWN_RACE_BET, name: 'CLAIM_OWN_RACE_BET',
    usedBy: ['apps/web/src/app/entry/page.tsx', 'apps/web/src/app/howto/page.tsx', 'apps/web/src/app/vote/page.tsx'],
    backedBy: () => {
      const d = latestDefinition('place_bet');
      if (d === null) return ['★place_bet の定義が見つからない'];
      const why: string[] = [];
      if (!/not\s*\(\s*p_selection\s*@>\s*to_jsonb\(e\.gate\)\s*\)/.test(d.body)) why.push(`★${d.rel}: 自馬を全頭含む の判定が無い`);
      if (!/owner_id\s*=\s*v_user/.test(d.body)) why.push(`★${d.rel}: 自馬の判定が無い`);
      if (!read('apps/web/src/lib/claims.ts').includes('BET_CAP_OWN_RACE_EP.toLocaleString')) why.push('★上限を定数から出していない');
      /** ★SQL の側（bet_limits.own_race_ep）は ★ワーカーが毎周 TS の値を書く（★4 番目の列 ← 4 番目の引数） */
      const main = stripComments(read('apps/worker/src/main.ts'));
      if (!/insert into bet_limits \(id, per_kind_ep, per_race_ep, per_day_ep, own_race_ep, updated_at\)/.test(main)
        || !/\[BET_CAP_PER_KIND_EP, BET_CAP_PER_RACE_EP, BET_CAP_PER_DAY_EP, BET_CAP_OWN_RACE_EP\]/.test(main)) why.push('★ワーカーが own_race_ep に BET_CAP_OWN_RACE_EP を書いていない');
      /** ★bet_allowance は 自馬出走なら own_race_ep を使う */
      const alw = latestDefinition('bet_allowance');
      if (alw === null || !/when\s+v_own\s+then\s+v_lim\.own_race_ep/i.test(alw.body)) why.push(`★bet_allowance（${alw?.rel ?? '無し'}）が 自馬出走で own_race_ep を使っていない`);
      return why;
    },
  },
  {
    id: '⑤脚質は今回だけ・適性から外れると走り全体が鈍る（★道中で崩れる仕組みは無い）',
    text: CLAIM_STRATEGY, name: 'CLAIM_STRATEGY',
    usedBy: ['apps/web/src/app/entry/page.tsx'],
    backedBy: () => {
      const bal = stripComments(read('packages/race-engine/src/balance.ts'));
      const min = Number(/STRATEGY_APT_COEF_MIN:\s*([0-9.]+)/.exec(bal)?.[1]);
      const co = stripComments(read('packages/race-engine/src/coefficients.ts'));
      const why: string[] = [];
      if (!(min < 1)) why.push(`★適性の下限が 1 未満でない（${String(min)}）→ 鈍らない`);
      if (!/strategyAptitude\[strategy\]/.test(co)) why.push('★strategyCoef が適性を見ていない');
      return why;
    },
  },
  {
    id: '⑥参加ポイントは無償でのみ・いまは毎日のログイン',
    text: CLAIM_EP_FREE_ONLY, name: 'CLAIM_EP_FREE_ONLY',
    usedBy: ['apps/web/src/app/howto/page.tsx'],
    backedBy: () => {
      const d = latestDefinition('ep_grant_amount');
      if (d === null) return ['★ep_grant_amount の定義が見つからない'];
      const kinds = [...d.body.matchAll(/when\s+'([a-z_]+)'\s+then/g)].map((m) => m[1]).filter((k) => k !== 'daily_cap').sort();
      return kinds.join(',') === 'daily,signup' ? [] : [`★${d.rel}: 発行の種類が signup・daily だけでない（${kinds.join(',')}）→ 文の「いまは毎日のログイン」を見直す`];
    },
  },
  {
    /**
     * ★2026-09-29: ★旧文「登録は、画面から取り消せません。」→ ★取消の画面を作った（D-123 ①）ので ★事実に合わせて書き換えた。
     *   ★旧い網は「画面が request_entry_scratch を呼んだら落ちる」だった（★狙いどおり落ちて 書き直しを求めた）。
     */
    id: '⑦出走の登録は 出走表が出る前（announced）まで取り消せ、出走料と騎手の料金は EP で戻る',
    text: CLAIM_ENTRY_CANCEL_WINDOW, name: 'CLAIM_ENTRY_CANCEL_WINDOW',
    usedBy: ['apps/web/src/app/entry/page.tsx'],
    backedBy: () => {
      const why: string[] = [];
      /** ★受けるのは announced の間だけ（★段で判定・D-123） */
      const req = latestDefinition('request_entry_scratch');
      if (req === null || !/if v_race_status <> 'announced' then/.test(req.body)) why.push(`★request_entry_scratch（${req?.rel ?? '無し'}）が announced の間だけに絞っていない`);
      /** ★画面が口を呼び、★押せるかをサーバーの段で見る */
      const page = stripComments(read('apps/web/src/app/entry/page.tsx'));
      if (!page.includes('requestEntryScratch(requestId, entry.entryId)')) why.push('★/entry が 取消の口を呼んでいない（★文が嘘になる）');
      if (!page.includes('entry.raceStatus === SCRATCHABLE_RACE_STATUS')) why.push('★/entry が 押せるかを サーバーの段で見ていない');
      if (!/export const SCRATCHABLE_RACE_STATUS = 'announced';/.test(stripComments(read('apps/web/src/lib/entry-scratch.ts')))) why.push('★画面の下見が announced でない');
      if (latestDefinition('my_open_entries') === null) why.push('★登録の id を画面へ渡す口 my_open_entries が無い');
      /** ★確定はワーカー: ★依頼を拾って ★既存の scratchEntry を呼ぶ（★返し方を 2 通りにしない） */
      const runner = stripComments(read('apps/worker/src/entry-scratch-runner.ts'));
      if (!/scratchEntry\(/.test(runner)) why.push('★ワーカーの取消の依頼が scratchEntry を呼んでいない');
      /** ★返すのは 出走料（行の値）＋ 騎手の料金・★EP で */
      const sc = stripComments(read('apps/worker/src/scratch.ts'));
      if (!/entry_fee_ep/.test(sc)) why.push('★返金が 出走料を行（races.entry_fee_ep）から読んでいない');
      if (!/jockeyFeeEP/.test(sc)) why.push('★返金に 騎手の料金が入っていない');
      if (!/ep_ledger/.test(sc) || /pp_ledger/.test(sc)) why.push('★返金が EP の台帳でない（★PP で返すと EP→PP の経路ができる）');
      return why;
    },
  },
  {
    id: '⑧出馬表は 発走の（周の長さ − 公開の位置）前に公開される',
    text: CLAIM_CARD_PUBLISH, name: 'CLAIM_CARD_PUBLISH',
    usedBy: ['apps/web/src/app/races/[id]/race-detail-view.tsx'],
    backedBy: () => {
      const claims = stripComments(read('apps/web/src/lib/claims.ts'));
      const why: string[] = [];
      /** ★文の数は ★組成のきっかけ（登録の締切）から導く（★表の publish ではない・2026-09-29 に一度 取り違えた） */
      if (!claims.includes('- entryDeadlineMs(10, 0)') || claims.includes('PHASE_OFFSET_MS.publish)}')) why.push('★公開の時刻を 登録の締切から導いていない');
      /** ★ワーカーが ★登録の締切を過ぎるまで組成しない（＝それまで 出馬表は出ない） */
      const runner = stripComments(read('apps/worker/src/cycle-runner.ts'));
      if (!/if\s*\(\s*nowMs\s*<\s*entryDeadlineMs\(\s*idx\s*,\s*epochMs\s*\)\s*\)\s*continue;/.test(runner)) why.push('★ワーカーの組成が 登録の締切を待っていない');
      /** ★組成前（announced）は 馬番を隠す */
      const view = SRC.filter((f) => f.rel.startsWith('db/migrations/') && /create\s+or\s+replace\s+view\s+race_entries_public/i.test(f.text)).sort((a, b) => a.rel.localeCompare(b.rel)).at(-1);
      if (view === undefined || !/when\s+r\.status\s*=\s*'announced'\s+then\s+null\s+else\s+e\.gate/i.test(view.text)) why.push('★組成前の馬番を隠していない');
      return why;
    },
  },
  {
    id: '⑨投票は 発走の（周の長さ − 締切の位置）前に締め切る',
    text: CLAIM_SALES_CLOSE, name: 'CLAIM_SALES_CLOSE',
    usedBy: ['apps/web/src/app/races/[id]/race-detail-view.tsx'],
    backedBy: () => {
      const why: string[] = [];
      if (!stripComments(read('apps/web/src/lib/claims.ts')).includes('jaDuration(CYCLE_MS - PHASE_OFFSET_MS.salesClose)')) why.push('★締切の時刻を cycle.ts から導いていない');
      const d = latestDefinition('place_bet');
      if (d === null || !/sales_close_lead_seconds\(\)/.test(d.body)) why.push(`★place_bet（${d?.rel ?? '無し'}）が締切の余裕を見ていない（★発走まで受ける）`);
      /** ★余裕の値の一致は sales-close-sql.test.ts が見る */
      return why;
    },
  },
];

describe('★仕組みの説明の文は 出どころに縛る', () => {
  it('★移し替え（2026-09-29）: 移した文の数 ＝ 裏づけの数 ＝ 12', () => {
    expect(MOVED.length).toBe(12);
    expect(MOVED.filter((c) => typeof c.backedBy === 'function').length).toBe(12);
    expect(new Set(MOVED.map((c) => c.name)).size, '★同じ定数を 2 度数えている').toBe(12);
  });

  for (const c of CLAIMS) {
    it(`🔴 ${c.id}: ★裏づけが崩れていない`, () => {
      expect(c.backedBy(), `★「${c.text}」の裏づけが崩れた → ★文を書き直すか 仕組みを戻す`).toEqual([]);
    });
    it(`🔴 ${c.id}: ★画面は 定数から読む（★文を写さない）`, () => {
      expect(c.usedBy.length).toBeGreaterThan(0);
      for (const f of c.usedBy) expect(read(f), `★${f} が ${c.name} を読んでいない`).toContain(c.name);
      const copies = SRC.filter((f) => f.rel !== 'apps/web/src/lib/claims.ts' && f.text.includes(c.text)).map((f) => f.rel);
      expect(copies, '★文が写されている（★1 か所から読む）').toEqual([]);
    });
  }

  it('★対照: 裏づけの網は 本物の書き込みを捕まえる（★空振りしていない）', () => {
    /** ★users の update は 在る（★ポイント）ので ★パターンが働いていること */
    expect(hits(/update\s+(public\.)?users\s+set\b/i).length).toBeGreaterThan(3);
    /** ★race_odds への insert は 在る（★生成） */
    expect(hits(/insert\s+into\s+race_odds\b/i).length).toBeGreaterThan(0);
  });

  it('🔴 ★今日 見つかった嘘が 戻らない', () => {
    /** ★画面とコードだけ（★移行の SQL 註記は 過去の経緯を書くので 除く） */
    const all = SRC.filter((f) => !f.rel.endsWith('.sql')).map((f) => f.text).join('\n');
    expect(all).not.toContain('あとから変えられます');
    expect(all).not.toContain('締切まで変わります');
    expect(all).not.toContain('締切で確定します');
    expect(all).not.toContain('レース・オッズ・記録はご覧いただけます');
    /** ★固定オッズに「最終の」は ★前に別の数字が在った含み（★2026-09-29 に落とした） */
    expect(all).not.toContain('最終の数字です');
    /** ★2026-09-29 の 2 便目（★沈んでいなかった文から） */
    for (const lie of ['自分の馬が出るレースは投票できません', '自分の馬が出るレースには投票できません', '発走 10 分前に確定', '99.9（上限）', '発走 3 分前から観られます', '道中で崩れやすく', '動画・アンケート・オファー・毎日のログイン', '取消は発売の準備に入る前まで', '発売の準備に入る前までしかできません']) {
      expect(all, lie).not.toContain(lie);
    }
  });
});
