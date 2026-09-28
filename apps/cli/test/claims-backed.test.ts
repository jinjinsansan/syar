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
  CLAIM_CARD_PUBLISH, CLAIM_ENTRY_NO_CANCEL, CLAIM_EP_FREE_ONLY, CLAIM_GUEST_CAN_SEE, CLAIM_NO_CHANGE_LATER, CLAIM_ODDS_FIXED, CLAIM_OWN_RACE_BET, CLAIM_STRATEGY,
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

const CLAIMS: readonly Claim[] = [
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
    usedBy: ['apps/web/src/components/uma/uma-odds-view.tsx', 'apps/web/src/app/races/[id]/page.tsx', 'apps/web/src/components/odds-board.tsx'],
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
    id: '⑦出走の登録は 画面から取り消せない（★口は在るが 画面が呼ばない）',
    text: CLAIM_ENTRY_NO_CANCEL, name: 'CLAIM_ENTRY_NO_CANCEL',
    usedBy: ['apps/web/src/app/entry/page.tsx'],
    backedBy: () => hits(/request_entry_scratch/).filter((f) => f.startsWith('apps/web/')).map((f) => `★画面が取消を呼んでいる: ${f} → 文を書き直す`),
  },
  {
    id: '⑧出馬表は 発走の（周の長さ − 公開の位置）前に公開される',
    text: CLAIM_CARD_PUBLISH, name: 'CLAIM_CARD_PUBLISH',
    usedBy: ['apps/web/src/app/races/[id]/page.tsx'],
    backedBy: () => {
      const claims = stripComments(read('apps/web/src/lib/claims.ts'));
      return claims.includes('jaDuration(CYCLE_MS - PHASE_OFFSET_MS.publish)') ? [] : ['★公開の時刻を cycle.ts から導いていない'];
    },
  },
];

describe('★仕組みの説明の文は 出どころに縛る', () => {
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
