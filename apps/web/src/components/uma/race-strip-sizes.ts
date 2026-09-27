/**
 * ★**常設レース表示の ★画面ごとの大きさ**（★正本・2026-09-27）
 *
 * ★出どころ: ★確定仕様 `RACE_NOTICE_HANDOFF.md` §3（★画面ごとのサイズ対応表）・★裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` ⑤
 *
 * 🔴 ★**この表が正本、画面が従**です。
 *   ★`RaceStrip` は ★`compact` のような引数を ★**受け取りません**。★自分の居る画面をこの表で引いて大きさを決めます。
 *   ★網 `apps/cli/test/race-strip-sizes.test.ts` が ★**この表と画面を突き合わせます**:
 *     ★表で出す画面が ★帯を置き忘れていない／★表で出さない（`hidden`）画面・★表に無い画面が ★帯を置いていない。
 *
 * ★大きさ（★§2）:
 *   `big`    … ★「大」150px（★一覧・閲覧の画面）。★レース中は走行を大きく出す
 *   `mini`   … ★「極小」22×16px（★フォームの画面）。★自動では大きくしない
 *   `text`   … ★**走行を出さない**（★出馬表・★そのレース自身の画面。★「出馬表と走行を同時に出さない」）
 *   `hidden` … ★出さない（★ログイン・登録・初回設定・TOP。★§3 の理由: 指す対象が無い・1 操作に集中）
 *
 * ★新しい画面が増えたら（★§3 の判定基準）: ★主な操作が ★**フォーム入力**なら `mini`、★**一覧を眺めるだけ**なら `big`。
 *   ★決めたら ★**ここに足す**（★足さないと網が落ちます）。
 * ⚠️ ★開発用の画面（★`middleware.ts` の `DEV_ONLY_ROUTES`／★自分で `notFound()` する画面・★どちらも本番は 404）は ★載せません。
 */
export type StripSize = 'big' | 'mini' | 'text' | 'hidden';

export const STRIP_SIZE_BY_ROUTE: Readonly<Record<string, StripSize>> = {
  /** ★§3 に名前のある画面 */
  '/home': 'big',
  '/mypage': 'big',
  '/train': 'mini',
  '/training': 'mini',
  '/vote': 'mini',
  /** ★`/odds` は ★次のレースの `/odds/<id>` へ転送するだけの入口（★見つからないときの 1 行だけ・帯は出さない） */
  '/odds': 'hidden',
  '/races/[id]': 'text',
  '/races/[id]/bet': 'text',
  '/odds/[id]': 'text',
  '/exchange': 'big',
  '/howto': 'big',
  '/earn': 'big',
  '/login': 'hidden',
  '/signup': 'hidden',
  '/setup': 'hidden',
  '/forgot-password': 'hidden',
  '/reset-password': 'hidden',
  '/': 'hidden',
  /** ★§3 に名前の無い画面（★判定基準で決めた・2026-09-27） */
  '/records': 'big',
  '/stable': 'big',
  '/stable/[horseId]': 'big',
  '/stable/retired': 'big',
  '/watch-race': 'big',
  '/entry': 'mini',
  '/stable/market': 'mini',
  '/stable/breed': 'mini',
  '/stable/name': 'mini',
  '/stable/foal': 'mini',
  '/stable/roles': 'mini',
  /** ★全画面の本編そのもの（★帯を重ねない） */
  '/race': 'hidden',
};

/** ★表の鍵（`/races/[id]`）に ★実際の道（`/races/abc`）を当てる。★`[x]` は 1 区切りに当たる */
export function routeKeyOf(pathname: string): string | null {
  const clean = pathname.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  if (clean in STRIP_SIZE_BY_ROUTE) return clean;
  const parts = clean.split('/');
  for (const key of Object.keys(STRIP_SIZE_BY_ROUTE)) {
    const pattern = key.split('/');
    if (pattern.length !== parts.length) continue;
    if (pattern.every((seg, i) => (seg.startsWith('[') && seg.endsWith(']') ? parts[i] !== '' : seg === parts[i]))) return key;
  }
  return null;
}

/** ★表に無い画面は `hidden`（★載せ忘れた画面に ★黙って帯を出さない） */
export function stripSizeOf(pathname: string): StripSize {
  const key = routeKeyOf(pathname);
  return key === null ? 'hidden' : STRIP_SIZE_BY_ROUTE[key]!;
}
