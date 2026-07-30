import Anthropic from "@anthropic-ai/sdk";
import getSkySystemPrompt from "./_lib/sky-system-prompt.js";
import { createBooking, checkAvailability } from "./_lib/book.js";
import { sendBookingNotification } from "./_lib/notify.js";
import { addBookingToSheet, addConversation, isSecondArtistAvailable } from "./_lib/sheets.js";
import { computeQuote } from "./_lib/pricing.js";
import { lookupClient, upsertClient } from "./_lib/clients.js";

// Prep context for the artist, shared by show_details_form and create_booking.
// Deliberately FLAT optional strings rather than a nested object: a heavy nested
// schema measurably made the model reluctant to call the tool at all.
const DETAIL_PROPS = {
  honoree: {
    type: "string",
    description:
      "For birthdays: who the party is for, plus their age if it came up. e.g. 'Maya, turning 6'.",
  },
  companyName: {
    type: "string",
    description: "For corporate events: the company's name.",
  },
  occasion: {
    type: "string",
    description:
      "For corporate events: the occasion, e.g. holiday party, family day, team building, product launch.",
  },
  guestMix: {
    type: "string",
    enum: ["kids", "adults", "both"],
    description:
      "Whether the people being painted are kids, adults, or both. This decides what the artist packs, so fill it in whenever you know.",
  },
  specialRequests: {
    type: "string",
    description:
      "Anything the client VOLUNTEERED that the artist should know: allergies or sensitive skin, a nervous child, parking or setup notes, a theme they mentioned unprompted. Never ask for this, only record what they offered.",
  },
  customRequest: {
    type: "string",
    description:
      "Only if the client raised custom or branded designs themselves (a logo, brand colours, a specific character). Record what they asked for. You never offer or promise this; it flags the booking for the team to discuss with them.",
  },
  secondArtistRequested: {
    type: "string",
    description:
      "Only when a second artist is NOT available and the client asked for one anyway. Note what they wanted and why, so the team can try to arrange one. Leave empty otherwise.",
  },
  paperworkRequest: {
    type: "string",
    description:
      "Only when the client asks about invoicing, a purchase order, a W-9, or a certificate of insurance. Common for schools and companies. Record exactly what they need so the team can sort it out. You never offer this or promise anything about it.",
  },
};

// Pulls those flat fields back into the `details` object createBooking expects.
function pickDetails(input = {}) {
  const out = {};
  for (const key of Object.keys(DETAIL_PROPS)) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

const AVAILABILITY_TOOL = {
  name: "check_availability",
  description:
    "Checks Google Calendar for existing events on a specific date. Use this BEFORE creating a booking to check if the date is available. Returns whether the date is free or has existing events.",
  input_schema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date to check in YYYY-MM-DD format (e.g. 2026-04-15)",
      },
    },
    required: ["date"],
  },
};

const BOOKING_TOOL = {
  name: "create_booking",
  description:
    "Creates a face painting booking on Google Calendar. EVERY booking is created as PENDING for the team to review and approve. It is saved without sending the client an invite; the team approves it later (which sends the invite). Only call this after the client has confirmed the summary of their booking.",
  input_schema: {
    type: "object",
    properties: {
      clientName: {
        type: "string",
        description:
          "The client's real full name, as given by the client. Always ask for it — never guess, leave it blank, or use a placeholder like 'there', 'guest', or 'client'.",
      },
      clientEmail: {
        type: "string",
        description: "The client's email address",
      },
      clientPhone: {
        type: "string",
        description: "The client's phone number",
      },
      date: {
        type: "string",
        description: "Event date in YYYY-MM-DD format (e.g. 2026-04-15)",
      },
      startTime: {
        type: "string",
        description: "Event start time in HH:MM 24-hour format (e.g. 14:00)",
      },
      endTime: {
        type: "string",
        description: "Event end time in HH:MM 24-hour format (e.g. 16:00)",
      },
      eventType: {
        type: "string",
        description:
          "Type of event (e.g. Birthday Party, Corporate Event, Festival, School Event)",
      },
      guestCount: {
        type: "string",
        description: "Number of guests expected",
      },
      location: {
        type: "string",
        description: "Event address or location",
      },
      quote: {
        type: "string",
        description: "The quoted price (e.g. $300)",
      },
      notes: {
        type: "string",
        description:
          "Any special requests, themes, or additional notes from the client",
      },
      ...DETAIL_PROPS,
      pending: {
        type: "boolean",
        description:
          "Always true. Every booking is created pending team approval (this is enforced server-side regardless of the value sent).",
      },
    },
    required: [
      "clientName",
      "clientEmail",
      "clientPhone",
      "date",
      "startTime",
      "endTime",
      "eventType",
      "guestCount",
      "location",
      "quote",
    ],
  },
};

