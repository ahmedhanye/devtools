import type { Preview } from "@storybook/nextjs-vite";
import React from "react";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import "../src/app/globals.css";

type LayoutRouterContextValue = React.ComponentProps<
  typeof LayoutRouterContext
>["value"];

// Monkey-patch Storybook 10.6.2 AppRouterProvider for Next.js 16.4+ LayoutRouterContext compatibility
const OriginalLayoutRouterProvider = LayoutRouterContext.Provider;

function patchLayoutValue(
  value: LayoutRouterContextValue,
): LayoutRouterContextValue {
  if (!value || typeof value !== "object") {
    return value;
  }
  const hasRenderTree =
    "parentRenderTree" in value && Boolean(value.parentRenderTree);
  if (hasRenderTree) {
    return value;
  }
  return {
    ...value,
    parentRenderTree: { data: { bfcacheId: 0 } },
  } as LayoutRouterContextValue;
}

const PatchedLayoutRouterProvider =
  function PatchedLayoutRouterProvider(props: {
    value: LayoutRouterContextValue;
    children?: React.ReactNode;
  }) {
    return React.createElement(OriginalLayoutRouterProvider, {
      ...props,
      value: patchLayoutValue(props.value),
    });
  };

Object.defineProperty(LayoutRouterContext, "Provider", {
  value: PatchedLayoutRouterProvider,
  writable: true,
  configurable: true,
});

// HappyDOM has no CSS layout engine, so Recharts ResponsiveContainer measures 0x0 without fallback dimensions.
if (
  typeof window !== "undefined" &&
  window.navigator.userAgent.includes("HappyDOM") &&
  typeof DOMRect === "function"
) {
  const originalRect: unknown = Reflect.get(
    Element.prototype,
    "getBoundingClientRect",
  );
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    writable: true,
    value: function patchedGetBoundingClientRect(this: Element): DOMRect {
      const rawRect: unknown =
        typeof originalRect === "function"
          ? Reflect.apply(originalRect, this, [])
          : undefined;
      const rect =
        rawRect instanceof DOMRect ? rawRect : new DOMRect(0, 0, 0, 0);
      if (
        rect.width === 0 &&
        rect.height === 0 &&
        this.classList.contains("recharts-responsive-container")
      ) {
        return new DOMRect(0, 0, 640, 320);
      }
      return rect;
    },
  });
}

const preview: Preview = {
  parameters: {
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
