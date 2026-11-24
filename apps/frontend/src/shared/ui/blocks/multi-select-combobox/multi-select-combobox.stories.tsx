import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "./multi-select-combobox";

const SAMPLE_OPTIONS: readonly MultiSelectOption[] = [
  {
    value: "https://shop.example.com/",
    label: "shop.example.com/",
    description: "Storefront home",
    count: 6,
  },
  {
    value: "https://shop.example.com/checkout",
    label: "shop.example.com/checkout",
    description: "Checkout flow",
    count: 3,
  },
  {
    value: "https://docs.example.com/start",
    label: "docs.example.com/start",
    count: 2,
  },
];

function ComboboxHarness({
  initialSelected,
  withFooter = true,
}: {
  initialSelected: string[];
  withFooter?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  return (
    <div className="w-72">
      <MultiSelectCombobox
        options={SAMPLE_OPTIONS}
        selectedValues={selected}
        onSelectedValuesChange={setSelected}
        placeholder="All items included"
        searchPlaceholder="Filter options..."
        selectAllLabel="Select all"
        onlyActionLabel="Only"
        footerText={withFooter ? `${selected.length} active` : undefined}
        ariaLabel="Filter items"
      />
    </div>
  );
}

const meta: Meta<typeof MultiSelectCombobox> = {
  title: "Shared/Blocks/MultiSelectCombobox",
  component: MultiSelectCombobox,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MultiSelectCombobox>;

export const InteractiveSelection: Story = {
  render: () => (
    <ComboboxHarness
      initialSelected={["https://shop.example.com/", "unknown-id"]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Filter items" });
    await expect(trigger).toHaveTextContent("2 selected");

    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);

    const checkoutOption = await body.findByText("shop.example.com/checkout");
    await userEvent.click(checkoutOption);
    await expect(trigger).toHaveTextContent("3 selected");

    const onlyButtons = await body.findAllByRole("button", { name: "Only" });
    const firstOnlyButton = onlyButtons[0];
    if (!firstOnlyButton) {
      throw new Error("Expected Only action button");
    }
    await userEvent.click(firstOnlyButton);
    await expect(trigger).toHaveTextContent("shop.example.com/");

    await userEvent.click(checkoutOption);
    await expect(trigger).toHaveTextContent("2 selected");

    await userEvent.click(checkoutOption);
    await expect(trigger).toHaveTextContent("shop.example.com/");

    const selectAllButton = body.getByRole("button", { name: "Select all" });
    await userEvent.click(selectAllButton);
    await expect(trigger).toHaveTextContent("3 selected");

    const searchInput = body.getByPlaceholderText("Filter options...");
    await userEvent.type(searchInput, "docs");
    await expect(body.getByText("docs.example.com/start")).toBeVisible();
    await expect(
      body.queryByText("shop.example.com/checkout"),
    ).not.toBeInTheDocument();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "zzzz-missing");
    await expect(body.getByText("No matching items.")).toBeVisible();

    await userEvent.clear(searchInput);
    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(
        body.queryByPlaceholderText("Filter options..."),
      ).not.toBeInTheDocument();
    });
  },
};

export const EmptyAndUnknownFallback: Story = {
  render: () => <ComboboxHarness initialSelected={[]} withFooter={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Filter items" });
    await expect(trigger).toHaveTextContent("All items included");
    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);
    const selectAllButton = await body.findByRole("button", {
      name: "Select all",
    });
    await userEvent.click(selectAllButton);
    await expect(trigger).toHaveTextContent("3 selected");
  },
};