const QUOTE_TOOL = {
  name: "calculate_quote",
  description:
    "Calculates the exact price for a booking. ALWAYS call this before telling a client any total, instead of doing the math yourself. It returns the hours price, travel fee, second artist fee, and grand total. If the city is outside the service area it returns inServiceArea=false, so you can decline politely.",
  input_schema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description:
          "The event city (e.g. San Rafael, Novato, San Francisco, Santa Rosa).",
      },
      hours: {
        type: "number",
        description:
          "Total painting hours. 1 is $150, 2 is $300, and each hour beyond 2 adds $100. Default to 2 for most events.",
      },
      secondArtist: {
        type: "boolean",
        description:
          "True if a second artist is included (+$200). Recommend for groups of about 23 or more.",
      },
    },
    required: ["city", "hours"],
  },
};

const LOOKUP_CLIENT_TOOL = {
  name: "lookup_client",
  description:
    "Checks whether this is a RETURNING client, by phone and/or email, and whether their SCHOOL OR COMPANY has booked with us before. Call it as soon as you have a phone, an email, or a school/company name, before asking for details we might already have. Only treat someone as returning when THIS tool says so; never assume it from a name.",
  input_schema: {
    type: "object",
    properties: {
      phone: { type: "string", description: "The client's phone number, if known." },
      email: { type: "string", description: "The client's email, if known." },
      organization: {
        type: "string",
        description:
          "The school or company name, if this is a school or corporate event. Worth passing even when the person is new to us: organisations book again and again, but the person arranging it changes, so the school may be a familiar customer even though this contact isn't.",
      },
    },
  },
};

const SAVE_LEAD_TOOL = {
  name: "save_lead",
  description:
    "Saves a potential client (a lead) so the team can follow up later. Call this when you have the person's name and a phone or email but the chat is ending WITHOUT a booking (they're just checking prices, thinking it over, or not ready yet). Do NOT call it if you already created a booking for them.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The person's name." },
      phone: { type: "string", description: "Their phone number, if given." },
      email: { type: "string", description: "Their email, if given." },
      eventType: {
        type: "string",
        description: "The kind of event they asked about, if known (e.g. Birthday Party).",
      },
      notes: {
        type: "string",
        description: "A short note: what they wanted, their city/date, or why they didn't book yet.",
      },
    },
    required: ["name"],
  },
};

// ── Widget tools ────────────────────────────────────────────────────────────
// These don't do any work server-side. They let Sky attach a structured widget
// to her reply, which the chat renders under her message. Tapping one just
// sends normal text back, so the conversation stays a conversation and the
// client can always type something Sky didn't offer.
//
// Anything deterministic (price math, the calendar) is computed in the browser,
// so a tap is instant and costs nothing.

const SHOW_OPTIONS_TOOL = {
  name: "show_options",
  description:
    "Shows tappable answer chips under your message, so the client can answer with one tap instead of typing. Use it whenever your question has a few obvious answers (event type, guest count, yes/no). ALWAYS still ask the question in your own words in your message; the chips are shortcuts, not a replacement for asking. Keep options short (a few words each). The client can still type a different answer, so never treat the options as the only choices.",
  input_schema: {
    type: "object",
    properties: {
      options: {
        type: "array",
        items: { type: "string" },
        description:
          "Between 2 and 6 short answers, e.g. ['Birthday party','Corporate event','Festival','School event'] or ['Up to 12','13 to 22','23 or more'].",
      },
    },
    required: ["options"],
  },
};

const SHOW_DATE_PICKER_TOOL = {
  name: "show_date_picker",
  description:
    "Shows a calendar under your message with already-booked days crossed out, so the client taps a date instead of typing one. Use this when you're asking what date their event is. It saves you calling check_availability for a date that's already taken.",
  input_schema: { type: "object", properties: {} },
};

