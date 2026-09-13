'use client';

import { useEffect, useRef, useState } from 'react';
import './story.css';

type SpriteFrame = { x: number; y: number; w: number; h: number; nativeBounds: { x: number; y: number } };
type SpriteSet = { role: string; frames: SpriteFrame[]; coats: Record<string, string> };
const COATS = [
  { id: 'bay', name: '鹿毛', color: '#86502f' },
  { id: 'chestnut', name: '栗毛', color: '#b37442' },
  { id: 'grey', name: '芦毛', color: '#d5d3c9' },
];

function RunningHorse({ coat, paused }: { coat: string; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let observer: IntersectionObserver | undefined;
    let visible = true;
    setReady(false);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    async function load() {
      try {
        const response = await fetch('/art/baked/manifest.json');
        if (!response.ok) throw new Error('Sprite manifest unavailable');
        const manifest = await response.json() as { sets: SpriteSet[] };
        const set = manifest.sets.find((item) => item.role === 'side-v6');
        const file = set?.coats[coat];
        if (!set || !file || disposed) return;
        const sprite = new Image();
        sprite.src = `/art/baked/${file}`;
        await sprite.decode();
        if (disposed || !canvas.current) return;
        const cv = canvas.current;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        cv.width = 1024; cv.height = 576;
        observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; });
        observer.observe(cv);
        let previous = -1;
        function draw(time: number) {
          if (disposed) return;
          const frameIndex = paused || media.matches ? 0 : Math.floor(time / 85) % set!.frames.length;
          if (visible && !document.hidden && previous !== frameIndex) {
            const frame = set!.frames[frameIndex]!;
            ctx!.clearRect(0, 0, 1024, 576);
            ctx!.drawImage(sprite, frame.x, frame.y, frame.w, frame.h,
              frame.nativeBounds.x, frame.nativeBounds.y, frame.w, frame.h);
            previous = frameIndex;
          }
          raf = requestAnimationFrame(draw);
        }
        setReady(true);
        raf = requestAnimationFrame(draw);
      } catch { /* The original horse remains visible if the atlas cannot load. */ }
    }
    void load();
    return () => { disposed = true; cancelAnimationFrame(raf); observer?.disconnect(); };
  }, [coat, paused]);
  return <div className="ms-horse">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {!ready && <img src="/art/horse-jockey-side-v8-pose01.png" alt="草原を駆ける馬と騎手" />}
    <canvas ref={canvas} role="img" aria-label={`${COATS.find((c) => c.id === coat)?.name ?? ''}の馬と騎手が走るアニメーション`} style={{ opacity: ready ? 1 : 0 }} />
  </div>;
}

