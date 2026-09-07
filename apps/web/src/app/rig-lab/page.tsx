import { notFound } from 'next/navigation';
import RigLabClient from './rig-lab-client';

export default function RigLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <RigLabClient />;
}
