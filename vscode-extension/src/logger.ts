import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("RepoSage");
  }
  return outputChannel;
}

export function logInfo(message: string, data?: unknown) {
  const channel = getOutputChannel();
  const dataStr = data !== undefined ? " " + (typeof data === "object" ? JSON.stringify(data) : String(data)) : "";
  channel.appendLine(message + dataStr);
}
