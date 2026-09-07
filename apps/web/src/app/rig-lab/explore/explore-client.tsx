/**
 * ★購入リグの ★**クリップ探索**（★29.2 秒に何が入っているかを目で見る）
 *
 * 【★なぜ別の画面にしたか】
 *   ★`/rig-lab` は「短い競馬演出として成立するか」を見る画面です。
 *   ★こちらは ★**素材の棚卸し**。★混ぜると、どちらの判定もぼやけます。
 *
 * 【⚠️ ★開発専用】★本番では 404。★購入素材は配信しません。
 *
 * ★`?t=16.5` … その時刻で止める ／ ★`?play=1` … その時刻から再生
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { HORSE_HEIGHT_M } from '@star/render';

const SOURCE_HEIGHT_UNITS = 2.19;
const SCALE = HORSE_HEIGHT_M / SOURCE_HEIGHT_UNITS;

/**
 * ★区間の一覧。★数字（`tools/probe-rig-clip.mjs`）で当たりを付け、
 *   ★**実画面で 16 コマ撮って確かめた**もの（★2026-09-03）。
 */
const GUESSES: ReadonlyArray<{ readonly from: number; readonly to: number; readonly guess: string }> = [
  { from: 0.0, to: 5.5, guess: '常歩・待機（騎手は直立）' },
  { from: 5.5, to: 7.0, guess: '歩き出し〜速歩' },
  { from: 7.0, to: 12.2, guess: '全力疾走（★いま使っている区間）' },
  { from: 12.2, to: 15.0, guess: '停止・立ち姿' },
  { from: 15.0, to: 16.2, guess: '★棹立ち（前脚を上げる）' },
  { from: 16.2, to: 18.2, guess: '★跳躍（大きく飛ぶ）' },
  { from: 18.2, to: 20.0, guess: '緩い走り' },
  { from: 20.0, to: 25.0, guess: '全力疾走（別テイク）' },
  { from: 25.0, to: 27.0, guess: '★跳ね上がり' },
  { from: 27.0, to: 28.4, guess: '★転倒（馬が倒れる）' },
  { from: 28.4, to: 29.24, guess: '★起き上がり（騎手は地面に落ちている）' },
];

export default function ExploreClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('読み込み中…');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(29.23);
  const stateRef = useRef({ time, playing });
  stateRef.current = { time, playing };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = Number(params.get('t'));
    if (Number.isFinite(t) && t > 0) setTime(t);
    if (params.get('play') === '1') setPlaying(true);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc6e0);
    const camera = new THREE.PerspectiveCamera(22, 16 / 9, 0.05, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x7d8f63, 2.7));
    const sun = new THREE.DirectionalLight(0xfff6e2, 2.6);
    sun.position.set(14, 10, 9);
    scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x5f9a3f, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    /** ★1m ごとの目盛り（★高さと動きの大きさを読むため） */
    for (let i = 0; i <= 6; i += 1) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.02, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(i * 2 - 6, 0.01, 0);
      scene.add(line);
    }

    let mixer: THREE.AnimationMixer | null = null;
    new FBXLoader().load('/rig-lab-assets/model.fbx', (loaded) => {
      const clip = loaded.animations[0];
      if (!clip) { setStatus('★アニメーションがありません'); return; }
      setDuration(clip.duration);
      loaded.scale.setScalar(SCALE);
      const box = new THREE.Box3().setFromObject(loaded);
      const centre = box.getCenter(new THREE.Vector3());
      loaded.position.set(-centre.x, -box.min.y, -centre.z);
      loaded.traverse((node) => {
        if (node.name.toUpperCase().includes('LOD1')) node.visible = false;
      });
      scene.add(loaded);
      mixer = new THREE.AnimationMixer(loaded);
      mixer.clipAction(clip).play();
      setStatus(`クリップ全長 ${clip.duration.toFixed(2)} 秒`);
    }, undefined, (error) => setStatus(`★読み込み失敗: ${String(error)}`));

    let raf = 0;
    let last = performance.now();
    const draw = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const width = Math.max(320, host.clientWidth);
      const height = Math.round((width * 9) / 16);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      camera.position.set(11, 1.9, 0);
      camera.lookAt(0, 1.35, 0);
      if (mixer !== null) {
        if (stateRef.current.playing) {
          const next = stateRef.current.time + dt;
          setTime(next > duration ? 0 : next);
        }
        mixer.setTime(Math.min(stateRef.current.time, duration - 0.001));
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => { cancelAnimationFrame(raf); renderer.dispose(); host.replaceChildren(); };
  }, [duration]);

  const current = GUESSES.find((g) => time >= g.from && time < g.to);

  return (
    <main style={{ minHeight: '100vh', background: '#15181c', color: '#eef1f4', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>購入リグ — クリップの棚卸し（29.2 秒に何が入っているか）</h1>
        <p style={{ margin: '0 0 10px', color: '#9fb0bd', fontSize: 13 }}>
          ★いま使っているのは <b>7.0〜12.2 秒</b>のうち約 2 秒だけです。★残りに何が入っているかを見ます。
        </p>
        <div
          ref={hostRef}
          style={{
            width: '100%', maxWidth: 'min(1200px, calc(58vh * 16 / 9))', margin: '0 auto',
            overflow: 'hidden', border: '1px solid #46505a', background: '#9fc6e0',
          }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setPlaying((v) => !v)} style={btn}>{playing ? '⏸ 停止' : '▶ 再生'}</button>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: 92 }}>{time.toFixed(2)} 秒</span>
          <input
            type="range" min={0} max={duration} step={0.01} value={Math.min(time, duration)}
            onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }}
            style={{ flex: '1 1 420px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {GUESSES.map((g) => (
            <button
              key={g.from}
              type="button"
              onClick={() => { setPlaying(false); setTime(g.from + 0.4); }}
              style={{ ...btn, minHeight: 32, fontSize: 12, background: current === g ? '#2f6fd0' : '#252b31' }}
            >
              {g.from.toFixed(1)}s {g.guess}
            </button>
          ))}
        </div>
        <p style={{ color: '#d8c88f', fontSize: 13, marginTop: 10 }}>{status}</p>
        <p style={{ color: '#93a2ae', fontSize: 12.5, lineHeight: 1.8 }}>
          ★区間の名前は、数字で当たりを付けたあと <b>16 コマ撮って目で確かめた</b>ものです。★床の白線は 2m 間隔。<br />
          ⚠️ ★この画面は <b>素材の棚卸し用</b>なので、★毛色と勝負服を当てていません（★影絵で形だけ見ます）。
        </p>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  minHeight: 38, padding: '6px 12px', border: '1px solid #55606b', borderRadius: 6,
  background: '#252b31', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
};
