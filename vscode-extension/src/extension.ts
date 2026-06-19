import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("RepoSage extension is now active!");

  const disposable = vscode.commands.registerCommand(
    "reposage.reviewCurrentFile",
    () => {
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

      console.log("RepoSage: Review Current File");
      console.log("File:", fileName);
      console.log("Content length:", fileContent.length, "characters");
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
