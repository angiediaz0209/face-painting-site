import Anthropic from "@anthropic-ai/sdk";
import getSkySystemPrompt from "./sky-system-prompt.js";
import { createBooking, checkAvailability } from "./book.js";
import { sendBookingNotification } from "./notify.js";

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
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({
          available: true,
          date: toolUse.input.date,
          existingEvents: [],
          error: "Could not check availability, proceed with booking.",
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
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const client = new Anthropic();
    const recentHistory = conversationHistory.slice(-10);

    let messages = [
      ...recentHistory.map((msg) => ({
        role: msg.role || (msg.type === "user" ? "user" : "assistant"),
        content: msg.content || msg.text,
      })),
      { role: "user", content: message },
    ];

    // Helper: call Claude with automatic retry on 529 overloaded errors
    async function callClaude(msgs) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
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
