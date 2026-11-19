import fs from "node:fs";
import path from "node:path";
import type { Page } from "fumadocs-core/source";
import type { StructuredData } from "fumadocs-core/mdx-plugins";

export function parseMarkdownMetadata(raw: string): {
  title: string;
  description?: string;
  content: string;
} {
  const emptyMatch = raw.match(/^---\r?\n---\r?\n([\s\S]*)$/);
  if (emptyMatch && emptyMatch[1] !== undefined) {
    return {
      title: "DevTools Documentation",
      description: undefined,
      content: emptyMatch[1].trim(),
    };
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match || match[2] === undefined) {
    return {
      title: "DevTools Documentation",
      description: undefined,
      content: raw.trim(),
    };
  }

  const frontmatterStr = match[1] ?? "";
  const bodyContent = match[2].trim();

  let title: string | undefined;
  let description: string | undefined;

  const titleMatch = frontmatterStr.match(/^title:\s*(.+)$/m);
  if (titleMatch?.[1]) {
    title = titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  const descMatch = frontmatterStr.match(/^description:\s*(.+)$/m);
  if (descMatch?.[1]) {
    description = descMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  return {
    title: title || "DevTools Documentation",
    description,
    content: bodyContent,
  };
}

function readConfinedDocFile(
  candidatePath: string,
  docsRoot: string,
): string | null {
  try {
    const canonicalRoot = fs.realpathSync(docsRoot);
    const canonicalTarget = fs.realpathSync(candidatePath);
    if (
      canonicalTarget !== canonicalRoot &&
      !canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`)
    ) {
      return null;
    }
    if (!fs.statSync(canonicalTarget).isFile()) {
      return null;
    }
    // fallow-ignore-next-line security-sink -- canonical realpath is confined within canonical docsRoot
    return fs.readFileSync(canonicalTarget, "utf-8");
  } catch {
    return null;
  }
}

function isStructuredData(value: unknown): value is StructuredData {
  return (
    typeof value === "object" &&
    value !== null &&
    "headings" in value &&
    Array.isArray(value.headings) &&
    "contents" in value &&
    Array.isArray(value.contents)
  );
}

export function resolvePageDetails(
  page: Page,
  options?: { docsRoot?: string },
): {
  title: string;
  description?: string;
  content: string;
} {
  const title = (page.data as { title?: string }).title;
  const description = (page.data as { description?: string }).description;

  if (title) {
    return {
      title,
      description,
      content: description ?? "",
    };
  }

  const docsRoot =
    options?.docsRoot ?? path.resolve(process.cwd(), "content/docs");
  const rawBody = "body" in page.data ? page.data.body : undefined;
  if (typeof rawBody === "string") {
    const raw = readConfinedDocFile(rawBody, docsRoot);
    if (raw !== null) {
      return parseMarkdownMetadata(raw);
    }
  }

  const rawInfo = "info" in page.data ? page.data.info : undefined;
  const infoPath =
    typeof rawInfo === "object" &&
    rawInfo !== null &&
    "fullPath" in rawInfo &&
    typeof rawInfo.fullPath === "string"
      ? rawInfo.fullPath
      : undefined;
  if (infoPath) {
    const raw = readConfinedDocFile(
      path.resolve(docsRoot, page.path),
      docsRoot,
    );
    if (raw !== null) {
      return parseMarkdownMetadata(raw);
    }
  }

  return {
    title: "DevTools Documentation",
    description,
    content: description ?? "",
  };
}

export async function buildSearchIndex(page: Page) {
  const details = resolvePageDetails(page);

  let rawStructured: unknown;
  if ("structuredData" in page.data) {
    const candidate = page.data.structuredData;
    rawStructured =
      typeof candidate === "function" ? await candidate() : candidate;
  } else if ("load" in page.data && typeof page.data.load === "function") {
    const loaded: unknown = await page.data.load();
    if (
      typeof loaded === "object" &&
      loaded !== null &&
      "structuredData" in loaded
    ) {
      rawStructured = loaded.structuredData;
    }
  }

  let structuredData = isStructuredData(rawStructured)
    ? rawStructured
    : undefined;

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
