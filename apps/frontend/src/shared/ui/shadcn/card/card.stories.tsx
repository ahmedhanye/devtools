import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta: Meta<typeof Card> = {
  title: "Shared/Shadcn/Card",
  component: Card,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description and metadata.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            Action
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This is the primary content area inside the card.
        </p>
      </CardContent>
      <CardFooter>
        <p className="text-muted-foreground text-xs">Card footer information</p>
      </CardFooter>
    </Card>
  ),
};

export const Small: Story = {
  render: () => (
    <Card size="sm" className="w-80">
      <CardHeader>
        <CardTitle>Compact Card</CardTitle>
        <CardDescription>Small size variant</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">Compact card body text.</p>
      </CardContent>
    </Card>
  ),
};
