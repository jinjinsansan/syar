/**
 * V-19 #9・#11 — **検証を通らないものがセッション発行に到達しないこと**。
 *
 * 【なぜ別の試験が要るか（裁定 §3 #9）】
 *   > Edge Function は service_role で任意のユーザーのセッションを作れます。
 *   > そのエンドポイントの認可が緩ければ、**トークン検証がすべて正しくても全口座が抜けます**。
 *
 *   `line-id-token.test.ts` が測るのは「検証が正しいか」。
 *   ここで測るのは「**その検証が、実際に経路上で効いているか**」。別の問いなので別に測る。
 *
 * 【★#11「本番経路で固定する」の実体】
 *   I-3 / I-4 / L-1 で3度踏んだ罠 —「純関数の単体テストが全緑でも、呼び出し側が検証を飛ばせば防御はゼロ」。
 *   → ここでは**実装の内部を覗かず、`issueSession` が呼ばれた回数だけを観測する。**
 *      検証の呼び忘れ・結果の握り潰し・順序の入れ替えは、すべてこの観測で落ちる。
 *
 * 【R-14（V-19 #12）】
 *   期待値は「セッションが発行されていないこと」という**外から見える結果**に置く。
 *   実装が内部でどう分岐しているかは参照しない。
 */

import { describe, expect, it } from 'vitest';
import { handleLineCallback, type LoginFlowDeps } from '../src/index.js';

const SUB = 'U0123456789abcdef0123456789abcdef';
const STATE = 'state-0123456789';
const NONCE = 'nonce-0123456789';
const CODE = 'authorization-code-0123456789';

interface Session { readonly token: string }

/** ★観測点。実装の内部ではなく、外から見える「何回呼ばれたか」だけを見る */
interface Observed {
  issued: number;
  verified: number;
  verifiedWithNonce: string | null;
  exchanged: number;
}

/** 既定は「すべて成功する」経路。各試験は必要な1段だけを壊す */
function makeSpy(over: Partial<LoginFlowDeps<Session>> = {}): { readonly seen: Observed; readonly deps: LoginFlowDeps<Session> } {
  const seen: Observed = { issued: 0, verified: 0, verifiedWithNonce: null, exchanged: 0 };
  const base: LoginFlowDeps<Session> = {
    consumeState: async (state: string) => (state === STATE ? { nonce: NONCE } : null),
    exchangeCode: async (code: string) => {
      seen.exchanged += 1;
      return code === CODE ? { idToken: 'id-token' } : null;
    },
    verifyIdToken: async (_idToken: string, expectedNonce: string) => {
      seen.verified += 1;
      seen.verifiedWithNonce = expectedNonce;
      return { ok: true, identity: { sub: SUB } };
    },
    issueSession: async () => {
      seen.issued += 1;
      return { token: 'session-token' };
    },
  };
  return { seen, deps: { ...base, ...over } };
}

describe('V-19 対照（★防御ではない。ゲートを空にしないための足場）', () => {
  it('すべて通ればセッションが発行される', async () => {
    const spy = makeSpy();
    const r = await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
    expect(r.ok).toBe(true);
    expect(spy.seen.issued).toBe(1);
  });
});

describe('V-19 #9 ★検証を通らないものがセッションに到達しない', () => {
  it('★ID トークンの検証が落ちたら、セッションは発行されない', async () => {
    const spy = makeSpy({ verifyIdToken: async () => ({ ok: false, reason: 'bad_signature' }) });
    const r = await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
    expect(r).toEqual({ ok: false, reason: 'token_rejected' });
    expect(spy.seen.issued).toBe(0);
  });

  it.each(['alg_mismatch', 'iss_mismatch', 'aud_mismatch', 'expired', 'nonce_mismatch', 'nonce_missing'] as const)(
    '★検証が %s で落ちても、セッションは発行されない',
    async (reason) => {
      const spy = makeSpy({ verifyIdToken: async () => ({ ok: false, reason }) });
      const r = await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
      expect(r.ok).toBe(false);
      expect(spy.seen.issued).toBe(0);
    },
  );

  it('★コード交換に失敗したら、検証もセッション発行も起きない', async () => {
    const spy = makeSpy({ exchangeCode: async () => null });
    const r = await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
    expect(r).toEqual({ ok: false, reason: 'code_rejected' });
    expect(spy.seen.verified).toBe(0);
    expect(spy.seen.issued).toBe(0);
  });
});

describe('V-19 #4 state（CSRF と callback の再送）', () => {
  it('★未知の state を拒否し、コード交換にすら進まない', async () => {
    const spy = makeSpy();
    const r = await handleLineCallback({ code: CODE, state: 'state-from-attacker' }, spy.deps);
    expect(r).toEqual({ ok: false, reason: 'state_rejected' });
    expect(spy.seen.exchanged).toBe(0);
    expect(spy.seen.issued).toBe(0);
  });

  it('★state は一度きり — 同じ callback を再送しても2回目はセッションが出ない', async () => {
    let remaining = 1;
    const spy = makeSpy({
      consumeState: async (state: string) => {
        if (state !== STATE || remaining === 0) return null;
        remaining -= 1;             // ★確認ではなく消費
        return { nonce: NONCE };
      },
    });
    const first = await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
    const second = await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: 'state_rejected' });
    expect(spy.seen.issued).toBe(1);     // 2 になってはいけない
  });

  it('★nonce は state に紐づいたものが使われる（リクエスト側の値を信用しない）', async () => {
    const spy = makeSpy();
    await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
    expect(spy.seen.verifiedWithNonce).toBe(NONCE);
  });

  it('★空の code / state を拒否する', async () => {
    const spy = makeSpy();
    expect(await handleLineCallback({ code: '', state: STATE }, spy.deps)).toEqual({ ok: false, reason: 'bad_request' });
    expect(await handleLineCallback({ code: CODE, state: '' }, spy.deps)).toEqual({ ok: false, reason: 'bad_request' });
    expect(spy.seen.issued).toBe(0);
  });
});

describe('V-19 ★失敗の理由を外に出さない', () => {
  it('LoginFailure は検証の内訳を含まない（どの検証で落ちたかを攻撃者に教えない）', async () => {
    const reasons = new Set<string>();
    for (const reason of ['bad_signature', 'alg_mismatch', 'iss_mismatch', 'expired', 'nonce_mismatch'] as const) {
      const spy = makeSpy({ verifyIdToken: async () => ({ ok: false, reason }) });
      const r = await handleLineCallback({ code: CODE, state: STATE }, spy.deps);
      if (!r.ok) reasons.add(r.reason);
    }
    // ★内訳が違っても、外に出る理由は1つに畳まれていること
    expect([...reasons]).toEqual(['token_rejected']);
  });
});
