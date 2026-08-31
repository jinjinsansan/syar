/**
 * ★R-24: 状態を変えるツールを本番から締め出す構造を、**書式で強制する**メタテスト
 *
 * 【背景】
 *   `verify-a2.mjs` は `delete from races where cycle_index is not null` で
 *   **本番のレースを全件削除**する実装でした。
 *   `verify-a7.mjs` は `app_environment` を 'development' に固定して終わり、
 *   ★**A-7 のガードが正しく働くぶん、確実に本番ワーカーが起動しなくなる**うえ、
 *     **次の再起動まで顕在化しない**ので流した本人が気づけません。
 *
 * 【このテストが保証すること】
 *   1. `tools/*.mjs` は**すべて分類簿に載っている**（新しいツールを黙って足せない）
 *   2. `stateChanging` のものは**必ず `assertNotProduction` を呼んでいる**
 *   3. ガード自体が**4通りすべてで正しく振る舞う**
 *
 *   ★当初これを grep で分類しようとして2回外しました（`grep -P` が使えず全件
 *     「読取専用」／`migrate.mjs` は DDL が .sql 側にあるので誤判定）。
 *     **見た目からは決まらないので、明示した登録簿を検査します。**
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_OPS, READONLY, STATE_CHANGING, allClassified } from '../../../tools/lib/classification.mjs';
import { assertNotProduction } from '../../../tools/lib/guard.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const toolFiles = readdirSync(`${ROOT}tools`).filter((f) => f.endsWith('.mjs'));

/** 最小限の偽クライアント */
const fake = (impl: () => Promise<{ rows: { environment: string }[] }>) =>
  ({ query: impl }) as unknown as Parameters<typeof assertNotProduction>[0];

