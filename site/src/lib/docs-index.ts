import fs from "node:fs";
import path from "node:path";
import type { Page } from "fumadocs-core/source";
import type { StructuredData } from "fumadocs-core/mdx-plugins";

export interface ResolvedPageDetails {
  title: string;
  description?: string;
  content: string;
}

function parseMarkdownMetadata(raw: string): ResolvedPageDetails {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return {
      title: "DevTools Documentation",
      description: undefined,
      content: raw.trim(),
    };
  }

  const frontmatterStr = match[1];
  const bodyContent = match[2].trim();

  let title: string | undefined;
  let description: string | undefined;

  const titleMatch = frontmatterStr.match(/^title:\s*(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  const descMatch = frontmatterStr.match(/^description:\s*(.+)$/m);
  if (descMatch) {
    description = descMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  return {
    title: title || "DevTools Documentation",
    description,
    content: bodyContent,
  };
}

export function resolvePageDetails(page: Page): ResolvedPageDetails {
  const title = (page.data as { title?: string }).title;
  const description = (page.data as { description?: string }).description;

  if (title) {
    return {
      title,
      description,
      content: description ?? "",
    };
  }

  const rawBody = (page.data as { body?: unknown }).body;
  if (typeof rawBody === "string" && fs.existsSync(rawBody)) {
    const raw = fs.readFileSync(rawBody, "utf-8");
    return parseMarkdownMetadata(raw);
  }

  const infoPath = (page.data as { info?: { fullPath?: string } }).info
    ?.fullPath;
  if (infoPath) {
    const candidatePath = path.resolve(
      process.cwd(),
      "content/docs",
      page.path,
    );
    if (fs.existsSync(candidatePath)) {
      const raw = fs.readFileSync(candidatePath, "utf-8");
      return parseMarkdownMetadata(raw);
    }
  }

  return {
    title: "DevTools Documentation",
    description,
    content: description ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildSearchIndex(page: any) {
  const details = resolvePageDetails(page);
  const data = page.data as {
    structuredData?: unknown;
    load?: () => Promise<{ structuredData?: unknown }>;
  };

  let structuredData: StructuredData | undefined;
  if (data.structuredData) {
    structuredData =
      typeof data.structuredData === "function"
        ? ((await (
            data.structuredData as () => Promise<unknown>
          )()) as StructuredData)
        : (data.structuredData as StructuredData);
  } else if (typeof data.load === "function") {
    structuredData = (await data.load()).structuredData as StructuredData;
  }

  if (!structuredData) {
    structuredData = {
      headings: [{ id: "overview", content: details.title }],
      contents: [
        {
          heading: undefined,
          content: details.content || details.description || "",
        },
      ],
    };
  }

  return {
    title: details.title,
    description: details.description,
    url: page.url,
    id: page.url,
    structuredData,
  };
}
