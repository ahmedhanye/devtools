import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

const meta: Meta<typeof Sheet> = {
  title: "Shared/Shadcn/Sheet",
  component: Sheet,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Sheet>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button variant="outline">Open Sheet</Button>} />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>
            This is a slide-out panel description.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-sm text-muted-foreground">
          Sheet body content goes here.
        </div>
        <SheetFooter>
          <SheetClose render={<Button variant="outline">Close</Button>} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger
        render={<Button variant="outline">Open Left Sheet</Button>}
      />
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation Menu</SheetTitle>
          <SheetDescription>
            Sheet positioned on the left side of the screen.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-sm text-muted-foreground">
          Left sheet content.
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger
        render={<Button variant="outline">Open Bottom Sheet</Button>}
      />
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Bottom Sheet</SheetTitle>
          <SheetDescription>
            Sheet positioned at the bottom of the screen.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-sm text-muted-foreground">
          Bottom sheet content.
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const InteractiveOpenAndClose: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger
        render={<Button variant="outline">Open Sheet Interactive</Button>}
      />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Interactive Sheet</SheetTitle>
          <SheetDescription>
            Interactive sheet testing description.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-sm text-muted-foreground">
          Interactive body content.
        </div>
        <SheetFooter>
          <SheetClose
            render={<Button variant="outline">Close Interactive</Button>}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: "Open Sheet Interactive",
    });

    await expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);

    const body = within(canvasElement.ownerDocument.body);
    const heading = await body.findByRole("heading", {
      name: "Interactive Sheet",
    });
    await expect(heading).toBeInTheDocument();

    const closeButton = body.getByRole("button", {
      name: "Close Interactive",
    });
    await userEvent.click(closeButton);
    await waitFor(async () => {
      await expect(
        body.queryByRole("heading", {
          name: "Interactive Sheet",
        }),
      ).not.toBeInTheDocument();
    });

    // Reopen and test keyboard Escape dismissal
    await userEvent.click(trigger);
    const reopenedHeading = await body.findByRole("heading", {
      name: "Interactive Sheet",
    });
    await expect(reopenedHeading).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(
        body.queryByRole("heading", {
          name: "Interactive Sheet",
        }),
      ).not.toBeInTheDocument();
    });
  },
};
