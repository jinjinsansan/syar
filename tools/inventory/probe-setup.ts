/**
 * N-2 / R-10: テスト棚卸しを「実行時計測」で出すための vitest セットアップ。
 *
 * 【なぜ静的検索ではダメか】
 *   以前の棚卸しは `it(...)` の本体を正規表現で見て「経路を通っているか」を数えていた。
 *   これは (a) ヘルパ経由の呼び出しを見落とし、(b) コメント中の語を誤検出するため、
 *   **どちらの方向にずれるか予測できない**（N-2 で実際に 46% → 49.5% と逆方向にずれた）。
 *   R-10「数える成果物は実行時計測で出す」に従い、本番エントリが実際に呼ばれたかを記録する。
 *
 * 【仕組み】
 *   本番コード側に一時的に 1 行のプローブを挿す（`tools/inventory/measure.mjs` が自動でやる）:
 *       globalThis.__PATH_PROBE__?.('breed');
 *   本セットアップがそのフックを定義し、「今どのテストを実行中か」と結び付けて JSONL に落とす。
 *   ワーカーが複数あるので追記のみ。集計は measure.mjs 側で行う。
 *
 * ⚠️ プローブは計測時だけ挿し、直後に必ず戻す（measure.mjs が md5 で復元を検証する）。
 */
import { appendFileSync } from 'node:fs';
import { afterEach, beforeEach, expect } from 'vitest';

const OUT = process.env['PATH_PROBE_OUT'];
if (OUT === undefined || OUT === '') {
  throw new Error('PATH_PROBE_OUT が未設定です（measure.mjs 経由で実行すること）');
}

let currentTest: string | null = null;
/** 1テスト内で同じ関数が何度呼ばれても1件にまとめる（回数ではなく到達の有無を測る） */
let touched = new Set<string>();

(globalThis as unknown as Record<string, unknown>)['__PATH_PROBE__'] = (name: string): void => {
  if (currentTest === null) return; // テスト外（モジュール初期化時など）は数えない
  touched.add(name);
};

beforeEach(() => {
  currentTest = expect.getState().currentTestName ?? null;
  touched = new Set<string>();
});

afterEach(() => {
  if (currentTest === null) return;
  appendFileSync(
    OUT,
    JSON.stringify({
      test: currentTest,
      file: expect.getState().testPath ?? '',
      entries: [...touched].sort(),
    }) + '\n',
    'utf8',
  );
  currentTest = null;
});
