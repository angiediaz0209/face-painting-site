import { useState } from 'react';

import butterflyImg from '../assets/designs/butterfly.jpg';
import tigerImg from '../assets/designs/tiger.jpg';
import princessImg from '../assets/designs/princess.jpg';
import rainbowImg from '../assets/designs/rainbow.jpg';
import unicornImg from '../assets/designs/unicorn.jpg';
import superheroImg from '../assets/designs/superhero-new.jpg';
import skullImg from '../assets/designs/skull-art.jpg';
import birthdayImg from '../assets/designs/birthday.jpg';
import setupImg from '../assets/designs/setup.jpg';

const galleryImages = [
  { src: butterflyImg, alt: 'Butterfly face paint', label: 'butterfly face design' },
  { src: tigerImg, alt: 'Tiger face paint', label: 'tiger face design' },
  { src: princessImg, alt: 'Princess face paint', label: 'mermaid face design' },
  { src: rainbowImg, alt: 'Rainbow face paint', label: 'rainbow face design' },
  { src: unicornImg, alt: 'Unicorn face paint', label: 'unicorn face design' },
  { src: superheroImg, alt: 'Superhero face paint', label: 'spiderman face design' },
  { src: skullImg, alt: 'Skull art face paint', label: 'skeleton face design' },
  { src: birthdayImg, alt: 'Birthday party face painting', label: 'fairy face design' },
  { src: setupImg, alt: 'Face painting setup', label: 'paint kit photo' },
];

export default function Gallery() {
  const [lightboxImg, setLightboxImg] = useState(null);

  return (
    <section id="gallery" className="relative py-14 sm:py-24 bg-cream overflow-hidden">
      {/* pastel blob accent */}
      <div className="absolute top-6 right-8 w-40 h-40 bg-purple/20 rounded-full" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <h2 className="text-4xl sm:text-5xl font-display text-center text-navy mb-3">
          Sneak{' '}
          <span className="relative inline-block text-coral font-script font-bold pr-1">
            Peek
            <svg
              className="absolute left-0 -bottom-2 w-full"
              viewBox="0 0 120 14"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M4 9C30 4 60 4 90 7C102 8 110 9 116 6"
                stroke="#FFD93D"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h2>
        <p className="text-center text-navy/50 font-body text-lg mb-12">
          Discover magical designs for every occasion.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {galleryImages.map((img, i) => (
            <button
              key={i}
              onClick={() => setLightboxImg(img)}
              style={{ transform: `rotate(${[-2, 1.5, -1, 2, -1.5, 1][i % 6]}deg)` }}
              className="group relative rounded-3xl overflow-hidden shadow-[0_12px_24px_rgba(27,40,56,0.12)] cursor-pointer transition-transform duration-300 hover:rotate-0 hover:scale-[1.03]"
            >
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                className="w-full aspect-[4/3] object-cover"
              />
            </button>
          ))}
        </div>

        {lightboxImg && (
          <div
            className="fixed inset-0 z-50 bg-navy/90 flex items-center justify-center p-4"
            onClick={() => setLightboxImg(null)}
          >
            <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={lightboxImg.src}
                alt={lightboxImg.alt}
                className="w-full rounded-2xl shadow-2xl"
              />
              <button
                onClick={() => setLightboxImg(null)}
                className="absolute -top-3 -right-3 w-10 h-10 bg-coral text-white rounded-full flex items-center justify-center text-xl font-bold shadow-lg hover:bg-coral-dark transition"
              >
                &times;
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
