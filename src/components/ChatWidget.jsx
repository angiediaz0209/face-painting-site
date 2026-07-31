import { useState, useRef, useEffect } from 'react';
import { MinusIcon } from './Icons';
import {
  Chips,
  DatePickerCard,
  TimeCard,
  QuoteCard,
  DetailsForm,
  SuccessCard,
} from './ChatWidgets';

const API_URL = '/api';

const GREETING = {
  role: 'assistant',
  content:
    "Hey! I'm Sky with Face Painting California 🎨\nWhat are you celebrating? Tell me a bit about it and I'll get you a price.",
  ui: {
    type: 'choices',
    options: ['Birthday party', 'Corporate event', 'Festival', 'School event'],
  },
};

export default function ChatWidget({ onClose }) {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('sky-chat-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Size of the actually-visible area on phones. See the effect below.
  const [visible, setVisible] = useState(null);

  useEffect(() => {
    localStorage.setItem('sky-chat-history', JSON.stringify(messages));
  }, [messages]);

  // Jump straight to the newest message the first time, so reopening a saved
  // conversation doesn't land you in the middle of old history. Animate after
  // that, where the movement is meaningful.
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (hasScrolled.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    // First paint: set scrollTop directly rather than using scrollIntoView,
    // which lands short here. Pin once on the next frame, then again once the
    // webfonts have loaded — they reflow the text and leave the list a couple
    // of dozen pixels short of the bottom otherwise.
    let cancelled = false;
    const pin = () => {
      const list = listRef.current;
      if (list && !cancelled) list.scrollTop = list.scrollHeight;
    };
    const frame = requestAnimationFrame(() => {
      pin();
      hasScrolled.current = true;
    });
    document.fonts?.ready.then(pin).catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [messages, isLoading]);

  // Escape closes the chat, as it would any dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus the composer on desktop so you can just start typing. Deliberately
  // NOT on phones: it would throw the keyboard up over the conversation before
  // the client has even read it, and most of them will tap a chip instead.
  useEffect(() => {
    if (window.matchMedia('(max-width: 639px)').matches) return;
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (messages.length === 0) setMessages([GREETING]);
  }, []);

  /**
   * Keep the chat inside the visible area when the phone keyboard is open.
   *
   * On iOS the layout viewport does NOT shrink for the keyboard, so a
   * full-height fixed panel keeps its full height and the input sits behind the
   * keyboard — you can't see what you're typing. visualViewport reports the
   * area actually on screen, so we size to that instead, and follow offsetTop
   * because iOS scrolls the visual viewport rather than resizing the layout.
   *
   * Phones only: on desktop the panel keeps its normal size.
   */
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const phone = window.matchMedia('(max-width: 639px)');

    const apply = () => {
      if (!phone.matches) {
        setVisible(null);
        return;
      }
      // The keyboard eats a big chunk of the visual viewport; anything smaller
      // than this gap is just browser chrome coming and going.
      const keyboardOpen = window.innerHeight - viewport.height > 120;
      setVisible({
        // Normally leave a strip of the website showing above the sheet, so it
        // reads as a panel over the site rather than a separate screen you're
        // stuck in. With the keyboard up there's no room to spare, so take it all.
        height: Math.round(viewport.height * (keyboardOpen ? 1 : 0.88)),
        // The sheet is anchored to the bottom of the LAYOUT viewport, but it
        // needs to sit on the bottom of the VISIBLE one. This is the gap between
        // them: 0 normally, negative (lifting the sheet) when the keyboard is up.
        shift: Math.round(viewport.offsetTop + viewport.height - window.innerHeight),
      });
    };

    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    phone.addEventListener('change', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      phone.removeEventListener('change', apply);
    };
  }, []);

  // When the keyboard opens the panel shrinks, so pull the latest message back
  // into view rather than leaving it hidden above the fold.
  useEffect(() => {
    if (visible) messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [visible?.height]);

  const sendMessageText = async (userMessage) => {
    if (isLoading) return;
    // Send the widgets along with the transcript: the server ignores them when
    // talking to the model, but uses them to know what Sky has already shown so
    // she can't repeat a widget the client has already answered.
    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `website` is a honeypot: always empty for real users. See api/chat.js.
        body: JSON.stringify({ message: userMessage, conversationHistory: updatedMessages, website: '' }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, ui: data.ui || null },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I'm having trouble connecting right now. Please text us at 415-991-9374 and we'll get you a quote right away! 🎨",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    sendMessageText(userMessage);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    localStorage.removeItem('sky-chat-history');
    setMessages([GREETING]);
  };

  // The details form posts straight to /api/booking, so there's nothing to ask
  // Sky — swap the form for a confirmation and add her sign-off locally.
  const handleSubmitted = (result) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].ui?.type === 'details_form') {
          next[i] = { ...next[i], ui: { type: 'success', result } };
          break;
        }
      }
      const first = (result.name || '').split(' ')[0];
      return [
        ...next,
        {
          role: 'assistant',
          content: result.duplicate
            ? "Looks like we already had that one from you. Our team is on it and they'll be in touch shortly."
            : result.pending
              ? `That's you sorted${first ? `, ${first}` : ''}. Our team will confirm by text shortly. Anything else I can help with?`
              : `You're all booked${first ? `, ${first}` : ''}! Confirmation's on its way to your email. Anything else I can help with?`,
        },
      ];
    });
  };

  // Only the newest widget is live; older ones stay visible but disabled so old
  // chips can't be tapped again out of context.
  const lastWidgetIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].ui) return i;
    return -1;
  })();

  const renderWidget = (msg, index) => {
    const stale = index !== lastWidgetIndex || isLoading;
    const pick = (text) => sendMessageText(text);

    switch (msg.ui.type) {
      case 'choices':
        return <Chips options={msg.ui.options} onPick={pick} disabled={stale} />;
      case 'date_picker':
        return <DatePickerCard onPick={pick} disabled={stale} />;
      case 'time_picker':
        return <TimeCard hours={msg.ui.hours} onPick={pick} disabled={stale} />;
      case 'quote':
        return (
          <QuoteCard
            city={msg.ui.city}
            hours={msg.ui.hours}
            secondArtist={msg.ui.secondArtist}
            lastQuote={msg.ui.lastQuote}
            lastHours={msg.ui.lastHours}
            onAccept={pick}
            disabled={stale}
          />
        );
      case 'details_form':
        return (
          <DetailsForm
            booking={msg.ui.booking}
            transcript={messages.map(({ role, content }) => ({ role, content }))}
            onSubmitted={handleSubmitted}
            disabled={index !== lastWidgetIndex}
          />
        );
      case 'success':
        return <SuccessCard result={msg.ui.result} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:justify-end sm:p-4 pointer-events-none">
      {/* Phones only: a light scrim so the site stays visible behind the sheet,
          and tapping it minimises the chat the same way the header button does. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Minimize chat"
        className="pointer-events-auto absolute inset-0 bg-navy/20 sm:hidden"
      />

      <div
        role="dialog"
        aria-label="Chat with Sky"
        style={
          visible
            ? { height: `${visible.height}px`, transform: `translateY(${visible.shift}px)` }
            : undefined
        }
        className="relative pointer-events-auto bg-white shadow-2xl flex flex-col w-full sm:w-[26rem] h-[88%] sm:h-[min(80vh,620px)] rounded-t-2xl sm:rounded-2xl overflow-hidden border border-navy/10"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-coral to-salmon px-3.5 pt-2.5 pb-3.5 text-white shrink-0">
          {/* Grab handle: the usual signal that a sheet can be dismissed. */}
          <div className="sm:hidden mx-auto mb-2 h-1 w-10 rounded-full bg-white/40" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base">Chat with Sky</h3>
              <p className="text-white/80 font-body text-xs">Face Painting California</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearChat}
                title="Start a new conversation"
                className="text-white/80 hover:text-white font-body text-xs font-bold px-2.5 py-1.5 rounded-full hover:bg-white/15 transition-colors"
              >
                New chat
              </button>
              <button
                onClick={onClose}
                title="Minimize — your conversation stays saved"
                aria-label="Minimize chat"
                className="flex items-center justify-center w-8 h-8 text-white rounded-full bg-white/15 hover:bg-white/25 transition-colors"
              >
                <MinusIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 bg-cream">
          {messages.map((msg, i) => (
            <div key={i}>
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 font-body text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-coral text-white rounded-br-sm'
                      : 'bg-white text-navy rounded-bl-sm shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
              {msg.role === 'assistant' && msg.ui && renderWidget(msg, i)}
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-sm px-3.5 py-2.5 font-body text-sm text-navy/50 shadow-sm">
                Sky is typing...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-navy/5 shrink-0 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="flex-1 border border-navy/10 rounded-full px-3.5 py-2 text-sm font-body bg-cream focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="bg-coral hover:bg-coral-dark text-white rounded-full px-4 py-2 text-sm font-body font-bold disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </div>
          <a
            href="sms:4159919374"
            className="block text-center text-navy/40 hover:text-coral font-body text-[11px] mt-2 transition-colors"
          >
            Prefer to text? 415-991-9374
          </a>
        </div>
      </div>
    </div>
  );
}
