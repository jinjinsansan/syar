/**
 * ★購入リグの評価画面（★最終直線・3 頭）
 *
 * 【★この画面で判定すること】
 *   ★引きの画角で ★**競馬に見えるか** ／ ★3 頭の脚と騎手の同期が破綻しないか
 *   ⚠️ ★アップとコーナーは使いません（★指示書 §6「コーナーは編集で見せない」）。
 *
 * 【⚠️ ★開発専用】★本番では 404（`page.tsx`）。★素材は購入品なので配信しません。
 *
 * 【★素材から測った数（★推測ではありません・`tools/probe-rig-clip.mjs`）】
 *   ★素材の高さ            … **2.19 単位**（馬＋騎手）
 *   ★SpeedRun 区間          … 10.13〜12.10 秒（**1.97 秒で 1 完歩**）
 *   ★接地中の蹄が後ろへ流れる速さ … **2.66 単位/秒**（★等倍のとき）
 *
 * 【★なぜ「測ってから」なのか — ★2D で同じ所を外しました】
 *   ★このクリップは ★**その場走り**（`Horse.position` の変化 0）なので、
 *   ★**地面を流す速さを間違えると、蹄が滑ります。**
 *   ★正しい速さは絵から決めるものではなく、★**クリップ自身が持っています**:
 *
 *       ★地面の速さ ＝ 2.66 単位/秒 × 再生倍率 × 実寸への倍率
 *
 *   ★この 1 本の式で、★**どの速さでも滑りません**（★倍率を変えても崩れません）。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { HORSE_HEIGHT_M } from '@star/render';

/** ★購入クリップの中で「全力疾走」に当たる区間（★30fps のコマ番号） */
const SPEED_RUN = { from: 304, to: 363, fps: 30 } as const;
/** ★素材そのものの高さ [単位]（★実測） */
const SOURCE_HEIGHT_UNITS = 2.19;
/** ★接地中の蹄が後ろへ流れる速さ [単位/秒]（★等倍・実測） */
const STANCE_UNITS_PER_SEC = 2.66;
/** ★実寸へ直す倍率。★`HORSE_HEIGHT_M` は既存の値を使います（★R-30・新しく決めない） */
const SCALE = HORSE_HEIGHT_M / SOURCE_HEIGHT_UNITS;
/**
 * ★**再生倍率 1 あたりの地面の速さ [m/s]**。
 *   ★これに再生倍率を掛けたものが、★滑らない地面の速さです。
 */
const MPS_PER_RATE = STANCE_UNITS_PER_SEC * SCALE;

/**
 * ★3 頭。★毛色は ★**既存パレットの役割名**で指定します（★裁定 7・★16 進をここに書かない）。
 *   ⚠️ ★購入素材の毛色テクスチャは ★**アルファ側に階調の整った陰影**が入っているので、
 *      ★そちらを下地（`-shade`）にして ★**毛色で染めます**。
 *      ★`RGB × アルファ` は暗く潰れました（★実測: 02 はほぼ真っ黒）。
 */
const LANES = [
  { x: -3.1, silk: 0, body: 2, coat: 'coat-ashi-1', label: '1' },
  { x: 0.0, silk: 1, body: 1, coat: 'coat-kage-1', label: '2' },
  { x: 3.1, silk: 2, body: 0, coat: 'coat-kage-1', label: '3' },
] as const;

