import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

THREE.TextureLoader.prototype.load = function load(url, onLoad) {
  const texture = new THREE.Texture();
  texture.name = String(url);
  onLoad?.(texture);
  return texture;
};

const file = new URL('../assets-spike/3d/race-horse-jockey-lod-source/ANIM_allmodels_allanim_BlenderFriendly.fbx', import.meta.url);
const bytes = await readFile(file);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const model = new FBXLoader().parse(buffer, '');
const meshes = [];
model.traverse((node) => {
  if (!node.isMesh) return;
  const materials = (Array.isArray(node.material) ? node.material : [node.material]).map((material) => ({
    name: material?.name ?? '',
    color: material?.color?.getHexString?.() ?? null,
    map: material?.map?.name ?? null,
  }));
  meshes.push({ name: node.name, materials });
});
console.log(JSON.stringify({ animations: model.animations.map((clip, index) => ({ index, name: clip.name, duration: clip.duration, tracks: clip.tracks.length })), meshes }, null, 2));
