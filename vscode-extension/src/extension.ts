import * as vscode from "vscode";
import { reviewFileContent } from "./api";
import { RepoSageDiagnostics } from "./diagnostics";
import { RepoSageWebviewProvider } from "./webviewProvider";
import { formatReviewToMarkdown } from "./utils";

const SECRET_KEY = "reposage.apiKey";

async function updateApiKeyStatusBar(
  statusBarItem: vscode.StatusBarItem,
  secrets: vscode.SecretStorage
) {
  const apiKey = await secrets.get(SECRET_KEY);
  if (apiKey) {
    statusBarItem.text = "$(key) RepoSage: Connected";
    statusBarItem.tooltip = "RepoSage API key is configured";
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(warning) RepoSage: No API Key";
    statusBarItem.tooltip = "Click to configure your RepoSage API key";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("RepoSage extension is now active!");

  // Migrate any legacy plain-text API key from settings.json to SecretStorage.
  const legacyConfig = vscode.workspace.getConfiguration("reposage");
  const legacyKey = legacyConfig.get<string>("apiKey", "");
  if (legacyKey) {
    await context.secrets.store(SECRET_KEY, legacyKey);
    await legacyConfig.update(
      "apiKey",
      undefined,
      vscode.ConfigurationTarget.Global
    );
  }

  const diagnostics = new RepoSageDiagnostics();
  context.subscriptions.push(diagnostics);

  const provider = new RepoSageWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      RepoSageWebviewProvider.viewType,
      provider
    )
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "reposage.configureApiKey";
  await updateApiKeyStatusBar(statusBarItem, context.secrets);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("reposage.configureApiKey", async () => {
      const currentKey = (await context.secrets.get(SECRET_KEY)) ?? "";
      const key = await vscode.window.showInputBox({
        prompt: "Enter your RepoSage API key",
        password: true,
        placeHolder: "reposage_api_...",
        value: currentKey || undefined,
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (value && value.length < 8) {
            return "API key must be at least 8 characters";
          }
          return null;
        },
      });

      if (key !== undefined) {
        if (key === "") {
          await context.secrets.delete(SECRET_KEY);
          vscode.window.showInformationMessage(
            "RepoSage API key has been cleared."
          );
        } else {
          await context.secrets.store(SECRET_KEY, key);
          vscode.window.showInformationMessage(
            "RepoSage API key has been configured successfully!"
          );
        }
        await updateApiKeyStatusBar(statusBarItem, context.secrets);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "reposage.reviewCurrentFile",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage(
            "Open a file to review it with RepoSage."
          );
          return;
        }

        const document = editor.document;
        const fileName = document.fileName;
        const fileContent = document.getText();
        const apiKey = (await context.secrets.get(SECRET_KEY)) ?? "";

        provider.setLoading(true);
        vscode.window.showInformationMessage(
          `RepoSage: Reviewing ${fileName}...`
        );

        const result = await reviewFileContent(fileName, fileContent, apiKey);

        if (result.success) {
          console.log("RepoSage review result:", result.response);
          const markdown = result.data ? formatReviewToMarkdown(result.data) : (result.response || "");
          provider.setContent(markdown);
          if (result.data) {
            diagnostics.updateFromResponse(result.data, fileName);
          }
          vscode.window.showInformationMessage(
            "RepoSage review complete! Check the sidebar for details."
          );
        } else {
          provider.setError(result.error || "Unknown error");
          vscode.window.showErrorMessage(
            `RepoSage review failed: ${result.error}`
          );
        }
        provider.setLoading(false);
      }
    )
  );

  // Update the status bar whenever the stored secret changes.
  context.subscriptions.push(
    context.secrets.onDidChange(async (e: vscode.SecretStorageChangeEvent) => {
      if (e.key === SECRET_KEY) {
        await updateApiKeyStatusBar(statusBarItem, context.secrets);
      }
    })
  );
}

export function deactivate() {}
