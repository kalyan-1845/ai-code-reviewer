import { expect } from "chai";
import {
  buildRequestHeaders,
  buildRequestBody,
  parseApiError,
  formatNetworkError,
  clampLine,
  formatDiagnosticMessage,
  countIssues,
  FileReview
} from "../../utils";

describe("Utils Unit Tests", () => {
  describe("buildRequestHeaders", () => {
    it("should build headers with x-api-key when apiKey is provided", () => {
      const headers = buildRequestHeaders("my-secret-key");
      expect(headers).to.deep.equal({
        "Content-Type": "application/json",
        "x-api-key": "my-secret-key",
      });
    });

    it("should build headers without x-api-key when apiKey is empty/undefined", () => {
      const headers = buildRequestHeaders();
      expect(headers).to.deep.equal({
        "Content-Type": "application/json",
      });
    });
  });

  describe("buildRequestBody", () => {
    it("should construct request body correctly", () => {
      const body = buildRequestBody("index.js", "const a = 1;");
      expect(body).to.deep.equal({
        code: "const a = 1;",
        fileName: "index.js",
        company: "General",
        language: "English",
        model: "llama-3.3-70b-versatile",
      });
    });
  });

  describe("parseApiError", () => {
    it("should format API error correctly", () => {
      const err = parseApiError(500, "Internal Server Error");
      expect(err).to.equal("API error (500): Internal Server Error");
    });
  });

  describe("formatNetworkError", () => {
    it("should format network error correctly", () => {
      const err = formatNetworkError("http://localhost:5000", "Connection refused");
      expect(err).to.equal("Failed to reach RepoSage backend at http://localhost:5000: Connection refused");
    });
  });

  describe("clampLine", () => {
    it("should clamp 1-based lines to 0-based lines", () => {
      expect(clampLine(1)).to.equal(0);
      expect(clampLine(10)).to.equal(9);
    });

    it("should keep 0 or negative values clamped to 0", () => {
      expect(clampLine(0)).to.equal(0);
      expect(clampLine(-5)).to.equal(0);
    });
  });

  describe("formatDiagnosticMessage", () => {
    it("should format message without suggestion correctly", () => {
      const msg = formatDiagnosticMessage("Security", "Hardcoded API key detected");
      expect(msg).to.equal("[Security] Hardcoded API key detected");
    });

    it("should format message with suggestion correctly", () => {
      const msg = formatDiagnosticMessage("Bugs", "Potential null pointer dereference", "Check if object is null before usage");
      expect(msg).to.equal("[Bugs] Potential null pointer dereference\nSuggestion: Check if object is null before usage");
    });
  });

  describe("countIssues", () => {
    it("should return 0 for empty or undefined issues", () => {
      const review: FileReview = {};
      expect(countIssues(review)).to.equal(0);
    });

    it("should correctly count issues from all categories", () => {
      const review: FileReview = {
        bugs: [
          { type: "bug", line: 1, description: "b1", suggestion: "s1" }
        ],
        security: [
          { type: "sec", line: 2, description: "s1", suggestion: "s2" },
          { type: "sec", line: 3, description: "s2", suggestion: "s3" }
        ],
        optimization: [],
        styling: [
          { type: "style", line: 4, description: "st1", suggestion: "st2" }
        ]
      };
      expect(countIssues(review)).to.equal(4);
    });
  });
});
