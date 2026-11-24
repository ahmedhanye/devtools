import type { Meta, StoryObj } from "@storybook/react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { Button } from "../button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert";

const meta: Meta<typeof Alert> = {
  title: "Shared/Shadcn/Alert",
  component: Alert,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert className="max-w-md">
      <Info />
      <AlertTitle>Audit summary ready</AlertTitle>
      <AlertDescription>
        Diagnostic attributions and insight scores were persisted to SQLite.
      </AlertDescription>
    </Alert>
  ),
};

export const WarningWithAction: Story = {
  render: () => (
    <Alert variant="warning" className="max-w-md">
      <TriangleAlert />
      <AlertTitle>Audit Job already active</AlertTitle>
      <AlertDescription>
        Only one Lighthouse Audit Job may execute at a time.
      </AlertDescription>
      <AlertAction>
        <Button variant="outline" size="xs">
          View Job
        </Button>
      </AlertAction>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="max-w-md">
      <AlertCircle />
      <AlertTitle>Audit failed</AlertTitle>
      <AlertDescription>
        Chromium exited before completing the navigation pass.
      </AlertDescription>
    </Alert>
  ),
};

export const InfoAndSuccess: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <Alert variant="info">
        <Info />
        <AlertTitle>Live stream connected</AlertTitle>
        <AlertDescription>
          Receiving progress updates from Daemon SSE endpoint.
        </AlertDescription>
      </Alert>
      <Alert variant="success">
        <CheckCircle2 />
        <AlertTitle>Report artifact saved</AlertTitle>
        <AlertDescription>
          Standalone HTML report written to disk.
        </AlertDescription>
      </Alert>
    </div>
  ),
};
