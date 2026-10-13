import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings and lists", () => {
    const html = renderMarkdown("## Combat\n\n- Damage down\n- Spawn fixed");

    expect(html).toContain("<h2");
    expect(html).toContain("Combat");
    expect(html).toContain("<li>");
    expect(html).toContain("Damage down");
  });

  it("strips script tags", () => {
    const html = renderMarkdown('Hello <script>alert(1)</script>');

    expect(html).not.toContain("<script");
    expect(html).toContain("Hello");
  });
});
