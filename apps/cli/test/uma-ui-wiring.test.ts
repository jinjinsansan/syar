/**
 * ★**馬物語 UI の配線**（★R-14・2026-09-17・引き渡し資料 §2・§13 の確認リスト）
 *
 * 【★なぜ検査で固定するか】
 *   ★資料 §13 は「実装できたかの確認リスト」を 15 項目挙げています。
 *   ★そのうち ★**機械で確かめられるもの**をここで固定します
 *   （★見た目の良否は確かめられません。★確かめられるものだけを検査にします）。
 *
 * 【★見ている壊れ方】
 *   ① ★**禁止語が増える**（★購入・チャージ・換金・円・課金／★馬券・商品交換）
 *   ② ★**EP と PP を合算した数字**が出る（★憲法 §0.2）
 *   ③ ★**arcade テーマの部品**（`a-*`・`.frame`）を使う（★A-2・テーマが混ざる）
 *   ④ ★**共通ヘッダーが二重**に載る（★A-1・`OWN_HEADER` に入れ忘れる）
 *   ⑤ ★**停止スイッチが無い**画面がある（★資料 §2-9・§5-7）
 *   ⑥ ★EP の副題が ★**オーナー判定 B-3 の文言**でない
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const UMA_DIR = path.join(ROOT, 'apps/web/src/components/uma');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');
/** ★コメントを空白にしてから見る（★註記の語を拾わない） */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

/** ★馬物語 UI のファイルすべて（★増えても自動で対象になる） */
const umaFiles = readdirSync(UMA_DIR).filter((f) => f.endsWith('.tsx'));
const umaCode = umaFiles.map((f) => ({ name: f, code: strip(readFileSync(path.join(UMA_DIR, f), 'utf8')) }));

