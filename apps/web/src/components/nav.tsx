'use client';
import { usePathname } from 'next/navigation';

const LINKS: ReadonlyArray<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: '/', label: '番組表', match: (p) => p === '/' || p.startsWith('/races') },
  { href: '/stable', label: 'わたしの馬', match: (p) => p.startsWith('/stable') },
  { href: '/training', label: '育成', match: (p) => p.startsWith('/training') || p.startsWith('/entry') },
  { href: '/records', label: '記録', match: (p) => p.startsWith('/records') || p.startsWith('/prizes') },
];

/** グローバルナビ（アーケード筐体: 現在地は白い錠剤、他は白 86%）— 正本 design/hud-ds/components/program-board */
export function ArcadeNav() {
  const path = usePathname() ?? '/';
  return (
    <nav style={{ display: 'flex', gap: 6, marginLeft: 24 }}>
      {LINKS.map((l) => {
        const on = l.match(path);
        return (
          <a
            key={l.href}
            href={l.href}
            style={{
              display: 'flex', alignItems: 'center', height: 34, padding: '0 16px', borderRadius: 8,
              fontSize: 14, fontWeight: 900,
              background: on ? '#fff' : 'transparent',
              color: on ? 'var(--a-blue-d)' : 'rgba(255,255,255,.86)',
              boxShadow: on ? '0 2px 0 rgba(0,0,0,.25)' : 'none',
            }}
          >
            {l.label}
          </a>
        );
      })}
    </nav>
  );
}
