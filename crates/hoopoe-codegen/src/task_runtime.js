const HOOPOE_CANCELLATION = Symbol("hoopoe.cancellation");
let hoopoeSettlementSequence = 0;

class HoopoeCancellation extends Error {
	constructor() {
		super("execution cancelled");
		this.name = "HoopoeCancellation";
		this[HOOPOE_CANCELLATION] = true;
	}
}

function hoopoeIsCancellation(value) {
	return value?.[HOOPOE_CANCELLATION] === true;
}

function hoopoeProduced(value) {
	return Object.freeze({ tag: "produced", value });
}

const HOOPOE_CANCELLED_OUTCOME = Object.freeze({ tag: "cancelled" });

function hoopoeDefectedOutcome(defect) {
	return Object.freeze({ tag: "defected", defect });
}

function hoopoeCancellationDefect(defect) {
	if (!(defect instanceof AggregateError) || !hoopoeIsCancellation(defect.errors[0])) return defect;
	Object.defineProperty(defect, "cancellationContext", { value: true });
	return defect;
}

function hoopoeAppendChildDefects(primary, outcomes) {
	for (const outcome of outcomes) {
		if (outcome.tag !== "defected") continue;
		const defects =
			outcome.defect instanceof AggregateError && hoopoeIsCancellation(outcome.defect.errors[0])
				? outcome.defect.errors.slice(1)
				: [outcome.defect];
		for (const defect of defects) {
			if (
				primary === defect ||
				(primary instanceof AggregateError && primary.errors.includes(defect))
			) {
				continue;
			}
			primary = hoopoeCleanupDefect(primary, defect);
		}
	}
	return primary;
}

class HoopoeHandle {
	#execution;
	#observed = false;

	constructor(execution) {
		this.#execution = execution;
		Object.freeze(this);
	}

	get settled() {
		return this.#execution.settled;
	}

	get settlementSequence() {
		return this.#execution.settlementSequence;
	}

	get observed() {
		return this.#observed;
	}

	cancel() {
		this.#execution.cancel();
	}

	observe() {
		this.#observed = true;
		return this.#execution.outcome;
	}

	peek() {
		return this.#execution.outcome;
	}
}

class HoopoeTaskContext {
	#children = [];

	adopt(handle, ownerHandles = []) {
		this.#children.push(handle);
		void handle.peek().then((outcome) => {
			if (outcome.tag === "defected") this.cancelChildren(handle, ...ownerHandles);
		});
	}

	cancelChildren(...exceptions) {
		for (const child of this.#children) {
			if (!exceptions.includes(child) && !child.settled) child.cancel();
		}
	}

	async join() {
		const outcomes = await Promise.all(this.#children.map((child) => child.peek()));
		for (let index = 0; index < outcomes.length; index += 1) {
			if (outcomes[index].tag === "defected" && !this.#children[index].observed) {
				throw outcomes[index].defect;
			}
		}
	}
}

class HoopoeExecution {
	#recipe;
	#controller = new AbortController();
	#context;
	#children = [];
	#ownerHandles;
	#resolve;

	settled = false;
	settlementSequence = undefined;
	outcome = new Promise((resolve) => {
		this.#resolve = resolve;
	});

	constructor(recipe, context, owner) {
		this.#recipe = recipe;
		this.#context = context;
		this.#ownerHandles = Object.freeze(
			owner?.handle === undefined ? [] : [...(owner.ownerHandles ?? []), owner.handle],
		);
		this.handle = new HoopoeHandle(this);
	}

	get ownerHandles() {
		return this.#ownerHandles;
	}

