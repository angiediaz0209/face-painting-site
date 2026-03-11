import { useState } from 'react';
import Header from './components/Header';
import Gallery from './components/Gallery';
import Clients from './components/Clients';
import About from './components/About';
import Reviews from './components/Reviews';
import FAQ from './components/FAQ';
import Contact from './components/Contact';
import ChatWidget from './components/ChatWidget';
import { StarIcon, HeartIcon, PaletteIcon, MessageIcon } from './components/Icons';
import birthdayImg from './assets/designs/services/birthday.png';
import setupImg from './assets/designs/services/setup.jpg';
import festivalImg from './assets/designs/services/festival.png';
import schoolEventImg from './assets/designs/services/school-event.png';

const services = [
  {
    image: birthdayImg,
    title: 'Birthday Parties',
    desc: 'Vibrant, kid-safe designs for kids. From superheroes to fairytale princesses — every child leaves with a huge smile.',
    bg: 'bg-coral',
  },
  {
    image: setupImg,
    title: 'Corporate Events',
    desc: 'Sophisticated eye-designs and brand-colored patterns for office celebrations, team building days, and company picnics.',
    bg: 'bg-teal',
  },
  {
    image: festivalImg,
    title: 'Festivals',
    desc: 'High-speed, high-impact designs including glitter bars, neon paints, and UV-reactive art for festivals and fairs.',
    bg: 'bg-purple',
  },
  {
    image: schoolEventImg,
    title: 'School Events',
    desc: 'Perfect for school fetes, carnivals, and sports days. Team colors, mascot designs, and spirit face painting.',
    bg: 'bg-orange',
  },
];

export default function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream overflow-x-hidden">
      <Header onGetQuote={() => setIsChatOpen(true)} />

      <main>
        {/* Hero Section */}
        <section className="relative bg-navy text-white py-20 sm:py-32 overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-coral/20 rounded-full -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-purple/20 rounded-full -ml-36 -mb-36" />
          <div className="absolute top-1/2 left-1/2 w-60 h-60 bg-teal/10 rounded-full -ml-80 -mt-20" />

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <div className="inline-block bg-white/10 backdrop-blur-sm px-5 py-2 rounded-full mb-6 border border-white/20">
              <p className="text-sm sm:text-base font-body font-semibold text-white/90">Trusted Face Painting Across the Bay Area</p>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display mb-6 leading-tight">
              Turning Little Faces<br />
              into <span className="text-sunshine italic">Masterpieces</span>
            </h1>

            <p className="text-base sm:text-lg mb-10 max-w-2xl mx-auto text-white/80 font-body leading-relaxed">
              Professional, safe, and magical face painting for birthdays, festivals, and corporate events.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setIsChatOpen(true)}
                className="bg-coral hover:bg-coral-dark text-white font-body font-extrabold py-3.5 px-10 rounded-full text-lg transition-all hover:shadow-lg active:scale-95"
              >
                Book Now
              </button>
              <a
                href="#services"
                className="bg-white/10 hover:bg-white/20 border-2 border-white/30 text-white font-body font-bold py-3.5 px-10 rounded-full transition-all text-lg backdrop-blur-sm"
              >
                View Services
              </a>
            </div>
          </div>
        </section>

        {/* Trust Badges */}
        <section className="bg-white py-5 sm:py-6 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row gap-4 sm:gap-8 justify-center items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-coral/15 rounded-full flex items-center justify-center">
                <HeartIcon className="w-5 h-5 text-coral" />
              </div>
              <div>
                <span className="font-body font-bold text-navy text-sm block">Kid-Safe Paints</span>
                <span className="font-body text-gray text-xs">FDA compliant & non-toxic</span>
              </div>
            </div>
            <div className="hidden sm:block w-px h-10 bg-gray-light" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-sunshine/20 rounded-full flex items-center justify-center">
                <StarIcon className="w-5 h-5 text-orange" />
              </div>
              <div>
                <span className="font-body font-bold text-navy text-sm block">5-Star Rated</span>
                <span className="font-body text-gray text-xs">Loved by parents everywhere</span>
              </div>
            </div>
          </div>
        </section>

        {/* Sneak Peek */}
        <Gallery />

        {/* Services */}
        <section id="services" className="py-14 sm:py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl sm:text-4xl font-display text-center text-navy mb-3">
              Our Services
            </h2>
            <p className="text-center text-gray font-body mb-12 max-w-lg mx-auto">
              Professional, vibrant designs to make your event truly unforgettable.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {services.map((svc, i) => (
                <div key={i} className="card-lift bg-cream rounded-2xl overflow-hidden border border-gray-light">
                  <div className="h-48 overflow-hidden">
                    <img src={svc.image} alt={svc.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-5 sm:p-6">
                    <h3 className="text-lg font-display text-navy mb-1.5">{svc.title}</h3>
                    <p className="text-gray font-body text-sm leading-relaxed mb-4">{svc.desc}</p>
                    <button onClick={() => setIsChatOpen(true)} className={`${svc.bg} hover:opacity-90 text-white font-body font-bold text-xs py-2 px-5 rounded-full transition active:scale-95`}>
                      Check Availability
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <About />
        <Reviews />
        <Clients />
        <FAQ />
        <Contact onOpenChat={() => setIsChatOpen(true)} />

        {/* Floating Chat Button */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 bg-magenta hover:bg-coral text-white font-body font-bold p-4 sm:py-3.5 sm:px-6 rounded-full shadow-lg hover:shadow-xl flex items-center gap-2 z-40 transition-all active:scale-95"
          >
            <MessageIcon className="w-5 h-5" />
            <span className="hidden sm:inline text-sm">Chat with Sky</span>
          </button>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-navy text-white py-10">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <PaletteIcon className="w-6 h-6 text-sunshine" />
            <p className="font-display text-base">Face Painting California</p>
          </div>
          <p className="text-white/50 font-body text-sm mb-2">
            Questions? Text us at <a href="sms:4159919374" className="text-coral hover:text-sunshine font-bold transition">415-991-9374</a>
          </p>
          <p className="text-white/30 font-body text-xs">Serving Marin County, San Francisco, and Santa Rosa</p>
        </div>
      </footer>

      {isChatOpen && <ChatWidget onClose={() => setIsChatOpen(false)} />}
    </div>
  );
}
