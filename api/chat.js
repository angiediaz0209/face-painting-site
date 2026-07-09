import Anthropic from "@anthropic-ai/sdk";
import getSkySystemPrompt from "./sky-system-prompt.js";
import { createBooking, checkAvailability } from "./book.js";
import { sendBookingNotification } from "./notify.js";
import { addBookingToSheet } from "./sheets.js";

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
    "Creates a face painting booking on Google Calendar. If the date is available, creates a confirmed booking and sends the client a calendar invitation. If the date has a conflict (busy), set pending=true to create a [PENDING] booking without sending the client an invite — the team will confirm manually.",
  input_schema: {
    type: "object",
    properties: {
      clientName: {
        type: "string",
        description: "The client's full name",
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
          "Set to true when the date has a conflict and you need to create a pending booking for team review. When false or omitted, creates a confirmed booking with calendar invite.",
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

const TOOLS = [AVAILABILITY_TOOL, BOOKING_TOOL];

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
    try {
      const bookingResult = await createBooking(toolUse.input);
      const isPending = bookingResult.pending;

      // Send email notification to admin (non-blocking)
      sendBookingNotification(toolUse.input, bookingResult).catch((err) =>
        console.error("Notification error:", err)
      );

      // Add booking to Google Sheet (non-blocking)
      addBookingToSheet(toolUse.input, bookingResult).catch((err) =>
        console.error("Sheet error:", err)
      );

      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({
          success: true,
          pending: isPending,
          message: isPending
            ? `Pending booking created for ${bookingResult.summary}, Date: ${bookingResult.start}. The team will review and confirm with the client by text at ${toolUse.input.clientPhone}.`
            : `Booking confirmed! Event: ${bookingResult.summary}, Date: ${bookingResult.start}. Calendar invite sent to ${toolUse.input.clientEmail}.`,
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

    // Handle up to 3 rounds of tool use (availability check + booking + confirmation)
    let rounds = 0;
    while (response.stop_reason === "tool_use" && rounds < 3) {
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
