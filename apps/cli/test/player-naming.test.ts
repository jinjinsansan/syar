/**
 * ★**仔の命名の確定**（★PLAN I-3・D-120）の検査。★DB に繋ぎません（★偽のクライアント）。
 *
 * 【★何を見るか】
 *   ① ★成功: ★下書きの record から `horses` に 1 行（★本人の持ち馬・★name_key・★検査の版）→ ★下書きに印 → ★要求を完了
 *   ② ★失敗の理由: 形（★画面と同じ関数）／重複／禁止名／既に命名済み／他人の仔
 *   ③ ★確定の本体は ★取引に触らない（★実演が包んで戻せる）
 *   ④ ★下書きに入れる鍵（`foalDraftRecord`）と ★`horses` に入れる列（`DRAFT_RECORD_COLUMNS`）が一致する
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, FOUNDERS, PROVISIONAL_NAME_PREFIX, createFounder, deriveRng, normalizeName } from '@star/sim-engine';
import { DRAFT_RECORD_COLUMNS, confirmFoalName } from '../../worker/src/player-naming.js';
import { foalDraftRecord } from '../../worker/src/player-breeding.js';

const REQ = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '66666666-6666-4666-8666-666666666666';
const DRAFT = '77777777-7777-4777-8777-777777777777';

const founder = createFounder({
  id: 'f', sex: 'female', sireLine: 'L-f', birthYear: 0,
  rng: deriveRng(3, 1, 1), balance: DEFAULT_BALANCE, founders: FOUNDERS,
});
const RECORD = foalDraftRecord({ ...founder, sireId: 's', damId: 'd' }, 51, 270);

interface FakeOptions {
  readonly name?: string;
  readonly draftOwner?: string;
  readonly namedAlready?: boolean;
  /** ★同じ name_key の馬が居る */
  readonly taken?: boolean;
  /** ★name_key が空の行が残っている（★段 2 の前）・★その名前 */
  readonly nullKeyNames?: readonly string[];
}

function fakeClient(o: FakeOptions) {
  const seen: { sql: string; params: unknown[] }[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      seen.push({ sql, params });
      if (sql.startsWith('select id, user_id, draft_id, proposed_name from foal_requests')) {
        return { rows: [{ id: REQ, user_id: USER, draft_id: DRAFT, proposed_name: o.name ?? 'ホシノヒカリ' }], rowCount: 1 };
      }
      if (sql.startsWith('select id, user_id, named_horse_id, record from foal_drafts')) {
        return {
          rows: [{ id: DRAFT, user_id: o.draftOwner ?? USER, named_horse_id: o.namedAlready === true ? DRAFT : null, record: RECORD }],
          rowCount: 1,
        };
      }
      if (sql.startsWith('select 1 from horses where name_key = $1')) {
        return { rows: o.taken === true ? [{}] : [], rowCount: o.taken === true ? 1 : 0 };
      }
      if (sql.startsWith('select 1 from horses where name_key is null')) {
        const n = (o.nullKeyNames ?? []).length;
        return { rows: n > 0 ? [{}] : [], rowCount: n > 0 ? 1 : 0 };
      }
      if (sql.startsWith('select name from horses where name_key is null')) {
        const names = o.nullKeyNames ?? [];
        return { rows: names.map((name) => ({ name })), rowCount: names.length };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as never, seen };
}

const CTX = { blocked: (k: string) => k === normalizeName('キンシメイ'), version: 'v1' };
const failedWith = (seen: { sql: string; params: unknown[] }[]) =>
  seen.find((x) => x.sql.startsWith("update foal_requests set status = 'failed'"))?.params[1];

describe('★PLAN I-3: 仔の命名の確定', () => {
  it('① ★成功: ★本人の持ち馬として horses に入り、★name_key と検査の版を書く', async () => {
    const { client, seen } = fakeClient({ name: 'ｱｲｳｰ' });
    expect(await confirmFoalName(client, REQ, CTX)).toBe('done');
    const ins = seen.find((x) => x.sql.startsWith('insert into horses'));
    expect(ins, '★horses に入れていない').toBeDefined();
    const cols = /insert into horses \(([^)]*)\)/.exec(ins?.sql ?? '')?.[1]?.split(', ') ?? [];
    const at = (c: string) => ins?.params[cols.indexOf(c)];
    expect(at('id')).toBe(DRAFT);
    expect(at('owner_id')).toBe(USER);
    expect(at('name'), '★NFKC 後の全角で保存').toBe('アイウー');
    expect(at('name_key')).toBe(normalizeName('アイウー'));
    expect(at('name_checked_with')).toBe('v1');
    expect(at('birth_week')).toBe(270);
    expect(cols, '★NPC 厩舎の列を書いた（★持ち主と排他）').not.toContain('npc_stable_id');
    expect(seen.some((x) => x.sql.startsWith('update foal_drafts set named_horse_id')), '★下書きに印を付けていない').toBe(true);
    expect(seen.some((x) => x.sql.startsWith("update foal_requests set status = 'done'"))).toBe(true);
  });

  const cases: [string, FakeOptions, string][] = [
    ['カタカナ以外', { name: 'Star' }, 'invalid_chars'],
    ['長すぎる', { name: 'アイウエオカキクケコ' }, 'length'],
    ['正規化で 1 文字', { name: 'ーア' }, 'too_short_normalized'],
    ['仮の名前の接頭辞で始まる（★裁定 d7455c5 §1）', { name: `${PROVISIONAL_NAME_PREFIX}アイウ` }, 'reserved_prefix'],
    ['🔴 実在馬名（★NG リスト）', { name: 'キンシメイ' }, 'name_blocked'],
    ['🔴 既に居る馬と重なる（★name_key）', { taken: true }, 'name_taken'],
    ['🔴 既に居る馬と重なる（★name_key が空の行を名前で）', { nullKeyNames: ['ホシノ・ヒカリ'] }, 'name_taken'],
    ['既に名前が付いている', { namedAlready: true }, 'already_named'],
    ['他人の仔', { draftOwner: OTHER }, 'draft_not_found'],
  ];
  for (const [label, o, reason] of cases) {
    it(`② ★${label} → ${reason}・★horses に入れない`, async () => {
      const { client, seen } = fakeClient(o);
      expect(await confirmFoalName(client, REQ, CTX)).toBe('failed');
      expect(failedWith(seen)).toBe(reason);
      expect(seen.some((x) => x.sql.startsWith('insert into horses')), '★失敗なのに horses に入れた').toBe(false);
    });
  }

  it('★対照: ★name_key が空の行が残っていても、★重ならなければ通る', async () => {
    const { client } = fakeClient({ nullKeyNames: ['ベツノナマエ'] });
    expect(await confirmFoalName(client, REQ, CTX)).toBe('done');
  });

  it('③ ★確定の本体は ★取引に触らない', async () => {
    for (const o of [{}, { taken: true }] as FakeOptions[]) {
      const { client, seen } = fakeClient(o);
      await confirmFoalName(client, REQ, CTX);
      expect(seen.map((x) => x.sql).filter((s) => /^(begin|commit|rollback)$/i.test(s.trim()))).toEqual([]);
    }
  });

  it('④ ★下書きの鍵と ★horses に入れる列が一致する（★片方だけ足すと落ちる）', () => {
    expect(Object.keys(RECORD).sort()).toEqual([...DRAFT_RECORD_COLUMNS].sort());
  });
});
