import { describe, expect, it } from "bun:test";
import React from "react";
import { Mermaid } from "../src/components/mermaid";

interface GlobalWithReactAct {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

interface CapturedMermaidConfig {
  securityLevel?: string;
  startOnLoad?: boolean;
}

describe("diagram rendering component client lifecycle (integration)", () => {
  it("mounts diagram and initializes mermaid with strict security in browser environment", async () => {
    const customGlobal = globalThis as typeof globalThis & GlobalWithReactAct;
    const origAct = customGlobal.IS_REACT_ACT_ENVIRONMENT;
    customGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { GlobalWindow } = await import("happy-dom");
    const win = new GlobalWindow();
    const origWindow = globalThis.window;
    const origDoc = globalThis.document;
    const origNav = globalThis.navigator;
    const origCSS = (globalThis as unknown as { CSSStyleSheet?: unknown })
      .CSSStyleSheet;

    globalThis.window = win as unknown as Window & typeof globalThis;
    globalThis.document = win.document as unknown as Document;
    globalThis.navigator = win.navigator as unknown as Navigator;
    (globalThis as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet =
      class FakeCSSStyleSheet {
        insertRule() {}
      };

    const mermaid = (await import("mermaid")).default;
    const origRender = mermaid.render;
    const holder: { config: CapturedMermaidConfig | null } = { config: null };
    const origInitialize = mermaid.initialize;
    mermaid.initialize = (cfg: Parameters<typeof mermaid.initialize>[0]) => {
      holder.config = (cfg ?? {}) as CapturedMermaidConfig;
      return origInitialize(cfg);
    };
    mermaid.render = (async (id: string) => ({
      svg: `<svg id="${id}" data-testid="live-svg"></svg>`,
    })) as unknown as typeof mermaid.render;

    try {
      const { createRoot } = await import("react-dom/client");
      const { act } = await import("react");
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container as unknown as HTMLElement);

      await act(async () => {
        root.render(
          React.createElement(Mermaid, {
            chart: "flowchart TD\n A-->B",
          }),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(holder.config?.securityLevel).toBe("strict");
      expect(holder.config?.startOnLoad).toBe(false);
      expect(container.innerHTML).toContain('data-testid="live-svg"');
    } finally {
      mermaid.initialize = origInitialize;
      mermaid.render = origRender;
      globalThis.window = origWindow;
      globalThis.document = origDoc;
      globalThis.navigator = origNav;
      (globalThis as unknown as { CSSStyleSheet?: unknown }).CSSStyleSheet =
        origCSS;
      customGlobal.IS_REACT_ACT_ENVIRONMENT = origAct;
    }
  });
});
