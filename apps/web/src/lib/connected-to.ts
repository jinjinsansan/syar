/**
 * ★**いまどこに繋いでいるかを、目で見える形にする**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §14）
 *
 * 【🔴 ★なぜ要るか】
 *   ★この PC の開発サーバーは、★**本番の DB に繋がっていました**（`apps/web/.env.local` が production）。
 *   ★オーナーに「staging で触ってください」と渡すとき、★**取り違えたら本番を書き換えます**。
 *   ★記憶にある「`loadEnv()` の既定は本番」と同じ族の事故です。
 *
 * 【★この層の約束】
 *   🔴 ★**書き換えた値を印刷しません。** ★`STAR_ENV=staging` のような ★**人が置いた名札**ではなく、
 *      ★**実際にクライアントが繋ぐ URL**（`NEXT_PUBLIC_SUPABASE_URL`）から出します。
 *      ★名札を印刷すると、★**名札だけ直して中身が本番のまま**という事故を見逃します。
 *   🔴 ★**本番の配信では出しません**（★`NODE_ENV === 'production'` のとき）。
 *
 * ⚠️ ★ここで「production / staging」と**言い当てません**。★どちらが本番かを知るには、
 *    ★本番のホスト名をこの層に書く必要があり、★それは「名札」と同じ弱さになります。
 *    → ★**実際のホストをそのまま出します。** ★人が見て確かめられれば足ります。
 */

/** ★繋ぎ先（★画面と起動時の出力で同じものを使う） */
export interface ConnectedTo {
  /** ★実際に繋ぐホスト（★`NEXT_PUBLIC_SUPABASE_URL` の host）。★読めなければ `null` */
  readonly host: string | null;
  /** ★プロジェクトの識別子（★host の最初の札。★短く出すため） */
  readonly ref: string | null;
}

/**
 * ★**URL から繋ぎ先を取り出す**（★純関数・★検査できる形）。
 * ⚠️ ★URL が壊れていても投げません（★帯を出すためだけに画面を落とさない）。
 */
export function connectedToOf(url: string | undefined | null): ConnectedTo {
  if (url === undefined || url === null || url === '') return { host: null, ref: null };
  try {
    const host = new URL(url).host;
    const ref = host.split('.')[0] ?? null;
    return { host, ref: ref === '' ? null : ref };
  } catch {
    return { host: null, ref: null };
  }
}

/**
 * ★**いまの繋ぎ先**（★クライアントが実際に使う環境変数から）。
 * ⚠️ ★`supabase.ts` が読むのと ★**同じ名前**を読むこと。★別の名前にすると、
 *    ★帯が指す先と実際の繋ぎ先がずれます。
 */
export function connectedTo(): ConnectedTo {
  return connectedToOf(process.env['NEXT_PUBLIC_SUPABASE_URL']);
}

/**
 * ★**帯を出すか**。★本番の配信では出しません。
 * ⚠️ ★`NODE_ENV` は Next.js が決めます（`next dev` なら `development`・`next build` なら `production`）。
 *    ★人が置く値ではないので、★**名札より強い**判断材料です。
 */
export function showConnectedBanner(): boolean {
  return process.env.NODE_ENV !== 'production';
}
