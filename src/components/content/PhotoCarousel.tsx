"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

const words: Record<Locale, { region: string; previous: string; next: string; go: (n: number, total: number) => string }> = {
  zh: { region: "图片轮播", previous: "上一张", next: "下一张", go: (n, total) => `第 ${n} 张，共 ${total} 张` },
  it: { region: "Galleria di foto", previous: "Foto precedente", next: "Foto successiva", go: (n, total) => `Foto ${n} di ${total}` },
  en: { region: "Photo gallery", previous: "Previous photo", next: "Next photo", go: (n, total) => `Photo ${n} of ${total}` },
};

const SLIDE_MS = 5000;

/**
 * Photos that swipe sideways (scroll-snap), with arrows and dots. It turns itself every few seconds until someone touches it,
 * and never moves on its own for people who ask for reduced motion. Fills its frame: the parent sets the size.
 * `coverFirst` keeps the first photo (a menu's main picture) filling the frame; every other photo is shown whole.
 */
export function PhotoCarousel({ slides, locale, sizes, priority = false, coverFirst = false }: { slides: { src: string; alt: string }[]; locale: Locale; sizes: string; priority?: boolean; coverFirst?: boolean }) {
  const t = words[locale];
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);

  function goTo(next: number) {
    const el = track.current;
    if (!el) return;
    const target = (next + slides.length) % slides.length;
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const el = track.current;
      if (!el || document.hidden) return;
      const current = Math.round(el.scrollLeft / el.clientWidth);
      el.scrollTo({ left: ((current + 1) % slides.length) * el.clientWidth, behavior: "smooth" });
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [auto, slides.length]);

  return (
    <div className="photo-carousel" role="group" aria-roledescription="carousel" aria-label={t.region} onPointerDown={() => setAuto(false)} onFocus={() => setAuto(false)} onMouseEnter={() => setAuto(false)}>
      <div className="photo-carousel__track" ref={track} onScroll={(event) => { const el = event.currentTarget; setIndex(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {slides.map((slide, i) => (
          <div key={slide.src} className={coverFirst && i === 0 ? "photo-carousel__slide photo-carousel__slide--lead" : "photo-carousel__slide"} role="group" aria-roledescription="slide" aria-label={t.go(i + 1, slides.length)}>
            {/* The photo is shown whole (never cropped or blown up); the same photo, blurred and tiny, fills the space beside it. */}
            <Image className="photo-carousel__backdrop" src={slide.src} alt="" aria-hidden="true" fill sizes="48px" />
            <Image className="photo-carousel__main" src={slide.src} alt={slide.alt} fill sizes={sizes} priority={priority && i === 0} />
          </div>
        ))}
      </div>
      <button type="button" className="photo-carousel__arrow photo-carousel__arrow--prev" aria-label={t.previous} onClick={() => { setAuto(false); goTo(index - 1); }}><span aria-hidden="true">‹</span></button>
      <button type="button" className="photo-carousel__arrow photo-carousel__arrow--next" aria-label={t.next} onClick={() => { setAuto(false); goTo(index + 1); }}><span aria-hidden="true">›</span></button>
      {/* A quiet position marker, not controls: the arrows and swiping move the photos. */}
      <div className="photo-carousel__dots" aria-hidden="true">
        {slides.map((slide, i) => <span key={slide.src} className="photo-carousel__dot" data-current={i === index ? "true" : undefined} />)}
      </div>
    </div>
  );
}
