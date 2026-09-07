import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FILES: Readonly<Record<string, { readonly file: string; readonly type: string }>> = {
  'horse.glb': { file: 'assets-spike/3d/holsteiner.glb', type: 'model/gltf-binary' },
  'draco/draco_decoder.js': { file: 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js', type: 'text/javascript' },
  'draco/draco_wasm_wrapper.js': { file: 'node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js', type: 'text/javascript' },
  'draco/draco_decoder.wasm': { file: 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm', type: 'application/wasm' },
};

export async function GET(_request: Request, context: { params: Promise<{ asset: string[] }> }) {
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 });
  const key = (await context.params).asset.join('/');
  if (key.startsWith('purchased/')) {
    const relative = key.slice('purchased/'.length);
    const root = path.resolve(process.cwd(), '..', '..', 'assets-spike/3d/race-horse-jockey-lod-source');
    const requested = relative === 'model.fbx'
      ? path.join(root, 'ANIM_allmodels_allanim_BlenderFriendly.fbx')
      : path.resolve(root, relative);
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
      return new NextResponse(null, { status: 404 });
    }
    const extension = path.extname(requested).toLowerCase();
    const type = extension === '.fbx' ? 'application/octet-stream'
      : extension === '.png' ? 'image/png'
        : extension === '.tga' ? 'image/x-tga'
          : 'application/octet-stream';
    try {
      return new NextResponse(await readFile(requested), { headers: { 'content-type': type, 'cache-control': 'no-store' } });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }
  const entry = FILES[key];
  if (entry === undefined) return new NextResponse(null, { status: 404 });
  const bytes = await readFile(path.join(process.cwd(), '..', '..', entry.file));
  return new NextResponse(bytes, { headers: { 'content-type': entry.type, 'cache-control': 'no-store' } });
}
