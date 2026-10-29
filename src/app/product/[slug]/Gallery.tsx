"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

/**
 * Product image gallery: a large main image with a thumbnail strip below.
 * With a single image it just renders that image (no thumbnails).
 */
export default function Gallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const main = images[active] ?? images[0];
  const hasMultiple = images.length > 1;
  const prev = () => setActive((i) => (i - 1 + images.length) % images.length);
  const next = () => setActive((i) => (i + 1) % images.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex h-72 items-center justify-center rounded-2xl bg-white p-4 sm:h-[26rem]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={main}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="รูปก่อนหน้า"
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xl text-slate-700 shadow-card hover:bg-white"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="รูปถัดไป"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xl text-slate-700 shadow-card hover:bg-white"
            >
              <ChevronRightIcon />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`รูปที่ ${i + 1}`}
              aria-current={i === active}
              className={`flex h-16 w-16 items-center justify-center rounded-xl border bg-white p-1.5 transition ${
                i === active
                  ? "border-brand-900 ring-2 ring-brand-100"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${alt} รูปที่ ${i + 1}`}
                className="max-h-full max-w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
