import { useState, useEffect } from 'react';
import { StarIcon } from './Icons';
import Reveal from './Reveal';

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
          data.map((r) => ({
            name: r.name || 'Happy client',
            event: r.event || '',
            text: r.text || '',
            stars: Math.min(5, Math.max(1, Number(r.rating) || 5)),
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
    <section id="reviews" className="py-16 sm:py-24 bg-sand border-y border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal className="max-w-xl mb-10 sm:mb-14">
          <p className="eyebrow mb-3">Reviews</p>
          <h2 className="section-title mb-4">
            {hasReviews ? 'What families say' : "We're still collecting these"}
          </h2>
          {!hasReviews && (
            <p className="section-intro">
              We've painted for schools, festivals and families across the Bay Area.
              We just haven't collected reviews on the site yet.
            </p>
          )}
        </Reveal>

        {hasReviews ? (
          <Reveal delay={80} className="grid md:grid-cols-2 gap-5 sm:gap-6">
            {reviews.map((review, i) => (
              <figure key={i} className="surface p-7 sm:p-8 flex flex-col">
                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: review.stars }).map((_, j) => (
                    <StarIcon key={j} className="w-4 h-4 text-brand" />
                  ))}
                </div>
                <blockquote className="font-body text-[15px] text-ink leading-relaxed mb-6 flex-1">
                  {review.text}
                </blockquote>
                <figcaption className="pt-5 border-t border-line">
                  <p className="font-body font-bold text-ink text-[15px]">{review.name}</p>
                  {review.event && <p className="font-body text-sm text-mist mt-0.5">{review.event}</p>}
                </figcaption>
              </figure>
            ))}
          </Reveal>
        ) : (
          <Reveal delay={80} className="surface p-8 sm:p-10 max-w-md">
            <p className="font-body text-[15px] text-slate leading-relaxed mb-6">
              If you've booked with us, we'd love to hear how it went.
            </p>
            <a href="/review" className="btn-primary">
              Leave a review
            </a>
          </Reveal>
        )}
      </div>
    </section>
  );
}
