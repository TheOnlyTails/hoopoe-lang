//! The uniform-value-boxing runtime representation (slice #2, the keystone).
//!
//! Every Hoopoe primitive, list, and tuple value compiles to a *boxed value* — a per-type wrapper
//! ES class carrying its payload in `.v` and its type discriminant on its
//! prototype under the shared `Symbol.for("hoopoe.tag")` key (ADR-0002). This
//! module is the single source of truth for those wrapper class definitions, in
//! two forms:
//!
//! * [`BOX_MODULE_SOURCE`] — an `export`ed ES module, injected into the bundle
//!   graph under [`BOX_MODULE_KEY`] exactly like the intrinsic runtime modules
//!   (`hoopoe-compiler::HostRuntimeGraph`). This is slice #7's "boxes must be importable
//!   modules" seam: a later slice's emitted code will `import { NInt } from
//!   "std/box"` instead of relying on the inline preamble.
//! * [`BOX_PREAMBLE`] — the identical class definitions WITHOUT `export`,
//!   prepended inline by [`crate::emit`] into any single emitted module that
//!   constructs a box. The single-module facade (`emit`/`compile`, what
//!   `run_node` drives) runs one `.mjs` directly under Node with no bundler to
//!   resolve a bare `"std/box"` specifier, so the definitions must travel inside
//!   the module itself. Cross-module identity does NOT depend on sharing one
//!   class object: the discriminant is the GLOBAL `Symbol.for("hoopoe.<type>")`
//!   installed on each prototype, never class identity (`instanceof`), so two
//!   independently-defined `NInt` classes in two bundled modules still report the
//!   same `x[TAG]` — the same `Symbol.for`-keyed ABI `emit_enum` already relies on
//!   for per-module `Option`.
//!
//! Collection wrappers expose the payload-level operations required by slice #6;
//! every built-in box carries the structural equals/hash protocol used by `NMap`.

/// The virtual module specifier the box wrapper classes are importable under.
/// Stable across the whole boxing branch (later slices' emitted `import`s name
/// it verbatim), and the key `hoopoe-compiler` injects [`BOX_MODULE_SOURCE`]
/// into the bundle graph under.
pub const BOX_MODULE_KEY: &str = "std/box";

/// TypeScript declarations for compiler-provided virtual runtime modules.
/// Internal stdlib adapters and downstream consumers use this same source.
pub const BOX_MODULE_DECLARATIONS: &str = include_str!("../../../stdlib/src/virtual-modules.d.ts");

/// The base class name every per-type wrapper extends; holds the `.v` payload.
const BASE: &str = "NBox";

const HASH_MAP_RUNTIME: &str = include_str!("./hashmap_runtime.js");
const LIST_RUNTIME: &str = include_str!("./list_runtime.js");
const ECHO_RUNTIME: &str = include_str!("./echo_runtime.js");
const ACTIVATION_RUNTIME: &str = include_str!("./activation_runtime.js");
const TASK_RUNTIME: &str = include_str!("./task_runtime.js");
#[cfg(test)]
const TASK_RUNTIME_TESTS: &str = include_str!("./task_runtime.test.js");

/// Each built-in box wrapper: `(JS class name, the `hoopoe.<type>` discriminant
/// suffix)`. The class name is what emitted `new N…(…)` construction and later
/// slices' imports reference; the suffix builds the global
/// `Symbol.for("hoopoe.<type>")` tag installed on the class prototype (which
/// `match`/hash/display read as "what type is this?"). The string wrapper is
/// `NString` (not the prototype sketch's `NStr`) because slices #7/#8 reference
/// `NString`.
const BOX_CLASSES: &[(&str, &str)] = &[
	("NInt", "int"),
	("NUint", "uint"),
	("NFloat", "float"),
	("NChar", "char"),
	("NBool", "bool"),
	("NString", "string"),
	("NList", "list"),
	("NTuple", "tuple"),
	("NMap", "map"),
];

