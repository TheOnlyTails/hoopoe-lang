type RunRequest = {
	js: string;
	root_kind: "void" | "option" | "result";
	task: boolean;
};

type RuntimeModule = {
	main?: () => unknown;
	hoopoeStartRoot?: (
		main: () => unknown,
		task: boolean,
	) => { cancel: () => void; outcome: Promise<RootOutcome> };
	hoopoeRenderDefect?: (defect: unknown) => string;
	__hoopoeRootEnum?: Record<string, { [key: symbol]: symbol }>;
};

type RootOutcome =
	| { tag: "completed"; value: unknown }
	| { tag: "cancelled" }
	| { tag: "defected"; defect: unknown };

for (const level of ["log", "info", "warn", "error"] as const) {
	console[level] = (...values: unknown[]) => {
		self.postMessage({ type: "output", level, text: values.map(formatValue).join(" ") });
	};
}

self.addEventListener("message", async (event: MessageEvent<RunRequest>) => {
	const url = URL.createObjectURL(new Blob([event.data.js], { type: "text/javascript" }));
	try {
		installEchoSink();
		const module = (await import(/* @vite-ignore */ url)) as RuntimeModule;
		if (typeof module.main !== "function" || typeof module.hoopoeStartRoot !== "function") {
			throw new Error("The compiler did not emit an executable root.");
		}
		const execution = module.hoopoeStartRoot(() => module.main?.(), event.data.task);
		const outcome = await execution.outcome;
		if (outcome.tag === "cancelled") throw new Error("Execution cancelled.");
		if (outcome.tag === "defected") {
			throw new Error(module.hoopoeRenderDefect?.(outcome.defect) ?? errorMessage(outcome.defect));
		}
		validateRoot(outcome.value, event.data.root_kind, module.__hoopoeRootEnum);
		self.postMessage({ type: "result", text: "completed" });
	} catch (error) {
		self.postMessage({ type: "runtime-error", text: errorMessage(error) });
	} finally {
		URL.revokeObjectURL(url);
	}
});

function installEchoSink() {
	Object.defineProperty(globalThis, "process", {
		configurable: true,
		value: {
			stderr: {
				isTTY: false,
				write(text: string) {
					self.postMessage({ type: "output", level: "log", text: text.replace(/\n$/, "") });
				},
			},
		},
	});
}

function validateRoot(
	value: unknown,
	kind: RunRequest["root_kind"],
	rootEnum: RuntimeModule["__hoopoeRootEnum"],
) {
	if (kind === "void") return;
	if (!rootEnum || typeof value !== "object" || value === null) {
		throw new TypeError(`main produced an invalid ${kind} root value`);
	}
	const tag = (value as { [key: symbol]: unknown })[Symbol.for("hoopoe.tag")];
	if (kind === "option") {
		if (tag === rootEnum.None?.[Symbol.for("hoopoe.tag")]) throw new Error("main returned None");
		if (tag !== rootEnum.Some?.[Symbol.for("hoopoe.tag")]) {
			throw new TypeError("main produced an invalid Option root value");
		}
		return;
	}
	if (tag === rootEnum.Error?.[Symbol.for("hoopoe.tag")]) {
		throw new Error(`main returned Error: ${formatValue((value as { error?: unknown }).error)}`);
	}
	if (tag !== rootEnum.Ok?.[Symbol.for("hoopoe.tag")]) {
		throw new TypeError("main produced an invalid Result root value");
	}
}

function formatValue(value: unknown): string {
	if (value === undefined) return "void";
	if (typeof value === "string") return value;
	if (typeof value === "symbol") return value.toString();
	if (typeof value === "object" && value !== null && "v" in value) {
		return formatValue((value as { v: unknown }).v);
	}
	try {
		if (typeof value === "object") return JSON.stringify(value) ?? "null";
		return String(value as string | number | boolean | bigint | null);
	} catch {
		return "[unserializable value]";
	}
}

function errorMessage(error: unknown) {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
