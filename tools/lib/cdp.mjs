/**
 * ★**Chrome DevTools Protocol の最小クライアント**（読取専用の監査用）
 *
 *   通常 `/race` の**実画面**を測るために、本物のブラウザでページを開き、
 *   Canvas とネットワークの記録を読みます。
 *
 * 【なぜ要るか】
 *   ★勝負服の overlay（`silksOverlays`）と毛色の焼き込み（`bakeCoat`）は
 *     `apps/web/src/app/race/page.tsx` の**私有関数**です。`packages/render` にはありません。
 *     つまり `tools/shot-race-at.mjs` のようなオフラインの描画ツールは**これらを通っていません**。
 *     素材の見え方を測るには、**実際のページを動かして読む**しかありません
 *     （`DEV_INSTRUCTIONS_P4_2D_MATERIAL_REPETITION_AUDIT_20260824.md` §6.2）。
 *
 * ⚠️ ★読むだけです。`apps/web/src` へ恒久的な変更を入れません。
 * ⚠️ ★Puppeteer は使いません（依存を増やさない）。Node 内蔵の `WebSocket` で直接話します。
 * ⚠️ ★ヘッドレスにしません。ヘッドレスだと GPU が SwiftShader へ落ち、
 *    実画面と描画が変わる恐れがあります（3D 検証のときに実際に起きました）。
 * ⚠️ ★タブは**同時に 1 枚**にします。裏のタブは描画が止まり、
 *    スクリーンショットが返ってこなくなります（3D 検証で実測）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** ★Windows でよくある置き場所を順に探す。無ければ投げる */
export function findBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of candidates) if (c && existsSync(c)) return c;
  throw new Error('★Chromium 系のブラウザが見つかりません（Chrome / Edge を探しました）');
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * ★ブラウザを起こして CDP でつなぐ。
 * @param opts.port デバッグポート
 * @param opts.width/height ウィンドウの内側の大きさ
 */
export async function launch(opts = {}) {
  const exe = opts.exe ?? findBrowser();
  const port = opts.port ?? 9333;
  const profile = mkdtempSync(path.join(tmpdir(), 'star-audit-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    /**
     * ★ウィンドウが他の窓の後ろに回ると Chrome は `requestAnimationFrame` を止めます。
     *   計測中にこれが起きると **1.5 秒で 0 コマ**になり、fps が測れませんでした。
     */
    '--disable-features=CalculateNativeWinOcclusion',
    `--window-size=${opts.width ?? 1400},${opts.height ?? 1000}`,
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: 'ignore', detached: false });

  /** DevTools が上がるまで待つ */
  let target = null;
  for (let i = 0; i < 120; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (target !== undefined) break;
    } catch { /* まだ */ }
    await sleep(250);
  }
  if (target === null || target === undefined) {
    proc.kill();
    throw new Error('★ブラウザの DevTools につながりませんでした');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error !== undefined) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`));
      else resolve(msg.result);
      return;
    }
    if (msg.method !== undefined) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  });

  /** CDP のコマンドを 1 つ送る */
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`★CDP がタイムアウト: ${method}`)); }
    }, opts.timeoutMs ?? 120000);
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  /** ページの JS を評価して値を取る（Promise も待つ） */
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails !== undefined) {
      throw new Error(`★ページ内でエラー: ${r.exceptionDetails.text} ${JSON.stringify(r.exceptionDetails.exception?.description ?? '')}`);
    }
    return r.result.value;
  };

  /** 指定 URL を開いて、`ready` が true を返すまで待つ */
  const goto = async (url, readyExpr, { timeoutMs = 120000, settleMs = 400 } = {}) => {
    await send('Page.navigate', { url });
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try {
        if (await evaluate(readyExpr) === true) { await sleep(settleMs); return true; }
      } catch { /* ロード中 */ }
      await sleep(250);
    }
    return false;
  };

  const close = async () => {
    try { ws.close(); } catch { /* 無視 */ }
    try { proc.kill(); } catch { /* 無視 */ }
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 無視 */ }
  };

  return { send, on, evaluate, goto, close, port, profile };
}