/// The wrapper-class JS body, shared by both emitted forms. When `export` is
/// true each declaration is `export`ed (the importable [`BOX_MODULE_SOURCE`]);
/// when false it is a bare declaration (the inline [`BOX_PREAMBLE`]). The tag is
/// installed on the prototype under `Symbol.for("hoopoe.tag")` written inline
/// (not via a `const TAG` binding) so the block is self-contained — it never
/// collides with, nor depends on, a module's own `const TAG` (emitted for
/// enums) and never trips `wrap_module_js`'s used-but-undeclared `[TAG]` probe.
fn class_defs(export: bool, option_enum_name: &str, echo: bool) -> String {
	let kw = if export { "export " } else { "" };
	let mut out = String::new();
	out.push_str(&format!("{kw}class {BASE} {{\n"));
	out.push_str("\tconstructor(v) {\n\t\tthis.v = v;\n");
	if echo {
		out.push_str("\t\thoopoeEchoBoxes.add(this);\n");
	}
	out.push_str("\t}\n");
	out.push_str("}\n");
	out.push_str("const HOOPOE_TYPE_INTERN = new globalThis.Map();\nconst HOOPOE_TYPE_RESULT = Symbol(\"hoopoe.type.result\");\nconst HOOPOE_TYPE_ARGUMENTS = new globalThis.WeakMap();\n");
	out.push_str("function hoopoeType(base, args) {\n\tif (args.length === 0) return base;\n\targs = Object.freeze([...args]);\n\tlet node = HOOPOE_TYPE_INTERN.get(base);\n\tif (node === undefined) { node = new globalThis.Map(); hoopoeMapSet(HOOPOE_TYPE_INTERN, base, node); }\n\tfor (const arg of args) { let next = node.get(arg); if (next === undefined) { next = new globalThis.Map(); hoopoeMapSet(node, arg, next); } node = next; }\n\tlet result = node.get(HOOPOE_TYPE_RESULT);\n\tif (result === undefined) { result = Object.create(base); hoopoeWeakMapSet(HOOPOE_TYPE_ARGUMENTS, result, args); hoopoeMapSet(node, HOOPOE_TYPE_RESULT, result); }\n\treturn result;\n}\nfunction hoopoeTypeProjection(receiver, path) {\n\tlet type = Object.getPrototypeOf(receiver);\n\tfor (const index of path) { const args = HOOPOE_TYPE_ARGUMENTS.get(type); if (args === undefined || index >= args.length) return NBox.prototype; type = args[index]; }\n\treturn type;\n}\n");
	out.push_str("const HOOPOE_VARIANT_INTERN = new globalThis.WeakMap();\nfunction hoopoeVariant(type, variant) {\n\tlet variants = HOOPOE_VARIANT_INTERN.get(type);\n\tif (variants === undefined) { variants = new globalThis.WeakMap(); hoopoeWeakMapSet(HOOPOE_VARIANT_INTERN, type, variants); }\n\tlet result = variants.get(variant);\n\tif (result === undefined) { result = Object.freeze(hoopoeAssign(Object.create(type), variant)); hoopoeWeakMapSet(variants, variant, result); }\n\treturn result;\n}\n");
	out.push_str(&format!(
		"const HOOPOE_OPTION_ENUM_NAME = \"{option_enum_name}\";\n"
	));
	out.push_str(LIST_RUNTIME);
	let hash_map_runtime = HASH_MAP_RUNTIME
		.replace(
			"/* HOOPOE_ECHO_REGISTRIES */",
			if echo {
				"const hoopoeEchoBoxes = new WeakSet();\nconst hoopoeEchoStructuralShapes = new WeakMap();"
			} else {
				""
			},
		)
		.replace(
			"/* HOOPOE_ECHO_REGISTER_STRUCTURAL */",
			if echo {
				"hoopoeEchoStructuralShapes.set(value, value[HOOPOE_STRUCTURAL_SHAPE]);"
			} else {
				""
			},
		);
	out.push_str(&hash_map_runtime);
	if echo {
		out.push_str(ECHO_RUNTIME);
	}
	out.push_str(ACTIVATION_RUNTIME);
	out.push_str(TASK_RUNTIME);
	out.push_str(
		"const HOOPOE_I64_MIN = -(1n << 63n);\nconst HOOPOE_I64_MAX = (1n << 63n) - 1n;\nconst HOOPOE_U64_MAX = (1n << 64n) - 1n;\n\
function hoopoeIntegerPayload(value, min, max, name) {\n\
\tif (typeof value === \"number\") {\n\
\t\tif (!Number.isSafeInteger(value)) throw new TypeError(`${name} payload must be an exact integer`);\n\
\t\tvalue = BigInt(value);\n\
\t}\n\
\tif (typeof value !== \"bigint\") throw new TypeError(`${name} payload must be a BigInt`);\n\
\tif (value < min || value > max) throw new RangeError(`${name} overflow`);\n\
\treturn value;\n\
}\n\
function hoopoeCheckedInt(value) { return hoopoeIntegerPayload(value, HOOPOE_I64_MIN, HOOPOE_I64_MAX, \"int\"); }\n\
function hoopoeCheckedUInt(value) { return hoopoeIntegerPayload(value, 0n, HOOPOE_U64_MAX, \"uint\"); }\n\
function hoopoeTrustedInt(value) { if (typeof value !== \"bigint\") throw new TypeError(\"trusted int FFI must return BigInt\"); return hoopoeCheckedInt(value); }\n\
function hoopoeTrustedUInt(value) { if (typeof value !== \"bigint\") throw new TypeError(\"trusted uint FFI must return BigInt\"); return hoopoeCheckedUInt(value); }\n\
const HOOPOE_OPAQUE_IDENTITY = new globalThis.WeakMap();\n\
function hoopoeBoxOpaque(identity, value) {\n\
\tif ((typeof value !== \"object\" || value === null) && typeof value !== \"function\") throw new TypeError(\"trusted opaque FFI must return a live reference\");\n\
\tconst box = Object.create(null);\n\
\tObject.defineProperty(box, \"v\", { value });\n\
\tHOOPOE_OPAQUE_IDENTITY.set(box, identity);\n\
\treturn Object.freeze(box);\n\
}\n\
function hoopoeUnboxOpaque(identity, value) {\n\
\tif (HOOPOE_OPAQUE_IDENTITY.get(value) !== identity) throw new TypeError(\"opaque external identity mismatch\");\n\
\treturn value.v;\n\
}\n\
function hoopoeCheckedShift(value, count, left) {\n\
\tif (typeof count !== \"bigint\" || count < 0n || count >= 64n) throw new RangeError(\"integer shift count must be in 0..63\");\n\
\treturn left ? value << count : value >> count;\n\
}\n\
function hoopoeCheckedPower(value, exponent) {\n\
\tif (typeof exponent !== \"bigint\" || exponent < 0n) throw new RangeError(\"integer exponent must be nonnegative\");\n\
\tif (exponent === 0n) return 1n;\n\
\tif (value === 0n || value === 1n) return value;\n\
\tif (value === -1n) return exponent % 2n === 0n ? 1n : -1n;\n\
\tif (exponent >= 64n) throw new RangeError(\"integer power overflow\");\n\
\treturn value ** exponent;\n\
}\n\
function hoopoeHostIndex(value) {\n\
\tif (typeof value !== \"bigint\" || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(\"host index is out of range\");\n\
\treturn Number(value);\n\
}\n\
function hoopoeCollectionIndex(value, length, checked) {\n\
\tif (typeof value !== \"bigint\") throw new TypeError(\"collection index must be an integer\");\n\
\tconst normalized = value < 0n ? BigInt(length) + value : value;\n\
\tif (checked && (normalized < 0n || normalized >= BigInt(length))) throw new RangeError(\"index is outside the collection\");\n\
\treturn Number(normalized);\n\
}\n\
function hoopoeSliceBound(value, length, inclusive, checked) {\n\
\tif (value === null) return null;\n\
\tif (typeof value !== \"bigint\") throw new TypeError(\"slice bound must be an integer\");\n\
\tlet normalized = value < 0n ? BigInt(length) + value : value;\n\
\tconst maximum = inclusive ? BigInt(length) - 1n : BigInt(length);\n\
\tif (checked && (normalized < 0n || normalized > maximum)) throw new RangeError(\"slice bound is outside the collection\");\n\
\tif (inclusive) normalized += 1n;\n\
\treturn Number(normalized);\n\
}\n\
function hoopoeListSlice(value, start, end, inclusive, checked) {\n\
\tconst length = value.v.length;\n\
\tconst from = hoopoeSliceBound(start, length, false, checked) ?? 0;\n\
\tconst to = hoopoeSliceBound(end, length, inclusive, checked) ?? length;\n\
\tconst result = new NList(value.v.slice(from, to));\n\
\treturn hoopoeSetPrototypeOf(result, Object.getPrototypeOf(value));\n\
}\n\
function hoopoeStringSlice(value, start, end, inclusive, checked) {\n\
\tconst points = Array.from(value.v);\n\
\tconst from = hoopoeSliceBound(start, points.length, false, checked) ?? 0;\n\
\tconst to = hoopoeSliceBound(end, points.length, inclusive, checked) ?? points.length;\n\
\treturn new NString(points.slice(from, to).join(\"\"));\n\
}\n\
function hoopoeIntegerToFloat(value) {\n\
\tif (typeof value === \"number\") return value;\n\
\tif (typeof value !== \"bigint\" || value < HOOPOE_I64_MIN || value > HOOPOE_U64_MAX) throw new RangeError(\"integer-to-float input is out of range\");\n\
\treturn Number(value);\n\
}\n\
function hoopoeCheckedDivide(left, right) {\n\
\tif (typeof right === \"bigint\" && right === 0n) throw new RangeError(\"integer division by zero\");\n\
\treturn hoopoeIntegerToFloat(left) / hoopoeIntegerToFloat(right);\n\
}\n\
function hoopoeFloatToInteger(value, unsigned) {\n\
\tif (typeof value === \"bigint\") return unsigned ? hoopoeCheckedUInt(value) : hoopoeCheckedInt(value);\n\
\tif (typeof value !== \"number\" || !Number.isFinite(value)) throw new RangeError(\"float-to-integer conversion requires a finite value\");\n\
\tconst integer = BigInt(Math.trunc(value));\n\
\treturn unsigned ? hoopoeCheckedUInt(integer) : hoopoeCheckedInt(integer);\n\
}\n\
function hoopoeCharCode(value) {\n\
\tif (typeof value !== \"bigint\" || value < 0n || value > 0x10ffffn || (value >= 0xd800n && value <= 0xdfffn)) throw new RangeError(\"Invalid code point\");\n\
\treturn Number(value);\n\
}\n",
	);
	if export {
		out.push_str("export { HoopoeRange, hoopoeStructuralValue, hoopoeProtocolDisplay, hoopoeProtocolDebug, hoopoeProtocolDisplayStep, hoopoePrintStep, hoopoePrintlnStep, ");
		if echo {
			out.push_str("hoopoeEcho, ");
		}
		out.push_str("hoopoeTransactionBegin, hoopoeTransactionCommit, hoopoeTransactionRollback, hoopoeSetProperty, hoopoeDeleteProperty, hoopoeAssign, hoopoeSetPrototypeOf, hoopoeArraySplice, hoopoeArrayPush, hoopoeArrayPop, hoopoeArraySetLength, hoopoeMapSet, hoopoeWeakMapSet, hoopoeRuntimeClass, hoopoeRuntimeEnum, hoopoeHostIndex, hoopoeListSlice, hoopoeStringSlice, hoopoeFloatToInteger, hoopoeIntegerToFloat, hoopoeCheckedDivide, hoopoeCharCode, hoopoeCheckedShift, hoopoeCheckedPower, hoopoeTrustedInt, hoopoeTrustedUInt, hoopoeBoxOpaque, hoopoeUnboxOpaque, hoopoeActivate, hoopoeCaptureFrame, hoopoeCallable, hoopoeMarkCallable, hoopoeMethodStep, hoopoePush, hoopoeTailCall, hoopoeTailCallMember, hoopoeReturn, hoopoeSuspend, hoopoeDefect, hoopoeResume, hoopoeRegisterCleanup, hoopoeEnterCleanupScope, hoopoeLeaveCleanupScope, hoopoeUnwindCleanupScopes, hoopoeCommitStateTransition, hoopoeTaskRecipe, hoopoeTaskDrive, hoopoeTaskSpawn, hoopoeHandleObserve, hoopoeHandleCancel, hoopoeCheckpoint, hoopoeCurrentExecutionSignal, hoopoeTaskSelect, hoopoeTaskRace, hoopoeStartRoot, hoopoeRenderDefect, hoopoeRunTask };\n");
	}
	for (class, _) in BOX_CLASSES {
		if *class == "NMap" {
			out.push_str(&format!(
				"{kw}class {class} extends {BASE} {{\n\tconstructor(entries) {{\n\t\tsuper(entries instanceof HoopoeHamt ? entries : HoopoeHamt.from(entries));\n\t}}\n\tget size() {{ return this.v.size; }}\n\tget(key) {{ return this.v.get(key); }}\n\thas(key) {{ return this.v.has(key); }}\n\twith(key, value) {{ return new NMap(this.v.set(key, value)); }}\n\twithout(key) {{ return new NMap(this.v.delete(key)[0]); }}\n\tkeys() {{ return this.v.keys(); }}\n\tvalues() {{ return this.v.values(); }}\n\tentries() {{ return this.v.entries(); }}\n\t[Symbol.iterator]() {{ return this.v[Symbol.iterator](); }}\n}}\n"
			));
		} else if *class == "NInt" {
			let register = if echo {
				" hoopoeEchoBoxes.add(value);"
			} else {
				""
			};
			out.push_str(&format!(
				"{kw}class {class} extends {BASE} {{ constructor(v) {{ super(hoopoeCheckedInt(v)); }} static direct(v) {{ const value = Object.create(this.prototype); value.v = v;{register} return value; }} }}\n"
			));
		} else if *class == "NUint" {
			let register = if echo {
				" hoopoeEchoBoxes.add(value);"
			} else {
				""
			};
			out.push_str(&format!(
				"{kw}class {class} extends {BASE} {{ constructor(v) {{ super(hoopoeCheckedUInt(v)); }} static direct(v) {{ const value = Object.create(this.prototype); value.v = v;{register} return value; }} }}\n"
			));
		} else if *class == "NTuple" {
			// Native Map's constructor reads pair entries through numeric properties.
			// Keep that boundary compatible while the tuple's canonical storage stays `.v`.
			out.push_str(&format!(
				"{kw}class {class} extends {BASE} {{\n\tindex(key) {{\n\t\treturn this.v[hoopoeCollectionIndex(key.v, this.v.length, true)];\n\t}}\n\tindexDirect(key) {{\n\t\treturn this.v[hoopoeCollectionIndex(key.v, this.v.length, false)];\n\t}}\n\tget 0() {{\n\t\treturn this.v[0];\n\t}}\n\tget 1() {{\n\t\treturn this.v[1];\n\t}}\n}}\n"
			));
		} else if *class == "NList" {
			out.push_str(&format!(
				"{kw}class {class} extends {BASE} {{\n\tconstructor(items) {{\n\t\tsuper(HoopoePersistentVector.from(items));\n\t}}\n\tcopy(vector) {{\n\t\treturn hoopoeSetPrototypeOf(new NList(vector), Object.getPrototypeOf(this));\n\t}}\n\tindex(key) {{\n\t\treturn this.v.get(hoopoeCollectionIndex(key.v, this.v.length, true));\n\t}}\n\tindexDirect(key) {{\n\t\treturn this.v.get(hoopoeCollectionIndex(key.v, this.v.length, false));\n\t}}\n\tappended(item) {{\n\t\treturn this.copy(this.v.append(item));\n\t}}\n\treplaced(key, item) {{\n\t\treturn this.copy(this.v.replace(hoopoeListIndex(key), item));\n\t}}\n\tslice(start, end) {{\n\t\treturn this.copy(this.v.slice(hoopoeListIndex(start), hoopoeListIndex(end)));\n\t}}\n}}\n"
			));
		} else if *class == "NString" {
			out.push_str(&format!(
				"{kw}class {class} extends {BASE} {{\n\tindex(key) {{\n\t\tconst points = Array.from(this.v);\n\t\treturn new NChar(points[hoopoeCollectionIndex(key.v, points.length, true)]);\n\t}}\n\tindexDirect(key) {{\n\t\tconst points = Array.from(this.v);\n\t\treturn new NChar(points[hoopoeCollectionIndex(key.v, points.length, false)]);\n\t}}\n}}\n"
			));
		} else {
			out.push_str(&format!("{kw}class {class} extends {BASE} {{}}\n"));
		}
	}
	for (class, tag) in BOX_CLASSES {
		out.push_str(&format!(
			"{class}.prototype[Symbol.for(\"hoopoe.tag\")] = Symbol.for(\"hoopoe.{tag}\");\n"
		));
	}
	if export {
		out.push_str("export { hoopoeType, hoopoeTypeProjection, hoopoeVariant };\n");
	}
	out
}

