/**
 * ★購入リグ — ★**20 秒の通し**（ゲート → 発走 → 直線 → ゴール）
 *
 * 【★なぜ通しで作るか】
 *   ⚠️ ★静止画で「どうですか」を繰り返して 4 往復しました（★2026-09-03）。
 *   ★映像は ★**つながって初めて判定できます**。★この画面は止め絵で見せません。
 *
 * 【★指示書 §6 の台本に合わせています】
 *   ★アップとコーナーは使いません。★ゲート後と最後の直線だけを見せます。
 *
 * 【★素材から測った数（★`tools/probe-rig-clip.mjs`）】
 *   ★素材の高さ 2.19 単位 ／ ★接地中の蹄が後ろへ流れる速さ（等倍）:
 *   　★待機 12.2〜15.0s … **0**（その場）
 *   　★常歩  0.0〜 5.0s … **0.53 単位/秒**
 *   　★疾走  7.0〜12.2s … **2.66 単位/秒**
 *   → ★地面の速さ ＝ その値 × 再生倍率 × 実寸倍率。★**どの速さでも蹄は滑りません。**
 *
 * 【⚠️ ★開発専用】★本番では 404。★購入素材は配信しません。
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { HORSE_HEIGHT_M } from '@star/render';

const SOURCE_HEIGHT_UNITS = 2.19;
const SCALE = HORSE_HEIGHT_M / SOURCE_HEIGHT_UNITS;
/** ★再生倍率 1 あたりに進む距離 [m/s]（★実測 × 実寸倍率） */
const WALK_MPS_PER_RATE = 0.53 * SCALE;
const RUN_MPS_PER_RATE = 2.66 * SCALE;

/** ★クリップの切り出し（★30fps のコマ番号・★棚卸しで確かめた区間） */
const CLIPS = {
  idle: { from: 372, to: 444 },
  walk: { from: 15, to: 145 },
  runA: { from: 216, to: 363 },
  runB: { from: 610, to: 745 },
} as const;

/** ★台本（★指示書 §6 を 20 秒に詰めたもの） */
const SCRIPT = {
  gate: 0.0,
  break: 2.4,
  transitionIn: 6.4,
  straight: 7.6,
  finish: 16.4,
  winner: 18.4,
  end: 20.5,
} as const;

const FIELD = 6;
/** ★出走馬。★毛色と勝負服は購入素材のもの */
const RUNNERS = Array.from({ length: FIELD }, (_, i) => ({
  laneX: (i - (FIELD - 1) / 2) * 1.9,
  body: i % 3,
  silk: i % 6,
  /** ★終いの脚（★どの馬が伸びるか）。★決め打ちで台本どおりに決着させます */
  kick: [0.55, 1.35, 0.15, 0.95, -0.35, 0.75][i] ?? 0,
  /** ★枠色（★`palette.json` の役割名）。⚠️ ★白い板のままだとゼッケンが主役になります */
  frame: `frame-${i + 1}`,
  phase: [0, 0.31, 0.62, 0.93, 1.24, 1.55][i] ?? 0,
}));

/** ★速さの台本 [m/s] */
function speedAt(t: number, kick: number): number {
  if (t < SCRIPT.break) return 0;
  const since = t - SCRIPT.break;
  /** ★発走から 3 秒で巡航へ */
  const cruise = 16.2 * (1 - Math.exp(-since / 1.1));
  /** ★直線に入ってから脚を使う */
  const drive = t < SCRIPT.straight ? 0 : Math.min(1, (t - SCRIPT.straight) / 6) * kick;
  return Math.max(0, cruise + drive);
}

