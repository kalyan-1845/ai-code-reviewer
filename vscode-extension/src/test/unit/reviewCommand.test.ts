import { expect } from "chai";
import { runReviewCommand } from "../../reviewCommand";
import { buildRequestBody, MAX_FILE_CONTENT_BYTES } from "../../utils";

function makeDeps(overrides: Partial<Parameters<typeof runReviewCommand>[0]> = {}) {
  const loading: boolean[] = [];
  const errors: string[] = [];
  const contents: string[] = [];
  const info: string[] = [];
  const errorMessages: string[] = [];
  const deps = {
    reviewFileContent: async () => ({ success: true }),
    provider: {
      setLoading: (v: boolean) => loading.push(v),
      setError: (m: string) => errors.push(m),
      setContent: (m: string) => contents.push(m),
    },
    showInformationMessage: (m: string) => info.push(m),
    showErrorMessage: (m: string) => errorMessages.push(m),
    ...overrides,
  };
  return { deps, loading, errors, contents, info, errorMessages };
}

describe("runReviewCommand", () => {
  it("resets loading and shows the size-cap error for an oversized file", async () => {
    const { deps, loading, errors, contents, errorMessages } = makeDeps({
      reviewFileContent: async (fileName: string, content: string) => {
        buildRequestBody(fileName, content); // throws for oversized files
        return { success: true };
      },
    });

    await runReviewCommand(
      deps,
      "huge.ts",
      "x".repeat(MAX_FILE_CONTENT_BYTES + 1),
      "key"
    );

    expect(loading).to.deep.equal([true, false]);
    expect(errors.length).to.equal(1);
    expect(errors[0]).to.contain("byte limit");
    expect(contents.length).to.equal(0);
    expect(errorMessages[0]).to.contain("byte limit");
  });

  it("surfaces a thrown error and still resets loading", async () => {
    const { deps, loading, errors, errorMessages } = makeDeps({
      reviewFileContent: async () => {
        throw new Error("backend exploded");
      },
    });

    await runReviewCommand(deps, "a.ts", "code", "key");

    expect(loading).to.deep.equal([true, false]);
    expect(errors).to.deep.equal(["backend exploded"]);
    expect(errorMessages[0]).to.equal("RepoSage review failed: backend exploded");
  });

  it("clears loading and shows error text when the review reports failure", async () => {
    const { deps, loading, errors, errorMessages } = makeDeps({
      reviewFileContent: async () => ({
        success: false,
        error: "API error (429): rate limited",
      }),
    });

    await runReviewCommand(deps, "a.ts", "code", "key");

    expect(loading).to.deep.equal([true, false]);
    expect(errors).to.deep.equal(["API error (429): rate limited"]);
    expect(errorMessages[0]).to.equal(
      "RepoSage review failed: API error (429): rate limited"
    );
  });

  it("renders markdown and reports completion on success", async () => {
    const { deps, loading, contents, info, errors } = makeDeps({
      reviewFileContent: async () => ({
        success: true,
        response: "{}",
        data: { success: true, analysis: { fileReviews: {} } },
      }),
    });

    await runReviewCommand(deps, "a.ts", "code", "key");

    expect(loading).to.deep.equal([true, false]);
    expect(contents.length).to.equal(1);
    expect(info.some((m) => m.includes("review complete"))).to.equal(true);
    expect(errors.length).to.equal(0);
  });
});
