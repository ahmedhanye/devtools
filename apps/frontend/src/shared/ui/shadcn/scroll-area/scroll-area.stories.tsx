import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ScrollArea, ScrollBar } from "./scroll-area";

const meta: Meta<typeof ScrollArea> = {
  title: "Shared/Shadcn/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ScrollArea>;

export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-40 w-64 rounded-md border p-3">
      <div className="flex flex-col gap-2 text-sm">
        {Array.from({ length: 12 }, (_, idx) => (
          <div key={idx} className="border-b pb-1">
            Audit Run #{idx + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-64 rounded-md border p-3">
      <div className="flex gap-4 text-sm whitespace-nowrap">
        {Array.from({ length: 8 }, (_, idx) => (
          <div key={idx} className="rounded border px-3 py-1">
            Column {idx + 1}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};
