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
    <section className="py-14 sm:py-20 bg-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-display text-center text-navy mb-3">
          Trusted By
        </h2>
        <p className="text-center text-gray font-body mb-12 max-w-lg mx-auto">
          Proud to bring smiles to these amazing organizations.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 lg:gap-16">
          {clients.map((client, i) => (
            <div
              key={i}
              className={`h-20 w-36 flex items-center justify-center p-3 grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all duration-300 rounded-xl ${client.darkBg ? 'bg-navy' : ''}`}
            >
              <img
                src={client.logo}
                alt={client.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
