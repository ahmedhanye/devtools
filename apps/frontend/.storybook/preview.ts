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
