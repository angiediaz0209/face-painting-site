import Reveal from './Reveal';
import pixieLogo from '../assets/designs/clients/pixie-logo.png';
import mariposaLogo from '../assets/designs/clients/mariposa-school.png';
import mtSchoolLogo from '../assets/designs/clients/mtschool_logo.svg';
import lionsLogo from '../assets/designs/clients/Lions_Clubs_International_logo.svg.webp';
import jccLogo from '../assets/designs/clients/jcc-logo.svg';

const clients = [
  { name: 'Pixie Park', logo: pixieLogo },
  { name: 'Mariposa School', logo: mariposaLogo },
  { name: 'Mountain School', logo: mtSchoolLogo },
  { name: 'Lions Club International', logo: lionsLogo },
  { name: 'JCC', logo: jccLogo, darkBg: true },
];

export default function Clients() {
  return (
    <section className="py-14 sm:py-16 bg-white">
      <Reveal className="max-w-6xl mx-auto px-5 sm:px-8">
        <p className="font-body text-[13px] font-semibold uppercase tracking-[0.14em] text-mist text-center mb-10">
          A few of the places we've worked
        </p>
        {/* Full colour, as each organisation's own branding.

            Scrolls sideways rather than wrapping, so the strip is always one
            row however many logos there are or however narrow the screen.
            `py-3` is load-bearing: `overflow-x-auto` computes `overflow-y` to
            `auto` as well, so without vertical room the tiles' hover scale
            would clip and raise a stray vertical scrollbar. */}
        <div
          className="no-scrollbar overflow-x-auto scroll-smooth py-3 -mx-5 px-5 sm:-mx-8 sm:px-8"
          tabIndex={0}
          role="group"
          aria-label="Organisations we have worked with"
        >
          {/* w-max + mx-auto: centred while the row fits, and left-aligned
              (mx-auto resolving to 0) the moment it overflows. */}
          <div className="flex flex-nowrap items-center gap-x-8 sm:gap-x-10 w-max mx-auto">
            {clients.map((client) => (
              <div
                key={client.name}
                className={`shrink-0 h-20 w-36 sm:h-24 sm:w-44 flex items-center justify-center transition-transform duration-300 hover:scale-105 ${
                  client.darkBg ? 'bg-shade rounded-xl p-3.5' : ''
                }`}
              >
                <img src={client.logo} alt={client.name} className="max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