export default function HorseStory() {
  const [coat, setCoat] = useState('bay');
  const [paused, setPaused] = useState(false);
  const landscape = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = landscape.current;
    if (!node) return;
    let pending = 0;
    const update = () => {
      pending = 0;
      const progress = Math.max(0, Math.min(1, -node.getBoundingClientRect().top / (node.offsetHeight - window.innerHeight)));
      node.style.setProperty('--journey', String(progress));
    };
    const scroll = () => { if (!pending) pending = requestAnimationFrame(update); };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll);
    update();
    return () => { window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll); cancelAnimationFrame(pending); };
  }, []);
  return <div className={`ms-page${paused ? ' ms-paused' : ''}`}>
    <nav className="ms-nav" aria-label="馬物語のナビゲーション">
      <a className="ms-brand" href="/">馬物語<span>UMA MONOGATARI</span></a>
      <div className="ms-nav-links"><a href="#story">物語を知る</a><a href="/race">レースを観る ↗</a></div>
      <a className="ms-nav-start" href="/signup">はじめる <span>↗</span></a>
    </nav>

    <div className="ms-journey" ref={landscape}>
      <div className="ms-stage" aria-hidden="true">
        <div className="ms-sun" /><div className="ms-cloud ms-cloud-one" /><div className="ms-cloud ms-cloud-two" />
        <div className="ms-hills ms-hills-far" /><div className="ms-hills ms-hills-near" />
        <div className="ms-stand" /><div className="ms-field" /><div className="ms-fence" />
        <div className="ms-track" /><div className="ms-speed" />
      </div>
      <section className="ms-hero">
        <div className="ms-hero-copy">
          <p className="ms-eyebrow"><span /> あなたと育つ、競馬の物語。</p>
          <h1>この一頭から、<br /><em>物語</em>がはじまる。</h1>
          <p className="ms-lead">育てる日々も、駆け抜ける一瞬も。<br />まだ名前のない夢を、あなたの馬と。</p>
          <div className="ms-actions"><a className="ms-primary" href="/signup">無料で物語をはじめる <span>↗</span></a><a className="ms-secondary" href="/race"><span>▷</span> レースを観る</a></div>
          <p className="ms-small">無料で遊べるオンライン競馬育成ゲーム</p>
        </div>
        <div className="ms-runner"><div className="ms-horse-shadow" /><RunningHorse coat={coat} paused={paused} /></div>
        <div className="ms-coats"><span>物語の主役は、どんな一頭？</span><div>{COATS.map((c) => <button key={c.id} type="button" aria-label={`${c.name}をプレビュー`} aria-pressed={coat === c.id} onClick={() => setCoat(c.id)}><i style={{ backgroundColor: c.color }} />{c.name}</button>)}</div><small>毛色のプレビュー</small></div>
        <div className="ms-hero-footer"><a href="#story">SCROLL TO YOUR STORY <span>↓</span></a><button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? '▷ 動きを再生' : 'Ⅱ 動きを止める'}</button></div>
        <span className="ms-watermark" aria-hidden="true">THE FIRST CHAPTER</span>
      </section>
      <section className="ms-story" id="story">
        <div className="ms-story-heading"><span className="ms-eyebrow">01 — EVERY DAY COUNTS</span><h2>強くなるまでの時間も、<br />好きになる。</h2><p>今日は鍛えようか。それとも、ひと休み？<br />小さな選択を重ねて、あなたらしい一頭に。</p></div>
        <div className="ms-chapters">
          <article><span>01 / 育てる</span><h3>昨日より、<br />少し頼もしい。</h3><p>調教と休養、調子を見ながら。<br />一頭ずつ違う素質を育てよう。</p><div className="ms-growth"><i /><i /><i /><i /><i /><i /><i /></div><small>日々の積み重ねが、走る力になる。</small></article>
          <article><span>02 / 挑む</span><h3>その直線に、<br />想いが走る。</h3><p>育てた馬が、いよいよレースへ。<br />最後の一歩まで、目が離せない。</p><a href="/race">レースを体験する <span>↗</span></a></article>
        </div>
      </section>
    </div>

    <section className="ms-legacy">
      <div className="ms-legacy-copy"><span className="ms-eyebrow">02 — THE STORY GOES ON</span><h2>その夢は、<br /><em>次の世代へ。</em></h2><p>一度のゴールで、終わらない。<br />大切に育てた馬の血をつないで、<br />まだ見ぬ可能性に出会おう。</p></div>
      <div className="ms-family" aria-label="配合で次の世代へつながる血統のイメージ"><div className="ms-parents"><span>育てた強さ<small>YOUR HORSE</small></span><b>＋</b><span>新しい可能性<small>PARTNER</small></span></div><div className="ms-family-line" /><div className="ms-next"><span>THE NEXT CHAPTER</span><strong>また、新しい物語。</strong><span className="ms-star">✧</span></div></div>
    </section>
    <section className="ms-finale"><span className="ms-eyebrow">YOUR STORY STARTS HERE</span><h2>名馬になるかは、まだわからない。<br /><em>愛馬になることは、きっと。</em></h2><a className="ms-primary" href="/signup">無料で物語をはじめる <span>↗</span></a><a className="ms-login" href="/login">すでに物語をはじめた方はこちら</a></section>
    <footer className="ms-footer"><a className="ms-brand" href="/">馬物語<span>UMA MONOGATARI</span></a><p>育てる。走る。つながっていく。</p><a href="/lp-arcade">以前のTOPを見る ↗</a><small>© 馬物語</small></footer>
  </div>;
}
