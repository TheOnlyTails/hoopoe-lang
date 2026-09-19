const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const grammar = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "syntaxes", "hoopoe.tmLanguage.json"), "utf8"),
);

void test("TextMate grammar gives each accepted async form a syntax-specific scope", () => {
	const [asyncFunction, asyncBlock, awaitExpression] = grammar.repository["async-syntax"].patterns;

	assert.equal(asyncFunction.captures[1].name, "storage.modifier.async.hoopoe");
	assert.equal(asyncFunction.captures[2].name, "storage.type.function.hoopoe");
	assert.match("async func fetch()", new RegExp(asyncFunction.match, "u"));

	assert.equal(asyncBlock.name, "keyword.control.async.hoopoe");
	assert.match("async { fetch().await }", new RegExp(asyncBlock.match, "u"));

	assert.equal(awaitExpression.captures[1].name, "punctuation.accessor.hoopoe");
	assert.equal(awaitExpression.captures[2].name, "keyword.operator.await.hoopoe");
	assert.match("fetch().await", new RegExp(awaitExpression.match, "u"));
});

void test("async and await are not retained as generic modifiers", () => {
	const genericModifier = grammar.repository.keywords.patterns.find(
		({ name }) => name === "storage.modifier.hoopoe",
	);
	const modifierPattern = new RegExp(genericModifier.match, "u");

	assert.match("public", modifierPattern);
	assert.doesNotMatch("async", modifierPattern);
	assert.doesNotMatch("await", modifierPattern);
});
