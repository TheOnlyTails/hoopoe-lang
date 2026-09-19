import { workspace, ExtensionContext, window } from "vscode";
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";
import { resolveServerPath } from "./serverPath";

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
	let server: string;
	try {
		server = resolveServerPath({
			platform: process.platform,
			arch: process.arch,
			override: workspace.getConfiguration("hoopoe").get<string>("server.path") || undefined,
			asAbsolutePath: context.asAbsolutePath.bind(context),
		});
	} catch (error) {
		window.showErrorMessage(String(error));
		return;
	}

	const serverOptions: ServerOptions = {
		run: { command: server, transport: TransportKind.stdio },
		debug: { command: server, transport: TransportKind.stdio },
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: "file", language: "hoopoe" },
			{ scheme: "untitled", language: "hoopoe" },
		],
		synchronize: {
			configurationSection: "hoopoe",
		},
	};

	client = new LanguageClient("hoopoe-lsp", "Hoopoe Language Server", serverOptions, clientOptions);

	try {
		await client.start();
		window.showInformationMessage("Hoopoe Language Server activated");
	} catch (err) {
		window.showErrorMessage(`Failed to start Hoopoe Language Server: ${String(err)}`);
	}
}

export async function deactivate(): Promise<void> {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
