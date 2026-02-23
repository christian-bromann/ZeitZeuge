#!/bin/bash
# Patches langchain AgentNode to fix "Cannot change both systemPrompt and systemMessage" error.
# See: middleware handler retry causes shared currentSystemMessage to be stale.
# Remove this patch once langchain ships a fix.

LANGCHAIN_DIR=$(find node_modules/.bun -maxdepth 1 -name 'langchain@*' -type d 2>/dev/null | head -1)
if [ -z "$LANGCHAIN_DIR" ]; then
  LANGCHAIN_DIR="node_modules"
fi

for ext in js cjs; do
  FILE="$LANGCHAIN_DIR/node_modules/langchain/dist/agents/nodes/AgentNode.$ext"
  if [ ! -f "$FILE" ]; then
    FILE="node_modules/langchain/dist/agents/nodes/AgentNode.$ext"
  fi
  if [ ! -f "$FILE" ]; then
    continue
  fi

  if grep -q 'baselineSystemMessage' "$FILE"; then
    continue
  fi

  sed -i.bak 's/wrappedHandler = async (request) => {/wrappedHandler = async (request) => { const baselineSystemMessage = currentSystemMessage;/' "$FILE"
  sed -i.bak 's/const handlerWithValidation = async (req) => {/const handlerWithValidation = async (req) => { currentSystemMessage = baselineSystemMessage;/' "$FILE"
  rm -f "$FILE.bak"
done
