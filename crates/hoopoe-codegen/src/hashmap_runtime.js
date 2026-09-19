const HOOPOE_TAG = Symbol.for("hoopoe.tag");
const HOOPOE_STRUCTURAL_SHAPE = Symbol.for("hoopoe.structural.shape");
const hoopoeHashCache = new WeakMap();
/* HOOPOE_ECHO_REGISTRIES */

function hoopoeStructuralValue(value, identity, fields) {
	Object.defineProperty(value, HOOPOE_STRUCTURAL_SHAPE, {
		value: Object.freeze({ identity, fields: Object.freeze([...fields]) }),
	});
	/* HOOPOE_ECHO_REGISTER_STRUCTURAL */
	return value;
}

// One journal shared by every copy of the exact ESM runtime.  Keeping the
// state on globalThis is important: project modules may resolve std/box through
// different module URLs while still participating in one REPL transaction.
const HOOPOE_TX_KEY = Symbol.for("hoopoe.transaction.journal");
const hoopoeTransactionJournal =
	globalThis[HOOPOE_TX_KEY] ?? (globalThis[HOOPOE_TX_KEY] = { stack: [], rollingBack: false });
const HOOPOE_CLASS_KEY = Symbol.for("hoopoe.runtime.classes");
const hoopoeRuntimeClasses =
	globalThis[HOOPOE_CLASS_KEY] ?? (globalThis[HOOPOE_CLASS_KEY] = new globalThis.Map());

