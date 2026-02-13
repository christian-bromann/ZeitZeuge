import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export function initModel(): BaseChatModel {
  const modelOverride = process.env.ZEITZEUGE_MODEL;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    return new ChatOpenAI({
      model: modelOverride ?? "gpt-5.2",
      apiKey: openaiKey,
    });
  }

  if (anthropicKey) {
    return new ChatAnthropic({
      model: modelOverride ?? "claude-opus-4-6",
      apiKey: anthropicKey,
    });
  }

  throw new Error(
    "No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.\n\n" +
    "  export OPENAI_API_KEY=sk-...\n" +
    "  # or\n" +
    "  export ANTHROPIC_API_KEY=sk-ant-...\n"
  );
}