	start() {
		if (hoopoeCurrentActivation === null) void this.#drive();
		else queueMicrotask(() => void this.#drive());
		return this.handle;
	}

	adoptCancellationChild(handle) {
		this.#children.push(handle);
	}

	cancelChildren() {
		for (const child of this.#children) {
			if (!child.settled) child.cancel();
		}
	}

	async joinChildren() {
		const children = this.#children;
		this.#children = [];
		return Promise.all(children.map((child) => child.observe()));
	}

	cancel() {
		if (this.settled || this.#controller.signal.aborted) return;
		this.#controller.abort();
		this.cancelChildren();
	}

	async #drive() {
		const frame = {
			signal: this.#controller.signal,
			context: this.#context,
			execution: this,
		};
		let outcome;
		try {
			let value = this.#recipe(frame);
			if (typeof value?.then === "function") value = await value;
			hoopoeCheckpointFrame(frame);
			outcome = hoopoeProduced(value);
		} catch (caught) {
			this.cancelChildren();
			const children = await this.joinChildren();
			const pending = hoopoeIsPendingActivationDefect(caught);
			const primary = hoopoeAppendChildDefects(pending ? caught.primary : caught, children);
			let failure = pending ? hoopoeFinalizeActivationDefect(caught, primary) : primary;
			failure = hoopoeCancellationDefect(failure);
			outcome = hoopoeIsCancellation(failure)
				? HOOPOE_CANCELLED_OUTCOME
				: hoopoeDefectedOutcome(failure);
		}
		this.settled = true;
		this.settlementSequence = hoopoeSettlementSequence++;
		this.#resolve(outcome);
	}
}

class HoopoeTask {
	#recipe;
	#defaultHandle;

	constructor(recipe) {
		this.#recipe = recipe;
		Object.freeze(this);
	}

