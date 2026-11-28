import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
        clearAllLabel="Clear all"
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
    const checkoutOptionRow = checkoutOption.closest('[role="option"]');
    await expect(checkoutOptionRow).toHaveAttribute("aria-checked", "false");

    await userEvent.click(checkoutOption);
    await expect(trigger).toHaveTextContent("3 selected");
    await expect(checkoutOptionRow).toHaveAttribute("aria-checked", "true");

    // 2 known options + 1 unknown value equals options.length, but docs is still unselected
    const selectAllStillVisible = body.getByRole("button", {
      name: "Select all",
    });
    await expect(selectAllStillVisible).toBeVisible();
    await expect(body.getByRole("button", { name: "Clear all" })).toBeVisible();

    const onlyButtons = await body.findAllByRole("button", { name: "Only" });
    const firstOnlyButton = onlyButtons[0];
    if (!firstOnlyButton) {
      throw new Error("Expected Only action button");
    }
    firstOnlyButton.focus();
    await userEvent.keyboard("{Enter}");
    await expect(trigger).toHaveTextContent("shop.example.com/");

    await userEvent.click(checkoutOption);
    await expect(trigger).toHaveTextContent("2 selected");

    await userEvent.click(checkoutOption);
    await expect(trigger).toHaveTextContent("shop.example.com/");

    const selectAllButton = body.getByRole("button", { name: "Select all" });
    await userEvent.click(selectAllButton);
    await expect(trigger).toHaveTextContent("3 selected");
    await expect(
      body.queryByRole("button", { name: "Select all" }),
    ).not.toBeInTheDocument();

    const clearAllButton = body.getByRole("button", { name: "Clear all" });
    await expect(clearAllButton).toBeVisible();
    clearAllButton.focus();
    await userEvent.keyboard("{Enter}");
    await expect(trigger).toHaveTextContent("All items included");
    await expect(
      body.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Select all" }));
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
  render: () => (
    <div className="flex flex-col gap-4">
      <ComboboxHarness initialSelected={[]} withFooter={false} />
      <MultiSelectCombobox
        options={SAMPLE_OPTIONS}
        selectedValues={[]}
        onSelectedValuesChange={() => {}}
        ariaLabel="Minimal combobox"
      />
    </div>
  ),
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

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Minimal combobox" }),
    );
    await expect(
      body.queryByRole("button", { name: "Select all" }),
    ).not.toBeInTheDocument();
  },
};
