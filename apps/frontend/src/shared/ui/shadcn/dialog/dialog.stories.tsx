import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta: Meta<typeof Dialog> = {
  title: "Shared/Shadcn/Dialog",
  component: Dialog,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline">Open Dialog</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogDescription>
            Review details before continuing.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <DialogClose render={<Button>Confirm</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open Dialog" }));

    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("heading", { name: "Confirm Action" }),
    ).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(
        body.queryByRole("heading", { name: "Confirm Action" }),
      ).not.toBeInTheDocument();
    });
  },
};
