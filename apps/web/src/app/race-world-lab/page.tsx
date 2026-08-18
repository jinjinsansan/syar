'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { drawFixed2DSideScene, fixed2DPackLayout, type Fixed2DHorseFrame } from '@star/render';

const WIDTH = 1280;
const HEIGHT = 720;
const LIFTS = [55, 90, 25, 0, 0, 0, 0, 55] as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読み込めません: ${src}`));
    image.src = src;
  });
}

function boundsOf(image: HTMLImageElement): Fixed2DHorseFrame<HTMLImageElement>['source'] {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width; let top = canvas.height; let right = -1; let bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    if ((pixels[(y * canvas.width + x) * 4 + 3] ?? 0) < 16) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? { x: 0, y: 0, width: canvas.width, height: canvas.height }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export default function RaceWorldLabPage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const assetsRef = useRef<{ background: HTMLImageElement; frames: readonly Fixed2DHorseFrame<HTMLImageElement>[] } | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [packMode, setPackMode] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      loadImage('/art/race-backstretch-side-v1.png?v=1'),
      ...Array.from({ length: 8 }, (_, index) => loadImage(`/art/horse-jockey-side-v6-pose${String(index + 1).padStart(2, '0')}.png?v=23`)),
    ]).then(([background, ...images]) => {
      const measured = images.map((image) => ({ image, source: boundsOf(image) }));
      const referenceHeight = Math.max(...measured.map(({ source }) => source.height));
      assetsRef.current = {
        background,
        frames: measured.map((item, index) => ({ ...item, referenceHeight, groundLiftSourcePx: LIFTS[index] ?? 0 })),
      };
      setReady(true);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % 8), 1000 / 12);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current; const assets = assetsRef.current;
    if (canvas === null || assets === null) return;
    const ctx = canvas.getContext('2d'); if (ctx === null) return;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const placements = packMode
      ? fixed2DPackLayout(Array.from({ length: 12 }, (_, index) => ({
        gate: index + 1,
        meters: 800 - [0, 0.6, 1.2, 1.8, 2.8, 3.5, 4.3, 5.1, 6.2, 7.1, 8.4, 9.6][index]!,
        laneM: [1, 5.5, 10.5, 2, 6.2, 11, 0.5, 4.8, 9.7, 2.8, 7.1, 11.5][index]!,
      })), {
        cameraMeters: 798, centerX: 720, pxPerMeter: 12, trackWidthM: 12,
        groundY: [455, 505, 555], displayReferenceHeight: [175, 205, 235],
        bandXOffsetPx: [-70, 0, 70], minVisibleGapPx: 150,
      }).map((horse) => ({
        frame: assets.frames[(frame + horse.gate * 3) % 8]!, x: horse.x,
        groundY: horse.groundY, displayReferenceHeight: horse.displayReferenceHeight,
      }))
      : [{ frame: assets.frames[frame]!, x: 690, groundY: 548, displayReferenceHeight: 330 }];
    drawFixed2DSideScene(ctx, { width: WIDTH, height: HEIGHT }, {
      image: assets.background, width: assets.background.naturalWidth, height: assets.background.naturalHeight,
    }, placements);
  }, [frame, ready, packMode]);

  return <main style={{ minHeight: '100vh', padding: 20, background: '#0d1011', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
    <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>固定2D・背景合成品質ステージ</h1>
    <p style={{ margin: '0 0 12px', opacity: 0.72 }}>承認済み画風の道中背景とv6単馬を、透視縮小なしで合成しています。</p>
    {error !== null && <p style={{ color: '#ff746c' }}>{error}</p>}
    <div style={{ marginBottom: 12 }}>
      <button type="button" disabled={!ready} onClick={() => setPlaying((value) => !value)}>{playing ? '停止' : '再生'}</button>
      <button type="button" disabled={!ready} onClick={() => setPackMode((value) => !value)} style={{ marginLeft: 8 }}>{packMode ? '単馬表示' : '12頭表示'}</button>
      <span style={{ marginLeft: 12 }}>frame {frame + 1}/8・12fps・{packMode ? '3帯 175/205/235px' : '共通表示高330px'}</span>
    </div>
    <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ width: '100%', maxWidth: WIDTH, border: '1px solid #46534b' }} />
  </main>;
}
