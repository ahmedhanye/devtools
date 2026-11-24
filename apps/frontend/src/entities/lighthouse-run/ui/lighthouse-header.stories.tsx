import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { updateNativeSearchParams } from "@/shared/lib";
import { LighthouseHeader } from "./lighthouse-header";

const meta: Meta<typeof LighthouseHeader> = {
  title: "Entities/LighthouseRun/LighthouseHeader",
  component: LighthouseHeader,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof LighthouseHeader>;

export const HistoryActive: Story = {
  args: {
    activeView: "history",
    onNewAudit: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "/lighthouse",
    );
    await expect(canvas.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/lighthouse/compare",
    );
    await userEvent.click(canvas.getByRole("button", { name: "New Audit" }));
    await expect(args.onNewAudit).toHaveBeenCalledTimes(1);
  },
};

export const CompareActive: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/lighthouse/compare" },
    },
  },
  args: {
    activeView: "compare",
    onNewAudit: fn(),
  },
  render: (args) => {
    const [prevHref] = useState(() => {
      const prev = window.location.href;
      updateNativeSearchParams("?runs=r1,r2&baseline=r1", { replace: true });
      return prev;
    });
    useEffect(() => {
      return () => {
        window.history.replaceState({}, "", prevHref);
      };
    }, [prevHref]);
    return <LighthouseHeader {...args} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Lighthouse")).toBeInTheDocument();
    await expect(window.location.search).toBe("?runs=r1,r2&baseline=r1");
    await userEvent.click(canvas.getByRole("link", { name: "Compare" }));
    await expect(window.location.search).toBe("");
  },
};
