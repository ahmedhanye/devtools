import type { HealthResponse } from "@devtools/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceStatusCard } from "./service-status-card";
import { ServiceStatusCardError } from "./service-status-card-error";
import { ServiceStatusCardSkeleton } from "./service-status-card-skeleton";

describe("ServiceStatusCard variants", () => {
  const mockHealthData: HealthResponse = {
    status: "ok",
    timestamp: "2026-10-05T12:00:00.000Z",
    uptime: 120,
    version: "1.0.0",
  };

  it("renders healthy service status card with data and triggers refresh", () => {
    const onRefresh = vi.fn();
    render(
      <ServiceStatusCard
        name="Test API Service"
        data={mockHealthData}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText("Test API Service")).toBeDefined();
    expect(screen.getByText("v1.0.0")).toBeDefined();
    expect(screen.getByText("Operational")).toBeDefined();
    expect(screen.getByText("120s")).toBeDefined();

    const refreshButton = screen.getByRole("button", {
      name: /Refresh Status/i,
    });
    fireEvent.click(refreshButton);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders service status card skeleton with placeholder slots", () => {
    const { container } = render(
      <ServiceStatusCardSkeleton name="Skeleton Service" />,
    );

    expect(screen.getByText("Skeleton Service")).toBeDefined();
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders service status card error and triggers retry", () => {
    const onRefresh = vi.fn();
    render(
      <ServiceStatusCardError
        name="Failed Service"
        error={new Error("Connection refused at 127.0.0.1:4000")}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText("Failed Service")).toBeDefined();
    expect(screen.getByText("Service Unreachable")).toBeDefined();
    expect(
      screen.getByText("Connection refused at 127.0.0.1:4000"),
    ).toBeDefined();

    const retryButton = screen.getByRole("button", {
      name: /Retry Connection/i,
    });
    fireEvent.click(retryButton);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
