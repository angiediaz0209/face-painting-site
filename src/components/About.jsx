import { CheckIcon } from './Icons';
import Reveal from './Reveal';
import aboutImg from '../assets/designs/setup.jpg';

const points = [
  'Professional water-based paints, FDA-compliant and hypoallergenic',
  'Around 10 to 12 kids an hour, even with detailed designs',
  'Free travel in Marin County, flat $35 to SF and Santa Rosa',
];

export default function About() {
  return (
    /* No section padding and no container: the photo runs to the left edge of
       the viewport and the full height of the row, so the section reads as two
       halves rather than a card on a white field. The padding that used to sit
       on the section now lives on the text column. */
    <section id="about" className="bg-white">
      <div className="grid lg:grid-cols-2 items-stretch">
        <Reveal className="order-2 lg:order-1 aspect-[4/3] lg:aspect-auto lg:min-h-[560px]">
          <img
            src={aboutImg}
            alt="A Face Painting California setup at an event"
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </Reveal>

        <Reveal
          delay={80}
          className="order-1 lg:order-2 flex items-center justify-center px-5 sm:px-8 lg:px-12 xl:px-16 py-14 sm:py-20 lg:py-24"
        >
          <div className="w-full max-w-xl">
            <p className="eyebrow mb-3">About us</p>
            <h2 className="section-title mb-5">Based in Marin, booked across the Bay</h2>

            <p className="section-intro mb-4">
              Most weekends it's a backyard with a dozen kids and a birthday cake.
              Some weekends it's a school carnival or a company picnic with a few
              hundred people. It's the same setup either way: a chair, a table of
              paints, and a line that keeps moving.
            </p>
            <p className="section-intro mb-8">
              We've worked with Pixie Park, Mariposa School, Mountain School, the JCC,
              and Lions Club International.
            </p>

            <ul className="border-t border-line">
              {points.map((point) => (
                <li key={point} className="flex gap-3 items-start py-4 border-b border-line">
                  <CheckIcon className="w-4 h-4 text-brand shrink-0 mt-1" />
                  <span className="font-body text-[15px] text-ink leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
