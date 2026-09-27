/**
 * 🔴 ★**利用者の画面は ★見本（`DEMO_*`）を読まない**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md` P0-B）
 *
 * 【🔴 ★何が起きていたか】
 *   ★スマホ幅（`show-narrow`・900px 以下）でだけ出る ★`components/horse-resume.tsx` が、
 *   ★**自分の馬の画面に** ★見本の個性・主戦騎手・生涯のピーク・物語・産駒を ★条件なしで出していました。
 *   ★PC 幅では出ないので ★**PC で見ていると気づけない**形でした。
 *   → ★この網は ★**原文**を見るので ★画面の幅に左右されません（★「幅で出る/出ないが変わる部品は狭い幅でも検査する」の機械の側）。
 *
 * 【★見るもの】
 *   ★`apps/web/src/app` と `apps/web/src/components` の `.tsx` を ★註記を除いて読み、★`DEMO_` で始まる名前を探します。
 *   ★いま残っているものは ★`KNOWN` に ★**理由と消す条件**つきで載せます（★黙って増やさない・★古びた登録も落とす）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(__dirname, '../../web/src');

/** ★註記を空白にする（★註記の中の `DEMO_` で判定しない） */
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));

/** ★`DEMO_` の名前（★重複を除いて並べる） */
export function demoNamesOf(src: string): string[] {
  return [...new Set(strip(src).match(/\bDEMO_[A-Z0-9_]+\b/g) ?? [])].sort();
}

/**
 * ★いま残っている見本（★理由と消す条件）。★**ここに無い `DEMO_*` が画面に出たら落ちます**。
 */
const KNOWN: Readonly<Record<string, { readonly names: readonly string[]; readonly why: string }>> = {
  'app/race/page.tsx': {
    names: ['DEMO_COATS', 'DEMO_CONTEST_GAMMA', 'DEMO_WIN_ODDS'],
    why: '★見本の道（`?venue=`）だけで使う（★`venuePageSetup()`）。★実レース（`?race=`）は通らない（★網 `built-course-fields` / `coat-single-source`）。'
      + '★消す条件: ★見本の道が無くなった日',
  },
  'app/odds/[id]/page.tsx': {
    names: ['DEMO_ODDS_RACE'],
    why: '★`?demo=1` のときだけ（★オーナー指示「ログインなしで見られるように」）。★実データの経路の手前で打ち切る。★消す条件: ★`?demo=1` をやめた日',
  },
  'app/races/[id]/bet/page.tsx': {
    names: ['DEMO_BET_RACE'],
    why: '🔴 ★この口は閉じている（★`BET_PAGE_CLOSED`・P0-A）。★送らないので EP は動かない。★消す条件: ★残すか `/vote` に畳むかのオーナー判断が出た日',
  },
  'app/entry/page.tsx': {
    names: ['DEMO_JOCKEY_RIDES'],
    why: '⚠️ ★騎手の騎乗回数（親密度）が見本（★裁定 P1-5）。★`race_entries.jockey_frozen` を数える口が無い。★消す条件: ★騎乗回数をサーバーが返す口ができた日',
  },
  'app/training/page.tsx': {
    names: ['DEMO_HORSES', 'DEMO_JITTERS', 'DEMO_TRAINING_ABILITY'],
    why: '⚠️ ★旧 `/training`（★裁定 P1-1 / P1-7）。★読み取り失敗の側に見本が残る疑い。★消す条件: ★`/train` に書き口を付けて `/training` を畳んだ日',
  },
};

const files = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.tsx')) out.push(full);
    }
  };
  walk(path.join(WEB, 'app'));
  walk(path.join(WEB, 'components'));
  return out;
};
const rel = (f: string): string => path.relative(WEB, f).split(path.sep).join('/');

describe('🔴 ★利用者の画面は 見本（DEMO_*）を読まない', () => {
  it('★網が空振りしていない（★対照）', () => {
    expect(files().length).toBeGreaterThan(50);
    expect(demoNamesOf("import { DEMO_X } from 'a';\nconst y = DEMO_Y;")).toEqual(['DEMO_X', 'DEMO_Y']);
    expect(demoNamesOf('/** DEMO_IN_COMMENT */\n// DEMO_LINE\nconst url = "https://a/DEMO";'), '★註記の中を数えている').toEqual([]);
  });

  /** 🔴 ★P0-B の本体: ★スマホ幅の馬詳細は ★見本を 1 つも読まない */
  it('🔴 ★P0-B: horse-resume は DEMO_* を 1 つも読まない', () => {
    const src = readFileSync(path.join(WEB, 'components/horse-resume.tsx'), 'utf8');
    expect(demoNamesOf(src), '🔴 ★スマホ幅の馬詳細が ★見本を自分の馬の欄として出しています').toEqual([]);
  });

  it('🔴 ★登録に無い DEMO_* を読む画面が無い（★黙って増やさない）', () => {
    const bad: string[] = [];
    for (const f of files()) {
      const names = demoNamesOf(readFileSync(f, 'utf8'));
      if (names.length === 0) continue;
      const allowed = KNOWN[rel(f)]?.names ?? [];
      const extra = names.filter((n) => !allowed.includes(n));
      if (extra.length > 0) bad.push(`${rel(f)}: ${extra.join(' ')}`);
    }
    expect(bad, '🔴 ★利用者の画面が ★見本を読んでいます。★実データを渡すか、★渡せない欄は出さない（★見本で埋めない）').toEqual([]);
  });

  it('★古びた登録が残っていない（★登録が次の見本を隠さない）', () => {
    const stale: string[] = [];
    for (const [file, { names }] of Object.entries(KNOWN)) {
      const now = demoNamesOf(readFileSync(path.join(WEB, file), 'utf8'));
      const gone = names.filter((n) => !now.includes(n));
      if (gone.length > 0) stale.push(`${file}: ${gone.join(' ')}（★もう読んでいない・★登録から消す）`);
    }
    expect(stale).toEqual([]);
  });
});
