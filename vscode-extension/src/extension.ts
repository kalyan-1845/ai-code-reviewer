import * as vscode from "vscode";
import { RepoSageWebviewProvider } from "./webviewProvider";
import { reviewFileContent } from "./api";

export function activate(context: vscode.ExtensionContext) {
  console.log("RepoSage extension is now active!");

  const provider = new RepoSageWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      RepoSageWebviewProvider.viewType,
      provider
    )
  );

  const disposable = vscode.commands.registerCommand(
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

      provider.setLoading(true);
      vscode.window.showInformationMessage(
        `RepoSage: Reviewing ${fileName}...`
      );

      const result = await reviewFileContent(fileName, fileContent);

      if (result.success) {
        provider.setContent(result.response || "");
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
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
