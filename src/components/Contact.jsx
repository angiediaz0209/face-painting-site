import { MessageIcon, PaletteIcon } from './Icons';

export default function Contact({ onOpenChat }) {
  return (
    <section id="contact" className="py-14 sm:py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-display text-navy mb-3">
          Ready to Book?
        </h2>
        <p className="text-navy/50 font-body mb-10 max-w-md mx-auto">
          Reach out and we'll get back to you right away.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-12">
          <a
            href="sms:4159919374"
            className="card-lift bg-coral/5 border-2 border-coral/20 rounded-2xl p-6 sm:p-8 group"
          >
            <div className="w-14 h-14 bg-coral rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageIcon className="w-7 h-7 text-white" />
            </div>
            <p className="font-display text-navy mb-1 group-hover:text-coral transition text-lg">Text Us</p>
            <p className="text-coral font-body font-bold text-lg">415-991-9374</p>
          </a>
          <button
            onClick={onOpenChat}
            className="card-lift bg-teal/5 border-2 border-teal/20 rounded-2xl p-6 sm:p-8 group text-center cursor-pointer"
          >
            <div className="w-14 h-14 bg-teal rounded-full flex items-center justify-center mx-auto mb-4">
              <PaletteIcon className="w-7 h-7 text-white" />
            </div>
            <p className="font-display text-navy mb-1 group-hover:text-teal transition text-lg">Get an Instant Quote</p>
            <p className="text-teal font-body font-bold text-lg">Chat with Sky</p>
          </button>
        </div>

        <div>
          <p className="text-xs font-body font-bold text-navy uppercase tracking-wider mb-4">Our Service Areas</p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            <span className="bg-teal/10 text-teal px-5 py-2.5 rounded-full text-sm font-body font-bold">Marin County</span>
            <span className="bg-purple/10 text-purple px-5 py-2.5 rounded-full text-sm font-body font-bold">San Francisco</span>
            <span className="bg-coral/10 text-coral px-5 py-2.5 rounded-full text-sm font-body font-bold">Santa Rosa</span>
          </div>
        </div>
      </div>
    </section>
  );
}
