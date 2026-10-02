'use client';
/**
 * ★**毛色を馬体だけに焼いた画像の URL**（★2026-10-01・オーナー「ダッシュボード・育成モードの馬が黒くオーバーレイされている」）。
 *
 * 【★なぜ CSS の filter をやめたか】
 *   ★`filter: brightness(...)` は ★**絵全体**に掛かります。★暗い毛色（鹿毛 0.82・黒鹿毛 0.44・青毛 0.10）で
 *   ★目・たてがみ・輪郭・白斑まで沈み、★黒い膜を被せたように見えました。
 *   ★レースは ★馬体の画素だけを変えています（`race/page.tsx` の `bakeCoat`）。★同じ規則 `recolorCoatPixels` を使います。
 *
 * ⚠️ ★画像 1 枚 × 毛色 1 つにつき ★1 回だけ作ります（★毎コマ画素を触らない）。★作るまでは `null`（★素材の色を一瞬も見せない）。
 */
import { useEffect, useState } from 'react';
import { DEFORMED_COAT_TRANSFORMS, recolorCoatPixels, type CoatName } from '@star/render';

const cache = new Map<string, Promise<string>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { reject(new Error(`画像を読めません: ${src}`)); };
    img.src = src;
  });
}

async function bake(src: string, coat: CoatName): Promise<string> {
  const img = await loadImage(src);
  const w = img.naturalWidth, h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return src;
  ctx.drawImage(img, 0, 0);
  /** ★横帯に切る（★`bakeCoat` と同じ理由: 一度に生きる配列を 1 帯ぶんにする） */
  const STRIP_ROWS = 64;
  const t = DEFORMED_COAT_TRANSFORMS[coat];
  for (let y = 0; y < h; y += STRIP_ROWS) {
    const rows = Math.min(STRIP_ROWS, h - y);
    const data = ctx.getImageData(0, y, w, rows);
    recolorCoatPixels(data.data, t);
    ctx.putImageData(data, 0, y);
  }
  const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/png'); });
  return blob === null ? src : URL.createObjectURL(blob);
}

/**
 * ★**何枚かを まとめて**（★拡大したテレビの 歩き 1 コマずつ 8 枚・★2026-10-02）。
 *   ★全部できるまで `null`（★歩き出しのコマが抜けない・★1 枚の表と同じ見え方）。
 */
export function useCoatedImages(srcs: readonly string[] | null, coat: CoatName): readonly string[] | null {
  const key = srcs === null ? null : `${srcs.join(',')}|${coat}`;
  const [urls, setUrls] = useState<{ key: string; urls: readonly string[] } | null>(null);
  /** ⚠️ ★呼ぶ側は 毎回 新しい配列を渡す → ★依存は key だけ（★配列で依存すると 毎回走って 止まらない）・★絵の一覧は key から戻す */
  useEffect(() => {
    if (key === null) return;
    const list = key.slice(0, key.lastIndexOf('|')).split(',');
    if (coat === 'bay') { setUrls({ key, urls: list }); return; }
    let alive = true;
    void Promise.all(list.map((src) => {
      const k = `${src}|${coat}`;
      let p = cache.get(k);
      if (p === undefined) { p = bake(src, coat).catch(() => src); cache.set(k, p); }
      return p;
    })).then((u) => { if (alive) setUrls({ key, urls: u }); });
    return () => { alive = false; };
  }, [key, coat]);
  return urls !== null && key !== null && urls.key === key ? urls.urls : null;
}

/** ★デフォルメの馬の絵 `src` に、毛色 `coat` を馬体だけに掛けた URL（★作るまで `null`） */
export function useCoatedImage(src: string | null, coat: CoatName): string | null {
  const key = src === null ? null : `${src}|${coat}`;
  const [url, setUrl] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (src === null || key === null) return;
    /**
     * 🔴 ★**鹿毛は素材のまま**（★2026-10-01・オーナー「馬の上に黒っぽくオーバーレイがあり薄暗い」）。
     *   ★デフォルメの表の鹿毛（彩度 0.60・明るさ 0.82）は ★素材の鮮やかなオレンジを沈め、★膜を被せたように見えた。
     *   ★ホーム・育成は ★15 時の変更より前と同じ ★素材そのまま（★レースの表は変えない）。
     */
    if (coat === 'bay') { setUrl({ key, url: src }); return; }
    let alive = true;
    let p = cache.get(key);
    if (p === undefined) {
      p = bake(src, coat).catch(() => src);
      cache.set(key, p);
    }
    void p.then((u) => { if (alive) setUrl({ key, url: u }); });
    return () => { alive = false; };
  }, [key, src, coat]);
  return url !== null && key !== null && url.key === key ? url.url : null;
}
