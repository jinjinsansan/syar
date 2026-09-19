/**
 * ★**systemd の unit は 1 本だけ**（★**WK-5**・★D-052・2026-09-19）
 *
 * 【🔴 ★なぜ要るか — ★写しが 7 分の停止を待ち構えていました】
 *   ★リポジトリに unit が **2 本**ありました:
 *     ✅ `tools/star-worker.service` … ★いまの形（`/opt/star-current/dist/worker.cjs`・素の node）
 *     🔴 `deploy/star-worker.service` … ★**2026-08-09 に 7 分停止を起こした形**
 *          （`ExecStart=/opt/star/node_modules/.bin/tsx apps/worker/src/main.ts`）
 *
 *   🔴 ★そして ★**`deploy/README.md` §5 が、壊れているほうを入れろと書いていました**:
 *     `sudo install -m 644 /opt/star/deploy/star-worker.service /etc/systemd/system/`
 *   → ★手順どおりにやると ★**`npm ci --omit=dev` が `tsx` を消した瞬間に 203/EXEC**（★D-043）。
 *
 *   ⚠️ 🔴 ★**2026-09-14 の監査が既に指摘していました**（`REPORT_AUDIT_20260914.md:127`）。
 *      ★**5 日 直っていませんでした。** ★**「指摘されたのに直っていない」が 2 度目**です
 *      （★CLAUDE.md が「Render の記述」でまったく同じことを書いています）。
 *
 * 【★この検査が守ること】
 *   ★① ★**unit は 1 本だけ**（★写しが復活したら落ちる）
 *   ★② ★**古い起動の形**（`tsx` / `/opt/star` 直下）を持たない
 *   ★③ ★**手順書が、その 1 本を指している**（★別のものを install しろと書かない）
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
/**
 * ⚠️ ★**区切りを `/` に揃えてから外します**（★Windows は `\`）。
 *    ★`tmp/` は gitignore の作業場で、★**版管理の対象ではありません**
 *    （★2026-09-19 に `tmp/es-before/` の写し 2 本を拾って落ちました）。
 */
const units = globSync('**/*.service', { cwd: ROOT })
  .map((p) => p.split(path.sep).join('/'))
  .filter((p) => !/^tmp\/|\/tmp\/|node_modules|(^|\/)\.tmp-/.test(p))
  .sort();

describe('WK-5 systemd の unit は 1 本だけ', () => {
  it('★走査が空振りしていない（★0 件を「該当なし」と読まない・R-21）', () => {
    expect(units.length, '★`.service` が 1 本も見つからない（★走査が壊れている）').toBeGreaterThan(0);
  });

  it('① 🔴 ★★unit は 1 本だけ（★写しを作らない・D-052）', () => {
    expect(units, `🔴 ★unit が ${units.length} 本あります: ${units.join(' / ')}`).toEqual(['tools/star-worker.service']);
  });

  it('② 🔴 ★★古い起動の形を持たない（★7 分停止の形・D-043）', () => {
    const src = readFileSync(path.join(ROOT, 'tools/star-worker.service'), 'utf8');
    const exec = src.split('\n').find((l) => l.startsWith('ExecStart='));
    expect(exec, '★`ExecStart` がありません').toBeDefined();
    /** 🔴 ★実行時に開発依存（`tsx`）を要求しない */
    expect(exec, '🔴 ★`tsx` で原本を起動している（★`npm ci --omit=dev` で 203/EXEC・D-043）')
      .not.toContain('tsx');
    expect(exec, '🔴 ★`node_modules` に依存している').not.toContain('node_modules');
    /** ★素の node が、バンドル 1 ファイルを起動する */
    expect(exec).toContain('/usr/bin/node');
    expect(exec).toContain('dist/worker.cjs');
    /** 🔴 ★`/opt/star-current`（symlink）を指す。★`/opt/star` 直下ではない */
    expect(exec, '🔴 ★`/opt/star` 直下を指している（★木を置き換える配備に逆戻り）')
      .toContain('/opt/star-current/');
    const wd = src.split('\n').find((l) => l.startsWith('WorkingDirectory='));
    expect(wd, '🔴 ★`WorkingDirectory` が `/opt/star-current` でない').toBe('WorkingDirectory=/opt/star-current');
  });

  it('★1 周の長さより短い `TimeoutStopSec` にしない（★毎回 SIGKILL になる）', () => {
    const src = readFileSync(path.join(ROOT, 'tools/star-worker.service'), 'utf8');
    const m = /TimeoutStopSec=(\d+)/.exec(src);
    expect(m, '★`TimeoutStopSec` がありません').not.toBeNull();
    /** ★D-035 で 1 周が最大 275 秒。★90 秒のままだと毎回 SIGKILL で落とすことになる */
    expect(Number(m![1]), '★1 周（最大 275 秒）を下回っています').toBeGreaterThanOrEqual(275);
  });

  it('★`StartLimit*` が `[Unit]` にある（★`[Service]` に書くと無視される）', () => {
    const src = readFileSync(path.join(ROOT, 'tools/star-worker.service'), 'utf8');
    /**
     * ⚠️ 🔴 ★**節の見出しは行頭で探します**（★2026-09-19 にここで落ちました）。
     *    ★`indexOf('[Service]')` は ★**註記の中の「`[Service]` に書くと無視される」**に当たり、
     *    ★節より手前の位置を返しました。★**註記が検査を狂わせた**形です。
     */
    const headAt = (name: string): number => {
      const m = new RegExp(`^\\[${name}\\]$`, 'm').exec(src);
      return m === null ? -1 : m.index;
    };
    const unitAt = headAt('Unit');
    const serviceAt = headAt('Service');
    const limitAt = src.indexOf('StartLimitIntervalSec=');
    expect(unitAt).toBeGreaterThan(-1);
    expect(serviceAt).toBeGreaterThan(unitAt);
    expect(limitAt, '★`StartLimitIntervalSec` がありません').toBeGreaterThan(-1);
    expect(limitAt, '🔴 ★`StartLimit*` が `[Service]` にある（★systemd に無視される）')
      .toBeLessThan(serviceAt);
  });

  it('③ 🔴 ★★手順書が、その 1 本を指している（★別のものを install しろと書かない）', () => {
    const readme = readFileSync(path.join(ROOT, 'deploy/README.md'), 'utf8');
    const installs = [...readme.matchAll(/install[^\n]*?([\w./-]*\.service)/g)].map((x) => x[1]!);
    expect(installs.length, '★手順書に install の行がありません（★走査が空振り）').toBeGreaterThan(0);
    for (const i of installs) {
      expect(i, `🔴 ★手順書が ${i} を入れろと書いています（★unit は tools/ の 1 本だけ）`)
        .toContain('tools/star-worker.service');
    }
  });

  it('🔴 ★手順書が「Render」を配備先として書いていない（★2026-09-14 の監査・CLAUDE.md）', () => {
    const readme = readFileSync(path.join(ROOT, 'deploy/README.md'), 'utf8');
    /**
     * ⚠️ ★語そのものを禁じません — ★「Render は誤り」と**書くため**には語が要ります。
     *    ★見るのは ★**訂正が添えられているか**です。
     */
    if (readme.includes('Render')) {
      expect(readme, '🔴 ★「Render」と書いてあるのに、誤りだと添えていない').toMatch(/Render.{0,200}誤り|誤り.{0,200}Render/s);
    }
  });
});