/// The inline, non-`export`ed box class definitions prepended into a single
/// emitted module that constructs a box (see the module docs and [`crate::emit`]).
#[must_use]
pub fn box_preamble() -> String {
	class_defs(false, "Option", true)
}

#[must_use]
pub fn box_preamble_release() -> String {
	class_defs(false, "Option", false)
}

/// The `export`ed `std/box` runtime module source, injected into the bundle
/// graph under [`BOX_MODULE_KEY`] (see the module docs).
#[must_use]
pub fn box_module_source() -> String {
	class_defs(true, "Option", true)
}

/// The importable box runtime using the exact emitted compiler-Option binding
/// as its native iterator discriminant namespace.
#[must_use]
pub fn box_module_source_with_option_enum(option_enum_name: &str) -> String {
	class_defs(true, option_enum_name, true)
}

#[must_use]
pub fn box_module_source_with_option_enum_release(option_enum_name: &str) -> String {
	class_defs(true, option_enum_name, false)
}

/// The declaration source paired with [`box_module_source`].
#[must_use]
pub const fn box_module_declarations() -> &'static str {
	BOX_MODULE_DECLARATIONS
}

/// The JS class name a boxed [`hoopoe_hir::hir::NumKind`] uses. Panics on
/// [`hoopoe_hir::hir::NumKind::Raw`], which is never a boxed value.
#[must_use]
pub fn num_box_class(kind: hoopoe_hir::hir::NumKind) -> &'static str {
	use hoopoe_hir::hir::NumKind;
	match kind {
		NumKind::Float => "NFloat",
		NumKind::Raw => {
			unreachable!("NumKind::Raw is an unboxed internal number, not a box class")
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::process::Command;

	#[test]
	fn box_module_exports_every_wrapper_class() {
		let src = box_module_source();
		for (class, _) in BOX_CLASSES {
			assert!(
				src.contains(&format!("export class {class}")),
				"box module must export {class}, got:\n{src}"
			);
		}
		assert!(
			src.contains(&format!("export class {BASE}")),
			"box module must export the base class:\n{src}"
		);
	}

	#[test]
	fn canonical_type_objects_snapshot_their_argument_identity_sequence() {
		let src = box_module_source();
		assert!(src.contains("args = Object.freeze([...args]);"), "{src}");
	}

	#[test]
	fn box_declarations_cover_every_runtime_export() {
		let declarations = box_module_declarations();
		for name in [
			"NBox",
			"NInt",
			"NUint",
			"NFloat",
			"NChar",
			"NBool",
			"NString",
			"NList",
			"NTuple",
			"NMap",
			"hoopoeProtocolDisplay",
		] {
			assert!(
				declarations.contains(&format!("export class {name}"))
					|| declarations.contains(&format!("export function {name}")),
				"virtual declarations must export {name}:\n{declarations}"
			);
		}
	}

	#[test]
	fn virtual_declarations_name_the_runtime_module() {
		assert!(box_module_declarations().contains("declare module \"std/box\""));
	}

	#[test]
	fn preamble_defines_wrappers_without_export() {
		let src = box_preamble();
		assert!(!src.contains("export"), "preamble must not export:\n{src}");
		assert!(src.contains("class NInt extends NBox"), "{src}");
		assert!(src.contains("class NString extends NBox"), "{src}");
	}

	#[test]
	fn opaque_boxes_preserve_alias_identity_and_reject_nominal_or_shape_repair() {
		let script = format!(
			"{}\n\
			 const host = {{ closed: false }};\n\
			 const boxed = hoopoeBoxOpaque(117n, host);\n\
			 const alias = boxed;\n\
			 const mismatch = (() => {{ try {{ hoopoeUnboxOpaque(118n, boxed); return 'repaired'; }} catch (error) {{ return error.message; }} }})();\n\
			 const shape = (() => {{ try {{ hoopoeUnboxOpaque(117n, {{ v: host }}); return 'repaired'; }} catch (error) {{ return error.message; }} }})();\n\
			 const scalar = (() => {{ try {{ hoopoeBoxOpaque(117n, 1); return 'repaired'; }} catch (error) {{ return error.message; }} }})();\n\
			 hoopoeUnboxOpaque(117n, alias).closed = true;\n\
			 console.log([hoopoeUnboxOpaque(117n, boxed) === host, host.closed, 'equals' in boxed, 'hash' in boxed, JSON.stringify(boxed), mismatch, shape, scalar].join('|'));",
			box_preamble_release(),
		);
		let output = Command::new("node")
			.arg("--input-type=module")
			.arg("--eval")
			.arg(script)
			.output()
			.expect("Node must be available for opaque FFI runtime tests");
		assert!(
			output.status.success(),
			"{}",
			String::from_utf8_lossy(&output.stderr)
		);
		assert_eq!(
			String::from_utf8_lossy(&output.stdout).trim(),
			"true|true|false|false|{}|opaque external identity mismatch|opaque external identity mismatch|trusted opaque FFI must return a live reference"
		);
	}

	#[test]
	fn list_wrapper_exposes_only_persistent_operations() {
		let src = box_module_source();
		assert!(src.contains("appended(item)"), "{src}");
		assert!(
			src.contains("return this.copy(this.v.append(item))"),
			"{src}"
		);
		assert!(!src.contains("legacy"), "{src}");
	}

	#[test]
	fn each_wrapper_installs_its_global_type_tag_on_the_prototype() {
		let src = box_module_source();
		for (class, tag) in BOX_CLASSES {
			assert!(
				src.contains(&format!(
					"{class}.prototype[Symbol.for(\"hoopoe.tag\")] = Symbol.for(\"hoopoe.{tag}\");"
				)),
				"{class} must install its hoopoe.{tag} tag:\n{src}"
			);
		}
	}

	#[test]
	fn activation_runtime_drives_states_once_and_unwinds_cancellation_in_reverse() {
		let script = format!(
			"{}\n\
			 const order = [];\n\
			 const descend = hoopoeCallable((frame) => {{\n\
			   const n = frame.liveLocals[0];\n\
			   hoopoeRegisterCleanup(() => order.push(`a${{n}}`));\n\
			   hoopoeRegisterCleanup(() => order.push(`b${{n}}`));\n\
			   return n === 0 ? hoopoeReturn(n) : hoopoeTailCall(descend, undefined, [n - 1], n);\n\
			 }});\n\
			 if (hoopoeActivate(descend, undefined, [100000], 0) !== 0) throw new Error('tail result');\n\
			 if (hoopoeNextFrameSlot !== 1) throw new Error('tail allocated another logical frame');\n\
			 if (order[0] !== 'b100000' || order[1] !== 'a100000' || order.at(-1) !== 'a0') throw new Error('cleanup order');\n\
			 const child = hoopoeCallable((frame) => hoopoeReturn(frame.liveLocals[0] + 1));\n\
			 const parent = hoopoeCallable((frame) => {{\n\
			   if (frame.resumeState === 0) return hoopoePush(child, undefined, [frame.liveLocals[0]], 8, 1, 1);\n\
			   return hoopoeReturn(frame.liveLocals[1] + 1);\n\
			 }});\n\
			 if (hoopoeActivate(parent, undefined, [1], 7) !== 3) throw new Error('push resume');\n\
			 if (hoopoeNextFrameSlot !== 3) throw new Error('non-tail call did not push one frame');\n\
			 const external = (value) => value + 1;\n\
			 const externalParent = hoopoeCallable((frame) => {{\n\
			   if (frame.resumeState === 0) return hoopoePush(external, undefined, [frame.liveLocals[0]], 8, 1, 1);\n\
			   return hoopoeReturn(frame.liveLocals[1] + 1);\n\
			 }});\n\
			 if (hoopoeActivate(externalParent, undefined, [1], 8) !== 3) throw new Error('external direct result');\n\
			 if (hoopoeNextFrameSlot !== 4) throw new Error('external call pushed a frame');\n\
			 let effects = 0;\n\
			 const suspended = hoopoeCallable((frame) => {{\n\
			   if (frame.resumeState === 0) return hoopoeSuspend(() => {{ effects += 1; return 41; }}, 1, 0);\n\
			   return hoopoeReturn(frame.liveLocals[0] + 1);\n\
			 }});\n\
			 const retained = hoopoeActivate(suspended, undefined, [], 9);\n\
			 if (retained.value !== 41 || effects !== 1) throw new Error('suspend effect count');\n\
			 if (retained.resume() !== 42 || effects !== 1) throw new Error('resume replayed effect');\n\
			 const fail = hoopoeCallable(() => {{\n\
			   hoopoeRegisterCleanup(() => {{ throw new Error('first'); }});\n\
			   hoopoeRegisterCleanup(() => {{ throw new Error('second'); }});\n\
			   return hoopoeDefect(new Error('primary'));\n\
			 }});\n\
			 try {{ hoopoeActivate(fail, undefined, [], 10); throw new Error('missing defect'); }}\n\
			 catch (error) {{\n\
			   if (!(error instanceof AggregateError)) throw error;\n\
			   if (error.errors.map((item) => item.message).join(',') !== 'primary,second,first') throw error;\n\
			 }}\n\
			 const cancelOrder = [];\n\
			 const waitingChild = hoopoeCallable(() => {{\n\
			   hoopoeRegisterCleanup(() => cancelOrder.push('child-outer'));\n\
			   hoopoeEnterCleanupScope();\n\
			   hoopoeRegisterCleanup(() => cancelOrder.push('child-inner'));\n\
			   return hoopoeSuspend(() => 'waiting', 1, 0);\n\
			 }});\n\
			 const waitingParent = hoopoeCallable((frame) => {{\n\
			   hoopoeRegisterCleanup(() => cancelOrder.push('parent-first'));\n\
			   hoopoeRegisterCleanup(() => cancelOrder.push('parent-second'));\n\
			   return hoopoePush(waitingChild, undefined, [], 11, 1, 0);\n\
			 }});\n\
			 const cancellation = hoopoeActivate(waitingParent, undefined, [], 11);\n\
			 const reason = new Error('cancel');\n\
			 try {{ cancellation.cancel(reason); throw new Error('missing cancellation'); }}\n\
			 catch (error) {{ if (error !== reason) throw error; }}\n\
			 if (cancelOrder.join(',') !== 'child-inner,child-outer,parent-second,parent-first') throw new Error(`cancel order: ${{cancelOrder}}`);\n\
			 const nested = hoopoeCallable(() => hoopoeReturn(hoopoeActivate(child, undefined, [0], 12)));\n\
			 try {{ hoopoeActivate(nested, undefined, [], 12); throw new Error('missing nested guard'); }}\n\
			 catch (error) {{ if (!String(error).includes('must be pushed by the activation driver')) throw error; }}\n",
			ACTIVATION_RUNTIME
		);
		let output = Command::new("node")
			.arg("--input-type=module")
			.arg("--eval")
			.arg(script)
			.output()
			.expect("Node must be available for codegen runtime tests");
		assert!(
			output.status.success(),
			"{}",
			String::from_utf8_lossy(&output.stderr)
		);
	}

	#[test]
	fn state_transition_closes_old_state_and_cleans_new_state_on_failure() {
		let script = format!(
			"{}\n\
			 const successOrder = [];\n\
			 const success = hoopoeCallable(() => {{\n\
			   hoopoeEnterCleanupScope();\n\
			   const oldA = hoopoeRegisterCleanup(() => successOrder.push('old-a'));\n\
			   const oldB = hoopoeRegisterCleanup(() => successOrder.push('old-b'));\n\
			   hoopoeEnterCleanupScope();\n\
			   hoopoeRegisterCleanup(() => successOrder.push('body'));\n\
			   hoopoeEnterCleanupScope();\n\
			   const newA = hoopoeRegisterCleanup(() => successOrder.push('new-a'));\n\
			   const newB = hoopoeRegisterCleanup(() => successOrder.push('new-b'));\n\
			   hoopoeCommitStateTransition(2, [oldA, newA, oldB, newB]);\n\
			   return hoopoeReturn(undefined);\n\
			 }});\n\
			 hoopoeActivate(success, undefined, [], 0);\n\
			 if (successOrder.join(',') !== 'body,old-b,old-a,new-b,new-a') throw new Error(`success order: ${{successOrder}}`);\n\
			 const failureOrder = [];\n\
			 const failure = hoopoeCallable(() => {{\n\
			   hoopoeEnterCleanupScope();\n\
			   const oldA = hoopoeRegisterCleanup(() => failureOrder.push('old-a'));\n\
			   const oldB = hoopoeRegisterCleanup(() => failureOrder.push('old-b'));\n\
			   hoopoeEnterCleanupScope();\n\
			   hoopoeRegisterCleanup(() => {{ failureOrder.push('body'); throw new Error('body failed'); }});\n\
			   hoopoeEnterCleanupScope();\n\
			   const newA = hoopoeRegisterCleanup(() => failureOrder.push('new-a'));\n\
			   const newB = hoopoeRegisterCleanup(() => failureOrder.push('new-b'));\n\
			   hoopoeCommitStateTransition(2, [oldA, newA, oldB, newB]);\n\
			   return hoopoeReturn(undefined);\n\
			 }});\n\
			 try {{ hoopoeActivate(failure, undefined, [], 0); throw new Error('missing failure'); }}\n\
			 catch (error) {{ if (!String(error).includes('body failed')) throw error; }}\n\
			 if (failureOrder.join(',') !== 'body,old-b,old-a,new-b,new-a') throw new Error(`failure order: ${{failureOrder}}`);\n",
			ACTIVATION_RUNTIME
		);
		let output = Command::new("node")
			.arg("--input-type=module")
			.arg("--eval")
			.arg(script)
			.output()
			.expect("Node must be available for codegen runtime tests");
		assert!(
			output.status.success(),
			"{}",
			String::from_utf8_lossy(&output.stderr)
		);
	}

	#[test]
	fn structured_task_runtime_obeys_execution_cancellation_and_ownership_contracts() {
		let script = [ACTIVATION_RUNTIME, TASK_RUNTIME, TASK_RUNTIME_TESTS].join("\n");
		let output = Command::new("node")
			.arg("--input-type=module")
			.arg("--eval")
			.arg(script)
			.output()
			.expect("Node must be available for task runtime tests");
		assert!(
			output.status.success(),
			"{}",
			String::from_utf8_lossy(&output.stderr)
		);
		assert_eq!(
			String::from_utf8_lossy(&output.stdout).trim(),
			"structured task runtime assertions passed"
		);
	}
}
