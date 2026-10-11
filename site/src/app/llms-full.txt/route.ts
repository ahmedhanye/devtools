import { createPlainTextResponse, getLlmsFull } from "@/lib/docs-llms";

export async function GET() {
  const content = await getLlmsFull();
  return createPlainTextResponse(content);
}
