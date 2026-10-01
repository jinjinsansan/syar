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
  /** ★2026-09-30 ★極小 → 大（★オーナー「この育成モード画面でも小窓はつけてください」） */
  '/train': 'big',
  '/vote': 'mini',
  /** ★2026-10-01: ★投票の履歴（★一覧を眺める・引き渡し ② §2-3「RaceStrip（big）」）と ★控え 1 枚（★眺めるだけ） */
  '/vote/history': 'big',
  '/vote/history/[betId]': 'big',
  /**
   * ★`/odds` は ★次のレースの `/odds/<id>` へ転送する入口。★見つからないときの 1 枚に ★文字の帯を出す
   *   （★2026-09-29・オーナー「全てのページで小窓を」・レビュー側: ★レースの画面なのに帯が無いのは不自然 → text）。
   */
  '/odds': 'text',
  '/races/[id]': 'text',
  /**
   * ★閉じている画面（★`BET_PAGE_CLOSED`・入口なし）。★2026-09-30 に `/races` を自前の上段バー（OWN_HEADER）にしたので
   *   ★枠が帯を置かなくなった → ★閉じた画面に帯は要らないので hidden（★開けるときに text に戻す）。
   */
  '/races/[id]/bet': 'hidden',
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

/**
 * ★**初回導入（★父母選択・誕生・命名）の間は ★出さない道**（★2026-09-28・デザイナー R-18 回答 🔴 #2・第 1 便の確定）。
 *   ★同じ道でも ★第 2 便（★自分の繁殖牝馬で配合・★その仔の命名）では ★表の値（mini）のまま。
 *   ★導入中かは ★**サーバーの段階**（★`my_onboarding_state` の stage）で決めます（★画面は推測しない・レビュー側の条件）。
 */
/**
 * ★**本編（`/race` の iframe）を帯で流す面**（★2026-09-28・オーナー決裁 ④「本物の映像は /home と観戦の面だけ。他は文字帯＋『観る』リンク」
 *   ・レビュー側の決定「面の条件は この表の 1 か所に持たせる・帯のコードで面を判定しない」）。
 *   ★ここに無い「大」の面は ★簡易版の走行（side-v8・約 450KB）。★「極小」「文字」は ★本編を読まない。
 *   ⚠️ ★一度 ★「大」の 10 面すべてと「極小」でも本編（1 レース 約 4MB）を読む形にしていた（★決裁と食い違い・レビュー側が原文で指摘）。
 */
/**
 * ★**2026-09-29 に広げた**（★オーナー「他の全てのページでも小窓を」「発走時刻に 小窓も本格的な画面も 両方とも同じものが流れないとおかしい」
 *   ・レビュー側が受理）。★決裁 ④（本編は /home と観戦だけ）を ★オーナー自身が差し替えた。
 *   → ★「大」の面は ★すべて本編（★同じ時計・同じ場面）。★簡易版の走行（side-v8）は ★どの面でも出さない（★中身が面ごとに違う歪みを無くす）。
 *   ★「極小」「文字」は ★本編を読まない（★フォームの画面の邪魔をしない・文字の帯だけ）。
 */
export const STRIP_EMBED_ROUTES: readonly string[] = Object.entries(STRIP_SIZE_BY_ROUTE)
  .filter(([, size]) => size === 'big').map(([route]) => route);

/**
 * ★**PC（幅 1024px 以上）で「大型ビジョン」にする「極小」の面**（★2026-10-01・デザイナー引き渡し「PC 表示 大型ビジョン案 2a」§1-4・§1-6）。
 *   ★PC では ★ビジョンが画面の右上に立つので ★フォームの邪魔をしない。★見本は投票モード（`PcAlt screen="vote"`）と ★馬市場（§1-6）。
 *   ★スマホ（1024px 未満）は ★表の値のまま（★「極小」）。
 *   ⚠️ ★ここに無い「極小」の面（★出走登録・配合・命名・仔馬・役割）は ★PC でも「極小」（★画面が自分の枠の中に帯を置いている）。
 *   🔴 ★ビジョンは ★「大」と同じ本編を流す（★オーナー決定: 小窓・ビジョン・全画面は ★同じ物）。★別の録画・別のレースは出さない。
 */