describe('★R-24 ツールの分類（メタテスト）', () => {
  it('★tools/*.mjs はすべて分類簿に載っている', () => {
    const classified = new Set(allClassified());
    const missing = toolFiles.filter((f) => !classified.has(f));
    expect(
      missing,
      `分類の登録漏れ。tools/lib/classification.mjs の READONLY / STATE_CHANGING / PRODUCTION_OPS のどれかに載せてください:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★分類簿に載っているファイルが実在する（消えたツールが残っていない）', () => {
    const actual = new Set(toolFiles);
    /**
     * ★**`_` 始まり（使い捨ての計測用）はこの検査から外します**（2026-08-27・オーナー判断）。
     *
     * ⚠️ ★`.gitignore:68` が `tools/_*.mjs` を**追跡外**にしているのに、分類簿は追跡されています。
     *    したがって**新規クローンでは登録済みの `_*.mjs` が 1 つも存在せず**、
     *    ★**この検査は綺麗なチェックアウトから通りませんでした**（実測 38 件がゴースト）。
     *    いま通っていたのは、★**作業ツリーにたまたまそのファイルが在るから**にすぎません
     *    （R-28「リポジトリという名のプログラムを測っている」と同じ形）。
     *
     * ★**外して失われるもの**: `_*.mjs` の登録が消えたあとも簿に残り続けます。
     * ★**外しても守られるもの**: 上の検査（作業ツリーにあるのに未登録なら落ちる）はそのまま効くので、
     *   ★**分類されていないツールが混入する経路は閉じたまま**です。R-24 の目的はこちらです。
     */
    const ghosts = allClassified().filter((f) => !f.startsWith('_') && !actual.has(f));
    expect(ghosts, `存在しないファイルが分類簿にあります:\n  ${ghosts.join('\n  ')}`).toEqual([]);
  });

  it('★状態を変えるツールは必ず assertNotProduction を呼ぶ', () => {
    const unguarded = STATE_CHANGING.filter(
      (f) => !readFileSync(`${ROOT}tools/${f}`, 'utf8').includes('assertNotProduction('),
    );
    expect(
      unguarded,
      `本番に向けたら止まる仕掛けがありません:\n  ${unguarded.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★読取専用に分類したものは書き込み文を持たない', () => {
    // ★分類簿が実態とずれていないかを、こちら側からも当てる（R-13 の形）
    //
    // 【2026-08-20: `truncate` を「語」から「文の形」に変えた】
    //   `verify-anon-exposure.mjs` は **「anon に truncate 権限が付いていないか」を検査する**
    //   ツールなので、語としての `truncate` を必然的に含みます（V-20 ①）。
    //   ★語で弾くと、**書き込みを検査するツールが書き込むツールに見えます。**
    //   → `truncate <識別子>` の形だけを書き込み文とみなす。
    //   （他の3つは元から文の形なので変更していません）
    const write = /insert into|update [a-z_]+ set|delete from|truncate\s+(table\s+)?["a-z_]|alter table/i;

    // ★検出器が鈍っていないことを、ここで確かめる（R-14: 検出器は自分自身を検査しない）
    for (const sample of [
      'insert into t values (1)',
      'delete from t where x',
      'update horses set stats = 1',
      'truncate t',
      'truncate table t',
      'alter table t add column c int',
    ]) {
      expect(write.test(sample), `★検出器がこれを見逃します: ${sample}`).toBe(true);
    }

    const lying = READONLY.filter((f) => write.test(readFileSync(`${ROOT}tools/${f}`, 'utf8')));
    expect(lying, `読取専用と分類されているのに書き込み文があります:\n  ${lying.join('\n  ')}`).toEqual([]);
  });

  it('★本番に向けてよいものは理由が書かれている', () => {
    for (const e of PRODUCTION_OPS) {
      expect(e.why.length, `${e.file} の理由が短すぎます`).toBeGreaterThan(20);
    }
  });
});

describe('★R-24 ガード本体（4通り）', () => {
  it('production は拒否する', async () => {
    await expect(
      assertNotProduction(fake(async () => ({ rows: [{ environment: 'production' }] })), 't'),
    ).rejects.toThrow(/production/);
  });

  it('development は通す', async () => {
    await expect(
      assertNotProduction(fake(async () => ({ rows: [{ environment: 'development' }] })), 't'),
    ).resolves.toBe('development');
  });

  it('★宣言が無い DB も拒否する（「宣言が無い＝本番でない」ではない）', async () => {
    await expect(assertNotProduction(fake(async () => ({ rows: [] })), 't')).rejects.toThrow(/宣言がありません/);
  });

  it('★読めなかったときも拒否する（読めない＝本番でない、ではない）', async () => {
    await expect(
      assertNotProduction(
        fake(async () => {
          throw new Error('接続断');
        }),
        't',
      ),
    ).rejects.toThrow(/判断できない/);
  });
});

/**
 * ★**時間の伸縮を組む基準馬を、画面と揃える**（2026-08-28）
 *
 *   ⚠️ ★`knotsFor(boundaries, gate)` は**その馬の節目を実時間へ寄せます**。
 *      ★基準馬が画面（`page.tsx` の `useState(3)`）と違うと、
 *      ★**同じ表示秒が別の瞬間を指します**。
 *   ★実害: `shot-race-at.mjs` が 1 番固定で、★**画面と 2.33 秒**ずれていました。
 *      ★オーナーへ出した静止画を、測定値と秒で照合できませんでした。
 *
 *   ★数え上げは必ず漏れるので（R-29）、**書式で止めます**。
 *   ※ `1` を直接書くのを禁じるだけです。変数名で渡すのは自由です。
 */
describe('★道具の基準馬', () => {
  it('★`knotsFor(..., 1)` を直書きしない', () => {
    const dir = fileURLToPath(new URL('../../../tools/', import.meta.url));
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.mjs')) continue;
      const text = readFileSync(new URL(name, new URL('../../../tools/', import.meta.url)), 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        /** ★注釈行は除く（経緯を書き残せるように） */
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (/knotsFor\([^,)]+,\s*1\s*\)/.test(line)) offenders.push(`${name}:${i + 1}`);
      }
    }
    expect(offenders, '★基準馬は画面と同じ 3 番にすること').toEqual([]);
  });
});

/**
 * ★**測定器の γ の既定を、画面の定数から引かせる**（R-31）
 *
 *   ⚠️ ★数値を直書きすると、★**画面の γ が動いたときに黙ってずれます**。
 *      ★実際 2026-08-28 に γ を 1.6 へ確定した直後、
 *      ★`audit-contest-focus.mjs` が★**「γ=1.00」と印字して測っていました**。
 *   ★`DEMO_CONTEST_GAMMA`（またはそれを入れた別名）だけを許します。
 */
describe('★道具の γ の既定', () => {
  it('★数値やエンジン既定を γ の既定にしない', () => {
    const base = new URL('../../../tools/', import.meta.url);
    const offenders: string[] = [];
    for (const name of readdirSync(fileURLToPath(base))) {
      if (!name.endsWith('.mjs')) continue;
      const text = readFileSync(new URL(name, base), 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        const m = /arg\('gamma',\s*([^)]+)\)/.exec(line);
        if (m === null) continue;
        const v = m[1]!.trim();
        if (v === 'DEMO_CONTEST_GAMMA' || /GAMMA$/.test(v)) continue;
        offenders.push(`${name}:${i + 1}  ${v}`);
      }
    }
    expect(offenders, '★γ の既定は DEMO_CONTEST_GAMMA から引くこと').toEqual([]);
  });
});

