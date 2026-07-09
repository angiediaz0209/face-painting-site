import { useState, useRef, useEffect } from 'react';
import { MinusIcon } from './Icons';

const API_URL = '/api';

export default function ChatWidget({ onClose }) {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('sky-chat-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('sky-chat-history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm Sky, the Face Painting California assistant! 🎨\nI'm here to help make your event extra special.\nWhat are we celebrating? I'd love to put together the perfect quote for you! 🎉"
      }]);
    }
  }, []);

  const sendMessageText = async (userMessage) => {
    if (isLoading) return;
    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, conversationHistory: updatedMessages }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please text us at 415-991-9374 and we'll get you a quote right away! 🎨"
      }]);
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    localStorage.removeItem('sky-chat-history');
    setMessages([{
      role: 'assistant',
      content: "Hi! I'm Sky, the Face Painting California assistant! 🎨\nI'm here to help make your event extra special.\nWhat are we celebrating? I'd love to put together the perfect quote for you! 🎉"
    }]);
  };

  return (
    <div className="fixed z-50 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-4 w-[calc(100vw-2rem)] max-w-sm">
      <div className="bg-white shadow-2xl h-[min(70vh,480px)] flex flex-col overflow-hidden border border-navy/10 rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-coral to-salmon p-3.5 text-white flex items-center justify-between shrink-0 rounded-t-2xl">
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

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 bg-cream">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 font-body text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-coral text-white rounded-br-sm'
                  : 'bg-white text-navy rounded-bl-sm shadow-sm'
              }`}>
                {msg.content}
              </div>
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

        {/* Action Buttons */}
        <div className="px-3 py-1.5 flex gap-2 border-t border-navy/5 shrink-0 bg-white">
          <button
            onClick={() => sendMessageText("I'd like to book my event!")}
            disabled={isLoading}
            className="flex-1 bg-salmon hover:bg-salmon-dark text-white text-center text-xs font-body font-bold py-2 rounded-full transition-colors disabled:opacity-50"
          >
            Book Now
          </button>
          <a
            href="sms:4159919374"
            className="flex-1 bg-coral/10 hover:bg-coral/20 text-navy text-center text-xs font-body font-bold py-2 rounded-full transition-colors"
          >
            Text Us
          </a>
        </div>

        {/* Input */}
        <div className="p-3 border-t border-navy/5 shrink-0 bg-white rounded-b-2xl">
          <div className="flex gap-2">
            <input
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
          <p className="text-center text-navy/40 font-body text-[11px] mt-2">
            Minimize anytime — your conversation stays saved here 💬
          </p>
        </div>
      </div>
    </div>
  );
}
