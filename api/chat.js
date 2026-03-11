import Anthropic from "@anthropic-ai/sdk";
import SKY_SYSTEM_PROMPT from "./sky-system-prompt.js";
import { createBooking } from "./book.js";

// Tool definition for Sky to create bookings
const BOOKING_TOOL = {
  name: "create_booking",
  description:
    "Creates a face painting booking on Google Calendar and sends the client a calendar invitation. Use this when you have collected all required information from the client: name, email, date, start time, end time, event type, guest count, location, and quote.",
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

    const messages = [
      ...recentHistory.map((msg) => ({
        role: msg.role || (msg.type === "user" ? "user" : "assistant"),
        content: msg.content || msg.text,
      })),
      { role: "user", content: message },
    ];

    // First call — may return text or a tool_use request
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SKY_SYSTEM_PROMPT,
      tools: [BOOKING_TOOL],
      messages: messages,
    });

    // Check if Sky wants to create a booking
    if (response.stop_reason === "tool_use") {
      const toolUse = response.content.find(
        (block) => block.type === "tool_use"
      );

      if (toolUse && toolUse.name === "create_booking") {
        let toolResult;

        try {
          const bookingResult = await createBooking(toolUse.input);
          toolResult = {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              success: true,
              message: `Booking created successfully! Event: ${bookingResult.summary}, Date: ${bookingResult.start}. Calendar invite sent to ${toolUse.input.clientEmail}.`,
            }),
          };
        } catch (error) {
          console.error("Booking error:", error);
          toolResult = {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              success: false,
              message:
                "Sorry, there was an issue creating the booking. Please ask the client to text 415-991-9374 to confirm.",
            }),
          };
        }

        // Send tool result back to Claude so Sky can confirm to the client
        response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SKY_SYSTEM_PROMPT,
          tools: [BOOKING_TOOL],
          messages: [
            ...messages,
            { role: "assistant", content: response.content },
            { role: "user", content: [toolResult] },
          ],
        });
      }
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
