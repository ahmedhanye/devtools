import { source } from "@/lib/source";
import { resolvePageDetails } from "@/lib/docs-index";
import { llms } from "fumadocs-core/source";

function getNodePageDetails(node: unknown) {
  if (
    node &&
    typeof node === "object" &&
    "type" in node &&
    node.type === "page" &&
    "url" in node &&
    typeof node.url === "string"
  ) {
    const page = source.getPageByUrl(node.url);
    if (page) {
      return resolvePageDetails(page);
    }
  }
  return null;
}

const docsLlms = llms(source, {
  renderName: (node) => {
    const details = getNodePageDetails(node);
    if (details) {
      return details.title;
    }
    if (
      "name" in node &&
      typeof node.name === "string" &&
      node.name.length > 0 &&
      node.name !== "Docs"
    ) {
      return node.name;
    }
    return "DevTools Documentation";
  },
  renderDescription: (node) => {
    const details = getNodePageDetails(node);
    if (details) {
      return details.description || "";
    }
    if (
      "description" in node &&
      typeof node.description === "string" &&
      node.description.length > 0
    ) {
      return node.description;
    }
    return "Platform overview and documentation directory for developer tooling services.";
  },
  renderPage: async (page) => {
    const details = resolvePageDetails(page);
    let bodyText = "";
    if (typeof page.data.getText === "function") {
      bodyText = await page.data.getText("processed").catch(() => "");
    }
    if (!bodyText) {
      bodyText = details.content;
    }
    return `# ${details.title}\nURL: ${page.url}\n\n${bodyText}`;
  },
});

export function createPlainTextResponse(content: string): Response {
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function getLlmsIndex(): Promise<string> {
  return docsLlms.index();
}

export async function getLlmsFull(): Promise<string> {
  return docsLlms.full();
}
