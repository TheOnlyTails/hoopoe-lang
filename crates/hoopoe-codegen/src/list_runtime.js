const HOOPOE_VECTOR_BITS = 5;
const HOOPOE_VECTOR_WIDTH = 1 << HOOPOE_VECTOR_BITS;
const HOOPOE_VECTOR_MASK = HOOPOE_VECTOR_WIDTH - 1;

function hoopoeVectorTailOffset(count) {
	return count < HOOPOE_VECTOR_WIDTH
		? 0
		: ((count - 1) >>> HOOPOE_VECTOR_BITS) << HOOPOE_VECTOR_BITS;
}

function hoopoeVectorFreezeNode(node) {
	return Object.freeze(node);
}

function hoopoeVectorNewPath(level, node) {
	if (level === 0) return node;
	return hoopoeVectorFreezeNode([hoopoeVectorNewPath(level - HOOPOE_VECTOR_BITS, node)]);
}

function hoopoeVectorPushTail(level, parent, tail, count) {
	const result = parent.slice();
	const index = ((count - 1) >>> level) & HOOPOE_VECTOR_MASK;
	result[index] =
		level === HOOPOE_VECTOR_BITS
			? tail
			: hoopoeVectorPushTail(
					level - HOOPOE_VECTOR_BITS,
					parent[index] ?? hoopoeVectorFreezeNode([]),
					tail,
					count,
				);
	return hoopoeVectorFreezeNode(result);
}

function hoopoeVectorAssoc(level, node, index, value) {
	const result = node.slice();
	if (level === 0) result[index & HOOPOE_VECTOR_MASK] = value;
	else {
		const child = (index >>> level) & HOOPOE_VECTOR_MASK;
		result[child] = hoopoeVectorAssoc(level - HOOPOE_VECTOR_BITS, node[child], index, value);
	}
	return hoopoeVectorFreezeNode(result);
}

function hoopoeVectorFromLeaves(leaves, count, tail) {
	if (leaves.length === 0)
		return new HoopoePersistentVector(count, HOOPOE_VECTOR_BITS, hoopoeVectorFreezeNode([]), tail);
	let level = HOOPOE_VECTOR_BITS;
	let nodes = leaves;
	while (nodes.length > HOOPOE_VECTOR_WIDTH) {
		const parents = [];
		for (let index = 0; index < nodes.length; index += HOOPOE_VECTOR_WIDTH)
			parents.push(hoopoeVectorFreezeNode(nodes.slice(index, index + HOOPOE_VECTOR_WIDTH)));
		nodes = parents;
		level += HOOPOE_VECTOR_BITS;
	}
	return new HoopoePersistentVector(count, level, hoopoeVectorFreezeNode(nodes), tail);
}

function hoopoeVectorIndexProperty(property) {
	if (typeof property !== "string" || property === "") return undefined;
	const index = Number(property);
	return Number.isSafeInteger(index) && index >= 0 && String(index) === property
		? index
		: undefined;
}

function hoopoeListIndex(value) {
	return hoopoeHostIndex(typeof value === "bigint" ? value : value.v);
}

class HoopoePersistentVector {
	constructor(count, shift, root, tail) {
		this._count = count;
		this._shift = shift;
		this._root = root;
		this._tail = tail;
		Object.freeze(this);
		return new Proxy(this, {
			get(target, property, receiver) {
				const index = hoopoeVectorIndexProperty(property);
				return index === undefined ? Reflect.get(target, property, receiver) : target.get(index);
			},
		});
	}

	static from(iterable) {
		if (iterable instanceof HoopoePersistentVector) return iterable;
		const transient = new HoopoeListTransient();
		for (const item of iterable) transient.append(item);
		return transient.freeze();
	}

	get length() {
		return this._count;
	}

