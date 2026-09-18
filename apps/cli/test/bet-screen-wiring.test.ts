/**
 * ★**投票の結線**（★UI-2・2026-09-19）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**画面が上限・控除率・§9.5 の判定を持つ**（★`place_bet` が持っています。★持つと二重帳簿）
 *   ② 🔴 ★**画面がオッズを計算する**（★モンテカルロはサーバー・§9.2）
 *   ③ 🔴 ★**失敗を握り潰す**（★上限に当たったことが分からなくなる・R-16）
 *   ④ 🔴 ★**冪等キーを送るたびに作り直す**（★2 回目も通る）
 *
 * ⚠️ ★**見た目は見ません**（★UI1-8 と同じ扱い）。★「あるか無いか」だけです。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { oddsKey, readBetError } from '../../web/src/lib/bet-screen.js';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/races/[id]/bet/page.tsx'), 'utf8');
const SCREEN = readFileSync(path.join(ROOT, 'apps/web/src/lib/bet-screen.ts'), 'utf8');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const LIVE_PAGE = strip(PAGE);
const LIVE_SCREEN = strip(SCREEN);

/** ★`place_bet` の最後の定義（★`0002` → `0020` → `0024` と重なっている） */
function lastPlaceBet(): { file: string; body: string } {
  const dir = path.join(ROOT, 'db/migrations');
  let found: { file: string; body: string } | null = null;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?place_bet\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const next = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
      found = { file, body: next === -1 ? rest : rest.slice(0, next + 1) };
    }
  }
  if (found === null) throw new Error('★place_bet の定義がありません（★走査が空・R-21）');
  return found;
}

