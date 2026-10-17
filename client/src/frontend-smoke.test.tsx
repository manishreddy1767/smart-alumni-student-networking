import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoadingState, Pagination } from "./main";

describe("frontend smoke states", () => {
  it("renders accessible pagination controls for multiple pages", () => {
    const html = renderToStaticMarkup(<Pagination page={2} pageSize={12} total={25} onChange={vi.fn()} />);
    expect(html).toContain('aria-label="Pagination"');
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
  });

  it("renders a live loading state", () => {
    const html = renderToStaticMarkup(<LoadingState text="Loading opportunities..." />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading opportunities...");
  });
});