const SHOW_TIME_PICKER_TOOL = {
  name: "show_time_picker",
  description:
    "Shows tappable start times under your message, plus an 'Another time' option for anything not on the list. Use when asking what time the event starts. Pass the package length so the card can show the client the finish time too.",
  input_schema: {
    type: "object",
    properties: {
      hours: {
        type: "number",
        description:
          "The package length in hours, so the card can show the client the full range (e.g. 2:00 PM to 4:00 PM). Defaults to 2 if you don't know it yet.",
      },
    },
  },
};

const SHOW_QUOTE_TOOL = {
  name: "show_quote",
  description:
    "Shows an itemised price card with a Book this button. The card does the math itself from what you pass, so use this INSTEAD of calculate_quote when you're ready to present a price to the client. Say the recommendation in your own words in your message, then show the card. Show it ONCE, when you first present the price. Once the client has agreed, never show it again — move on to the date, then show_details_form. Only show it a second time if they change the package.",
  input_schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "The event city." },
      hours: { type: "number", description: "Painting hours: 1, 2, 3..." },
      secondArtist: { type: "boolean", description: "Whether a second artist is included." },
    },
    required: ["city", "hours"],
  },
};

const SHOW_DETAILS_FORM_TOOL = {
  name: "show_details_form",
  description:
    "Shows a short form for name, email, phone and address, which the client's browser can autofill in one tap. This is the ONLY way you should ever collect a name, email, phone or address — never ask for them in a message, and never ask permission to show this form. Call it as soon as the client has agreed to the price and you know the city, date, start time, event type and guest count. Submitting it creates the pending booking and notifies the team, so do NOT also call create_booking afterwards.",
  input_schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "Event city." },
      date: { type: "string", description: "Event date, YYYY-MM-DD." },
      startTime: { type: "string", description: "Start time, HH:MM 24-hour." },
      eventType: { type: "string", description: "e.g. Birthday Party." },
      guestBand: {
        type: "string",
        enum: ["small", "medium", "large"],
        description: "small = up to 12 guests, medium = 13 to 22, large = 23 or more.",
      },
      hours: { type: "number", description: "Painting hours." },
      secondArtist: { type: "boolean", description: "Whether a second artist is included." },
      notes: { type: "string", description: "Anything else useful the client mentioned." },
      ...DETAIL_PROPS,
    },
    required: ["city", "date", "startTime", "eventType", "guestBand", "hours"],
  },
};

// Widget tools are recognised here and handled without any server work.
const WIDGET_TOOLS = {
  show_options: (input) => ({ type: "choices", options: input.options || [] }),
  show_date_picker: () => ({ type: "date_picker" }),
  show_time_picker: (input) => ({
    type: "time_picker",
    hours: Number(input.hours) > 0 ? Number(input.hours) : 2,
  }),
  show_quote: (input) => ({
    type: "quote",
    city: input.city,
    hours: Number(input.hours) || 2,
    secondArtist: input.secondArtist === true,
  }),
  show_details_form: (input) => ({
    type: "details_form",
    booking: {
      city: input.city,
      date: input.date,
      startTime: input.startTime,
      eventType: input.eventType,
      guestBand: input.guestBand,
      hours: Number(input.hours) || 2,
      secondArtist: input.secondArtist === true,
      notes: input.notes || "",
      details: pickDetails(input),
    },
  }),
};

const TOOLS = [
  QUOTE_TOOL,
  AVAILABILITY_TOOL,
  BOOKING_TOOL,
  LOOKUP_CLIENT_TOOL,
  SAVE_LEAD_TOOL,
  SHOW_OPTIONS_TOOL,
  SHOW_DATE_PICKER_TOOL,
  SHOW_TIME_PICKER_TOOL,
  SHOW_QUOTE_TOOL,
  SHOW_DETAILS_FORM_TOOL,
];

// ── Abuse protection ────────────────────────────────────────────────────────
// /api/chat is public and costs money per message (and can create real
// bookings), so we throttle it. This limiter is in-memory per warm serverless
// instance — not distributed — so it won't stop a large botnet, but it does
// throttle a single source hammering the endpoint. For stronger guarantees,
// back it with Vercel KV / Upstash Redis later.
const MAX_MESSAGE_LENGTH = 2000; // cap a single message
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 15; // messages per IP per window
const rateBuckets = new Map(); // ip -> timestamp[]

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  recent.push(now);
  rateBuckets.set(ip, recent);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

