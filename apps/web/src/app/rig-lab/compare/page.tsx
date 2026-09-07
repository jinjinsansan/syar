import { notFound } from 'next/navigation';
import CompareClient from './compare-client';

/** ⚠️ ★開発専用（★納品素材を配信しないため、本番では 404） */
export default function RigLabComparePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CompareClient />;
}
