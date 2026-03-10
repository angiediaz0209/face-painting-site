import Anthropic from "@anthropic-ai/sdk";
import SKY_SYSTEM_PROMPT from "./sky-system-prompt.js";

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

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SKY_SYSTEM_PROMPT,
      messages: messages,
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";

    return res.status(200).json({ response: reply });
  } catch (error) {
    console.error("Chat error:", error);

    const fallbackMessage =
      "Thanks for reaching out! Our team would love to chat more about your event. Text us at 415-991-9374 and we'll get you a personalized quote right away! 🎨";
    return res.status(200).json({ response: fallbackMessage });
  }
}