	_leafFor(index) {
		if (index < 0 || index >= this._count) return undefined;
		if (index >= hoopoeVectorTailOffset(this._count)) return this._tail;
		let node = this._root;
		for (let level = this._shift; level > 0; level -= HOOPOE_VECTOR_BITS)
			node = node[(index >>> level) & HOOPOE_VECTOR_MASK];
		return node;
	}

	get(index) {
		const leaf = this._leafFor(index);
		return leaf?.[index & HOOPOE_VECTOR_MASK];
	}

	append(value) {
		if (this._tail.length < HOOPOE_VECTOR_WIDTH)
			return new HoopoePersistentVector(
				this._count + 1,
				this._shift,
				this._root,
				hoopoeVectorFreezeNode([...this._tail, value]),
			);
		let shift = this._shift;
		let root;
		if (this._count >>> HOOPOE_VECTOR_BITS > 1 << this._shift) {
			root = hoopoeVectorFreezeNode([this._root, hoopoeVectorNewPath(this._shift, this._tail)]);
			shift += HOOPOE_VECTOR_BITS;
		} else root = hoopoeVectorPushTail(this._shift, this._root, this._tail, this._count);
		return new HoopoePersistentVector(
			this._count + 1,
			shift,
			root,
			hoopoeVectorFreezeNode([value]),
		);
	}

	replace(index, value) {
		if (index < 0 || index >= this._count) throw new RangeError("list index out of bounds");
		if (index >= hoopoeVectorTailOffset(this._count)) {
			const tail = this._tail.slice();
			tail[index & HOOPOE_VECTOR_MASK] = value;
			return new HoopoePersistentVector(
				this._count,
				this._shift,
				this._root,
				hoopoeVectorFreezeNode(tail),
			);
		}
		return new HoopoePersistentVector(
			this._count,
			this._shift,
			hoopoeVectorAssoc(this._shift, this._root, index, value),
			this._tail,
		);
	}

	slice(start = 0, end = this._count) {
		start = Math.max(0, Math.min(this._count, start));
		end = Math.max(start, Math.min(this._count, end));
		const count = end - start;
		if (count === 0) return HoopoePersistentVector.from([]);
		const tailStart = hoopoeVectorTailOffset(count);
		const leaves = [];
		for (let offset = 0; offset < tailStart; offset += HOOPOE_VECTOR_WIDTH) {
			const source = start + offset;
			if ((source & HOOPOE_VECTOR_MASK) === 0) leaves.push(this._leafFor(source));
			else {
				const leaf = [];
				for (let index = 0; index < HOOPOE_VECTOR_WIDTH; index++)
					leaf.push(this.get(source + index));
				leaves.push(hoopoeVectorFreezeNode(leaf));
			}
		}
		const tail = [];
		for (let offset = tailStart; offset < count; offset++) tail.push(this.get(start + offset));
		return hoopoeVectorFromLeaves(leaves, count, hoopoeVectorFreezeNode(tail));
	}

	map(callback) {
		return Array.from(this, callback);
	}

	join(separator) {
		return Array.from(this).join(separator);
	}

	*[Symbol.iterator]() {
		for (let index = 0; index < this._count; index++) yield this.get(index);
	}
}

class HoopoeListTransient {
	constructor() {
		this.items = [];
		this.frozen = false;
	}

	append(item) {
		if (this.frozen) throw new TypeError("list transient is already frozen");
		this.items.push(item);
	}

	freeze() {
		if (this.frozen) throw new TypeError("list transient is already frozen");
		this.frozen = true;
		const count = this.items.length;
		const tailStart = hoopoeVectorTailOffset(count);
		const leaves = [];
		for (let index = 0; index < tailStart; index += HOOPOE_VECTOR_WIDTH)
			leaves.push(hoopoeVectorFreezeNode(this.items.slice(index, index + HOOPOE_VECTOR_WIDTH)));
		return hoopoeVectorFromLeaves(
			leaves,
			count,
			hoopoeVectorFreezeNode(this.items.slice(tailStart)),
		);
	}
}
