import { notFound } from 'next/navigation';
import SpriteClient from './sprite-client';

/** ⚠️ ★開発専用（★購入素材を配信しないため、本番では 404） */
export default function RigLabSpritePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <SpriteClient />;
}