describe('★① 判定はサーバーが持つ（★画面が持たない）', () => {
  const { body } = lastPlaceBet();
  const rpc = body.replace(/--[^\n]*/g, ' ');

  it('★判定はサーバーが持っている（★走査が空振りしていない・R-21）', () => {
    /**
     * 🔴 ★**2026-09-19・BT-1/BT-2 で上限の場所が変わりました**。
     *   ★旧: `place_bet` が 4 つの数を SQL に直書き。
     *   ★新: ★**数は `bet_limits`、規則は `bet_allowance()`**。★`place_bet` はそれを呼ぶ。
     * ⚠️ ★この検査は「画面が持っていないこと」を見るのが仕事です。
     *    ★上限そのものの置き場は `bet-limits.test.ts` が見ます。
     */
    expect(rpc, '★bet_allowance を呼んでいない').toMatch(/bet_allowance\(/);
    expect(rpc, '★自馬のレースの判定が無い').toMatch(/自馬/);
  });

  it('🔴 ★画面が上限の数を持っていない', () => {
    /**
     * ⚠️ ★**数のリテラルでは見ません**（★`30000` は他の所にも出ます）。
     *    ★**「上限を判定しているか」**を見ます — ★画面に `>` の比較があってはいけません。
     */
    for (const cap of ['30000', '50000', '500000']) {
      expect(LIVE_PAGE, `★画面が上限を持っている: ${cap}`).not.toContain(cap);
      expect(LIVE_SCREEN, `★変換の層が上限を持っている: ${cap}`).not.toContain(cap);
    }
  });

  it('🔴 ★画面が控除率を持っていない（★§9.3・払戻はサーバー）', () => {
    for (const bad of ['0.8', '0.75', 'takeout', '控除']) {
      expect(LIVE_SCREEN, `★変換の層が控除率を持っている: ${bad}`).not.toContain(bad);
    }
  });
});

describe('★② オッズを画面で計算しない（§9.2）', () => {
  it('🔴 ★`race_odds_public` を読むだけ', () => {
    expect(LIVE_SCREEN, '★オッズの公開ビューを読んでいない').toContain('race_odds_public');
    for (const bad of ['montecarlo', 'MC_TRIALS', 'Math.random', 'winRate']) {
      expect(LIVE_SCREEN, `★画面側で計算しようとしている: ${bad}`).not.toContain(bad);
    }
  });

  it('★鍵は券種と選択の組（★`race_odds` の一意の組と同じ形）', () => {
    expect(oddsKey('win', [7])).toBe('win:[7]');
    expect(oddsKey('trifecta', [7, 3, 4])).toBe('trifecta:[7,3,4]');
    /** ★順序が違えば別の買い目（★三連単） */
    expect(oddsKey('trifecta', [3, 7, 4])).not.toBe(oddsKey('trifecta', [7, 3, 4]));
  });
});

describe('★③ 失敗を握り潰さない（R-27・UI1-9）', () => {
  it('★EP 不足は言い換え、それ以外は原文のまま', () => {
    expect(readBetError({ code: 'ST001', message: 'EP が不足している（残高 100 / 必要 200）' }).kind)
      .toBe('insufficient_ep');
    const other = readBetError({ code: 'P0001', message: '1レース1種の上限（30,000 EP）を超える' });
    expect(other.kind).toBe('other');
    expect(other.message, '★原文を変えている').toBe('1レース1種の上限（30,000 EP）を超える');
    expect(readBetError(null).message.length, '★理由が無くても無言にしない').toBeGreaterThan(0);
  });

  it('🔴 ★画面が失敗を受け取って出している', () => {
    /** ⚠️ ★「名前がどこかにある」では足りない（★2026-09-19 に変異で確かめた形） */
    expect(LIVE_PAGE, '★RPC の失敗を受け取っていない').toMatch(/setBetError\(r\.failure\.message\)/);
    expect(LIVE_PAGE, '★失敗を画面に出していない').toMatch(/betError\s*!==\s*null/);
    expect(LIVE_PAGE, '★原文を出していない').toMatch(/\{betError\}/);
    /** ★読み込みの失敗も別に出す */
    expect(LIVE_PAGE, '★読み込みの失敗を受け取っていない').toMatch(/\.catch\([\s\S]{0,160}setLoadError/);
  });
});

describe('★④ 冪等キー（V-19 ⑭ と同じ形）', () => {
  it('🔴 ★送るたびに作り直していない（★1 回作って持ち続ける）', () => {
    expect(LIVE_PAGE, '★状態として持っていない').toMatch(/useState\(\(\) => crypto\.randomUUID\(\)\)/);
    /** ★`placeBet` の引数に、その場で作った値を渡していない */
    expect(LIVE_PAGE, '★呼び出しの中で作り直している').not.toMatch(/clientToken:\s*crypto\.randomUUID\(\)/);
  });

  it('★1 回通ったら、次の投票用に新しい鍵を作る（★連続して買える）', () => {
    /** ⚠️ ★作り直さないと ★**2 回目が「再送」と見なされて通りません** */
    expect(LIVE_PAGE, '★成功の後に鍵を更新していない').toMatch(/setClientToken\(crypto\.randomUUID\(\)\)/);
  });
});

describe('★自馬のレース（§9.5）', () => {
  it('🔴 ★画面は「どれが自分の馬か」を見せるだけ（★判定は RPC）', () => {
    /**
     * ⚠️ ★画面が `ownGates` を使うのは ★**印を付けるため**で、
     *    ★**買えるかどうかの最終判定は `place_bet`** です。
     * 🔴 ★**2026-09-19・BT-3 で馬名の突き合わせをやめました**。
     *    ★`horses.name` に★**一意制約はありません**（★開発側が確かめずに「一意」と書いていました）。
     *    → ★いまは ★**`race_entries_public.is_mine`**（★サーバーが `auth.uid()` で判定）を読みます。
     */
    expect(LIVE_SCREEN).toContain('ownGates');
    expect(LIVE_SCREEN, '★画面側で §9.5 を判定している').not.toMatch(/9\.5[\s\S]{0,40}return false/);
  });
});
