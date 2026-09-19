function hoopoeEchoPlaceholder(value) {
	if (typeof value === "function") return "<function>";
	return "<opaque external>";
}

function hoopoeEchoRender(value, seen = new WeakSet()) {
	if (value === undefined) return "void";
	if (value === null) return "<opaque external>";
	if (typeof value === "function") return "<function>";
	if (typeof value !== "object") return hoopoeEchoPlaceholder(value);
	if (seen.has(value)) return "<cycle>";
	seen.add(value);
	try {
		if (hoopoeEchoBoxes.has(value)) {
			const tag = value[HOOPOE_TAG]?.description;
			if (tag === "hoopoe.int" || tag === "hoopoe.uint" || tag === "hoopoe.bool")
				return String(value.v);
			if (tag === "hoopoe.float")
				return Number.isInteger(value.v) ? value.v.toFixed(1) : String(value.v);
			if (tag === "hoopoe.char")
				return `'${JSON.stringify(value.v).slice(1, -1).replaceAll("'", "\\'")}'`;
			if (tag === "hoopoe.string") return JSON.stringify(value.v);
			if (tag === "hoopoe.list")
				return `#[${[...value.v].map((item) => hoopoeEchoRender(item, seen)).join(", ")}]`;
			if (tag === "hoopoe.tuple")
				return `#(${value.v.map((item) => hoopoeEchoRender(item, seen)).join(", ")})`;
			if (tag === "hoopoe.map")
				return `#{${[...value.v]
					.map(([key, item]) => `${hoopoeEchoRender(key, seen)}: ${hoopoeEchoRender(item, seen)}`)
					.join(", ")}}`;
			return "<opaque external>";
		}
		const shape = hoopoeEchoStructuralShapes.get(value);
		if (shape === undefined) return "<opaque external>";
		const [kind, name] = shape.identity.split(":", 2);
		const displayName = kind === "variant" ? name : name.split("$").at(-1);
		if (shape.fields.length === 0) return displayName;
		return `${displayName}(${shape.fields
			.map((field) => `${field}: ${hoopoeEchoRender(value[field], seen)}`)
			.join(", ")})`;
	} finally {
		seen.delete(value);
	}
}

function hoopoeEcho(value, site) {
	let rendered;
	try {
		rendered = hoopoeEchoRender(value);
	} catch {
		rendered = hoopoeEchoPlaceholder(value);
	}
	const plainLocation = `${site.file}:${site.line}:${site.column}`;
	let location = plainLocation;
	try {
		if (site.uri !== null && globalThis.process?.stderr?.isTTY === true) {
			const uri = [...site.uri]
				.filter((char) => char.codePointAt(0) > 31 && char.codePointAt(0) !== 127)
				.join("");
			location = `\u001b]8;;${uri}#L${site.line}:${site.column}\u001b\\${plainLocation}\u001b]8;;\u001b\\`;
		}
		globalThis.process?.stderr?.write(`${location}: ${rendered}\n`);
	} catch {
		// Compiler observations never affect program control flow.
	}
	return value;
}
