import type { Meta, StoryObj } from "@storybook/react";
import { Search } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group";

const meta: Meta<typeof InputGroup> = {
  title: "Shared/Shadcn/InputGroup",
  component: InputGroup,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof InputGroup>;

export const WithAddonAndButton: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3">
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search URL..." aria-label="Search URL" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>ms</InputGroupText>
          <InputGroupButton>Clear</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea placeholder="Notes..." aria-label="Notes" />
      </InputGroup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Search URL" });
    const iconAddon = input.previousElementSibling;
    if (iconAddon instanceof HTMLElement) {
      await userEvent.click(iconAddon);
    }
    await expect(input).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
  },
};

export const TextareaWithAddon: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3">
      <InputGroup>
        <InputGroupAddon align="block-start">
          <InputGroupText>Notes</InputGroupText>
        </InputGroupAddon>
        <InputGroupTextarea
          placeholder="Write audit notes..."
          aria-label="Audit notes"
        />
        <InputGroupAddon align="block-end">
          <InputGroupText>Markdown</InputGroupText>
          <InputGroupButton className="ms-auto">Save</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", { name: "Audit notes" });
    const headerAddon = canvas
      .getByText("Notes")
      .closest("[data-slot='input-group-addon']");
    if (headerAddon instanceof HTMLElement) {
      await userEvent.click(headerAddon);
    }
    await expect(textarea).toHaveFocus();
  },
};
