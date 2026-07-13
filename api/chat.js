import Anthropic from "@anthropic-ai/sdk";
import getSkySystemPrompt from "./_lib/sky-system-prompt.js";
import { createBooking, checkAvailability } from "./_lib/book.js";
import { sendBookingNotification } from "./_lib/notify.js";
import { addBookingToSheet } from "./_lib/sheets.js";
import { computeQuote } from "./_lib/pricing.js";
import { lookupClient, upsertClient } from "./_lib/clients.js";

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
    "Checks whether this is a RETURNING client, by phone and/or email. Call it once you have the client's phone or email, before asking for details we might already have (like their address). If it returns known=true, greet them warmly by name and offer what we already know — e.g. 'Want this at the same address as last time, 123 Oak St?'. Only treat someone as returning when THIS tool says so; never assume it from a first name.",
  input_schema: {
    type: "object",
    properties: {
      phone: { type: "string", description: "The client's phone number, if known." },
      email: { type: "string", description: "The client's email, if known." },
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

const TOOLS = [QUOTE_TOOL, AVAILABILITY_TOOL, BOOKING_TOOL, LOOKUP_CLIENT_TOOL, SAVE_LEAD_TOOL];

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

async function handleToolUse(toolUse) {
  if (toolUse.name === "calculate_quote") {
    try {
      const result = computeQuote(toolUse.input);
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
      const bookingInput = { ...toolUse.input, pending: true };
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
    async function callClaude(msgs) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await client.messages.create({
            model: "claude-sonnet-5",
            max_tokens: 1024,
            // Keep replies fast and within the 1024-token budget: on Sonnet 5
            // adaptive thinking is on by default, which would add latency and
            // could truncate a reply. Sky doesn't need it for this chat flow.
            thinking: { type: "disabled" },
            system: getSkySystemPrompt(),
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

    // Handle up to 4 rounds of tool use (quote + availability check + booking + confirmation)
    let rounds = 0;
    while (response.stop_reason === "tool_use" && rounds < 4) {
      rounds++;
      const toolUse = response.content.find(
        (block) => block.type === "tool_use"
      );

      if (!toolUse) break;

      const toolResult = await handleToolUse(toolUse);

      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: [toolResult] },
      ];

      response = await callClaude(messages);
    }

    // Extract text from the final response
    const textBlock = response.content.find((block) => block.type === "text");
    const reply = textBlock ? textBlock.text : "";

    return res.status(200).json({ response: reply });
  } catch (error) {
    console.error("Chat error:", error);

    const fallbackMessage =
      "Thanks for reaching out! Our team would love to chat more about your event. Text us at 415-991-9374 and we'll get you a personalized quote right away! 🎨";
    return res.status(200).json({ response: fallbackMessage });
  }
}