function hoopoeTransactionBegin() {
	hoopoeTransactionJournal.stack.push([]);
}
function hoopoeTransactionCommit() {
	const entries = hoopoeTransactionJournal.stack.pop();
	if (entries === undefined) throw new Error("no active Hoopoe transaction");
	const parent = hoopoeTransactionJournal.stack.at(-1);
	if (parent) parent.push(...entries);
}
function hoopoeTransactionRollback() {
	const entries = hoopoeTransactionJournal.stack.pop();
	if (entries === undefined) throw new Error("no active Hoopoe transaction");
	hoopoeTransactionJournal.rollingBack = true;
	try {
		for (let i = entries.length - 1; i >= 0; i--) entries[i]();
	} finally {
		hoopoeTransactionJournal.rollingBack = false;
	}
}
function hoopoeJournal(undo) {
	if (!hoopoeTransactionJournal.rollingBack) hoopoeTransactionJournal.stack.at(-1)?.push(undo);
}
function hoopoeSetProperty(object, key, value) {
	const descriptor = Object.getOwnPropertyDescriptor(object, key);
	const oldLength = Array.isArray(object) ? object.length : undefined;
	hoopoeJournal(() => {
		if (descriptor) Object.defineProperty(object, key, descriptor);
		else Reflect.deleteProperty(object, key);
		if (oldLength !== undefined && object.length !== oldLength) object.length = oldLength;
	});
	if (!Reflect.set(object, key, value))
		throw new TypeError(`cannot assign property ${String(key)}`);
	return value;
}
function hoopoeDeleteProperty(object, key) {
	const descriptor = Object.getOwnPropertyDescriptor(object, key);
	hoopoeJournal(() => {
		if (descriptor) Object.defineProperty(object, key, descriptor);
	});
	return Reflect.deleteProperty(object, key);
}
function hoopoeAssign(object, source) {
	for (const key of Reflect.ownKeys(source)) hoopoeSetProperty(object, key, source[key]);
	return object;
}
function hoopoeSetPrototypeOf(object, prototype) {
	const old = Object.getPrototypeOf(object);
	hoopoeJournal(() => Reflect.setPrototypeOf(object, old));
	Object.setPrototypeOf(object, prototype);
	return object;
}
function hoopoeArraySplice(array, start, deleteCount, ...items) {
	const before = array.slice();
	hoopoeJournal(() => {
		array.splice(0, array.length);
		array.length = before.length;
		for (const key of Object.keys(before)) array[key] = before[key];
	});
	return array.splice(start, deleteCount, ...items);
}
function hoopoeArrayPush(array, ...items) {
	hoopoeArraySplice(array, array.length, 0, ...items);
	return array.length;
}
function hoopoeArrayPop(array) {
	return array.length ? hoopoeArraySplice(array, array.length - 1, 1)[0] : undefined;
}
function hoopoeArraySetLength(array, length) {
	if (length < array.length) hoopoeArraySplice(array, length, array.length - length);
	else hoopoeSetProperty(array, "length", length);
	return length;
}
function hoopoeMapSet(map, key, value) {
	const had = map.has(key),
		old = map.get(key);
	hoopoeJournal(() => (had ? map.set(key, old) : map.delete(key)));
	map.set(key, value);
	return map;
}
function hoopoeWeakMapSet(map, key, value) {
	const had = map.has(key),
		old = map.get(key);
	hoopoeJournal(() => (had ? map.set(key, old) : map.delete(key)));
	map.set(key, value);
	return map;
}
function hoopoeRuntimeClass(module, name, implementation) {
	const key = `${module}\0${name.replace(/^\$m[^$]+\$/, "")}`;
	const existing = hoopoeRuntimeClasses.get(key);
	if (existing !== undefined) {
		for (const property of Reflect.ownKeys(implementation.prototype)) {
			if (property !== "constructor")
				hoopoeSetProperty(existing.prototype, property, implementation.prototype[property]);
		}
		for (const property of Reflect.ownKeys(implementation)) {
			if (!["length", "name", "prototype"].includes(property))
				hoopoeSetProperty(existing, property, implementation[property]);
		}
		return existing;
	}
	hoopoeMapSet(hoopoeRuntimeClasses, key, implementation);
	return implementation;
}
function hoopoeRuntimeEnum(module, name, implementation) {
	const key = `${module}\0enum:${name.replace(/^\$m[^$]+\$/, "")}`;
	const existing = hoopoeRuntimeClasses.get(key);
	if (existing !== undefined) {
		for (const property of Reflect.ownKeys(implementation.$hoopoe$type))
			hoopoeSetProperty(existing.$hoopoe$type, property, implementation.$hoopoe$type[property]);
		for (const property of Reflect.ownKeys(implementation)) {
			if (!(property in existing)) hoopoeSetProperty(existing, property, implementation[property]);
			else if (
				typeof implementation[property] === "function" &&
				!implementation[property][HOOPOE_TAG]
			)
				hoopoeSetProperty(existing, property, implementation[property]);
		}
		return existing;
	}
	hoopoeMapSet(hoopoeRuntimeClasses, key, implementation);
	return implementation;
}

function hoopoeMix32(value) {
	value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
	value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
	return (value ^ (value >>> 15)) | 0;
}

function hoopoeHashString(value) {
	let lo = 0x243f6a88;
	let hi = 0x85a308d3;
	for (let index = 0; index < value.length; index++) {
		lo = hoopoeMix32(lo ^ value.charCodeAt(index));
		hi = hoopoeMix32(hi + value.charCodeAt(index));
	}
	return [lo, hi];
}

function hoopoeHashOrdered(seed, hashes) {
	let [lo, hi] = hoopoeHashString(seed);
	for (const [itemLo, itemHi] of hashes) {
		lo = hoopoeMix32(lo ^ itemLo);
		hi = hoopoeMix32(hi ^ itemHi ^ lo);
	}
	return [lo, hi];
}

function hoopoeHashUnordered(seed, hashes) {
	let sumLo = 0,
		sumHi = 0,
		xorLo = 0,
		xorHi = 0,
		count = 0;
	for (const [itemLo, itemHi] of hashes) {
		const lo = hoopoeMix32(itemLo ^ 0x9e3779b9);
		const hi = hoopoeMix32(itemHi ^ lo);
		sumLo = (sumLo + lo) | 0;
		sumHi = (sumHi + hi) | 0;
		xorLo ^= lo;
		xorHi ^= hi;
		count++;
	}
	return hoopoeHashOrdered(seed, [
		[sumLo, sumHi],
		[xorLo, xorHi],
		[count, hoopoeMix32(count)],
	]);
}

