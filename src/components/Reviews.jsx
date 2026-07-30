import { useState, useEffect } from 'react';
import { StarIcon } from './Icons';

const palette = [
  ['bg-coral', 'text-coral'],
  ['bg-purple', 'text-purple'],
  ['bg-teal', 'text-teal'],
];

export default function Reviews() {
  // null = still checking; [] = checked, nothing approved yet; array = real reviews.
  // Any failure also lands on [] — we never fall back to invented content.
  const [reviews, setReviews] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/review?list=1')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!active) return;
        if (!Array.isArray(data) || data.length === 0) {
          setReviews([]);
          return;
        }
        setReviews(
          data.map((r, i) => ({
            name: r.name || 'Happy client',
            event: r.event || '',
            text: r.text || '',
            stars: Math.min(5, Math.max(1, Number(r.rating) || 5)),
            color: palette[i % palette.length][0],
            starColor: palette[i % palette.length][1],
          }))
        );
      })
      .catch(() => {
        if (active) setReviews([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasReviews = Array.isArray(reviews) && reviews.length > 0;

  return (
    <section id="reviews" className="relative py-14 sm:py-24 bg-white overflow-hidden">
      {/* pale accent blob (like the reference) */}
      <div className="absolute bottom-10 left-0 w-52 h-52 bg-sunshine/30 rounded-full -ml-24" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <h2 className="text-4xl sm:text-5xl font-display text-center text-navy mb-3">
          Happy{' '}
          <span className="relative inline-block text-teal font-script font-bold pr-1">
            Clients
            <svg
              className="absolute left-0 -bottom-2 w-full"
              viewBox="0 0 150 14"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M4 9C40 4 80 4 116 7C130 8 140 9 146 6"
                stroke="#FF6B6B"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h2>

        {hasReviews ? (
          <>
            <p className="text-center text-navy/50 font-body text-lg mb-12">
              What families are saying
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {reviews.map((review, i) => (
                <div
                  key={i}
                  className={`bg-cream rounded-3xl p-7 sm:p-8 shadow-[0_18px_34px_-14px_rgba(27,40,56,0.22)] transition-transform duration-300 hover:-translate-y-1 ${
                    i === 2 && reviews.length === 3 ? 'md:col-span-2 md:max-w-lg md:mx-auto' : ''
                  }`}
                >
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: review.stars }).map((_, j) => (
                      <StarIcon key={j} className={`w-5 h-5 ${review.starColor}`} />
                    ))}
                  </div>
                  <p className="text-navy/80 font-body text-base leading-relaxed mb-6 italic">
                    "{review.text}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 ${review.color} rounded-full flex items-center justify-center shrink-0`}>
                      <span className="text-white font-display text-base">{review.name[0]}</span>
                    </div>
                    <div>
                      <p className="font-body font-bold text-navy">{review.name}</p>
                      <p className="text-gray font-body text-sm">{review.event}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-navy/50 font-body text-lg mb-10">
              We're just getting started collecting reviews
            </p>
            <div className="max-w-md mx-auto bg-cream rounded-3xl p-8 sm:p-10 text-center shadow-[0_18px_34px_-14px_rgba(27,40,56,0.22)]">
              <div className="w-14 h-14 bg-teal/15 rounded-full flex items-center justify-center mx-auto mb-5">
                <StarIcon className="w-7 h-7 text-teal" />
              </div>
              <p className="text-navy/80 font-body text-base leading-relaxed mb-6">
                We've painted for schools, festivals and families across the Bay Area —
                we just haven't collected reviews on the site yet. If you've booked with
                us, we'd love to hear how it went.
              </p>
              <a
                href="/review"
                className="inline-block bg-teal hover:bg-teal-dark text-white font-body font-bold py-3 px-8 rounded-full transition-all shadow-sm hover:shadow-md"
              >
                Leave a review
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
