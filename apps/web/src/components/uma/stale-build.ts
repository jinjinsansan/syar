/**
 * ★**古い版を開いたままの人に その場で気づかせる**（★2026-09-28・レビュー側・簿 STALE-CLIENT-NO-NOTICE）
 *
 * 【★なぜ】
 *   ★オーナーの画面写しが 現行と違い（★見本の馬・簡易版の走行・「いま/次」の札なし）、
 *   ★配信物の束 15 本を読んで ★「古いタブ」と確かめるまで 推測で止まった。★本人が気づける道が無かった。
 *
 * 【★比べるもの】
 *   ★手元の束に焼かれた版（`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`・★Vercel が自動で入れる・`/race` の札と同じ値）と
 *   ★`/api/healthz` の `sha`（★いま配っている版）。
 *
 * 【🔴 ★決まり（★レビュー側の条件）】
 *   ★比べるのは ★画面が見えるようになったとき（★初回・visibilitychange の復帰）だけ。★定期に問い合わせない。
 *   ★healthz が失敗・値が読めない・手元の版が分からない ときは ★**何も出さない**（★分からないときに「古い」と言わない）。
 */

/** ★手元の版と いま配っている版が ★両方分かって ★違うときだけ 真 */
export function isStaleBuild(clientSha: string | null | undefined, serverSha: string | null | undefined): boolean {
  if (typeof clientSha !== 'string' || typeof serverSha !== 'string') return false;
  const c = clientSha.trim();
  const s = serverSha.trim();
  if (c === '' || s === '') return false;
  return c !== s;
}

/** ★healthz の `sha` を読む（★どこで失敗しても `null`・★投げない） */
export async function readServedSha(fetchImpl: typeof fetch): Promise<string | null> {
  try {
    /** ★healthz は `cache-control: no-store` を返すので ★ブラウザは写しを使わない */
    const res = await fetchImpl('/api/healthz');
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (body === null || typeof body !== 'object') return null;
    const sha = (body as { readonly sha?: unknown }).sha;
    return typeof sha === 'string' && sha !== '' ? sha : null;
  } catch {
    return null;
  }
}

/** ★暫定の語（★デザイナー便の次の回で語を聞く） */
export const STALE_BUILD_TEXT = '新しい版があります。再読み込みしてください';