export const PC_VISION_ROUTES: readonly string[] = ['/vote', '/stable/market'];

/** ★PC の幅か（★画面の幅の判定は 1 か所・`race-strip.tsx` が `matchMedia` で渡す） */
export interface StripWidth {
  /** ★幅 1024px 以上（★`(min-width: 1024px)`） */
  readonly wide?: boolean;
}

/** ★この面の帯で 本編を流すか（★表が正本） */
export function stripEmbedsOn(pathname: string, opts: StripWidth = {}): boolean {
  const key = routeKeyOf(pathname);
  if (key !== null && opts.wide === true && PC_VISION_ROUTES.includes(key)) return true;
  return key !== null && STRIP_EMBED_ROUTES.includes(key) && STRIP_SIZE_BY_ROUTE[key] === 'big';
}

export const HIDDEN_DURING_INTRO: readonly string[] = ['/stable/foal', '/stable/name'];
/** ★導入中の段階（★移行 `0067` の stage の語）。★`ready` `legacy` は導入を終えた（★または導入の無い）口座 */
export const INTRO_STAGES: readonly string[] = ['choose_parents', 'waiting_birth', 'naming'];

/**
 * ★表に無い画面は `hidden`（★載せ忘れた画面に ★黙って帯を出さない）。
 * ★`intro` … ★導入中か（★サーバーの段階から）。★**分からない間（null）は ★導入の道では出さない**
 *   （★読み終わる前に 帯が一瞬 出て消えるのを避ける・★導入中に出すほうが 誤り）。
 */
export function stripSizeOf(pathname: string, opts: { readonly intro: boolean | null } & StripWidth = { intro: null }): StripSize {
  const key = routeKeyOf(pathname);
  if (key === null) return 'hidden';
  if (HIDDEN_DURING_INTRO.includes(key) && opts.intro !== false) return 'hidden';
  /** ★PC では ★ビジョンの面の「極小」を「大」に（★上の `PC_VISION_ROUTES`） */
  if (opts.wide === true && PC_VISION_ROUTES.includes(key) && STRIP_SIZE_BY_ROUTE[key] === 'mini') return 'big';
  return STRIP_SIZE_BY_ROUTE[key]!;
}

/**
 * ★**PC の「大型ビジョン」で出すか**（★幅 1024px 以上 ＆ ★「大」になる面）。
 *   ★「文字」（★出馬表・そのレースの画面）は ★ビジョンにしない（★「出馬表と走行を同時に出さない」§3）。
 */
export function stripVisionOn(pathname: string, opts: { readonly intro: boolean | null } & StripWidth): boolean {
  return opts.wide === true && stripSizeOf(pathname, opts) === 'big';
}

/**
 * ★**小窓テレビの形**（★2026-10-01・デザイナー引き渡し R-28 README §2）。★帯は ★面を自分で判定しない（★この表が正本）。
 *   ★`pc` … PC の大型ビジョン（★`stripVisionOn` と同じ面）
 *   ★`full` … スマホの 幅いっぱいの 16:9（★ホームと同じ大きさ）
 *   ★`null` … テレビを出さない（★`hidden` の面・★PC で ビジョンでない面）
 *   🔴 ★2026-10-01 オーナー「全てのページで小窓が見れて、なおかつ同じサイズに」→ ★スマホは `hidden` 以外 すべて `full`
 *     （★旧: ホームだけ `full`・ほかは S 型 160×90・★`text` の面は テレビなし）。
 */
export function stripTvModeOf(pathname: string, opts: { readonly intro: boolean | null } & StripWidth): 'pc' | 'full' | null {
  if (stripVisionOn(pathname, opts)) return 'pc';
  if (opts.wide === true) return null;
  return stripSizeOf(pathname, opts) === 'hidden' ? null : 'full';
}