export default function RaceClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('購入リグを読み込み中…');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const stateRef = useRef({ playing });
  stateRef.current = { playing };
  const resetRef = useRef<(() => void) | null>(null);

  const restart = useCallback(() => { resetRef.current?.(); setPlaying(true); }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.05, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    /**
     * ⚠️ ★HDRI を入れたら ★**露出オーバー**になりました（★馬が白飛び・実画面）。
     *   ★自作グラデーションより本物の空のほうがずっと明るいためです。
     */
    renderer.toneMappingExposure = 0.62;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    host.appendChild(renderer.domElement);

    /**
     * ★**空と環境光（HDRI）**
     *   ⚠️ ★これまでは私が作ったグラデーションで代用していました。★質感がここで決まります。
     *   ★出どころ・ライセンスは `public/rig-lab-assets/hdri/LICENSE.txt`
     *   （★Poly Haven / **CC0** / 空のみ・実在の競馬場は写っていません）。
     */
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    let envMap: THREE.Texture | null = null;
    let skyTexture: THREE.Texture | null = null;
    new RGBELoader().load('/rig-lab-assets/hdri/sky_2k.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      skyTexture = hdr;
      envMap = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = envMap;
      scene.background = hdr;
      /** ★空が入ったら、手前の光は抑えます（★二重に明るくしない） */
      hemi.intensity = 0.30;
      sun.intensity = 0.95;
      pmrem.dispose();
    });

    const hemi = new THREE.HemisphereLight(0xe8f3ff, 0x7d8f63, 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6e2, 2.2);
    sun.position.set(16, 11, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5; sun.shadow.blurSamples = 12; sun.shadow.bias = -0.0006;
    sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    scene.add(sun);

    /** ★芝 */
    const turfCanvas = document.createElement('canvas');
    turfCanvas.width = 64; turfCanvas.height = 64;
    const tctx = turfCanvas.getContext('2d');
    if (tctx) {
      tctx.fillStyle = '#6d8b4e'; tctx.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 900; i += 1) {
        const t = (i * 2654435761) % 4096;
        tctx.fillStyle = `rgba(${86 + (t % 38)},${116 + (t % 40)},${68 + (t % 28)},.5)`;
        tctx.fillRect((t * 7) % 64, (t * 13) % 64, 2, 2);
      }
    }
    const turf = new THREE.CanvasTexture(turfCanvas);
    turf.wrapS = turf.wrapT = THREE.RepeatWrapping;
    turf.repeat.set(21, 90);
    turf.colorSpace = THREE.SRGBColorSpace;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(64, 320), new THREE.MeshStandardMaterial({ map: turf, roughness: 1 }));
    track.rotation.x = -Math.PI / 2; track.receiveShadow = true; scene.add(track);

    /** ★向こう側のラチと距離標（★流れて速さが読める） */
    const rail = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4 });
    const posts: THREE.Mesh[] = [];
    const POST_GAP = 4;
    const POST_COUNT = 70;
    for (let i = 0; i < POST_COUNT; i += 1) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), postMat);
      p.position.set(-8.4, 0.55, -i * POST_GAP + 60);
      rail.add(p); posts.push(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 320), new THREE.MeshStandardMaterial({ color: 0xf7f4ea }));
    bar.position.set(-8.4, 1.0, 0); rail.add(bar);
    const poles: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i += 1) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), new THREE.MeshStandardMaterial({ color: 0xe4e0d2 }));
      p.position.set(-9.8, 1.1, -i * 20 + 60);
      rail.add(p); poles.push(p);
    }
    scene.add(rail);

    /** ★スタンド（★遠景の帯） */
    const crowdCanvas = document.createElement('canvas');
    crowdCanvas.width = 256; crowdCanvas.height = 64;
    const cctx = crowdCanvas.getContext('2d');
    if (cctx) {
      cctx.fillStyle = '#4b5560'; cctx.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 2600; i += 1) {
        const t = (i * 2654435761) % 65536;
        cctx.fillStyle = `hsl(${t % 360} ${8 + (t % 14)}% ${30 + (t % 22)}%)`;
        cctx.fillRect((t * 7) % 256, 12 + ((t * 11) % 44), 2, 2);
      }
      cctx.fillStyle = '#2f3740'; cctx.fillRect(0, 0, 256, 9);
    }
    const crowd = new THREE.CanvasTexture(crowdCanvas);
    crowd.wrapS = THREE.RepeatWrapping; crowd.repeat.set(16, 1);
    crowd.colorSpace = THREE.SRGBColorSpace;
    const stand = new THREE.Mesh(new THREE.PlaneGeometry(320, 4.6), new THREE.MeshBasicMaterial({ map: crowd }));
    stand.position.set(-78, 2.2, 0); stand.rotation.y = Math.PI / 2; scene.add(stand);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(320, 1.1), new THREE.MeshBasicMaterial({ color: 0x39424b }));
    roof.position.set(-78, 4.9, 0); roof.rotation.y = Math.PI / 2; scene.add(roof);

    /** ★ゲート（★発走まで映ります） */
    const gate = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ac, metalness: 0.35, roughness: 0.5 });
    for (let i = 0; i <= FIELD; i += 1) {
      const x = (i - FIELD / 2) * 1.9;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.12), frameMat);
      post.position.set(x, 1.15, 0); post.castShadow = true; gate.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(FIELD * 1.9 + 0.4, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x2f6fd0 }));
    top.position.set(0, 2.5, 0); gate.add(top);
    scene.add(gate);

    /** ★ゴール板 */
    const goal = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), new THREE.MeshStandardMaterial({ color: 0xf2f2ee }));
    pole.position.set(-8.9, 1.7, 0); goal.add(pole);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.5), new THREE.MeshStandardMaterial({ color: 0xd0463a }));
    plate.position.set(-8.9, 3.1, 0); goal.add(plate);
    scene.add(goal);

    /** ★テクスチャ（★毛色は不透明・法線と粗さも当てる） */
    const loader = new THREE.TextureLoader();
    const bodyMaps = ['horse-body.png', 'horse-body-02.png', 'horse-body-03.png'].map((n) => loader.load(`/rig-lab-assets/${n}`));
    const silkMaps = ['silks-01.png', 'silks-02.png', 'silks-03.png', 'silks-04.png', 'silks-05.png', 'silks-06.png']
      .map((n) => loader.load(`/rig-lab-assets/${n}`));
    const hairMap = loader.load('/rig-lab-assets/horse-hair.png');
    const saddleMap = loader.load('/rig-lab-assets/saddle.png');
    for (const t of [...bodyMaps, ...silkMaps, hairMap, saddleMap]) t.colorSpace = THREE.SRGBColorSpace;
    const bodyNormal = loader.load('/rig-lab-assets/horse-body-nmap.png');
    const bodyRough = loader.load('/rig-lab-assets/horse-body-rough.png');
    const jockeyNormal = loader.load('/rig-lab-assets/jockey-body-nmap.png');
    const saddleNormal = loader.load('/rig-lab-assets/saddle-nmap.png');

    type Horse = {
      readonly group: THREE.Group;
      readonly mixer: THREE.AnimationMixer;
      readonly idle: THREE.AnimationAction;
      readonly walk: THREE.AnimationAction;
      readonly run: THREE.AnimationAction;
      readonly kick: number;
      readonly phase: number;
      travel: number;
      speed: number;
    };
    const horses: Horse[] = [];

    const build = (source: THREE.Object3D, clips: Record<'idle' | 'walk' | 'runA' | 'runB', THREE.AnimationClip>, i: number): void => {
      const spec = RUNNERS[i]!;
      const model = cloneSkeleton(source);
      model.scale.setScalar(SCALE);
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.set(-centre.x, -box.min.y, -centre.z);
      model.traverse((node) => {
        const lower = node.name.toLowerCase();
        if (node.name.toUpperCase().includes('LOD1') || lower.includes('horse_mask') || lower.includes('reins_')) { node.visible = false; return; }
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = true; node.receiveShadow = true;
        const list = (Array.isArray(node.material) ? node.material : [node.material]).map((m: THREE.Material) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          const n = c.name.toLowerCase();
          if (n.includes('horse_body')) { c.map = bodyMaps[spec.body] ?? null; c.normalMap = bodyNormal; c.roughnessMap = bodyRough; c.roughness = 0.62; }
          else if (n.includes('horse_hair')) { c.map = hairMap; c.transparent = true; c.alphaTest = 0.25; c.roughness = 0.8; }
          else if (n.includes('saddle')) {
            c.map = saddleMap; c.normalMap = saddleNormal; c.roughness = 0.7;
            /** ★ゼッケンを枠色へ。★白い板のままだと馬より目立ちます */
            c.color?.set(palette[spec.frame] ?? '#dddddd');
            c.needsUpdate = true;
            return c as THREE.Material;
          }
          else if (n.includes('jockey') || n.includes('material #4')) { c.map = silkMaps[spec.silk] ?? null; c.normalMap = jockeyNormal; c.roughness = 0.55; }
          c.color?.set(0xffffff);
          c.metalness = 0;
          c.envMapIntensity = 0.32;
          c.needsUpdate = true;
          return c as THREE.Material;
        });
        node.material = Array.isArray(node.material) ? list : list[0]!;
      });
      const group = new THREE.Group();
      group.add(model);
      group.position.set(spec.laneX, 0, 0);
      scene.add(group);
      const mixer = new THREE.AnimationMixer(model);
      const idle = mixer.clipAction(clips.idle);
      const walk = mixer.clipAction(clips.walk);
      const run = mixer.clipAction(i % 2 === 0 ? clips.runA : clips.runB);
      idle.play(); walk.play(); run.play();
      idle.setEffectiveWeight(1); walk.setEffectiveWeight(0); run.setEffectiveWeight(0);
      horses.push({ group, mixer, idle, walk, run, kick: spec.kick, phase: spec.phase, travel: 0, speed: 0 });
    };

    /** ★枠色は `palette.json` が唯一の出どころ（★16 進をここに書かない） */
    let palette: Record<string, string> = {};
    let ready = false;
    void fetch('/art/palette.json').then((r) => r.json()).then((j: Record<string, string>) => { palette = j; }).catch(() => undefined);
    new FBXLoader().load('/rig-lab-assets/model.fbx', (loaded) => {
      const full = loaded.animations[0];
      if (!full) { setStatus('★アニメーションがありません'); return; }
      const sub = (k: keyof typeof CLIPS) =>
        THREE.AnimationUtils.subclip(full, k, CLIPS[k].from, CLIPS[k].to, 30);
      const clips = { idle: sub('idle'), walk: sub('walk'), runA: sub('runA'), runB: sub('runB') };
      for (let i = 0; i < FIELD; i += 1) build(loaded, clips, i);
      ready = true;
      setStatus('');
    }, undefined, (e) => setStatus(`★読み込み失敗: ${String(e)}`));

    /**
     * ★**後処理**。⚠️ ★値は私の趣味ではなく、★**素材の作者が同梱している設定**です
     *   （`Assets/HorseJockey/Demo/RaceHorseJockey_volume.asset`）:
     *   　★Bloom … 敷居 1.0 ／ 強さ 1.0
     *   　★Vignette … 強さ 0.25 ／ なだらかさ 0.4
     *   　★影・中間・ハイライト … ★**影を暖色へ**（1, 0.941, 0.886）
     *   　★トーンマッピング … Neutral
     *
     * ★**被写界深度（背景ぼかし）を足しています。**
     *   ⚠️ ★参考映像は ★**背景をほとんど見せません**（★寄って、後ろは緑のぼけ）。
     *      ★こちらは広い芝と薄いスタンドを大きく写しており、★**いちばん弱い所を一番大きく出して**いました。
     *      → ★同じ手（寄る・ぼかす）を採ります。
     */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    /**
     * ⚠️ ★1 度目は絞りを 2 桁大きく取り、★**馬までぼけました**（★実画面）。
     *   ★`aperture` は 1e-5 の桁です。★ぼかすのは**背景だけ**。
     */
    const bokeh = new BokehPass(scene, camera, { focus: 16, aperture: 0.000022, maxblur: 0.009 });
    composer.addPass(bokeh);
    /**
     * ⚠️ ★作者の値（敷居 1.0 / 強さ 1.0）は ★**Unity の明るさの尺度**でのものです。
     *   ★そのまま three.js に持ち込むと ★**馬の縁とラチが光り、白飛びしました**（★実画面）。
     *   ★平均輝度は 115.7（参考 98.6）で**近い**のに飛んでいた＝ ★**滲みだけが過剰**でした。
     */
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.05, 0.5, 1.6));
    composer.addPass(new OutputPass());
    /**
     * ★**モーションブラー（速度感）**
     *   ⚠️ ★本物の被写体ブラーは重いので、★**画面の端ほど横に流す**近似にします。
     *   ★中央（＝馬）は流さないので、★**主役は締まったまま速さだけ出ます**。
     *   ★強さは走る速さから決めます（★止まっているときは 0）。
     */
    const motionPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;',
        'void main(){',
        '  float edge = smoothstep(0.16, 0.62, abs(vUv.x - 0.5));',
        '  float k = amount * edge;',
        '  vec4 c = vec4(0.0);',
        '  c += texture2D(tDiffuse, vUv + vec2(-3.0 * k, 0.0)) * 0.10;',
        '  c += texture2D(tDiffuse, vUv + vec2(-2.0 * k, 0.0)) * 0.16;',
        '  c += texture2D(tDiffuse, vUv + vec2(-1.0 * k, 0.0)) * 0.22;',
        '  c += texture2D(tDiffuse, vUv) * 0.24;',
        '  c += texture2D(tDiffuse, vUv + vec2( 1.0 * k, 0.0)) * 0.16;',
        '  c += texture2D(tDiffuse, vUv + vec2( 2.0 * k, 0.0)) * 0.12;',
        '  gl_FragColor = c;',
        '}',
      ].join(String.fromCharCode(10)),
    });
    composer.addPass(motionPass);

    /** ★ビネットと、★影を暖色へ寄せる調整（★作者の値） */
    composer.addPass(new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        vignetteAmount: { value: 0.25 },
        vignetteSmooth: { value: 0.4 },
        shadowTint: { value: new THREE.Color(1.0, 0.941, 0.886) },
        shadowWeight: { value: 0.248 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse;',
        'uniform float vignetteAmount; uniform float vignetteSmooth;',
        'uniform vec3 shadowTint; uniform float shadowWeight;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec4 c = texture2D(tDiffuse, vUv);',
        '  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));',
        '  float shadowMask = 1.0 - smoothstep(0.0, 0.55, l);',
        '  c.rgb = mix(c.rgb, c.rgb * shadowTint, shadowMask * shadowWeight);',
        '  float d = distance(vUv, vec2(0.5));',
        '  float v = smoothstep(0.78, 0.78 - vignetteSmooth, d);',
        '  c.rgb *= mix(1.0 - vignetteAmount, 1.0, v);',
        '  gl_FragColor = c;',
        '}',
      ].join(String.fromCharCode(10)),
    }));
    composer.addPass(new SMAAPass());

    let clock = 0;
    let last = performance.now();
    let sized = '';
    let raf = 0;

    resetRef.current = () => {
      clock = 0;
      for (const h of horses) { h.travel = 0; h.speed = 0; h.group.position.z = 0; }
    };

    const draw = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const width = Math.max(320, host.clientWidth);
      const height = Math.round((width * 9) / 16);
      const key = `${width}x${height}`;
      if (key !== sized) {
        sized = key;
        renderer.setSize(width, height); composer.setSize(width, height);
        camera.aspect = width / height; camera.updateProjectionMatrix();
      }

      if (ready && stateRef.current.playing) {
        clock += dt;
        if (clock > SCRIPT.end) { clock = SCRIPT.end; setPlaying(false); }
        setTime(clock);
        for (const h of horses) {
          h.speed = speedAt(clock, h.kick);
          h.travel += h.speed * dt;
          /**
           * ★**脚の回転は、その馬の速さから決めます。**
           *   ★常歩と疾走を速さで混ぜ、★混ぜた比率に応じた「1 倍あたりの距離」で割ります。
           *   → ★どの速さでも ★**蹄が滑りません**（★遷移中も含めて）。
           */
          const wRun = Math.min(1, Math.max(0, (h.speed - 2.5) / 6));
          const wWalk = h.speed <= 0.05 ? 0 : 1 - wRun;
          const wIdle = h.speed <= 0.05 ? 1 : 0;
          h.idle.setEffectiveWeight(wIdle);
          h.walk.setEffectiveWeight(wWalk);
          h.run.setEffectiveWeight(wRun);
          const perRate = WALK_MPS_PER_RATE * wWalk + RUN_MPS_PER_RATE * wRun;
          const rate = perRate > 0.01 ? h.speed / perRate : 1;
          h.mixer.setTime((clock * rate + h.phase) % 1.6);
        }
      }

      /**
       * ★**馬は原点の近くに留め、世界のほうを流します。**
       * ⚠️ ★1 度目は馬を前へ動かしたので、★**走路の端まで走り抜けて世界が消えました**
       *    （★12 秒あたりで背景が真っ白・実画面）。
       */
      const mid = horses.length > 0 ? horses.reduce((s, h) => s + h.travel, 0) / horses.length : 0;
      let lead = 0;
      for (const h of horses) {
        h.group.position.z = h.travel - mid;
        lead = Math.max(lead, h.group.position.z);
      }
      /** ★柵は等間隔なので、★1 区画ぶんの剰余で置き直せば無限に続きます */
      const span = POST_COUNT * POST_GAP;
      for (let i = 0; i < posts.length; i += 1) {
        const base = i * POST_GAP - mid;
        posts[i]!.position.z = ((base % span) + span) % span - span / 2;
      }
      for (let i = 0; i < poles.length; i += 1) {
        const base = i * 20 - mid;
        poles[i]!.position.z = ((base % 320) + 320) % 320 - 160;
      }
      turf.offset.y = -mid / 320 * 90;
      /** ★ゲートは後ろへ去り、★ゴール板は 250m 先から近づいてきます */
      gate.position.z = -mid;
      goal.position.z = 250 - mid;

      /** ★カメラの台本（★真横に限定・アップとコーナーは使わない） */
      const t = clock;
      /**
       * ★カメラ。⚠️ ★**寄ります**（★参考映像は馬が画面の 4 割強／背景はぼけた緑だけ）。
       *   ★引くと ★**弱い背景が主役**になります（★今日それで 3 回止まりました）。
       */
      let focus = 15;
      if (t < SCRIPT.break) { camera.position.set(11, 2.2, -1.0); camera.lookAt(0.2, 1.6, -0.3); focus = 11; }
      else if (t < SCRIPT.transitionIn) { camera.position.set(13, 2.3, 1.2); camera.lookAt(-0.2, 1.7, 0); focus = 13; }
      else if (t < SCRIPT.straight) { camera.position.set(17, 3.0, 3); camera.lookAt(-0.6, 1.9, 0); focus = 17; }
      else if (t < SCRIPT.finish) { camera.position.set(14, 2.4, 0.8); camera.lookAt(-0.4, 1.8, 0); focus = 14; }
      else if (t < SCRIPT.winner) { camera.position.set(11, 2.2, lead + 0.8); camera.lookAt(-0.4, 1.75, lead); focus = 11; }
      else { camera.position.set(8.5, 2.0, lead + 1.2); camera.lookAt(-0.3, 1.7, lead); focus = 8.5; }
      (bokeh.uniforms as Record<string, { value: number }>).focus!.value = focus;
      /** ★速さに応じて端を流す（★16m/s で最大） */
      const lead0 = horses.length > 0 ? horses[0]!.speed : 0;
      motionPass.uniforms.amount!.value = Math.min(1, lead0 / 16) * 0.0075;

      composer.render();
      raf = requestAnimationFrame(draw);
    };
    draw(performance.now());

    return () => {
      cancelAnimationFrame(raf);
      skyTexture?.dispose(); envMap?.dispose(); turf.dispose(); crowd.dispose();
      composer.dispose(); renderer.dispose(); host.replaceChildren();
    };
  }, []);

  const phase = time < SCRIPT.break ? 'ゲート'
    : time < SCRIPT.transitionIn ? '発走・加速'
      : time < SCRIPT.straight ? '転換（コーナーは見せない）'
        : time < SCRIPT.finish ? '直線の攻防'
          : time < SCRIPT.winner ? 'ゴール' : '勝馬';

  return (
    <main style={{ minHeight: '100vh', background: '#12161a', color: '#eef2f6', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>購入リグ — 20 秒の通し（ゲート → 発走 → 直線 → ゴール）</h1>
        <p style={{ margin: '0 0 10px', color: '#9aa8b4', fontSize: 13 }}>
          ★止め絵ではなく<b>通し</b>で見てください。★アップとコーナーは使っていません（指示書 §6）。
        </p>
        <div
          ref={hostRef}
          style={{
            width: '100%', maxWidth: 'min(1200px, calc(60vh * 16 / 9))', margin: '0 auto',
            overflow: 'hidden', border: '1px solid #3d4650', background: '#9fc6e0',
          }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setPlaying((v) => !v)} style={btn}>{playing ? '⏸ 停止' : '▶ 再生'}</button>
          <button type="button" onClick={restart} style={btn}>⟲ 最初から</button>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{time.toFixed(1)} 秒 — {phase}</span>
        </div>
        <p style={{ color: '#d8c88f', fontSize: 13, marginTop: 8 }}>{status}</p>
        <p style={{ color: '#8fa0ad', fontSize: 12.5, lineHeight: 1.8 }}>
          ★待機・常歩・疾走（2 テイク）を速さで混ぜています。★混ぜた比率から再生倍率を出しているので、
          ★<b>加速の途中でも蹄が滑りません</b>。★6 頭・終いの脚は台本で決めています。
        </p>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  minHeight: 40, padding: '6px 14px', border: '1px solid #55606b', borderRadius: 6,
  background: '#222a31', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
};
