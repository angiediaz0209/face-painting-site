import { useState } from 'react';

import butterflyImg from '../assets/designs/butterfly.jpg';
import tigerImg from '../assets/designs/tiger.jpg';
import princessImg from '../assets/designs/princess.jpg';
import rainbowImg from '../assets/designs/rainbow.jpg';
import unicornImg from '../assets/designs/unicorn.jpg';
import superheroImg from '../assets/designs/superhero-new.jpg';
import skullImg from '../assets/designs/skull-art.jpg';
import birthdayImg from '../assets/designs/birthday.jpg';
import schoolImg from '../assets/designs/school-carnival.jpg';
import setupImg from '../assets/designs/setup.jpg';

const galleryImages = [
  { src: butterflyImg, alt: 'Butterfly face paint' },
  { src: tigerImg, alt: 'Tiger face paint' },
  { src: princessImg, alt: 'Princess face paint' },
  { src: rainbowImg, alt: 'Rainbow face paint' },
  { src: unicornImg, alt: 'Unicorn face paint' },
  { src: superheroImg, alt: 'Superhero face paint' },
  { src: skullImg, alt: 'Skull art face paint' },
  { src: birthdayImg, alt: 'Birthday party face painting' },
  { src: schoolImg, alt: 'School carnival face painting' },
  { src: setupImg, alt: 'Face painting setup' },
];

export default function Gallery() {
  const [lightboxImg, setLightboxImg] = useState(null);

  return (
    <section id="gallery" className="py-14 sm:py-20 bg-sunshine/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-display text-center text-navy mb-3">
          Sneak Peek
        </h2>
        <p className="text-center text-navy/50 font-body mb-10">
          Discover magical designs for every occasion.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {galleryImages.map((img, i) => (
            <button
              key={i}
              onClick={() => setLightboxImg(img)}
              className={`${i % 2 === 0 ? 'gallery-tilt-left' : 'gallery-tilt-right'} rounded-2xl overflow-hidden shadow-md cursor-pointer`}
            >
              <img
                src={img.src}
                alt={img.alt}
                className="w-full h-44 sm:h-56 object-cover"
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
