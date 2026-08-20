/**
 * V-19 #13 — 同一 `sub` で同時に2回ログインしても、auth ユーザー1・identity 1行・口座1。
 *
 * 【この試験が守るもの】
 *   `primary key (provider, subject)` は**2行目の insert**を止めるが、
 *   **その前に作られた auth ユーザー**は止めない。孤児にセッションを出せば2口座になる。
 *   → ここでは「**競合した側が、自分の作った auth ユーザーを使わないこと**」を固定する。
 *
 * 【R-14 / #12】
 *   期待値は外から見える結果（返ってきた userId・作られた auth ユーザーの数）に置き、
 *   実装の内部分岐を参照しない。
 */

import { describe, expect, it } from 'vitest';
import { resolveUserId, type IdentityStoreDeps } from '../src/index.js';

const PROVIDER = 'line';
const SUB = 'U0123456789abcdef0123456789abcdef';
const WINNER = 'auth-user-winner';

/** DB を模した最小の store。★一意制約はここで再現する（PK 相当） */
function makeStore(opts: { readonly preexisting?: string | null } = {}) {
  const table = new Map<string, string>();          // `${provider}:${subject}` -> userId
  const authUsers = new Set<string>();
  const created: string[] = [];
  const deleted: string[] = [];
  let seq = 0;

  if (opts.preexisting != null) {
    table.set(`${PROVIDER}:${SUB}`, opts.preexisting);
    authUsers.add(opts.preexisting);
  }

  const deps: IdentityStoreDeps = {
    findUserId: async (p, s) => table.get(`${p}:${s}`) ?? null,
    createAuthUser: async () => {
      seq += 1;
      const id = `auth-user-${seq}`;
      authUsers.add(id);
      created.push(id);
      return id;
    },
    linkIdentity: async (p, s, userId) => {
      const key = `${p}:${s}`;
      if (table.has(key)) return 'conflict';        // ★PK 相当
      table.set(key, userId);
      return 'linked';
    },
    deleteAuthUser: async (id) => {
      authUsers.delete(id);
      deleted.push(id);
    },
  };
  return { deps, table, authUsers, created, deleted };
}

describe('V-19 対照（★防御ではない。ゲートを空にしないための足場）', () => {
  it('初回ログインでは auth ユーザーが作られ、identity が1行できる', async () => {
    const s = makeStore();
    const r = await resolveUserId(PROVIDER, SUB, s.deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(true);
    expect(s.table.size).toBe(1);
    expect(s.authUsers.size).toBe(1);
  });
});

describe('V-19 #13 同時ログイン', () => {
  it('★2回目のログインで auth ユーザーを作らない（既に紐付いていれば引くだけ）', async () => {
    const s = makeStore({ preexisting: WINNER });
    const r = await resolveUserId(PROVIDER, SUB, s.deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe(WINNER);
      expect(r.created).toBe(false);
    }
    expect(s.created).toEqual([]);          // ★1つも作っていないこと
    expect(s.authUsers.size).toBe(1);
  });

  it('★競合したら、自分が作った auth ユーザーではなく先に紐付いたほうを返す', async () => {
    const s = makeStore();
    // 自分が createAuthUser した「後」に、もう一方が紐付けた状況を作る
    const racing: IdentityStoreDeps = {
      ...s.deps,
      createAuthUser: async () => {
        const id = await s.deps.createAuthUser();
        s.table.set(`${PROVIDER}:${SUB}`, WINNER);   // ★横入り
        return id;
      },
    };
    const r = await resolveUserId(PROVIDER, SUB, racing);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // ★ここが本体: 自分の作ったほう（auth-user-1）を返してはいけない
      expect(r.userId).toBe(WINNER);
      expect(r.userId).not.toBe(s.created[0]);
      expect(r.created).toBe(false);
    }
  });

  it('★競合したら、自分が作った auth ユーザーを孤児として残さない', async () => {
    const s = makeStore();
    const racing: IdentityStoreDeps = {
      ...s.deps,
      createAuthUser: async () => {
        const id = await s.deps.createAuthUser();
        s.table.set(`${PROVIDER}:${SUB}`, WINNER);
        return id;
      },
    };
    await resolveUserId(PROVIDER, SUB, racing);
    expect(s.deleted).toEqual([s.created[0]]);
    expect(s.authUsers.has(s.created[0]!)).toBe(false);
    expect(s.table.size).toBe(1);            // identity は1行のまま
  });

  it('★同時に2つ走らせても、identity は1行・返る userId は同じ', async () => {
    const s = makeStore();
    const [r1, r2] = await Promise.all([
      resolveUserId(PROVIDER, SUB, s.deps),
      resolveUserId(PROVIDER, SUB, s.deps),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.userId).toBe(r2.userId);   // ★2口座にならない
    expect(s.table.size).toBe(1);
    // 作られた auth ユーザーのうち、生き残るのは1つだけ
    expect(s.authUsers.size).toBe(1);
  });

  it('★孤児を消せなくてもログインは通すが、残ったことを伝える', async () => {
    const s = makeStore();
    const racing: IdentityStoreDeps = {
      ...s.deps,
      createAuthUser: async () => {
        const id = await s.deps.createAuthUser();
        s.table.set(`${PROVIDER}:${SUB}`, WINNER);
        return id;
      },
      deleteAuthUser: async () => { throw new Error('削除に失敗'); },
    };
    const r = await resolveUserId(PROVIDER, SUB, racing);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe(WINNER);                  // ★不変条件は守られている
      expect(r.orphanedAuthUser).toBe(s.created[0]);  // ★黙って捨てない
    }
  });

  it('★競合したのに引き直せないときは通さない（一意制約以外の理由で落ちている）', async () => {
    const s = makeStore();
    const broken: IdentityStoreDeps = {
      ...s.deps,
      linkIdentity: async () => 'conflict',   // conflict と言うが table には入っていない
    };
    const r = await resolveUserId(PROVIDER, SUB, broken);
    expect(r).toEqual({ ok: false, reason: 'conflict_but_missing' });
  });
});
