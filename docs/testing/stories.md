# Storybook component testing

Guidelines for running Portable Stories under Vitest and authoring interactive `play()` tests inside `*.stories.tsx` files in `apps/frontend`. For CSF v3 visual presentation, decorators, and colocation rules, see [`docs/coding-standards/frontend.md`](../coding-standards/frontend.md#storybook-presentation-and-csf-v3).

## Vitest story runner architecture

> [!WARNING]
> Every story file must declare a named `const meta` before `export default meta;`. Anonymous `export default { ... }` declarations fail `storybookStoriesPlugin` transformation during Vitest runs.

- **Zero UI component `.test.tsx` files.** Presentational components across `apps/frontend/src/{app/layouts,pages,features,entities,shared}/` are tested exclusively through co-located `*.stories.tsx` Portable Stories.
- **Automatic CSF transformation.** [`apps/frontend/vitest.config.ts`](../../apps/frontend/vitest.config.ts) parses `src/**/*.stories.{ts,tsx}` with `loadCsf` (`storybook/internal/csf-tools`), wraps exported stories with `composeStories` from `@storybook/nextjs-vite` and `.storybook/preview`, and runs `await story.run()` in `happy-dom` under `@vitest/coverage-v8`.
- **Built-in Next.js mocks.** `apps/frontend/vitest.config.ts` aliases `next/navigation`, `next/link`, `next/headers`, `next/router`, `next/cache`, and `sb-original/image-context` automatically. Do not add manual `vi.mock("next/navigation")` calls inside story files.

## Test execution

| Goal                                    | Command                                                                                       |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------- |
| Run all frontend stories and hook tests | `CI=true bun --filter @devtools/frontend test`                                                |
| Run Portable Stories only (Black-box)   | `CI=true bun --filter @devtools/frontend test:e2e`                                            |
| Run hook/library unit tests (White-box) | `CI=true bun --filter @devtools/frontend test:unit`                                           |
| Run one story file during iteration     | `CI=true bun --filter @devtools/frontend test src/shared/ui/shadcn/button/button.stories.tsx` |
| Verify static Storybook bundle          | `bun --filter @devtools/frontend build-storybook`                                             |

## Interactive `play()` functions

Every UI `.tsx` file (exporting a single React component: `pages/<slice>/ui/page.tsx`, `features/<slice>/ui/<feature>.tsx`, exported `entities/<slice>/ui/<component>.tsx`, `app/layouts/<layout>/<layout>.tsx`, and `shared/ui/`) pairs 1:1 with a co-located `*.stories.tsx` file. Stateful interactive components (`Dialog`, `Sheet`, `Tooltip`, `AppShell`, forms, interactive `Button` callbacks) require an async `play()` function; stateless primitives (`Badge`, `Card`, `Empty`, `Separator`, `Skeleton`) require only visual CSF render stories.

In Storybook 10, import `expect`, `fn`, `userEvent`, `waitFor`, and `within` from `"storybook/test"`:

```tsx
export const ClickedWithPointer: Story = {
  args: {
    children: "Run Audit",
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Run Audit" });
    await expect(button).toBeInTheDocument();
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
```

See `apps/frontend/src/shared/ui/shadcn/button/button.stories.tsx`, `apps/frontend/src/shared/ui/shadcn/sheet/sheet.stories.tsx`, and `apps/frontend/src/app/layouts/app-shell/app-shell.stories.tsx` for full interactive examples.

### Authoring rules for `play()`

- **Query by accessible role.** Use `getByRole()`, `findByRole()`, or `getByLabelText()`. For portaled overlays (`SheetContent`, `TooltipContent`, dialogs), query `within(canvasElement.ownerDocument.body)`. Never query by Tailwind utility classes or tag names.
- **Await every interaction and assertion.** All `userEvent.*` calls and `storybook/test` matchers are async; always `await` them to avoid `happy-dom` races.
- **Wait for overlay dismissal (`waitFor`).** Wrap post-close absence assertions in `await waitFor(() => expect(body.queryByRole(...)).not.toBeInTheDocument())` so CSS exit animations settle cleanly in real browsers.
- **Reset persistent browser storage.** When a component reads or writes `localStorage`, `sessionStorage`, or cookies (such as `"sidebar_state"`), clear the key in a story decorator so reloads stay deterministic.
- **Test keyboard controls.** Exercise `{Enter}`, `{Escape}`, and `userEvent.tab()` on interactive overlays and controls.
- **Cover conditional render branches.** Include story variants or `play()` paths for every conditional prop or state branch added in the diff to satisfy 100% diff coverage.
- **Assert callbacks with spies, not DOM probes.** Verify event handlers with `fn()` spies (`expect(args.onAction).toHaveBeenCalledWith(...)`) rather than rendering visible `<output>` debug elements inside stories.
- **Keep product UI inside the component.** Never inject component-owned controls (such as header action buttons) inside story wrappers or decorators; keep stories focused on rendering the component under test.
