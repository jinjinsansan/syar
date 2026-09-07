import { notFound } from 'next/navigation';
import RigClient from './rig-client';

/** ⚠️ ★開発専用（★購入素材・納品素材を配信しないため、本番では 404） */
export default function RigLabRigPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <RigClient />;
}