describe('★馬物語 UI の配線（R-14）', () => {
  it('★前提: 部品が実在する（★空振りしていない）', () => {
    expect(umaFiles.length, '★馬物語 UI のファイルが無い').toBeGreaterThan(0);
    expect(umaFiles).toContain('uma-parts.tsx');
    expect(umaFiles).toContain('uma-top.tsx');
  });

  /**
   * ★**画面の側も見ます**（★部品だけ直して画面が古い、を防ぐ）。
   * ★`data-theme="uma"` を持つ画面は、★この UI の一員として同じ規律に従います。
   */
  /**
   * ★**client の画面**（★停止スイッチを自分で持つ）。
   * ⚠️ ★`odds` は ★**サーバー部品**に変えました（★実データを読むため）。★見せ方は
   *    ★`components/uma/uma-odds-view.tsx`（client）が持ち、★そちらに停止スイッチがあります。
   *    → ★**ここに入れると「停止スイッチが無い」で落ちます**。★別に見ます（下の SERVER_SCREENS）。
   */
  const SCREENS = ['home', 'howto', 'earn', 'watch-race', 'exchange', 'mypage', 'vote', 'train'] as const;
  const screenCode = SCREENS.map((s) => ({ name: s, code: strip(read(`apps/web/src/app/${s}/page.tsx`)) }));
  /** ★**サーバーの画面**（★読み取りだけ・★見せ方は client の部品に渡す） */
  const SERVER_SCREENS = ['odds/page.tsx', 'odds/[id]/page.tsx'] as const;
  const serverCode = SERVER_SCREENS.map((s) => ({ name: s, code: strip(read(`apps/web/src/app/${s}`)) }));

  it('★★サーバーの画面は読むだけ（★`use client` を付けない・§14.3）', () => {
    for (const { name, code } of serverCode) {
      expect(code, `★${name} が client 部品になっている（★サーバーで読めない）`).not.toMatch(/'use client'/);
      /** ★禁止語と arcade の痕跡は、サーバーの画面にも同じ規律 */
      for (const bad of ['購入', 'チャージ', '換金', '課金', '馬券', '商品交換']) {
        expect(code, `★${name} に禁止語「${bad}」`).not.toContain(bad);
      }
    }
    /** ★入口は「次の 1 本」へ送るだけ（★デモの出馬表を持たない） */
    const entry = serverCode[0]!.code;
    expect(entry).toMatch(/redirect\(/);
    expect(entry, '★入口がデモの出馬表を持っている').not.toMatch(/アオバハヤテ|コトブキノホシ/);
  });

  it('★★画面が共通部品を使っている（★各画面で組み直していない・D-052）', () => {
    for (const { name, code } of screenCode) {
      expect(code, `★${name} が uma の部品を使っていない`).toMatch(/from '\.\.\/\.\.\/components\/uma\/uma-parts'/);
      expect(code, `★${name} に停止スイッチが無い`).toMatch(/useMotionPaused/);
      expect(code, `★${name} が uma テーマを宣言していない`).toContain('data-theme="uma"');
      /** ★下端の安全領域（★アプリ化） */
      expect(code, `★${name} に下端 34px の安全領域が無い`).toContain('--u-safe-bottom');
    }
  });

  it('★画面にも禁止語・arcade の痕跡が無い', () => {
    for (const { name, code } of screenCode) {
      for (const bad of ['購入', 'チャージ', '換金', '課金', '馬券', '商品交換']) {
        expect(code, `★${name} に禁止語「${bad}」`).not.toContain(bad);
      }
      expect(code, `★${name} が arcade のトークンを引いている`).not.toMatch(/var\(--a-/);
      expect(code, `★${name} が EP+PP を足している`).not.toMatch(/ep\s*\+\s*pp|pp\s*\+\s*ep/i);
    }
  });

  /**
   * ★**画面が名簿を直書きしていない**（★D-052・R-30）。
   * ⚠️ ★2026-09-17: ★`/train` に 6 メニュー、★`/vote` に 12 行の出馬表、★`/mypage` に 3 頭を
   *    ★**画面へ直書き**していました。★正典 §7.2 の名簿は **8 件**で、★画面だけ別物でした。
   *    → ★**引く形**に直し、★ここで固定します。
   */
  it('★★画面が名簿を直書きしていない（★D-052・二重帳簿にしない）', () => {
    const train = strip(read('apps/web/src/app/train/page.tsx'));
    expect(train, '★調教のメニューを引いていない').toMatch(/TRAINING_MENUS/);
    /** ★正典の名簿に無いメニュー名を画面に書いていない */
    for (const invented of ['馬房で様子見', '軽めの調整']) {
      expect(train, `★正典に無いメニュー名「${invented}」を画面に書いている`).not.toContain(invented);
    }

    const vote = strip(read('apps/web/src/app/vote/page.tsx'));
    expect(vote, '★出馬表を引いていない').toMatch(/DEMO_BET_RACE/);
    expect(vote, '★騎手の名簿を引いていない').toMatch(/JOCKEYS/);
    /** ★自馬の判定は出どころから（★画面で真偽値を作らない・§9.5） */
    expect(vote, '★自馬の枠を引いていない').toMatch(/ownGate/);

    const mypage = strip(read('apps/web/src/app/mypage/page.tsx'));
    expect(mypage, '★厩舎を引いていない').toMatch(/DEMO_HORSES/);
  });

  /**
   * ★**読み取りは「読むだけ」**（★正典 §14.3: Vercel はフロントと読み取り系だけ）。
   * ⚠️ ★画面でオッズや確率を計算すると、★アプリ化で書き直しになります。
   */
  it('★★実データの画面は読むだけ（★計算も判定も持たない・§14.3）', () => {
    const page = strip(read('apps/web/src/app/odds/[id]/page.tsx'));
    /** ★見せ方は client の部品に渡す（★停止スイッチが `useState` を使うため） */
    expect(page).toMatch(/UmaOddsView/);
    /** ★公開ビューから読む（★実体テーブルは anon では読めない） */
    expect(page).toMatch(/races_public/);
    expect(page).toMatch(/race_entries_public/);
    expect(page).toMatch(/race_odds_public/);
    /** ★読み取りの失敗を黙って空にしない（★R-21） */
    expect(page).toMatch(/ReadError/);
    /** ★オッズを画面で作らない（★確率から計算する式を持たない） */
    expect(page, '★画面でオッズを計算している').not.toMatch(/1\s*\/\s*\w*probability|MARGIN|debiased/i);
    /** ★service_role を持ち込まない（★RLS を素通りする） */
    expect(page).not.toContain('service_role');
  });

  it('★★中継のラッパーは race/page.tsx を改造していない（★資料 §4.1）', () => {
    const wrapper = strip(read('apps/web/src/app/watch-race/page.tsx'));
    /**
     * ★入口は `/race` へ送るだけ（★B-2 の既定）。
     * ⚠️ ★2026-09-17: ★送り先に `?return=/home` を足したので、★この行は
     *    ★**`'/race'` の完全一致では落ちます**（★自分の変更で自分の検査を壊しました）。
     *    → ★**前方一致**で見ます。★出口そのものは下の「★中継の出口」で固定します。
     */
    expect(wrapper).toMatch(/'\/race(\?[^']*)?'/);
    /**
     * ★**全画面 API と回転をラッパー側で掛けない**（★`/race` が持っている・A-3）。
     * ★二重に掛けると回転が二重になります。
     */
    expect(wrapper, '★ラッパーが全画面 API を呼んでいる').not.toMatch(/requestFullscreen|webkitRequestFullscreen/);
    expect(wrapper, '★ラッパーが回転を掛けている').not.toMatch(/rotate\(\s*90deg/);
    /** ★16:9 の枠を先に確保している（★映像を引き伸ばさない・資料 §4.4） */
    expect(wrapper).toMatch(/aspectRatio:\s*'16 \/ 9'/);
  });

  /**
   * ★**中継の出口**（★2026-09-17・オーナー指示「★中継の出口も ★ハンドオフ通りにしてください」）。
   *
   * 【★見ている壊れ方】
   *   ① ★案内が ★**戻り先を渡していない** → ★中継の後、★`/race` の中のメニューに ★**取り残されます**
   *   ② ★`/race` 側の ★**名簿に無い**行き先を渡す → ★黙って無視され、★①と同じ姿になります
   *   ③ ★`/` 始まりの検査だけで受ける → ★`//外部の所` が通り、★**開いた転送口**になります
   */
  it('★★中継の出口が案内の戻り先へ送る（★ハンドオフ B-1）', () => {
    const wrapper = strip(read('apps/web/src/app/watch-race/page.tsx'));
    expect(wrapper, '★案内が戻り先を渡していない（★出口がダッシュボードへ向かない）')
      .toContain("'/race?return=/home'");

    const race = strip(read('apps/web/src/app/race/page.tsx'));
    expect(race, '★戻り先の名簿が無い').toMatch(/const RETURN_ROUTES/);
    expect(race, '★名簿に `/home` が無い（★渡しても黙って無視される）').toMatch(/'\/home':/);
    /** ★③ ★**完全一致でだけ**受ける（★前方一致や `startsWith('/')` にしない） */
    expect(race, '★戻り先を完全一致で受けていない（★開いた転送口になる）')
      .toMatch(/hasOwnProperty\.call\(RETURN_ROUTES/);
    /** ★出口のボタンが、★**押されたら戻り先へ送る** */
    expect(race, '★出口が戻り先を見ていない')
      .toMatch(/if \(RETURN_TO !== null\) \{ window\.location\.href = RETURN_TO; return; \}/);
  });

  /**
   * ★**新しいルートへ切り替えた**（★2026-09-17・オーナー指示「★また新ルートに切り替えてください」）。
   *
   * ⚠️ ★旧い画面（`/races`・`/stable`・`/training`・`/records`・`/prizes`）は ★**消していません**。
   *    ★ここで固定するのは「★**新しい画面から旧い道へ落ちない**」ことだけです。
   * ⚠️ ★`/stable/…`・`/records` は ★**詳細**として残しています（★新 UI に対応画面が無い）。
   *    ★だから名簿に入れていません（★入れると今のまま落ちます・★照会 Q-UI-7）。
   */
  it('★★新しい画面が旧いルートへ落ちない（★新ルートへの切り替え）', () => {
    const LEGACY = ['/races', '/training', '/prizes'] as const;
    for (const { name, code } of [...screenCode, ...serverCode]) {
      for (const old of LEGACY) {
        expect(code, `★${name} が旧ルート ${old} を指している`).not.toContain(`href="${old}"`);
        expect(code, `★${name} が旧ルート ${old} を指している`).not.toContain(`Href="${old}"`);
      }
    }
    /**
     * ★旧い画面のナビも新しい入口へ向ける（★旧い画面に着いた人を出す）。
     *
     * 🔴 ★2026-09-17: ★**ナビは 2 つあります。** ★最初 `nav.tsx` だけ見て
     *    ★「★旧い画面からも出られます」と報告しました。★**嘘でした。**
     *    ★旧い画面（`/stable`・`/training`・`/races`・`/records`・`/prizes`・`/login`・
     *    ★`/signup`・`/setup`）が出すのは ★**`story-shell.tsx` の `LINKS`** で、
     *    ★`nav.tsx` の `ArcadeNav` は ★**ほぼ開発用の画面にしか出ません**。
     *    → ★**両方を見ます。** ★片方だけ直すと、この検査が素通りさせます。
     */
    const navs = [
      { name: 'nav.tsx（ArcadeNav）', code: strip(read('apps/web/src/components/nav.tsx')) },
      { name: 'story-shell.tsx（旧い画面の帯）', code: strip(read('apps/web/src/components/story-shell.tsx')) },
    ];
    for (const { name, code } of navs) {
      for (const route of ['/home', '/vote', '/mypage', '/train', '/exchange']) {
        expect(code, `★${name} が ${route} を指していない`).toContain(`href: '${route}'`);
      }
      /** ★中継は ★**案内 1 枚を通す**（★`/race` を直接指すと出口が決まらない・B-1） */
      expect(code, `★${name} が中継の案内を飛ばして \`/race\` を直接指している`)
        .toContain('href="/watch-race"');
    }
  });

  it('① ★禁止語を増やしていない（★購入・チャージ・換金・円・課金／馬券・商品交換）', () => {
    for (const { name, code } of umaCode) {
      for (const bad of ['購入', 'チャージ', '換金', '課金', '馬券', '商品交換']) {
        expect(code, `★${name} に禁止語「${bad}」`).not.toContain(bad);
      }
      /** ★「円」は単語として出さない（★「円形」「楕円」は形の話なので除く） */
      expect(code.replace(/円形|楕円|半円/g, ''), `★${name} に「円」`).not.toContain('円');
    }
  });

  it('② ★EP と PP を合算していない（★憲法 §0.2）', () => {
    for (const { name, code } of umaCode) {
      /** ★足し算・合計の口を作らない */
      expect(code, `★${name} が EP+PP を足している`).not.toMatch(/ep\s*\+\s*pp|pp\s*\+\s*ep/i);
      expect(code, `★${name} に合計の語`).not.toMatch(/合計ポイント|総ポイント|totalPoints/);
    }
    /** ★カプセルは別々の部品（★1 つの部品が両方を受け取る形にしない） */
    const parts = strip(read('apps/web/src/components/uma/uma-parts.tsx'));
    expect(parts).toMatch(/export function EpCapsule/);
    expect(parts).toMatch(/export function PpCapsule/);
    expect(parts, '★1 つの部品が EP と PP を同時に受け取っている').not.toMatch(/function \w+Capsule\([^)]*ep[^)]*pp/i);
  });

  it('③ ★arcade テーマの部品を使っていない（★A-2・テーマを混ぜない）', () => {
    for (const { name, code } of umaCode) {
      expect(code, `★${name} が arcade の class を使っている`).not.toMatch(/className=["'`][^"'`]*\ba-(btn|panel|band|num|chip|lbl)\b/);
      expect(code, `★${name} が .frame を使っている`).not.toMatch(/className=["'`][^"'`]*\bframe\b/);
      /** ★arcade のトークンも引かない（★`--a-` で始まる変数） */
      expect(code, `★${name} が arcade のトークンを引いている`).not.toMatch(/var\(--a-/);
    }
  });

  it('④ ★★共通ヘッダーが二重に載らない（★A-1・`OWN_HEADER` に入れる）', () => {
    const shell = strip(read('apps/web/src/components/story-shell.tsx'));
    /**
     * ★自前の上段バーを持つ画面は、★**すべて** OWN_HEADER 側に入れる。
     * ⚠️ ★2026-09-17: ★`/earn`・`/watch-race` を作ったのに ★**入れ忘れました**
     *    （★報告書には「足した」と書いていました）。→ ★**画面を足したらここも足す**。
     */
    for (const route of ['/home', '/howto', '/earn', '/watch-race', '/odds', '/exchange', '/mypage', '/vote', '/train']) {
      expect(shell, `★${route} が OWN_HEADER に無い（★帯が二重になる）`).toContain(`'${route}'`);
    }
    expect(shell).toMatch(/OWN_HEADER\.includes\(pathname\)/);
  });

  it('⑤ ★停止スイッチが常設されている（★資料 §2-9・§5-7）', () => {
    const parts = strip(read('apps/web/src/components/uma/uma-parts.tsx'));
    expect(parts).toMatch(/export function MotionToggle/);
    expect(parts).toMatch(/export function useMotionPaused/);
    /** ★端末の設定で初期から止まる */
    expect(parts).toContain('prefers-reduced-motion');
    /** ★画面はスイッチを置いている */
    const top = strip(read('apps/web/src/components/uma/uma-top.tsx'));
    expect(top, '★TOP に停止スイッチが無い').toMatch(/MotionToggle/);
  });

  it('⑥ ★EP の副題がオーナー判定 B-3 の文言（★「ゲーム内で使う（無償でのみ受け取れます）」）', () => {
    const parts = read('apps/web/src/components/uma/uma-parts.tsx');
    expect(parts).toContain('ゲーム内で使う（無償でのみ受け取れます）');
  });

  it('★停止しても情報が欠けない（★速度線は 0% から不透明・資料 §5-7 の 4）', () => {
    const css = read('apps/web/src/components/uma/uma-theme.css');
    /** ★`animation-play-state` ではなく `animation:none` で止める（★途中の姿で固まらない） */
    expect(css).toMatch(/animation:\s*none\s*!important/);
    /** ★端末の設定にも従う */
    expect(css).toContain('prefers-reduced-motion');
  });

  it('★既存の「馬券」を画面から消した（★A-4）', () => {
    /**
     * ⚠️ ★**コメントを空白にしてから見ます**（★他の配線検査と同じ作法）。
     *    ★2026-09-17: ★最初これを生の本文で見たところ、
     *    ★**「画面の語を『馬券』から『投票』に統一」と書いた註記そのもの**が当たりました。
     *    ★`entry-freeze.test.ts` で一度踏んだのと同じ形です（★D-108 ③ の家族）。
     */
    const entry = strip(read('apps/web/src/app/entry/page.tsx'));
    expect(entry, '★entry の画面に「馬券」が残っている').not.toContain('馬券');
    expect(entry).toContain('自分の馬が出るレースは投票できません');
  });
});
