import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta: Meta<typeof Tabs> = {
  title: "Shared/Shadcn/Tabs",
  component: Tabs,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="summary" className="w-80">
      <TabsList>
        <TabsTrigger value="summary">Audit Summary</TabsTrigger>
        <TabsTrigger value="report">HTML Report</TabsTrigger>
      </TabsList>
      <TabsContent value="summary">Summary metrics panel</TabsContent>
      <TabsContent value="report">Report viewer panel</TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reportTab = canvas.getByRole("tab", { name: "HTML Report" });
    await userEvent.click(reportTab);
    await expect(canvas.getByText("Report viewer panel")).toBeVisible();
  },
};

export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="area">
      <TabsList variant="line">
        <TabsTrigger value="area">Area</TabsTrigger>
        <TabsTrigger value="bar">Bars</TabsTrigger>
      </TabsList>
      <TabsContent value="area">Area chart mode</TabsContent>
      <TabsContent value="bar">Bar chart mode</TabsContent>
    </Tabs>
  ),
};
