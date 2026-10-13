import type { Meta, StoryObj } from "@storybook/react";
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
        <div className="text-muted-foreground p-4 text-sm">
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
        <div className="text-muted-foreground p-4 text-sm">
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
        <div className="text-muted-foreground p-4 text-sm">
          Bottom sheet content.
        </div>
      </SheetContent>
    </Sheet>
  ),
};
