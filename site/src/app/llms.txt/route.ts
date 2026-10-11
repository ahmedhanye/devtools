import { createPlainTextResponse, getLlmsIndex } from "@/lib/docs-llms";

export async function GET() {
  const content = await getLlmsIndex();
  return createPlainTextResponse(content);
}