function hoopoeHashInteger(value) {
	const negative = value < 0n;
	let magnitude = negative ? -value : value;
	let lo = negative ? 0x4f1bbcdc : 0x6a09e667;
	let hi = 0xbb67ae85;
	do {
		lo = hoopoeMix32(lo ^ Number(magnitude & 0xffff_ffffn));
		hi = hoopoeMix32(hi ^ lo);
		magnitude >>= 32n;
	} while (magnitude !== 0n);
	return hoopoeHashOrdered("integer", [[lo, hi]]);
}

function hoopoePackHash([lo, hi]) {
	return BigInt.asIntN(64, (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0));
}

function hoopoeFoldHash(hash) {
	const bits = BigInt.asUintN(64, hash);
	return Number(BigInt.asIntN(32, bits ^ (bits >> 32n)));
}

function hoopoeTagName(value) {
	return value?.[HOOPOE_TAG]?.description;
}

function hoopoeIsPayloadBox(value) {
	return [
		"hoopoe.int",
		"hoopoe.uint",
		"hoopoe.float",
		"hoopoe.char",
		"hoopoe.bool",
		"hoopoe.string",
		"hoopoe.list",
		"hoopoe.tuple",
	].includes(hoopoeTagName(value));
}

function hoopoeDebug(value) {
	if (value === undefined) return "void";
	const tag = hoopoeTagName(value);
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean")
		return String(value);
	if (tag === "hoopoe.int" || tag === "hoopoe.uint" || tag === "hoopoe.bool")
		return String(value.v);
	if (tag === "hoopoe.float")
		return Number.isInteger(value.v) ? value.v.toFixed(1) : String(value.v);
	if (tag === "hoopoe.char") {
		const escaped = JSON.stringify(String(value.v)).slice(1, -1).replaceAll("'", "\\'");
		return `'${escaped}'`;
	}
	if (tag === "hoopoe.string") return JSON.stringify(value.v);
	if (tag === "hoopoe.list") return `#[${value.v.map(hoopoeDebugValue).join(", ")}]`;
	if (tag === "hoopoe.tuple") return `#(${value.v.map(hoopoeDebugValue).join(", ")})`;
	if (tag === "hoopoe.map")
		return `#{${[...value].map(([k, v]) => `${hoopoeDebugValue(k)}: ${hoopoeDebugValue(v)}`).join(", ")}}`;
	if (value == null) return String(value);
	const name = (tag ?? value.constructor?.name ?? "Object").split("$").at(-1);
	const fields = Object.keys(value);
	return fields.length === 0
		? name
		: `${name}(${fields.map((key) => `${key}: ${hoopoeDebugValue(value[key])}`).join(", ")})`;
}

function hoopoeDebugValue(value) {
	return typeof value?.$hoopoe$debug === "function" ? value.$hoopoe$debug().v : hoopoeDebug(value);
}

function hoopoeDisplay(value) {
	const tag = hoopoeTagName(value);
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "bigint" ||
		typeof value === "boolean"
	)
		return String(value);
	if (tag === "hoopoe.char" || tag === "hoopoe.string") return value.v;
	return hoopoeDebugValue(value);
}

function hoopoeProtocolDisplay(value) {
	return typeof value?.$hoopoe$display === "function"
		? value.$hoopoe$display()
		: new NString(hoopoeDisplay(value));
}

function hoopoeProtocolDebug(value) {
	return typeof value?.$hoopoe$debug === "function"
		? value.$hoopoe$debug()
		: new NString(hoopoeDebug(value));
}

