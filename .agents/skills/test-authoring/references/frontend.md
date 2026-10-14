# Frontend application testing

Testing contracts and patterns for `apps/frontend` (`@devtools/frontend`).

- **Runner**: `vitest` with `happy-dom` and `@testing-library/react`
- **Scope**: Next.js UI components, Feature-Sliced Design (FSD) slices, custom React hooks, API clients.

## Patterns

1. **API client contracts (`shared/api/**`)**: Mock network `fetch`, verify parsing through domain Zod schemas, and verify rejection when payloads mismatch schemas or return non-200 statuses.
2. **Hook state transitions (`*/model/**`)**: Use `renderHook` from `@testing-library/react`. Verify asynchronous state transitions between `idle`, `loading`, `success`, and `error`, and verify retry handlers.
3. **Accessible UI component roles (`*/ui/**`)**: Render components with `render` and locate elements with `screen.getByRole`. Verify click handlers and user events.
4. **Loading skeleton slots**: Use `container.querySelectorAll("[data-slot='skeleton']")` to verify structural placeholder presence rather than styling classes.

## Example

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionButton } from "./action-button";

describe("ActionButton component", () => {
  afterEach(cleanup);

  it("triggers callback when clicked by accessible role", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<ActionButton label="Perform Action" onAction={handleClick} />);

    const button = screen.getByRole("button", { name: "Perform Action" });
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled state and aria attributes when loading", () => {
    render(<ActionButton label="Perform Action" isLoading onAction={() => {}} />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
```
