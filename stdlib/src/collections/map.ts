import {
	NList,
	NMap,
	NTuple,
	hoopoeType,
	hoopoeTypeProjection,
	hoopoeSetPrototypeOf,
} from "std/box";
import { Option } from "std/option";

export const size = <K, V>($_this: NMap<K, V>) => BigInt($_this.size);
export const get = <K, V>($_this: NMap<K, V>, key: K) =>
	$_this.has(key) ? Option.Some({ value: $_this.get(key)! }) : Option.None;
export const inserted = <K, V>($_this: NMap<K, V>, key: K, value: V) =>
	hoopoeSetPrototypeOf($_this.with(key, value), Object.getPrototypeOf($_this));
export const removed = <K, V>($_this: NMap<K, V>, key: K) =>
	hoopoeSetPrototypeOf($_this.without(key), Object.getPrototypeOf($_this));
export const keys = <K, V>($_this: NMap<K, V>) =>
	hoopoeSetPrototypeOf(
		new NList([...$_this.keys()]),
		hoopoeType(NList.prototype, [hoopoeTypeProjection($_this, [0])]),
	);
export const values = <K, V>($_this: NMap<K, V>) =>
	hoopoeSetPrototypeOf(
		new NList([...$_this.values()]),
		hoopoeType(NList.prototype, [hoopoeTypeProjection($_this, [1])]),
	);
export const entries = <K, V>($_this: NMap<K, V>) => {
	const key = hoopoeTypeProjection($_this, [0]);
	const value = hoopoeTypeProjection($_this, [1]);
	const tuple = hoopoeType(NTuple.prototype, [key, value]);
	return hoopoeSetPrototypeOf(
		new NList([...$_this.entries()].map((entry) => hoopoeSetPrototypeOf(new NTuple(entry), tuple))),
		hoopoeType(NList.prototype, [tuple]),
	);
};
