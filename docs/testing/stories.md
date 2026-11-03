# Storybook component testing

Guidelines for running and writing automated interaction tests (`play()`) inside Storybook stories (`*.stories.tsx`) in `apps/frontend`. For visual story authoring, CSF v3 `argTypes`, decorators, and colocation conventions, see [`docs/coding-standards/frontend.md`](../coding-standards/frontend.md#storybook-component-stories-and-presentation).

## Vitest story runner architecture

1. **Zero UI component `.test.tsx` files.** Presentational components across `apps/frontend/src/{pages,features,entities,shared}/` are tested exclusively through co-located `*.stories.tsx` files rather than `*.test.tsx` files. The `apps/frontend` package maintains zero `*.test.tsx` files.
2. **Automatic CSF transformation (`storybookStoriesPlugin`).** [`apps/frontend/vitest.config.ts`](../../apps/frontend/vitest.config.ts) parses every `src/**/*.stories.{ts,tsx}` file with `loadCsf` (`storybook/internal/csf-tools`), wraps exported stories with `composeStories` from `@storybook/nextjs-vite` and `.storybook/preview`, and executes `await story.run()` in `happy-dom` under `@vitest/coverage-v8`.
3. **Mandatory named `meta` default export.** Because `storybookStoriesPlugin()` inspects `csf._metaVariableName`, every story file **must** declare `const meta: Meta<typeof Component> = { ... }; export default meta;`. Anonymous `export default { ... }` declarations throw a build error during Vitest transformation.
4. **Built-in Next.js module mocks.** `apps/frontend/vitest.config.ts` automatically aliases `next/navigation`, `next/link`, `next/headers`, `next/router`, `next/cache`, and `sb-original/image-context` to `vite-plugin-storybook-nextjs/browser/mocks/*`. Do not add manual `vi.mock("next/navigation")` calls inside story files.

## Test execution

Run all frontend stories and hook unit tests through Vitest:

```bash
CI=true bun --filter @devtools/frontend test
```

Execute stories and unit tests independently per testing axis:

- **E2E stories (Black-box):** `CI=true bun --filter @devtools/frontend test:e2e` runs all Portable Stories in `src/**/*.stories.tsx`.
- **Unit tests (White-box):** `CI=true bun --filter @devtools/frontend test:unit` runs pure hooks and library unit tests in `src/**/*.unit.test.ts`.

Run a single component story file during iteration:

```bash
CI=true bun --filter @devtools/frontend test src/shared/ui/shadcn/button/button.stories.tsx
```

When `*.stories.tsx` or `.storybook/**` configuration changes, also verify the static Storybook bundle:

```bash
bun --filter @devtools/frontend build-storybook
```

## Interactive `play()` functions

Components with user interactions (dialogs, sheets, dropdowns, forms, filters, tabs, and interactive button callbacks) must define an asynchronous `play()` function. Stateful interactive components (`Sheet`, `Tooltip`, `AppLayout`, interactive `Button` callbacks) require `play()` assertions to verify state transitions and accessibility. Stateless presentational primitives (`Badge`, `Card`, `Separator`, `Skeleton`, and visual variant stories) do not require `play()` functions and are verified through CSF visual render stories.

In Storybook 10 (`storybook@^10.6.3`), import `expect`, `userEvent`, `within`, and `fn` from `"storybook/test"`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "Shared/Shadcn/Button",
  component: Button,
  args: {
    children: "Run Audit",
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const ClickedWithKeyboardAndPointer: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Run Audit" });

    await expect(button).toBeInTheDocument();
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
```

### Authoring rules for `play()` functions

- **Query by accessible role.** Use `canvas.getByRole()`, `canvas.findByRole()`, or `canvas.getByLabelText()`. For portaled overlays (`SheetContent`, `TooltipContent`, dialogs), query `within(canvasElement.ownerDocument.body)`. Never query by Tailwind utility classes (`bg-primary`, `px-4`) or element tag names.
- **Await every interaction and assertion.** All `userEvent.*` methods and `storybook/test` `expect(...).toBeInTheDocument()` matchers are asynchronous. Always `await` them to prevent race conditions in `happy-dom`.
- **Wait for exit animations on dismissal (`waitFor`).** In real browsers, animated overlays (`Sheet`, `Dialog`, `Tooltip`) retain DOM nodes until CSS exit transitions finish, whereas `happy-dom` unmounts them synchronously. Wrap post-close absence assertions in `await waitFor(() => expect(body.queryByRole(...)).not.toBeInTheDocument())` from `"storybook/test"`.
- **Isolate browser storage across reloads.** When a component reads or writes `localStorage`, `sessionStorage`, or cookies (such as `SidebarProvider` persisting `"sidebar_state"`), add a story decorator that clears or resets the storage key before rendering so repeated browser refreshes start from a deterministic state.
- **Verify keyboard accessibility.** Exercise keyboard triggers (`await userEvent.keyboard("{Enter}")`, `await userEvent.keyboard("{Escape}")`, `await userEvent.tab()`) on interactive overlays and controls.
- **Cover conditional render branches.** Because `verify-diff-coverage.ts` enforces 100% line coverage on modified component files via `@vitest/coverage-v8`, include story variants or `play()` interactions that exercise every conditional prop or state branch added in the diff.
