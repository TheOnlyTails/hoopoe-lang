const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionRoot = path.join(__dirname, "..");
const grammar = JSON.parse(
	fs.readFileSync(path.join(extensionRoot, "syntaxes", "hoopoe.tmLanguage.json"), "utf8"),
);
const injection = JSON.parse(
	fs.readFileSync(path.join(extensionRoot, "syntaxes", "hoopoe.codeblock.json"), "utf8"),
);
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const patternNamed = (repository, name) =>
	repository.patterns.find((pattern) => pattern.name === name);

void test("destination .hoo fixture has TextMate fallbacks matching LSP token categories", () => {
	const source = fixture("destination.hoo");
	const keyword = patternNamed(grammar.repository.keywords, "keyword.control.hoopoe");
	const spread = patternNamed(grammar.repository.operators, "keyword.operator.spread.hoopoe");
	const range = patternNamed(grammar.repository.operators, "keyword.operator.range.hoopoe");
	const pipe = patternNamed(grammar.repository.operators, "keyword.operator.pipe.hoopoe");
	const type = patternNamed(grammar.repository.keywords, "entity.name.type.hoopoe");
	const property = grammar.repository["struct-fields"].patterns[0];
	const member = grammar.repository["member-access"];

	// TextMate's conventional scope families are the lexical fallbacks for the
	// corresponding authoritative LSP semantic token categories.
	for (const [lexeme, rule, semanticCategory, scopeFamily] of [
		["loop", keyword, "keyword", "keyword."],
		["echo", keyword, "keyword", "keyword."],
		["...", spread, "operator", "keyword.operator."],
		["..=", range, "operator", "keyword.operator."],
		["|>", pipe, "operator", "keyword.operator."],
		["Point", type, "type", "entity.name.type."],
		["x", property, "property", "variable.other.property."],
		["origin", member, "method", "variable.other.member."],
	]) {
		assert.ok(source.includes(lexeme), `fixture must exercise ${lexeme}`);
		const sample = lexeme === "origin" ? ".origin" : lexeme === "x" ? "x =" : lexeme;
		assert.match(sample, new RegExp(rule.match, "u"));
		const scope = rule.name ?? rule.captures?.[2]?.name;
		assert.ok(scope.startsWith(scopeFamily), `${semanticCategory} fallback was ${scope}`);
	}

	assert.doesNotMatch("return", new RegExp(keyword.match, "u"));
});

void test("metaprogramming forms have lexical scopes before anonymous parameters", () => {
	const includes = grammar.patterns.map((pattern) => pattern.include);
	assert.ok(includes.indexOf("#metaprogramming") < includes.indexOf("#anonymous-parameters"));

	const [tokens, expansion, shorthand, attached, attribute] =
		grammar.repository.metaprogramming.patterns;
	assert.match("\\(", new RegExp(tokens.match, "u"));
	assert.match("$(", new RegExp(expansion.match, "u"));
	assert.match("$make(", new RegExp(shorthand.match, "u"));
	assert.doesNotMatch("$ make(", new RegExp(shorthand.match, "u"));
	assert.doesNotMatch("$module.make(", new RegExp(shorthand.match, "u"));
	assert.match("@derive(", new RegExp(attached.match, "u"));
	assert.match("@serialize.case =", new RegExp(attribute.match, "u"));
	assert.match("const", new RegExp(grammar.repository.keywords.patterns[5].match, "u"));
});

void test("Markdown injection embeds both hoo and hoopoe fenced destination fixtures", () => {
	const markdown = fixture("destination.md");
	const block = injection.repository["hoopoe-code-block"];
	const javascriptPattern = block.begin
		.replace("(?i:", "(?:")
		.replaceAll("\\G", "^")
		.replaceAll("\\`", "`");
	const begin = new RegExp(javascriptPattern, "iu");
	assert.match("```hoo", begin);
	assert.match('~~~hoopoe title="destination"', begin);
	assert.equal(block.patterns[0].contentName, "meta.embedded.block.hoopoe");
	assert.equal(block.patterns[0].patterns[0].include, "source.hoopoe");
	assert.match(markdown, /```hoo[\s\S]*\n```/);
	assert.match(markdown, /~~~hoopoe[\s\S]*\n~~~/);
});
