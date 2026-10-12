import { describe, expect, it } from "vitest";
import { checklistData, fidelityMetrics, summaryCards } from "./resultsData";

describe("resultsData", () => {
  it("exports valid checklistData", () => {
    expect(Array.isArray(checklistData)).toBe(true);
    expect(checklistData.length).toBeGreaterThan(0);
    checklistData.forEach((item) => {
      expect(item.id).toBeDefined();
      expect(typeof item.title).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(typeof item.badge).toBe("string");
      expect(item.icon).toBeDefined();
    });
  });

  it("exports valid fidelityMetrics", () => {
    expect(Array.isArray(fidelityMetrics)).toBe(true);
    expect(fidelityMetrics.length).toBeGreaterThan(0);
    fidelityMetrics.forEach((item) => {
      expect(item.id).toBeDefined();
      expect(typeof item.label).toBe("string");
      expect(item.value).toBeDefined();
      expect(item.icon).toBeDefined();
    });
  });

  it("exports valid summaryCards", () => {
    expect(Array.isArray(summaryCards)).toBe(true);
    expect(summaryCards.length).toBeGreaterThan(0);
    summaryCards.forEach((item) => {
      expect(item.id).toBeDefined();
      expect(typeof item.title).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(item.icon).toBeDefined();
      expect(["figures", "typography", "session"]).toContain(item.variant);
    });
  });
});