	spawn(frame) {
		const context = frame?.context ?? new HoopoeTaskContext();
		const execution = new HoopoeExecution(this.#recipe, context, frame?.execution);
		const handle = execution.start();
		context.adopt(handle, execution.ownerHandles);
		frame?.execution?.adoptCancellationChild(handle);
		return handle;
	}

	async drive(frame) {
		this.#defaultHandle ??= this.spawn(frame);
		return hoopoeUnwrapOutcome(await this.#defaultHandle.observe());
	}
}

function hoopoeTask(recipe) {
	return new HoopoeTask(recipe);
}

function hoopoeCheckpointFrame(frame) {
	if (frame.signal.aborted) throw new HoopoeCancellation();
}

function hoopoeCurrentExecutionFrame() {
	const executionFrame = hoopoeCurrentActivation?.executionFrame;
	if (executionFrame === null || executionFrame === undefined) {
		throw new Error("task operation requires a running Hoopoe execution");
	}
	return executionFrame;
}

function hoopoeCurrentExecutionSignal() {
	return hoopoeCurrentExecutionFrame().signal;
}

function hoopoeCheckpoint() {
	hoopoeCheckpointFrame(hoopoeCurrentExecutionFrame());
}

function hoopoeAwaitCancellable(frame, value) {
	hoopoeCheckpointFrame(frame);
	return new Promise((resolve, reject) => {
		let settled = false;
		const abort = () => {
			if (settled) return;
			settled = true;
			reject(new HoopoeCancellation());
		};
		frame.signal.addEventListener("abort", abort, { once: true });
		Promise.resolve(value).then(
			(result) => {
				if (settled) return;
				settled = true;
				frame.signal.removeEventListener("abort", abort);
				try {
					hoopoeCheckpointFrame(frame);
					resolve(result);
				} catch (error) {
					reject(error);
				}
			},
			(error) => {
				if (settled) return;
				settled = true;
				frame.signal.removeEventListener("abort", abort);
				reject(frame.signal.aborted ? new HoopoeCancellation() : error);
			},
		);
	});
}

function hoopoeContinueTaskActivation(current, frame) {
	if (current?.kind !== "suspended") return current;
	const cancel = async (failure) => {
		frame.execution.cancelChildren();
		const children = await frame.execution.joinChildren();
		current.cancel(hoopoeAppendChildDefects(failure, children));
	};
	let waiting;
	try {
		waiting = hoopoeAwaitCancellable(frame, current.value);
	} catch (failure) {
		return cancel(failure);
	}
	return waiting.then(
		(value) => hoopoeContinueTaskActivation(current.resume(value), frame),
		cancel,
	);
}

function hoopoeRunTaskActivation(callable, frame, args = []) {
	return hoopoeContinueTaskActivation(hoopoeActivate(callable, undefined, args, -1, frame), frame);
}

async function hoopoeWithTaskContext(frame, body) {
	const context = new HoopoeTaskContext();
	const nested = { ...frame, context };
	let value;
	let failure;
	try {
		value = await body(nested);
	} catch (error) {
		failure = error;
		context.cancelChildren();
	}
	try {
		await context.join();
	} catch (error) {
		failure ??= error;
	}
	if (failure !== undefined) throw failure;
	return value;
}

function hoopoeTaskRecipe(callable, nestedContext) {
	return hoopoeTask((frame) => {
		const run = (executionFrame) => hoopoeRunTaskActivation(callable, executionFrame);
		return nestedContext ? hoopoeWithTaskContext(frame, run) : run(frame);
	});
}

function hoopoeTaskDrive(task) {
	return task.drive(hoopoeCurrentExecutionFrame());
}

function hoopoeTaskSpawn(task) {
	return task.spawn(hoopoeCurrentExecutionFrame());
}

function hoopoeHandleObserve(handle) {
	return handle.observe();
}

function hoopoeHandleCancel(handle) {
	handle.cancel();
}

function hoopoeUnwrapOutcome(outcome) {
	if (outcome.tag === "produced") return outcome.value;
	if (outcome.tag === "cancelled") throw new HoopoeCancellation();
	throw outcome.defect;
}

function hoopoeFirstSettlement(handles, frame) {
	if (handles.length === 0)
		return Promise.reject(new TypeError("cannot select an empty handle list"));
	const settled = handles.findIndex((handle) => handle.settled);
	if (settled !== -1) return Promise.resolve(settled);
	return hoopoeAwaitCancellable(
		frame,
		new Promise((resolve) => {
			let selected = false;
			for (const handle of handles) {
				void handle.peek().then(() => {
					if (selected) return;
					let winner;
					for (let index = 0; index < handles.length; index += 1) {
						if (!handles[index].settled) continue;
						if (
							winner === undefined ||
							handles[index].settlementSequence < handles[winner].settlementSequence
						) {
							winner = index;
						}
					}
					selected = true;
					resolve(winner);
				});
			}
		}),
	);
}

function hoopoeTaskSelect(handles) {
	return hoopoeTask(async (frame) => {
		const index = await hoopoeFirstSettlement(handles, frame);
		return Object.freeze({ index, result: await handles[index].observe() });
	});
}

function hoopoeTaskRace(tasks) {
	return hoopoeTask((frame) =>
		hoopoeWithTaskContext(frame, async (raceFrame) => {
			const handles = tasks.map((task) => task.spawn(raceFrame));
			const winner = await hoopoeFirstSettlement(handles, raceFrame);
			for (let index = 0; index < handles.length; index += 1) {
				if (index !== winner) handles[index].cancel();
			}
			const outcomes = await Promise.all(handles.map((handle) => handle.observe()));
			const loserDefects = outcomes.flatMap((outcome, index) =>
				index !== winner && outcome.tag === "defected" ? [outcome.defect] : [],
			);
			if (loserDefects.length === 1) throw loserDefects[0];
			if (loserDefects.length > 1) {
				throw new AggregateError(loserDefects, "Hoopoe race loser cleanup failed");
			}
			return outcomes[winner];
		}),
	);
}

function hoopoeStartRoot(main, taskRoot) {
	const context = new HoopoeTaskContext();
	const execution = new HoopoeExecution((frame) => {
		const value = main();
		return taskRoot ? value.drive(frame) : value;
	}, context);
	const handle = execution.start();
	context.adopt(handle);
	const outcome = (async () => {
		let result = await handle.observe();
		try {
			await context.join();
		} catch (defect) {
			result = hoopoeDefectedOutcome(defect);
		}
		return result;
	})();
	return Object.freeze({
		cancel() {
			handle.cancel();
			context.cancelChildren();
		},
		outcome,
	});
}

function hoopoeRenderDefect(defect) {
	try {
		let name = "Error";
		let message = "unknown defect";
		if (defect !== null && (typeof defect === "object" || typeof defect === "function")) {
			const ownName = Object.getOwnPropertyDescriptor(defect, "name")?.value;
			const ownMessage = Object.getOwnPropertyDescriptor(defect, "message")?.value;
			const prototype = Object.getPrototypeOf(defect);
			const inheritedName = Object.getOwnPropertyDescriptor(prototype, "name")?.value;
			if (typeof ownName === "string") name = ownName;
			else if (typeof inheritedName === "string") name = inheritedName;
			if (typeof ownMessage === "string" && ownMessage.length !== 0) message = ownMessage;
		} else if (["string", "number", "bigint", "boolean"].includes(typeof defect)) {
			name = "Error";
			message = String(defect);
		}
		return `error: program defected: ${name}: ${message}\n`;
	} catch {
		return "error: program defected\n";
	}
}

async function hoopoeRunTask(task) {
	return hoopoeUnwrapOutcome(await hoopoeStartRoot(() => task, true).outcome);
}