function hoopoeEquals(left, right) {
	if (left === right) return true;
	if (left == null || right == null || typeof left !== "object" || typeof right !== "object") {
		return false;
	}
	const leftTag = hoopoeTagName(left),
		rightTag = hoopoeTagName(right);
	if (
		(leftTag === "hoopoe.int" || leftTag === "hoopoe.uint") &&
		(rightTag === "hoopoe.int" || rightTag === "hoopoe.uint")
	)
		return left.v === right.v && (leftTag === rightTag || left.v >= 0n);
	if (left[HOOPOE_TAG] !== right[HOOPOE_TAG]) return false;
	if (leftTag === "hoopoe.map") {
		const leftRoot = left.v.root,
			leftSize = left.size,
			rightRoot = right.v.root,
			rightSize = right.size;
		let equal = leftSize === rightSize;
		if (equal) {
			for (const [key, value] of hamtEntries(leftRoot)) {
				if (!right.has(key) || !hoopoeKeyEquals(value, right.get(key))) {
					equal = false;
					break;
				}
			}
		}
		if (
			left.v.root !== leftRoot ||
			left.size !== leftSize ||
			right.v.root !== rightRoot ||
			right.size !== rightSize
		)
			throw new Error("map callback mutated a map being compared");
		return equal;
	}
	if (
		(leftTag === "hoopoe.list" && rightTag === "hoopoe.list") ||
		(Array.isArray(left.v) && Array.isArray(right.v))
	) {
		return (
			left.v.length === right.v.length &&
			Array.from(left.v).every((value, index) => hoopoeKeyEquals(value, right.v[index]))
		);
	}
	if (hoopoeIsPayloadBox(left) || hoopoeIsPayloadBox(right)) return left.v === right.v;
	const leftShape = left[HOOPOE_STRUCTURAL_SHAPE],
		rightShape = right[HOOPOE_STRUCTURAL_SHAPE];
	return (
		leftShape !== undefined &&
		rightShape !== undefined &&
		leftShape.identity === rightShape.identity &&
		leftShape.fields.length === rightShape.fields.length &&
		leftShape.fields.every(
			(field, index) =>
				field === rightShape.fields[index] && hoopoeKeyEquals(left[field], right[field]),
		)
	);
}

function hoopoeHashPair(value) {
	if (value !== null && typeof value === "object") {
		const cached = hoopoeHashCache.get(value);
		if (Array.isArray(cached)) return cached;
	}
	if (value == null || typeof value !== "object")
		return hoopoeHashString(`${typeof value}:${String(value)}`);
	const tag = hoopoeTagName(value);
	if (tag === "hoopoe.int" || tag === "hoopoe.uint") return hoopoeHashInteger(value.v);
	let result;
	if (tag === "hoopoe.map") {
		const root = value.v.root,
			size = value.size;
		const cached = hoopoeHashCache.get(value);
		if (cached?.root === root) return cached.hash;
		result = hoopoeHashUnordered(
			"map",
			Array.from(hamtEntries(root), ([key, entryValue]) =>
				hoopoeHashOrdered("entry", [hoopoeKeyHashPair(key), hoopoeKeyHashPair(entryValue)]),
			),
		);
		if (value.v.root !== root || value.size !== size)
			throw new Error("map callback mutated the map being hashed");
		hoopoeHashCache.set(value, { root, hash: result });
		return result;
	}
	if (tag === "hoopoe.list" || Array.isArray(value.v))
		return hoopoeHashOrdered(
			tag === "hoopoe.list" ? "list" : "tuple",
			value.v.map(hoopoeKeyHashPair),
		);
	if (tag === "hoopoe.float") throw new TypeError("float has no lawful structural hash");
	if (hoopoeIsPayloadBox(value))
		return hoopoeHashOrdered(tag ?? "payload", [hoopoeHashString(String(value.v))]);
	const shape = value[HOOPOE_STRUCTURAL_SHAPE];
	if (shape === undefined) throw new TypeError("value has no structural hash capability");
	result = hoopoeHashOrdered(
		`nominal:${shape.identity}`,
		shape.fields.map((field) =>
			hoopoeHashOrdered("field", [hoopoeHashString(field), hoopoeKeyHashPair(value[field])]),
		),
	);
	if (Object.isFrozen(value)) hoopoeHashCache.set(value, result);
	return result;
}

