'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

const WIDTH = 1280;
const HEIGHT = 720;
const FRAME_COUNT = 8;
const ASSET_VERSION = '23';

// Source-canvas pixels above the turf baseline. Airborne poses must retain
// visible clearance instead of having their lowest hoof glued to the ground.
const GROUND_LIFT_SOURCE_PX = [55, 90, 25, 0, 0, 0, 0, 55] as const;

interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly bottomMargin: number;
}

interface FrameAsset {
  readonly image: HTMLImageElement;
  readonly bounds: Bounds;
}

function measure(image: HTMLImageElement): Bounds {
  const cv = document.createElement('canvas');
  cv.width = image.naturalWidth; cv.height = image.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return { x: 0, y: 0, width: cv.width, height: cv.height, bottomMargin: 0 };
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let left = cv.width, top = cv.height, right = -1, bottom = -1;
  for (let y = 0; y < cv.height; y += 1) {
    for (let x = 0; x < cv.width; x += 1) {
      if (pixels[(y * cv.width + x) * 4 + 3]! < 16) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: cv.width, height: cv.height, bottomMargin: 0 };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1, bottomMargin: cv.height - bottom - 1 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読み込めません: ${src}`));
    image.src = src;
  });
}

export default function RaceQualityLabPage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<readonly FrameAsset[]>([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [fps, setFps] = useState(6);
  const [displayHeight, setDisplayHeight] = useState(430);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requested = Number(new URLSearchParams(window.location.search).get('frame'));
    if (Number.isInteger(requested) && requested >= 1 && requested <= FRAME_COUNT) setFrame(requested - 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(Array.from({ length: FRAME_COUNT }, (_, index) =>
      loadImage(`/art/horse-jockey-side-v6-pose${String(index + 1).padStart(2, '0')}.png?v=${ASSET_VERSION}`)))
      .then((images) => {
        if (cancelled) return;
        framesRef.current = images.map((image) => ({ image, bounds: measure(image) }));
        setReady(true);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setFrame((current) => (current + 1) % FRAME_COUNT), 1000 / fps);
    return () => window.clearInterval(id);
  }, [playing, fps]);

  useEffect(() => {
    const canvas = canvasRef.current; const frames = framesRef.current;
    if (canvas === null || frames.length !== FRAME_COUNT) return;
    const ctx = canvas.getContext('2d'); if (ctx === null) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#17211c'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let x = 0; x < WIDTH; x += 64) {
      for (let y = 0; y < HEIGHT; y += 64) {
        if (((x + y) / 64) % 2 === 0) { ctx.fillStyle = '#1d2a23'; ctx.fillRect(x, y, 64, 64); }
      }
    }
    const groundY = 610;
    ctx.strokeStyle = '#e7c95b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(WIDTH, groundY); ctx.stroke();
    const maxHeight = Math.max(...frames.map((asset) => asset.bounds.height));
    const asset = frames[frame]!; const scale = displayHeight / maxHeight;
    const dw = asset.bounds.width * scale; const dh = asset.bounds.height * scale;
    const groundLift = (GROUND_LIFT_SOURCE_PX[frame] ?? 0) * scale;
    const dx = WIDTH / 2 - dw / 2; const dy = groundY - dh - groundLift;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(asset.image, asset.bounds.x, asset.bounds.y, asset.bounds.width, asset.bounds.height, dx, dy, dw, dh);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1; ctx.strokeRect(dx, dy, dw, dh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`pose ${String(frame + 1).padStart(2, '0')}`, 24, 38);
    ctx.font = '16px monospace';
    ctx.fillText(`source ${asset.bounds.width}×${asset.bounds.height} / bottom margin ${asset.bounds.bottomMargin}px`, 24, 66);
    ctx.fillText(`common reference ${maxHeight}px / display ${displayHeight}px / scale ${scale.toFixed(3)} / lift ${groundLift.toFixed(1)}px`, 24, 90);
  }, [frame, displayHeight, ready]);

  const bounds = framesRef.current[frame]?.bounds;
  return (
    <main style={{ minHeight: '100vh', padding: 20, background: '#0e1112', color: '#edf2ed', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>馬・騎手 v6　8コマ品質検証ステージ</h1>
      <p style={{ margin: '0 0 14px', opacity: 0.72 }}>レース本編へ接続する前に、単馬の寸法・接地点・時間連続性を監査する内部ページです。</p>
      {error !== null && <p style={{ color: '#ff746c' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" disabled={!ready} onClick={() => setPlaying((value) => !value)}>{playing ? '停止' : '再生'}</button>
        <button type="button" disabled={!ready} onClick={() => { setPlaying(false); setFrame((frame + FRAME_COUNT - 1) % FRAME_COUNT); }}>前</button>
        <button type="button" disabled={!ready} onClick={() => { setPlaying(false); setFrame((frame + 1) % FRAME_COUNT); }}>次</button>
        <label>フレーム <input type="range" min="0" max="7" value={frame} onChange={(event) => { setPlaying(false); setFrame(Number(event.target.value)); }} /> {frame + 1}/8</label>
        <label>速度 <select value={fps} onChange={(event) => setFps(Number(event.target.value))}><option value="2">2fps</option><option value="6">6fps</option><option value="12">12fps</option></select></label>
        <label>表示高 <input type="range" min="160" max="560" step="10" value={displayHeight} onChange={(event) => setDisplayHeight(Number(event.target.value))} /> {displayHeight}px</label>
      </div>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ display: 'block', width: '100%', maxWidth: WIDTH, border: '1px solid #46534b', background: '#17211c' }} />
      {bounds !== undefined && <p style={{ fontFamily: 'monospace', opacity: 0.72 }}>alpha bounds: x={bounds.x}, y={bounds.y}, w={bounds.width}, h={bounds.height}, bottom={bounds.bottomMargin}</p>}
    </main>
  );
}
