import { describe, expect, it } from "vitest";
import { compareOutput } from "../src/checkers/comparison.js";

describe("TOKEN comparison (default)", () => {
  it("ignores multiple spaces, trailing whitespace and newlines", () => {
    expect(compareOutput("TOKEN", "5", "5\n").passed).toBe(true);
    expect(compareOutput("TOKEN", "1  2   3", "1 2 3\n\n").passed).toBe(true);
    expect(compareOutput("TOKEN", "5\n", "  5 ")).toBeTruthy();
    expect(compareOutput("TOKEN", "1 2", "1\n2").passed).toBe(true);
  });

  it("detects real differences", () => {
    expect(compareOutput("TOKEN", "4", "5").passed).toBe(false);
    expect(compareOutput("TOKEN", "1 2", "1 2 3").passed).toBe(false);
    expect(compareOutput("TOKEN", "-0", "0").passed).toBe(false); // tokens differ
  });
});

describe("EXACT comparison", () => {
  it("requires identical content modulo trailing newline", () => {
    expect(compareOutput("EXACT", "5", "5\n").passed).toBe(true);
    expect(compareOutput("EXACT", "5", "5 ").passed).toBe(false);
    expect(compareOutput("EXACT", "1 2", "1  2").passed).toBe(false);
  });

  it("normalizes CRLF", () => {
    expect(compareOutput("EXACT", "a\nb", "a\r\nb").passed).toBe(true);
  });
});

describe("FLOAT comparison", () => {
  it("accepts values within tolerance", () => {
    expect(compareOutput("FLOAT", "0.33333333", "0.33333335", 1e-6).passed).toBe(true);
    expect(compareOutput("FLOAT", "1e9", "1.000000001e9", 1e-6).passed).toBe(true);
  });

  it("rejects values beyond tolerance", () => {
    expect(compareOutput("FLOAT", "0.5", "0.6", 1e-6).passed).toBe(false);
  });

  it("compares non-numeric tokens as strings", () => {
    expect(compareOutput("FLOAT", "yes 0.5", "yes 0.5", 1e-6).passed).toBe(true);
    expect(compareOutput("FLOAT", "yes 0.5", "no 0.5", 1e-6).passed).toBe(false);
  });
});