function hoopoeHash(value) {
	return hoopoePackHash(hoopoeHashPair(value));
}

function hoopoeKeyHash(key) {
	return hoopoeFoldHash(hoopoeHash(key));
}

function hoopoeKeyHashPair(key) {
	return hoopoeHashPair(key);
}

function hoopoeKeyEquals(left, right) {
	return hoopoeEquals(left, right);
}

const HAMT_NOT_FOUND = Symbol("hoopoe.hamt.not_found");

function hamtPopcount(value) {
	value -= (value >>> 1) & 0x55555555;
	value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
	return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function hamtMerge(left, leftHash, right, rightHash, shift) {
	const leftIndex = (leftHash >>> shift) & 31;
	const rightIndex = (rightHash >>> shift) & 31;
	const leftBit = 1 << leftIndex;
	const rightBit = 1 << rightIndex;
	if (leftBit === rightBit) {
		return {
			kind: "bitmap",
			bitmap: leftBit,
			children: [hamtMerge(left, leftHash, right, rightHash, shift + 5)],
		};
	}
	return {
		kind: "bitmap",
		bitmap: leftBit | rightBit,
		children: leftIndex < rightIndex ? [left, right] : [right, left],
	};
}

function hamtGet(node, hash, key, shift) {
	if (node == null) return HAMT_NOT_FOUND;
	if (node.kind === "leaf")
		return node.hash === hash && hoopoeKeyEquals(node.key, key) ? node.value : HAMT_NOT_FOUND;
	if (node.kind === "collision") {
		if (node.hash !== hash) return HAMT_NOT_FOUND;
		const entry = node.entries.find(([candidate]) => hoopoeKeyEquals(candidate, key));
		return entry ? entry[1] : HAMT_NOT_FOUND;
	}
	const bit = 1 << ((hash >>> shift) & 31);
	if ((node.bitmap & bit) === 0) return HAMT_NOT_FOUND;
	const index = hamtPopcount(node.bitmap & (bit - 1));
	return hamtGet(node.children[index], hash, key, shift + 5);
}

function hamtSet(node, hash, key, value, shift) {
	if (node == null) return [{ kind: "leaf", hash, key, value }, true];
	if (node.kind === "leaf") {
		if (node.hash === hash && hoopoeKeyEquals(node.key, key)) {
			return [{ ...node, value }, false];
		}
		if (node.hash === hash) {
			return [
				{
					kind: "collision",
					hash,
					entries: [
						[node.key, node.value],
						[key, value],
					],
				},
				true,
			];
		}
		return [hamtMerge(node, node.hash, { kind: "leaf", hash, key, value }, hash, shift), true];
	}
	if (node.kind === "collision") {
		if (node.hash !== hash) {
			return [hamtMerge(node, node.hash, { kind: "leaf", hash, key, value }, hash, shift), true];
		}
		const entryIndex = node.entries.findIndex(([candidate]) => hoopoeKeyEquals(candidate, key));
		if (entryIndex >= 0) {
			const entries = node.entries.slice();
			entries[entryIndex] = [key, value];
			return [{ ...node, entries }, false];
		}
		return [{ ...node, entries: [...node.entries, [key, value]] }, true];
	}
	const bit = 1 << ((hash >>> shift) & 31);
	const index = hamtPopcount(node.bitmap & (bit - 1));
	if ((node.bitmap & bit) === 0) {
		const children = node.children.slice();
		children.splice(index, 0, { kind: "leaf", hash, key, value });
		return [{ ...node, bitmap: node.bitmap | bit, children }, true];
	}
	const [child, inserted] = hamtSet(node.children[index], hash, key, value, shift + 5);
	const children = node.children.slice();
	children[index] = child;
	return [{ ...node, children }, inserted];
}

function hamtDelete(node, hash, key, shift) {
	if (node == null) return [null, undefined, false];
	if (node.kind === "leaf") {
		return node.hash === hash && hoopoeKeyEquals(node.key, key)
			? [null, node.value, true]
			: [node, undefined, false];
	}
	if (node.kind === "collision") {
		if (node.hash !== hash) return [node, undefined, false];
		const index = node.entries.findIndex(([candidate]) => hoopoeKeyEquals(candidate, key));
		if (index < 0) return [node, undefined, false];
		const value = node.entries[index][1];
		const entries = node.entries.toSpliced(index, 1);
		if (entries.length === 1) {
			const [[remainingKey, remainingValue]] = entries;
			return [{ kind: "leaf", hash, key: remainingKey, value: remainingValue }, value, true];
		}
		return [{ ...node, entries }, value, true];
	}
	const bit = 1 << ((hash >>> shift) & 31);
	if ((node.bitmap & bit) === 0) return [node, undefined, false];
	const index = hamtPopcount(node.bitmap & (bit - 1));
	const [child, value, removed] = hamtDelete(node.children[index], hash, key, shift + 5);
	if (!removed) return [node, undefined, false];
	if (child == null) {
		const children = node.children.toSpliced(index, 1);
		if (children.length === 0) return [null, value, true];
		if (children.length === 1 && children[0].kind !== "bitmap") return [children[0], value, true];
		return [{ ...node, bitmap: node.bitmap & ~bit, children }, value, true];
	} else {
		const children = node.children.slice();
		children[index] = child;
		return [{ ...node, children }, value, true];
	}
}

function* hamtEntries(node) {
	if (node == null) return;
	if (node.kind === "leaf") {
		yield [node.key, node.value];
		return;
	}
	if (node.kind === "collision") {
		yield* node.entries;
		return;
	}
	for (const child of node.children) yield* hamtEntries(child);
}

class HoopoeHamt {
	constructor(root = null, size = 0) {
		this.root = root;
		this.size = size;
		Object.freeze(this);
	}
	static from(entries = []) {
		let result = HoopoeHamt.empty;
		for (const entry of entries) {
			const pair = Array.isArray(entry.v) ? entry.v : entry;
			result = result.set(pair[0], pair[1]);
		}
		return result;
	}
	get(key) {
		const hash = hoopoeKeyHash(key);
		const value = hamtGet(this.root, hash, key, 0);
		return value === HAMT_NOT_FOUND ? undefined : value;
	}
	has(key) {
		const hash = hoopoeKeyHash(key);
		return hamtGet(this.root, hash, key, 0) !== HAMT_NOT_FOUND;
	}
	set(key, value) {
		const hash = hoopoeKeyHash(key);
		const [root, inserted] = hamtSet(this.root, hash, key, value, 0);
		return new HoopoeHamt(root, this.size + (inserted ? 1 : 0));
	}
	delete(key) {
		const hash = hoopoeKeyHash(key);
		const [root, value, removed] = hamtDelete(this.root, hash, key, 0);
		return [removed ? new HoopoeHamt(root, this.size - 1) : this, value, removed];
	}
	*entries() {
		yield* hamtEntries(this.root);
	}
	*keys() {
		for (const [key] of this.entries()) yield key;
	}
	*values() {
		for (const [, value] of this.entries()) yield value;
	}
	[Symbol.iterator]() {
		return this.entries();
	}
}
HoopoeHamt.empty = new HoopoeHamt();

class HoopoeRange {
	constructor({ start, end, inclusive }) {
		this.start = start;
		this.end = end;
		this.inclusive = inclusive;
	}
}
