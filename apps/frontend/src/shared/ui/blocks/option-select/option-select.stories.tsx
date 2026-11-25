import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { OptionSelect } from "./option-select";

const ITEMS = {
  all: "All Options",
  fast: "Fast Mode",
  strict: "Strict Mode",
};

const OPTIONS = [
  { value: "all", label: "All Options" },
  { value: "fast", label: "Fast Mode" },
  { value: "strict", label: "Strict Mode" },
];

function OptionSelectHarness({ withLabel }: { withLabel: boolean }) {
  const [val, setVal] = useState("all");
  return (
    <OptionSelect
      id={withLabel ? "mode-select" : undefined}
      label={withLabel ? "Mode" : undefined}
      ariaLabel={withLabel ? undefined : "Select mode"}
      value={val}
      items={ITEMS}
      options={OPTIONS}
      onValueChange={(next) => {
        if (next) setVal(next);
      }}
      triggerClassName="w-48"
    />
  );
}

const meta: Meta<typeof OptionSelect> = {
  title: "Shared/Blocks/OptionSelect",
  component: OptionSelect,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof OptionSelect>;

export const LabeledAndStandalone: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <OptionSelectHarness withLabel />
      <OptionSelectHarness withLabel={false} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const comboboxes = canvas.getAllByRole("combobox");
    const first = comboboxes[0];
    if (!first) throw new Error("Expected combobox");
    await userEvent.click(first);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("option", { name: "Fast Mode" }),
    );
    await expect(first).toHaveTextContent("Fast Mode");
  },
};