// `ctx.transcript` is the conversation so far, used to archive chats that ended
// in a lead or a booking. See the Conversations tab in api/_lib/sheets.js.
async function handleToolUse(toolUse, ctx = {}) {
  // Widget tools do no work here; the directive is collected by the caller and
  // sent to the browser alongside Sky's reply.
  if (WIDGET_TOOLS[toolUse.name]) {
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify({
        shown: true,
        note: "Displayed to the client. Now write your message asking the question in your own words.",
      }),
    };
  }

  if (toolUse.name === "calculate_quote") {
    try {
      const input = { ...toolUse.input };
      if (ctx.secondArtistAvailable === false) input.secondArtist = false;
      const result = computeQuote(input);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      };
    } catch (error) {
      console.error("Quote calc error:", error);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({ error: "Could not calculate the quote." }),
      };
    }
  }

  if (toolUse.name === "lookup_client") {
    try {
      const result = await lookupClient(toolUse.input);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      };
    } catch (error) {
      console.error("Client lookup error:", error);
      // Fail closed: on error, treat them as a new client rather than guessing.
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({ known: false }),
      };
    }
  }

  if (toolUse.name === "save_lead") {
    try {
      const { name, phone, email, eventType, notes } = toolUse.input;
      const saved = await upsertClient({
        name,
        phone,
        email,
        source: "lead",
        lastEventType: eventType || "",
        notes: notes || "",
      });
      // Keep the chat that produced this lead, so the team can see what they
      // actually wanted before following up. Never fatal.
      await addConversation({
        outcome: "lead",
        name,
        phone,
        email,
        summary: [eventType, notes].filter(Boolean).join(" — "),
        messages: ctx.transcript,
      }).catch((err) => console.error("Conversation log error:", err));
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        // saved is null when there's no phone/email to key/contact the lead by.
        content: JSON.stringify({ saved: !!saved }),
      };
    } catch (error) {
      console.error("Save lead error:", error);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({ saved: false }),
      };
    }
  }

  if (toolUse.name === "check_availability") {
    try {
      const result = await checkAvailability(toolUse.input);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      };
    } catch (error) {
      console.error("Availability check error:", error);
      // Fail SAFE: if we can't verify the calendar, do NOT assume the date is
      // free (that risks double-booking over a real event). Tell Sky to treat
      // it as unverified and create a PENDING booking for the team to confirm.
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({
          available: false,
          unverified: true,
          date: toolUse.input.date,
          existingEvents: [],
          error:
            "Availability could not be verified. Create the booking as PENDING (pending=true) for team review — do NOT send a confirmed calendar invite.",
        }),
      };
    }
  }

  if (toolUse.name === "create_booking") {
    // Hard guard: never create a booking without a real client name (the schema
    // only guarantees the field is present, not that it's a genuine name). If it's
    // missing or a placeholder, send Sky back to ask the client before booking.
    const rawName = (toolUse.input.clientName || "").trim();
    const placeholder = /^(there|guest|client|customer|friend|unknown|n\/?a|none|test|-+)$/i;
    if (rawName.length < 2 || !/\p{L}/u.test(rawName) || placeholder.test(rawName)) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({
          success: false,
          message:
            "I can't book this yet — I still need the client's name. Please ask the client what name the party should be booked under, then create the booking with their real name.",
        }),
      };
    }

    try {
      // Every booking must be team-approved before it is confirmed, so force
      // pending here regardless of what the model passed. This guarantees no
      // booking auto-confirms or sends the client an invite without approval.
      const bookingInput = {
        ...toolUse.input,
        pending: true,
        details: pickDetails(toolUse.input),
      };
      const bookingResult = await createBooking(bookingInput);
      const isPending = bookingResult.pending;

      // Await both side effects so they finish before this serverless function
      // is frozen after the response. (Fire-and-forget gets cut off mid-write,
      // which is why sheet rows were going missing.) Failures are logged but
      // don't block the booking.
      await Promise.allSettled([
        sendBookingNotification(bookingInput, bookingResult).catch((err) =>
          console.error("Notification error:", err)
        ),
        addBookingToSheet(bookingInput, bookingResult).catch((err) =>
          console.error("Sheet error:", err)
        ),
        // Keep the client CRM current so this client is recognized next time and
        // shows up for birthday follow-ups.
        upsertClient(
          {
            name: bookingInput.clientName,
            phone: bookingInput.clientPhone,
            email: bookingInput.clientEmail,
            source: "booking",
            lastEventDate: bookingInput.date,
            lastEventType: bookingInput.eventType,
            lastLocation: bookingInput.location,
          },
          { incrementBookings: true }
        ).catch((err) => console.error("Client upsert error:", err)),
        addConversation({
          outcome: "booking",
          name: bookingInput.clientName,
          phone: bookingInput.clientPhone,
          email: bookingInput.clientEmail,
          summary: `${bookingInput.eventType || "Event"} · ${bookingInput.date} · ${bookingInput.quote || ""}`.trim(),
          messages: ctx.transcript,
        }).catch((err) => console.error("Conversation log error:", err)),
      ]);

      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({
          success: true,
          pending: isPending,
          message: isPending
            ? `Pending booking created for ${bookingResult.summary}, Date: ${bookingResult.start}. The team will review and confirm with the client by text at ${bookingInput.clientPhone}.`
            : `Booking confirmed! Event: ${bookingResult.summary}, Date: ${bookingResult.start}. Calendar invite sent to ${bookingInput.clientEmail}.`,
        }),
      };
    } catch (error) {
      console.error("Booking error:", error);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({
          success: false,
          message:
            "Sorry, there was an issue creating the booking. Please ask the client to text 415-991-9374 to confirm.",
        }),
      };
    }
  }

  return {
    type: "tool_result",
    tool_use_id: toolUse.id,
    content: JSON.stringify({ error: "Unknown tool" }),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, conversationHistory = [], website } = req.body;

    // Honeypot: real users never fill this hidden field; naive bots do.
    if (website) {
      return res.status(200).json({
        response:
          "Thanks for reaching out! Text us at 415-991-9374 and we'll help you out. 🎨",
      });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(200).json({
        response:
          "That message is a bit long for me to read! Could you shorten it, or text us at 415-991-9374? 🎨",
      });
    }

    if (isRateLimited(getClientIp(req))) {
      return res.status(429).json({
        response:
          "You're sending messages a little fast! Give me a moment, or text us at 415-991-9374. 🎨",
      });
    }

    const client = new Anthropic();
    const recentHistory = conversationHistory.slice(-10);

    // Owner-controlled and cached, so this is usually free. Defaults to false if
    // the sheet is unreachable — better to under-sell than to promise an artist
    // who doesn't exist.
    const secondArtistAvailable = await isSecondArtistAvailable().catch(() => false);

    // Widgets already shown earlier in this conversation. The model is prone to
    // re-showing the price card after the client has accepted it, so we enforce
    // "show it once" here instead of relying on the instructions alone.
    // Full conversation (not the 10-message slice sent to the model), used only
    // to archive chats that end in a lead or a booking.
    const transcriptMessages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const shownUi = recentHistory.map((msg) => msg.ui).filter(Boolean);
    const shownQuote = [...shownUi].reverse().find((ui) => ui.type === "quote");
    const shownDetailsForm = shownUi.some((ui) => ui.type === "details_form");
    const pickedDateOrTime = shownUi.some(
      (ui) => ui.type === "date_picker" || ui.type === "time_picker"
    );

    let messages = [
      ...recentHistory
        .map((msg) => ({
          role: msg.role || (msg.type === "user" ? "user" : "assistant"),
          content: (msg.content || msg.text || "").slice(0, MAX_MESSAGE_LENGTH),
        }))
        .filter((msg) => msg.content),
      { role: "user", content: message },
    ];

    // Helper: call Claude with automatic retry on 529 overloaded errors
    async function callClaude(msgs, toolChoice) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await client.messages.create({
            model: "claude-sonnet-5",
            max_tokens: 1024,
            ...(toolChoice ? { tool_choice: toolChoice } : {}),
            // Keep replies fast and within the 1024-token budget: on Sonnet 5
            // adaptive thinking is on by default, which would add latency and
            // could truncate a reply. Sky doesn't need it for this chat flow.
            thinking: { type: "disabled" },
            system: getSkySystemPrompt({ secondArtistAvailable }),
            tools: TOOLS,
            messages: msgs,
          });
        } catch (err) {
          if (err.status === 529 && attempt < maxRetries) {
            // Wait 2s, 4s before retrying
            await new Promise((r) => setTimeout(r, attempt * 2000));
            continue;
          }
          throw err;
        }
      }
    }

    // Loop to handle multiple tool calls (check availability → then book)
    let response = await callClaude(messages);

    // The widget Sky attached to her reply, if any. Last one wins, so a reply
    // never comes back with two competing widgets under it.
    let ui = null;

    // Sky often writes her message in the SAME response as the tool call, and
    // then adds nothing after the tool result. Keep the most recent non-empty
    // text across the whole loop, or the client gets a widget with no question
    // above it.
    const textOf = (msg) =>
      (msg.content || [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
    let latestText = textOf(response);

    // The sentence that belongs with a widget is the one written in the SAME
    // response as the tool call. Without this, a later message ("and how many
    // guests?") gets paired with an earlier widget (occasion chips), and the
    // question and the buttons disagree.
    let widgetText = "";

    // Handle up to 5 rounds of tool use (quote + availability + widget + booking)
    let rounds = 0;
    while (response.stop_reason === "tool_use" && rounds < 5) {
      rounds++;
      const toolUses = response.content.filter((block) => block.type === "tool_use");
      if (!toolUses.length) break;

      // Every tool_use block needs its own tool_result, so handle them all —
      // returning only the first breaks the request when the model calls two
      // tools at once.
      const toolResults = [];
      for (const toolUse of toolUses) {
        const build = WIDGET_TOOLS[toolUse.name];
        if (build) {
          try {
            const rawInput = toolUse.input || {};
            // Hard guard: no matter what the model decides, it cannot quote or
            // book a second artist while one isn't available.
            if (!secondArtistAvailable && rawInput.secondArtist === true) {
              rawInput.secondArtist = false;
            }
            const widget = build(rawInput);

            // A repeat of the identical price card means the client already
            // accepted it. Drop the widget and point Sky at the next step
            // instead. A genuinely different package still gets a new card.
            const isRepeatQuote =
              widget.type === "quote" &&
              shownQuote &&
              shownQuote.city === widget.city &&
              Number(shownQuote.hours) === widget.hours &&
              Boolean(shownQuote.secondArtist) === widget.secondArtist;

            if (isRepeatQuote) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  shown: false,
                  note: "Nothing was displayed. You already showed this exact price card and the client moved past it, so it was suppressed. Do NOT reply with text alone — the client would see a promise of a form that never appears. If you have the city, date, start time, event type and guest band, call show_details_form RIGHT NOW. If something is still missing, ask for that instead with the matching widget.",
                }),
              });
              continue;
            }

            ui = widget;
            widgetText = textOf(response);
          } catch (err) {
            console.error("Widget build error:", err);
          }
        }
        toolResults.push(
          await handleToolUse(toolUse, {
            transcript: transcriptMessages,
            secondArtistAvailable,
          })
        );
      }

      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];

      response = await callClaude(messages);
      const text = textOf(response);
      if (text) latestText = text;
    }

    // The model reliably narrates the details form ("let me get your details")
    // without actually calling the tool, which leaves the client staring at a
    // promise and no form. Instructions did not fix it, so when the
    // conversation is unambiguously at that step, force the call.
    if (!ui && shownQuote && pickedDateOrTime && !shownDetailsForm) {
      try {
        const forced = await callClaude(messages, {
          type: "tool",
          name: "show_details_form",
        });
        const toolUse = forced.content.find(
          (block) => block.type === "tool_use" && block.name === "show_details_form"
        );
        if (toolUse) {
          ui = WIDGET_TOOLS.show_details_form(toolUse.input || {});
          // Keep whatever she actually said; only the widget was missing.
          if (!latestText) latestText = textOf(forced);
        }
      } catch (err) {
        // Not worth failing the whole reply over — she just gets no form this
        // turn and will usually offer it again on the next message.
        console.error("Forced details form failed:", err);
      }
    }

    // Prefer the widget's own sentence; fall back to the latest text when she
    // called the tool without saying anything in that response.
    let reply = widgetText || latestText;

    // When a tool call is forced, the model sometimes writes a stage direction
    // ("[Sends details form]") instead of talking to the client. Never show that.
    if (/^\s*[[(].*[\])]\s*$/.test(reply)) reply = "";
    if (!reply && ui?.type === "details_form") {
      reply = "Pop your details in here and I'll get this over to the team.";
    }

    return res.status(200).json({ response: reply, ui });
  } catch (error) {
    console.error("Chat error:", error);

    const fallbackMessage =
      "Thanks for reaching out! Our team would love to chat more about your event. Text us at 415-991-9374 and we'll get you a personalized quote right away! 🎨";
    return res.status(200).json({ response: fallbackMessage });
  }
}
