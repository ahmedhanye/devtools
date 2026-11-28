import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FolderOpen } from "lucide-react";
import { Button } from "../button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

const meta: Meta<typeof Empty> = {
  title: "Shared/Shadcn/Empty",
  component: Empty,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof Empty>;

export const Default: Story = {
  render: () => (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No items found</EmptyTitle>
        <EmptyDescription>
          Nothing matched your current selection.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
};

export const WithIconAndAction: Story = {
  render: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpen />
        </EmptyMedia>
        <EmptyTitle>No Audit Runs yet</EmptyTitle>
        <EmptyDescription>
          Trigger an Audit Run to inspect scores and Core Web Vitals.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button">Run Audit</Button>
      </EmptyContent>
    </Empty>
  ),
};
