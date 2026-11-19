export function getMermaidThemeConfig(theme?: string): {
  theme: "dark" | "neutral";
  fontFamily: string;
} {
  const isDark = theme === "dark";
  return {
    theme: isDark ? "dark" : "neutral",
    fontFamily: "inherit",
  };
}

const BLOCKED_SVG_BLOCK_TAGS =
  "script|iframe|object|embed|applet|noscript|template|form";
const BLOCKED_SVG_TAG_NAMES =
  "script|iframe|object|embed|applet|noscript|template|form|base|meta|link|img|video|audio|source|track|input|button|textarea|select";
const URI_ATTRIBUTE_NAMES = new Set([
  "href",
  "xlink:href",
  "src",
  "action",
  "data",
  "poster",
]);

function safeCodePoint(code: number): string {
  return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);?/g, (_, dec: string) =>
      safeCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
      safeCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&colon;/gi, ":")
    .replace(/&tab;|&newline;/gi, "");
}

function isUnsafeUriValue(value: string): boolean {
  const decoded = decodeHtmlEntities(value);
  let normalized = "";
  for (const ch of decoded) {
    if (ch.charCodeAt(0) > 0x20) {
      normalized += ch.toLowerCase();
    }
  }
  return (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:")
  );
}

const BLOCKED_ATTR_NAMES = new Set(["srcdoc", "formaction"]);

function sanitizeSingleAttribute(
  name: string,
  doubleQuoted: string | undefined,
  singleQuoted: string | undefined,
  unquoted: string | undefined,
): string | null {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith("on") || BLOCKED_ATTR_NAMES.has(lowerName)) {
    return null;
  }

  const value = doubleQuoted ?? singleQuoted ?? unquoted;
  if (value === undefined) {
    return name;
  }

  if (URI_ATTRIBUTE_NAMES.has(lowerName) && isUnsafeUriValue(value)) {
    return null;
  }

  const quote = singleQuoted !== undefined ? "'" : '"';
  return `${name}=${quote}${value}${quote}`;
}

function sanitizeTagAttributes(rawAttrs: string): {
  attrs: string;
  selfClose: string;
} {
  const safeParts: string[] = [];
  const attrRegex =
    /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  let lastMatchEnd = 0;
  for (const match of rawAttrs.matchAll(attrRegex)) {
    lastMatchEnd = (match.index ?? 0) + match[0].length;
    const formatted = sanitizeSingleAttribute(
      match[1] ?? "",
      match[2],
      match[3],
      match[4],
    );
    if (formatted !== null) {
      safeParts.push(formatted);
    }
  }

  const trailing = rawAttrs.slice(lastMatchEnd).trim();
  const selfClose = trailing.endsWith("/") ? "/" : "";
  return {
    attrs: safeParts.length > 0 ? ` ${safeParts.join(" ")}` : "",
    selfClose,
  };
}

function stripUntilStable(input: string, pattern: RegExp): string {
  let current = input;
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(pattern, "");
  }
  return current;
}

/**
 * Sanitizes Mermaid-rendered or pre-rendered SVG markup before DOM injection,
 * stripping active elements, inline event handlers, and unsafe URI schemes.
 */
export function sanitizeMermaidSvg(rawSvg: string): string {
  const trimmed = rawSvg.trim();
  if (!/^<svg(?=[\s/>])/i.test(trimmed)) {
    return "";
  }

  const blockRegex = new RegExp(
    `<\\s*(${BLOCKED_SVG_BLOCK_TAGS})\\b[^>]*>[\\s\\S]*?<\\s*/\\s*\\1[^>]*>`,
    "gi",
  );
  const tagRegex = new RegExp(
    `<\\/?\\s*(?:${BLOCKED_SVG_TAG_NAMES})(?=[\\s/>])[^>]*>`,
    "gi",
  );

  // Strip full block elements to fixed point before removing orphan tags so
  // nested reconstructions like <scr<script></script>ipt>... lose their bodies.
  const withoutBlocks = stripUntilStable(trimmed, blockRegex);
  const sanitized = stripUntilStable(withoutBlocks, tagRegex);

  return sanitized.replace(
    /<([a-zA-Z][a-zA-Z0-9:-]*)((?=[\s/>])[^>]*)>/g,
    (_full, tagName: string, rawBody: string) => {
      const { attrs, selfClose } = sanitizeTagAttributes(rawBody);
      return `<${tagName}${attrs}${selfClose}>`;
    },
  );
}