export default function RigLabClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('購入リグを読み込み中…');
  const [paused, setPaused] = useState(false);
  const [toon, setToon] = useState(false);
  /** ★先頭の走る速さ [m/s]。★脚の回転と地面の流れは、ここから**同時に**決まります */
  const [speedMps, setSpeedMps] = useState(16);
  /** ★競り合い（★3 頭の速度差）*/
  const [contest, setContest] = useState(true);
  /** ★描画の強化（★環境マップ・AO・ブルーム・柔らかい影）。★入切で比べられます */
  const [fx, setFx] = useState(true);
  const stateRef = useRef({ paused, toon, speedMps, contest, fx });
  stateRef.current = { paused, toon, speedMps, contest, fx };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc6e0);
    scene.fog = new THREE.Fog(0x9fc6e0, 70, 200);
    const camera = new THREE.PerspectiveCamera(20, 16 / 9, 0.05, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.shadowMap.enabled = true;
    /** ⚠️ ★`PCFSoftShadowMap` は r185 で非推奨（★警告が出ていました）。★VSM で柔らかくします */
    renderer.shadowMap.type = THREE.VSMShadowMap;
    host.appendChild(renderer.domElement);

    /**
     * ★光。⚠️ ★1 度目は真上から強く当てすぎて、★影が真っ黒・馬体が平らでした。
     *   ★横から当てて、★空の照り返しを強めます。
     */
    /**
     * ★**空と環境マップ**。⚠️ ★これが無いと、★毛にも布にも映り込みが無く ★**樹脂**に見えます。
     *   ★外部の HDRI は使いません（★権利と重さ）。★空〜地平〜芝の縦グラデーションを自前で作り、
     *   ★`PMREMGenerator` で映り込み用に畳みます。
     */
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 32; skyCanvas.height = 128;
    const sctx = skyCanvas.getContext('2d');
    if (sctx) {
      const g = sctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0.00, '#6f9fd0');
      g.addColorStop(0.42, '#bcd9ef');
      g.addColorStop(0.50, '#e8f1f6');
      g.addColorStop(0.58, '#7fa860');
      g.addColorStop(1.00, '#3f6b2e');
      sctx.fillStyle = g; sctx.fillRect(0, 0, 32, 128);
    }
    const skyTexture = new THREE.CanvasTexture(skyCanvas);
    skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromEquirectangular(skyTexture).texture;
    scene.environment = envMap;
    scene.background = skyTexture;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x7d8f63, 1.5));
    const sun = new THREE.DirectionalLight(0xfff6e2, 2.2);
    sun.position.set(16, 9, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    sun.shadow.blurSamples = 12;
    sun.shadow.bias = -0.0006;
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    scene.add(sun);

    /**
     * ★**走路**。⚠️ ★馬はその場で走るので、★**地面のほうを流します。**
     *   ★繰り返す模様を持たせ、`offset` を動かすことで速さを見せます。
     */
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 64; groundCanvas.height = 64;
    const gctx = groundCanvas.getContext('2d');
    if (gctx) {
      gctx.fillStyle = '#5f9a3f'; gctx.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 900; i += 1) {
        const t = (i * 2654435761) % 4096;
        gctx.fillStyle = `rgba(${70 + (t % 46)},${128 + (t % 52)},${58 + (t % 34)},.55)`;
        gctx.fillRect((t * 7) % 64, (t * 13) % 64, 2, 2);
      }
    }
    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(21, 60);
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 220),
      new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 }),
    );
    track.rotation.x = -Math.PI / 2;
    track.receiveShadow = true;
    scene.add(track);

    /**
     * ★**スタンドと観客**（★遠景）。
     *   ⚠️ ★空と平らな緑だけだと ★**競馬場に見えません**（★2026-09-03・実画面）。
     *   ★細かく作らず、★**帯として置く**だけで「場所」が立ちます。
     */
    const crowdCanvas = document.createElement('canvas');
    crowdCanvas.width = 256; crowdCanvas.height = 64;
    const cctx = crowdCanvas.getContext('2d');
    if (cctx) {
      cctx.fillStyle = '#4b5560'; cctx.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 2600; i += 1) {
        const t = (i * 2654435761) % 65536;
        const hue = (t % 360);
        /** ⚠️ ★1 度目は色が強すぎて ★**観客が主役になりました**。★彩度と大きさを落とします */
        cctx.fillStyle = `hsl(${hue} ${8 + (t % 14)}% ${30 + (t % 22)}%)`;
        cctx.fillRect((t * 7) % 256, 12 + ((t * 11) % 44), 2, 2);
      }
      cctx.fillStyle = '#2f3740'; cctx.fillRect(0, 0, 256, 9);
    }
    const crowdTexture = new THREE.CanvasTexture(crowdCanvas);
    crowdTexture.wrapS = THREE.RepeatWrapping; crowdTexture.repeat.set(13, 1);
    crowdTexture.colorSpace = THREE.SRGBColorSpace;
    const stand = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 4.6),
      new THREE.MeshBasicMaterial({ map: crowdTexture }),
    );
    /** ⚠️ ★遠くへ下げます。★近いと画面の半分を占めて、★空が無くなりました */
    stand.position.set(-78, 2.2, 0);
    stand.rotation.y = Math.PI / 2;
    scene.add(stand);
    const roof = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 1.1),
      new THREE.MeshBasicMaterial({ color: 0x39424b }),
    );
    roof.position.set(-78, 4.9, 0); roof.rotation.y = Math.PI / 2; scene.add(roof);

    /** ★芝の外側（★遠景。★奥行きの手がかり） */
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 220),
      new THREE.MeshStandardMaterial({ color: 0x4f8639, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.02, 0); scene.add(outer);

    /**
     * ★**ラチ（柵）**。★これが後ろへ流れることで速さが読めます。
     *   ★等間隔の柱を並べ、★後ろへ出たものを前へ回します。
     * ⚠️ ★**向こう側だけに置きます。** ★手前に置くと ★**馬の脚を横切って**、
     *    ★何が起きているか読めなくなりました（★2026-09-03・実画面）。
     */
    const railGroup = new THREE.Group();
    const postGeom = new THREE.BoxGeometry(0.09, 1.1, 0.09);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ea });
    const POST_GAP = 4;
    const POST_COUNT = 46;
    const posts: THREE.Mesh[] = [];
    for (let i = 0; i < POST_COUNT; i += 1) {
      const post = new THREE.Mesh(postGeom, postMat);
      post.position.set(-7.2, 0.55, -i * POST_GAP + 40);
      railGroup.add(post); posts.push(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 220), barMat);
    bar.position.set(-7.2, 1.0, 0); railGroup.add(bar);
    /** ★距離標。★等間隔に立てて流すと、★速さと進みが読めます */
    const poles: THREE.Mesh[] = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe4e0d2 });
    for (let i = 0; i < 12; i += 1) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.12), poleMat);
      pole.position.set(-8.6, 1.0, -i * 16 + 40);
      railGroup.add(pole); poles.push(pole);
    }
    scene.add(railGroup);

    /** ★勝負服・毛色は購入素材のものを使います（★13 種の casaque があります） */
    const textureLoader = new THREE.TextureLoader();
    /**
     * ★毛色。⚠️ ★**素材が持っている毛色をそのまま使います**（鹿毛・黒鹿毛・芦毛）。
     *   ★灰色の下地を毛色で染める案は ★**全頭が黒く沈みました**（★2026-09-03・実画面）。
     *   ★STAR の 6 毛色へ広げるのは、★素材の毛色で成立を確かめてからにします。
     */
    const bodyMaps = ['horse-body.png', 'horse-body-02.png', 'horse-body-03.png']
      .map((n) => textureLoader.load(`/rig-lab-assets/${n}`));
    const silkMaps = ['silks-01.png', 'silks-02.png', 'silks-03.png']
      .map((n) => textureLoader.load(`/rig-lab-assets/${n}`));
    const hairMap = textureLoader.load('/rig-lab-assets/horse-hair.png');
    const saddleMap = textureLoader.load('/rig-lab-assets/saddle.png');
    const colourTextures = [...bodyMaps, ...silkMaps, hairMap, saddleMap];
    for (const t of colourTextures) t.colorSpace = THREE.SRGBColorSpace;

    /**
     * ★**法線と粗さ**（★購入素材に入っているのに、★1 枚も使っていませんでした）。
     *   ⚠️ ★これが無いと ★**のっぺりした樹脂**に見えます（★2026-09-03・オーナー評）。
     *   ★色ではないので `colorSpace` は触りません（★触ると陰影が狂います）。
     */
    const bodyNormal = textureLoader.load('/rig-lab-assets/horse-body-nmap.png');
    const bodyRough = textureLoader.load('/rig-lab-assets/horse-body-rough.png');
    const hairNormal = textureLoader.load('/rig-lab-assets/horse-hair-nmap.png');
    const jockeyNormal = textureLoader.load('/rig-lab-assets/jockey-body-nmap.png');
    const jockeyRough = textureLoader.load('/rig-lab-assets/jockey-body-rough.png');
    const saddleNormal = textureLoader.load('/rig-lab-assets/saddle-nmap.png');
    const dataTextures = [bodyNormal, bodyRough, hairNormal, jockeyNormal, jockeyRough, saddleNormal];
    const allTextures = [...colourTextures, ...dataTextures];

    /** ★材質ごとの肌ざわり */
    const surfaceOf = (name: string): { normal: THREE.Texture | null; rough: THREE.Texture | null; roughness: number } => {
      const n = name.toLowerCase();
      if (n.includes('horse_body')) return { normal: bodyNormal, rough: bodyRough, roughness: 0.62 };
      if (n.includes('horse_hair')) return { normal: hairNormal, rough: null, roughness: 0.75 };
      if (n.includes('saddle')) return { normal: saddleNormal, rough: null, roughness: 0.7 };
      if (n.includes('jockey') || n.includes('material #4')) return { normal: jockeyNormal, rough: jockeyRough, roughness: 0.55 };
      return { normal: null, rough: null, roughness: 0.8 };
    };

    /** ★色は `palette.json` が唯一の出どころ（★裁定 7） */
    let coats: Record<string, string> = {};
    const sourceMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const toonMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

    const materialMap = (name: string, index: number): THREE.Texture | null => {
      const n = name.toLowerCase();
      if (n.includes('horse_body')) return bodyMaps[LANES[index]!.body] ?? null;
      if (n.includes('horse_hair')) return hairMap;
      if (n.includes('saddle')) return saddleMap;
      if (n.includes('jockey') || n.includes('material #4')) return silkMaps[LANES[index]!.silk] ?? null;
      return null;
    };

    type Runner = {
      readonly group: THREE.Group;
      readonly mixer: THREE.AnimationMixer;
      /** ★この馬の走る速さ [m/s]。★脚の回転もここから決まります */
      speed: number;
      /** ★先頭からの遅れ [m] */
      lag: number;
      readonly phase: number;
      readonly wobble: number;
    };
    const runners: Runner[] = [];

    const prepare = (source: THREE.Object3D, index: number, clip: THREE.AnimationClip): void => {
      const model = cloneSkeleton(source);
      /** ★実寸へ（★素材 2.19 単位 → `HORSE_HEIGHT_M`） */
      model.scale.setScalar(SCALE);
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.set(-centre.x, -box.min.y, -centre.z);
      model.traverse((node) => {
        const lower = node.name.toLowerCase();
        if (node.name.toUpperCase().includes('LOD1') || lower.includes('horse_mask') || lower.includes('reins_')) {
          node.visible = false; return;
        }
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = true; node.receiveShadow = true;
        const originals = (Array.isArray(node.material) ? node.material : [node.material])
          .map((material: THREE.Material) => {
            const copy = material.clone() as THREE.MeshStandardMaterial;
            const map = materialMap(copy.name, index);
            if (map && 'map' in copy) {
              copy.map = map;
              /** ★毛だけ「下地 × 毛色」。★勝負服は模様が RGB にあるのでそのまま */
              copy.color?.set(0xffffff);
              const surface = surfaceOf(copy.name);
              if (surface.normal) { copy.normalMap = surface.normal; copy.normalScale = new THREE.Vector2(1, 1); }
              if (surface.rough) copy.roughnessMap = surface.rough;
              copy.roughness = surface.roughness;
              copy.metalness = 0;
              copy.envMapIntensity = copy.name.toLowerCase().includes('horse_body') ? 0.55 : 0.85;
              copy.needsUpdate = true;
            }
            return copy as THREE.Material;
          });
        node.material = Array.isArray(node.material) ? originals : originals[0]!;
        sourceMaterials.set(node, node.material);
        const toonSet = originals.map((material) => new THREE.MeshToonMaterial({
          color: 0xffffff,
          map: materialMap(material.name, index),
          transparent: lower.includes('hair'),
          alphaTest: lower.includes('hair') ? 0.25 : 0,
        }));
        toonMaterials.set(node, Array.isArray(node.material) ? toonSet : toonSet[0]!);
      });
      const group = new THREE.Group();
      group.add(model);
      group.position.set(LANES[index]!.x, 0, 0);
      /** ★+Z へ進むので、モデルをその向きへ */
      group.rotation.y = 0;
      scene.add(group);
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(clip).play();
      runners.push({
        group, mixer, speed: 16, lag: index * 1.1,
        phase: [0, 0.62, 1.24][index] ?? 0,
        wobble: [0.9, 1.35, 0.6][index] ?? 1,
      });
    };

    let clipDuration = 1.9667;
    const boot = fetch('/art/palette.json').then((r) => r.json()).then((j: Record<string, string>) => { coats = j; }).catch(() => undefined);
    void boot.then(() => new FBXLoader().load('/rig-lab-assets/model.fbx', (loaded) => {
      const full = loaded.animations[0];
      if (!full) { setStatus('★購入 FBX にアニメーションがありません'); return; }
      const clip = THREE.AnimationUtils.subclip(full, 'SpeedRun', SPEED_RUN.from, SPEED_RUN.to, SPEED_RUN.fps);
      clipDuration = clip.duration;
      for (let i = 0; i < LANES.length; i += 1) prepare(loaded, i, clip);
      setStatus('読み込み完了');
    }, undefined, (error) => setStatus(`★購入素材の読み込みに失敗: ${String(error)}`)));

    /** ★砂煙 */
    const dustCanvas = document.createElement('canvas');
    dustCanvas.width = 128; dustCanvas.height = 128;
    const dctx = dustCanvas.getContext('2d');
    if (dctx) {
      const g = dctx.createRadialGradient(64, 64, 4, 64, 64, 60);
      g.addColorStop(0, 'rgba(236,210,169,.55)'); g.addColorStop(1, 'rgba(210,177,132,0)');
      dctx.fillStyle = g; dctx.fillRect(0, 0, 128, 128);
    }
    const dustTexture = new THREE.CanvasTexture(dustCanvas);
    const dust = Array.from({ length: 18 }, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTexture, transparent: true, depthWrite: false, opacity: 0.4 }));
      s.scale.setScalar(0.7 + (i % 4) * 0.22); scene.add(s); return s;
    });

    /**
     * ★**後処理の列**。⚠️ ★順番に意味があります。
     *   ★ブルーム（光の滲み）→ ★出力（トーンマッピングと色空間）→ ★アンチエイリアス
     *   ★`OutputPass` より前は線形色空間、★後は表示色空間です（★入れ替えると色が転びます）。
     *
     * 【⚠️ ★AO（GTAO）は外しました】
     *   ★入れたところ ★**砂煙のスプライトが黒い箱**になり、★空も白飛びしました（★実画面で確認）。
     *   ★AO は不透明な物を前提にした処理で、★透過スプライトと相性が悪いためです。
     *   ★接地感は ★**柔らかい影（VSM）** のほうで出しています。
     *
     * 【⚠️ ★ブルームは弱く】
     *   ★1 度目は `強さ 0.28 / 敷居 0.92` で ★**空がまるごと光りました**。
     *   ★空の明るさが敷居を超えていたためです。★敷居を上げ、強さを落とします。
     */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.14, 0.6, 1.05);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.addPass(new SMAAPass());

    let raf = 0;
    let last = performance.now();
    let sized = '';
    /** ★見た目の走行距離 [m]。★地面も柵も砂煙も、すべてこの 1 つから流します */
    let travelled = 0;
    let clock = 0;

    const draw = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      const width = Math.max(320, host.clientWidth);
      const height = Math.round((width * 9) / 16);
      const key = `${width}x${height}`;
      if (key !== sized) {
        sized = key;
        renderer.setSize(width, height);
        composer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      if (!st.paused) {
        clock += dt;
        travelled += st.speedMps * dt;

        for (let i = 0; i < runners.length; i += 1) {
          const r = runners[i]!;
          /** ★競り合い … ★速度差はゆっくり入れ替わる（★決め打ちの順位にしない） */
          const swing = st.contest ? Math.sin(clock * 0.55 + r.phase) * 0.5 * r.wobble : 0;
          r.speed = st.speedMps + swing;
          r.lag += (r.speed - st.speedMps) * dt;
          /**
           * ★**脚の回転は、その馬の速さから決めます。**
           *   ★これで ★**どの馬も蹄が滑りません**（★速い馬だけ滑る、が起きない）。
           */
          const rate = r.speed / MPS_PER_RATE;
          r.mixer.setTime((clock * rate + r.phase) % clipDuration);
          r.group.position.z = r.lag;
        }

        /** ★地面と柵を、★**先頭の速さ**で後ろへ流す */
        groundTexture.offset.y = -(travelled / 220) * 60;
        for (const post of posts) {
          post.position.z -= st.speedMps * dt;
          if (post.position.z < -70) post.position.z += POST_COUNT * POST_GAP;
        }
        for (const pole of poles) {
          pole.position.z -= st.speedMps * dt;
          if (pole.position.z < -80) pole.position.z += 12 * 16;
        }
      }

      /** ★カメラ … ★真横から、★馬群の中ほどを追う（★指示書 §6-3「真横カメラに限定してよい」） */
      const mid = runners.length > 0
        ? runners.reduce((sum, r) => sum + r.lag, 0) / runners.length
        : 0;
      /**
       * ★真横・引きの画角。★馬の高さが画面の 2 割強に収まる距離を選んでいます
       *   （★指示書 §5「馬が大きい」を繰り返さないため）。
       * ⚠️ ★1 度目は馬群より前に立てていたので、★**馬が右へ寄っていました**。
       */
      /**
       * ★**参考映像の画角に合わせています**（★推測で決めていません）:
       *   ★馬の高さが画面の **3 割強** ／ ★真横やや上 ／ ★背景は単純
       *   ★距離 = 馬高 2.5m ÷ tan(視野 20° × 0.35 ÷ 2) ≒ **20m**
       */
      camera.position.set(20.5, 2.5, mid + 0.6);
      camera.lookAt(-0.8, 1.75, mid);

      for (let i = 0; i < dust.length; i += 1) {
        const s = dust[i]!;
        const lane = LANES[i % LANES.length]!;
        const cycle = (clock * 1.9 + i * 0.31) % 2;
        const r = runners[i % Math.max(1, runners.length)];
        s.position.set(lane.x + 0.25, 0.22 + cycle * 0.16, (r?.lag ?? 0) - 1.1 - cycle * 1.5);
        (s.material as THREE.SpriteMaterial).opacity = st.paused ? 0.16 : Math.max(0, 0.4 * (1 - cycle / 2));
      }

      for (const [mesh, material] of sourceMaterials) {
        mesh.material = st.toon ? toonMaterials.get(mesh) ?? material : material;
      }
      /** ★入切で比べられるようにしています（★効いているかを目で確かめるため） */
      if (st.fx) composer.render(); else renderer.render(scene, camera);
      raf = requestAnimationFrame(draw);
    };
    draw(performance.now());

    return () => {
      cancelAnimationFrame(raf);
      for (const m of toonMaterials.values()) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      allTextures.forEach((t) => t.dispose());
      groundTexture.dispose(); dustTexture.dispose(); crowdTexture.dispose();
      skyTexture.dispose(); envMap.dispose(); composer.dispose(); renderer.dispose();
      host.replaceChildren();
    };
  }, []);

  const rate = speedMps / MPS_PER_RATE;

  return (
    <main style={{ minHeight: '100vh', background: '#171512', color: '#f5efe4', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 21 }}>最終直線・3 頭テスト（★購入リグ）</h1>
        <p style={{ margin: '0 0 10px', color: '#c9c0b2', fontSize: 13 }}>
          ★アップとコーナーを使わず、★購入リグが短い競馬演出として成立するかを見ます。
        </p>
        <div
          ref={hostRef}
          /** ⚠️ ★縦を画面に収めます（★操作卓が画面外に出ないように） */
          style={{
            width: '100%', maxWidth: 'min(1200px, calc(62vh * 16 / 9))', margin: '0 auto',
            overflow: 'hidden', border: '1px solid #5d5549', background: '#bcd3e2',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setPaused((v) => !v)} style={buttonStyle}>{paused ? '▶ 再生' : '⏸ 停止'}</button>
          <button type="button" onClick={() => setToon((v) => !v)} style={buttonStyle}>{toon ? '元の質感' : 'トゥーン質感'}</button>
          <button type="button" onClick={() => setContest((v) => !v)} style={buttonStyle}>{contest ? '競り合い: 入' : '競り合い: 切'}</button>
          <button type="button" onClick={() => setFx((v) => !v)} style={{ ...buttonStyle, background: fx ? '#2f6fd0' : '#332e27' }}>
            {fx ? '描画の強化: 入' : '描画の強化: 切'}
          </button>
          <label style={{ fontSize: 13, fontWeight: 700 }}>
            速さ {speedMps.toFixed(1)} m/s（再生 ×{rate.toFixed(2)}）
            <input
              type="range" min={8} max={20} step={0.5} value={speedMps}
              onChange={(e) => setSpeedMps(Number(e.target.value))}
              style={{ display: 'block', width: 260, marginTop: 4 }}
            />
          </label>
        </div>
        <p style={{ color: '#dbc98f', lineHeight: 1.7, fontSize: 13, marginTop: 10 }}>{status}</p>
        <p style={{ color: '#aaa095', fontSize: 12.5, lineHeight: 1.8 }}>
          ★地面の速さは、素材から測った値で決めています — ★接地中の蹄は 2.66 単位/秒（等倍）で後ろへ流れるので、
          ★地面もその速さで流します。★<b>速さを変えても蹄は滑りません</b>（再生倍率と地面が同じ式から出るため）。<br />
          ★判定点：★引きの画角で競馬に見えるか ／ ★3 頭の脚と騎手の同期が破綻しないか ／ ★競り合いが読めるか。
        </p>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  minHeight: 40, padding: '6px 14px', border: '1px solid #9b8a6f', borderRadius: 6,
  background: '#332e27', color: '#fff', cursor: 'pointer', fontWeight: 700,
};