/**
 * ★**測定器の台本の既定を、画面の定数から引かせる**（R-31）
 *
 *   ⚠️ ★実際 2026-08-28 に既定を v6 へ切替えた直後、
 *      ★`audit-cut-seam.mjs` が★**`SCREEN_SCRIPT = 'v5'` の直書きで v5 を測って**いました。
 *      ★印字は「（画面既定）」と出ていました。★印字も含めて嘘になります。
 */
describe('★道具の台本の既定', () => {
  it('★台本名を直書きしない', () => {
    const base = new URL('../../../tools/', import.meta.url);
    const offenders: string[] = [];
    for (const name of readdirSync(fileURLToPath(base))) {
      if (!name.endsWith('.mjs')) continue;
      const text = readFileSync(new URL(name, base), 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (/arg\('script',\s*'v[0-9]'\s*\)/.test(line)) offenders.push(`${name}:${i + 1}`);
        if (/SCREEN_SCRIPT\s*=\s*'v[0-9]'/.test(line)) offenders.push(`${name}:${i + 1}`);
      }
    }
    expect(offenders, '★台本の既定は DEFAULT_RACE_SCRIPT から引くこと').toEqual([]);
  });
});

/**
 * ★**同じ量を 2 か所で実装させない**（★D-052 / ★台帳 B-5）
 *
 *   ⚠️ ★この案件だけで **3 件**やりました:
 *     ★① `_gatebias.mjs` に ②b の 2 つ目の実装 → ★200 本 **0.567** 対 既存 2000 本 **0.216**
 *     ★② `_venueverify.mjs` の `spearman` の写し
 *     ★③ `diag-gauge.mjs` の `spearman` の写し（★`lib/v18.mjs` と 1 文字も違わないもの）
 *
 *   ★②③ は「いま同じ」でしたが、★**それは「これからも同じ」ではありません。**
 *     ★片方だけ直した瞬間、★**同じ名前の違う量**が 2 つになります。
 *     ★①は実際にそうなり、★食い違いに気づくまで報告に載りました。
 *
 * ★測り方の実装は `tools/lib/` の 1 か所に置き、★呼ぶ側は**引く**こと。
 */
describe('★測り方の実装を 1 か所に（D-052）', () => {
  /** ★関数名 → ★それを定義してよい唯一のファイル */
  const SINGLE_SOURCE: Record<string, string> = {
    spearman: 'lib/v18.mjs',
  };

  it('★同じ測り方を 2 か所で定義しない', () => {
    const base = new URL('../../../tools/', import.meta.url);
    const offenders: string[] = [];
    /** ★`lib/` も含めて見る。★`_*.mjs`（追跡外）も**あれば**見る — 写しはそこで生えました */
    const scan = (dir: string, prefix: string) => {
      for (const name of readdirSync(fileURLToPath(new URL(dir, base)), { withFileTypes: true })) {
        if (name.isDirectory()) { if (name.name === 'lib') scan(`${dir}lib/`, 'lib/'); continue; }
        if (!name.name.endsWith('.mjs')) continue;
        const rel = `${prefix}${name.name}`;
        const text = readFileSync(new URL(`${dir}${name.name}`, base), 'utf8');
        for (const [fn, home] of Object.entries(SINGLE_SOURCE)) {
          if (rel === home) continue;
          const re = new RegExp(`^\\s*(export\\s+)?function\\s+${fn}\\s*\\(`, 'm');
          const line = text.split('\n').findIndex((l) => re.test(l));
          if (line >= 0) offenders.push(`${rel}:${line + 1}  function ${fn}(  → ★${home} から引くこと`);
        }
      }
    };
    scan('', '');
    expect(
      offenders.join('\n'),
      `★測り方の写しがあります。★tools/lib/ の 1 か所から import してください（D-052 / 台帳 B-5）:\n${offenders.join('\n')}`,
    ).toBe('');
  });

  it('★見張っている関数が、その唯一のファイルに実在する（検査が空振りしていない）', () => {
    const base = new URL('../../../tools/', import.meta.url);
    for (const [fn, home] of Object.entries(SINGLE_SOURCE)) {
      const text = readFileSync(new URL(home, base), 'utf8');
      expect(
        new RegExp(`^\\s*export\\s+function\\s+${fn}\\s*\\(`, 'm').test(text),
        `★${home} に export された ${fn} がありません。★引越したなら SINGLE_SOURCE を直すこと`,
      ).toBe(true);
    }
  });
});
