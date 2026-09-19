declare module "std/box" {
	export interface HoopoeOption<T> {
		readonly [tag: symbol]: unknown;
		readonly value?: T;
	}

	export type HoopoeTaskOutcome<T> =
		| { readonly tag: "produced"; readonly value: T }
		| { readonly tag: "cancelled" }
		| { readonly tag: "defected"; readonly defect: unknown };

	export interface HoopoeTask<T> {}

	export interface HoopoeHandle<T> {}

	export class NBox<T> {
		constructor(value: T);
		v: T;
	}

	export class NInt extends NBox<bigint> {
		constructor(value: bigint | number);
	}
	export class NUint extends NBox<bigint> {
		constructor(value: bigint | number);
	}
	export class NFloat extends NBox<number> {}
	export class NChar extends NBox<string> {}
	export class NBool extends NBox<boolean> {}
	export class NString extends NBox<string> {}

	export interface HoopoePersistentVector<T> extends Iterable<T> {
		readonly length: number;
		get(index: number): T | undefined;
		map<U>(callback: (item: T, index: number) => U): U[];
		join(separator?: string): string;
		readonly [index: number]: T;
	}

	export class NList<T = unknown> extends NBox<HoopoePersistentVector<T>> {
		constructor(items: Iterable<T>);
		index(key: NInt | NUint): T;
		appended(item: T): NList<T>;
		replaced(key: NUint | bigint, item: T): NList<T>;
		slice(start: NUint | bigint, end: NUint | bigint): NList<T>;
	}

	export class NTuple<T = unknown> extends NBox<T[]> {
		index(key: NInt | NUint): T;
		readonly 0: T;
		readonly 1: T;
	}

	export class NMap<K = unknown, V = unknown> extends NBox<unknown> {
		constructor(entries?: Iterable<readonly [K, V]>);
		readonly size: number;
		get(key: K): V | undefined;
		has(key: K): boolean;
		with(key: K, value: V): NMap<K, V>;
		without(key: K): NMap<K, V>;
		keys(): IterableIterator<K>;
		values(): IterableIterator<V>;
		entries(): IterableIterator<[K, V]>;
		[Symbol.iterator](): IterableIterator<[K, V]>;
	}

	export function hoopoeStructuralValue<T>(value: T, identity: string, fields: string[]): T;
	export function hoopoeProtocolDisplay(value: unknown): NString;
	export function hoopoeTransactionBegin(): void;
	export function hoopoeTransactionCommit(): void;
	export function hoopoeTransactionRollback(): void;
	export function hoopoeArraySplice<T>(
		array: T[],
		start: number,
		deleteCount: number,
		...items: T[]
	): T[];
	export function hoopoeArrayPush<T>(array: T[], ...items: T[]): number;
	export function hoopoeArrayPop<T>(array: T[]): T | undefined;
	export function hoopoeArraySetLength<T>(array: T[], length: number): number;
	export function hoopoeType(base: object, args: object[]): object;
	export function hoopoeTypeProjection(receiver: object, path: number[]): object;
	export function hoopoeSetPrototypeOf<T extends object>(object: T, prototype: object): T;
	export function hoopoeHostIndex(value: bigint): number;
	export function hoopoeFloatToInteger(value: number, unsigned: boolean): bigint;
	export function hoopoeIntegerToFloat(value: bigint | number): number;
	export function hoopoeCheckedDivide(left: bigint | number, right: bigint | number): number;
	export function hoopoeCharCode(value: bigint): number;
	export function hoopoeCheckedShift(value: bigint, count: bigint, left: boolean): bigint;
	export function hoopoeCheckedPower(value: bigint, exponent: bigint): bigint;
	export function hoopoeTrustedInt(value: unknown): bigint;
	export function hoopoeTrustedUInt(value: unknown): bigint;
	export function hoopoeActivate(
		callable: (...args: unknown[]) => unknown,
		receiver: unknown,
		args: ArrayLike<unknown>,
		source: number,
	): unknown;
	export function hoopoeCallable<T extends (...args: never[]) => unknown>(step: T): T;
	export function hoopoeMarkCallable<T extends (...args: never[]) => unknown>(callable: T): T;
	export function hoopoeMethodStep(
		receiver: Record<string, (...args: unknown[]) => unknown>,
		member: string,
		args: ArrayLike<unknown>,
		step: (frame: unknown) => unknown,
	): unknown;
	export function hoopoePush(
		callable: (...args: unknown[]) => unknown,
		receiver: unknown,
		args: unknown[],
		source: number,
		resumeState: number,
		resultSlot: number,
	): unknown;
	export function hoopoeRegisterCleanup(cleanup: () => void): void;
	export function hoopoeEnterCleanupScope(): void;
	export function hoopoeLeaveCleanupScope(): void;
	export function hoopoeUnwindCleanupScopes(targetDepth: number): void;
	export function hoopoeTailCall(
		callable: (...args: unknown[]) => unknown,
		receiver: unknown,
		args: unknown[],
		source: number,
	): unknown;
	export function hoopoeTailCallMember(
		receiver: Record<string, (...args: unknown[]) => unknown>,
		member: string,
		args: unknown[],
		source: number,
	): unknown;
	export function hoopoeReturn(value: unknown): unknown;
	export function hoopoeSuspend(effect: unknown, resumeState: number, resultSlot: number): unknown;
	export function hoopoeDefect(defect: unknown): unknown;
	export function hoopoeResume(value: unknown, resumeState: number, resultSlot: number): unknown;
	export function hoopoeTaskRecipe<T>(
		callable: (...args: never[]) => unknown,
		nested: boolean,
	): HoopoeTask<T>;
	export function hoopoeTaskDrive<T>(task: HoopoeTask<T>): Promise<T>;
	export function hoopoeTaskSpawn<T>(task: HoopoeTask<T>): HoopoeHandle<T>;
	export function hoopoeHandleObserve<T>(handle: HoopoeHandle<T>): Promise<HoopoeTaskOutcome<T>>;
	export function hoopoeHandleCancel<T>(handle: HoopoeHandle<T>): void;
	export function hoopoeCheckpoint(): void;
	export function hoopoeTaskSelect<T>(handles: HoopoeHandle<T>[]): HoopoeTask<unknown>;
	export function hoopoeTaskRace<T>(tasks: HoopoeTask<T>[]): HoopoeTask<HoopoeTaskOutcome<T>>;
	export function hoopoeStartRoot<T>(
		main: () => T | HoopoeTask<T>,
		taskRoot: boolean,
	): { cancel(): void; outcome: Promise<HoopoeTaskOutcome<T>> };
	export function hoopoeRenderDefect(defect: unknown): string;
	export function hoopoeRunTask<T>(task: HoopoeTask<T>): Promise<T>;
}

declare module "std/option" {
	export namespace Option {
		interface Some<T> {
			readonly [tag: symbol]: unknown;
			readonly value: T;
		}

		interface None {
			readonly [tag: symbol]: unknown;
		}

		const Some: <T>(fields: { value: T }) => Some<T>;
		const None: None;
	}
}
