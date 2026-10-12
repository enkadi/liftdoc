import { describe, expect, it } from "vitest";
import { preservationData } from "./preservationData";

describe("preservationData", () => {
  it("exports an array of preservation items", () => {
    expect(Array.isArray(preservationData)).toBe(true);
    expect(preservationData.length).toBeGreaterThan(0);
  });

  it("contains items with valid required fields", () => {
    preservationData.forEach((item) => {
      expect(item.id).toBeDefined();
      expect(typeof item.title).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(item.icon).toBeDefined();
      expect(item.comparison).toBeDefined();
      expect(typeof item.comparison.original).toBe("string");
      expect(typeof item.comparison.result).toBe("string");
      expect(typeof item.comparison.description).toBe("string");
    });
  });
});
