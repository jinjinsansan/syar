/**
 * ★`sub` から口座を決める — V-19 #13（穴 A: 同時ログインで auth ユーザーが2つできる）
 *
 * 【塞ぐ穴】
 *   同一 `sub` で2つのログイン要求が同時に来ると:
 *     両方とも identity を引いて「無い」を得る → 両方とも auth ユーザーを作る
 *     → 両方とも identity を insert → **片方は PK で落ちる**
 *     → 落ちた側が作った auth ユーザーが**孤児として残る**
 *     → 孤児にセッションを出せば、そちらでもセットアップを完走できる＝**2口座**
 *
 *   `primary key (provider, subject)` は2行目の insert を止めるが、
 *   **その前に作られた auth ユーザーは止めない。**
 *
 * 【★守るべき不変条件（ここが本体）】
 *   **identity の紐付けに失敗した auth ユーザーで、セッションを出さないこと。**
 *
 *   孤児の削除は後片付けであって、安全性の本体ではない。
 *   実際、孤児には identity 行が無いので**以後のログインで到達できず**、
 *   セッションも出ないので、残っていても口座にはならない。
 *   → したがって**削除に失敗してもログインは通してよい**が、**残ったことは呼び出し側に伝える**
 *     （黙って溜まると、いつか誰かが「掃除」で触る）。
 *
 * 【なぜ「先に引く」のか】
 *   既に紐付いている利用者のログインで auth ユーザーを作ってはいけない。
 *   毎回作って毎回消すのは、失敗したときに毎回孤児を出すということでもある。
 */

export interface IdentityStoreDeps {
  /** `(provider, subject)` に紐づく auth ユーザー id。無ければ null */
  readonly findUserId: (provider: string, subject: string) => Promise<string | null>;
  /** auth ユーザーを新規に作り、その id を返す */
  readonly createAuthUser: () => Promise<string>;
  /** identity 行を insert する。★一意制約で落ちたら 'conflict' を返すこと（例外にしない） */
  readonly linkIdentity: (provider: string, subject: string, userId: string) => Promise<'linked' | 'conflict'>;
  /** 孤児になった auth ユーザーを消す。失敗しても致命ではない（上の注記） */
  readonly deleteAuthUser: (userId: string) => Promise<void>;
}

export type ResolveResult =
  | {
      readonly ok: true;
      readonly userId: string;
      /** 新規に作ったか（＝この経路が初回ログイン） */
      readonly created: boolean;
      /** ★競合して作った auth ユーザーを消せなかった場合、その id。運用に通知する */
      readonly orphanedAuthUser?: string;
    }
  | { readonly ok: false; readonly reason: 'conflict_but_missing' };

/**
 * `sub` に対応する auth ユーザー id を決める。無ければ作る。
 *
 * ★戻り値の `userId` は、**必ず identity 行に紐づいているもの**である。
 *   競合したときに自分が作ったほうを返さないことが、この関数の要点。
 */
export async function resolveUserId(
  provider: string,
  subject: string,
  deps: IdentityStoreDeps,
): Promise<ResolveResult> {
  // ① 既に紐付いていれば、それを使う（auth ユーザーを作らない）
  const existing = await deps.findUserId(provider, subject);
  if (existing !== null) return { ok: true, userId: existing, created: false };

  // ② 初回とみなして作る
  const candidate = await deps.createAuthUser();
  const linked = await deps.linkIdentity(provider, subject, candidate);
  if (linked === 'linked') return { ok: true, userId: candidate, created: true };

  // ③ ★競合した = 同時に来たもう一方が先に紐付けた。
  //    自分が作ったほうは捨て、**先に紐付いたほうを使う**
  let orphaned: string | undefined;
  try {
    await deps.deleteAuthUser(candidate);
  } catch {
    orphaned = candidate;   // 消せなくてもログインは通す（不変条件は守られている）
  }

  const winner = await deps.findUserId(provider, subject);
  if (winner === null) {
    // 競合したのに引けない = 一意制約以外の理由で落ちている。ここで通してはいけない
    return { ok: false, reason: 'conflict_but_missing' };
  }
  return orphaned === undefined
    ? { ok: true, userId: winner, created: false }
    : { ok: true, userId: winner, created: false, orphanedAuthUser: orphaned };
}
