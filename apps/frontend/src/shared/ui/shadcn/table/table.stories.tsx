import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta: Meta<typeof Table> = {
  title: "Shared/Shadcn/Table",
  component: Table,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Table>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent Lighthouse Audit Runs</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Target URL</TableHead>
          <TableHead>Profile</TableHead>
          <TableHead className="text-right">Performance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>https://example.com/</TableCell>
          <TableCell>mobile</TableCell>
          <TableCell className="text-right">97</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Total Runs</TableCell>
          <TableCell className="text-right">1</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
