import assert from "node:assert/strict";

const sleep = (milliseconds, value) =>
	new Promise((resolve) => setTimeout(() => resolve(value), milliseconds));

let starts = 0;
const reusable = hoopoeTask(() => ++starts);
assert.equal(starts, 0);
assert.deepEqual(await hoopoeStartRoot(() => 42, false).outcome, hoopoeProduced(42));
const launched = hoopoeStartRoot(() => reusable, true);
assert.deepEqual(await launched.outcome, hoopoeProduced(1));
assert.equal(starts, 1);
assert.equal(
	hoopoeRenderDefect(new Error("root failed")),
	"error: program defected: Error: root failed\n",
);
assert.equal(
	hoopoeRenderDefect(
		new Proxy(
			{},
			{
				getOwnPropertyDescriptor() {
					throw new Error("renderer");
				},
			},
		),
	),
	"error: program defected\n",
);
assert.deepEqual(
	await hoopoeRunTask(
		hoopoeTask(async (frame) => [await reusable.drive(frame), await reusable.drive(frame)]),
	),
	[1, 1],
);
assert.deepEqual(
	await hoopoeRunTask(
		hoopoeTask(async (frame) => {
			const first = reusable.spawn(frame);
			const second = reusable.spawn(frame);
			return [(await first.observe()).value, (await second.observe()).value];
		}),
	),
	[2, 3],
);

const applicationError = Object.freeze({ tag: "error", value: "expected" });
const nestedOutcome = await hoopoeRunTask(
	hoopoeTask(async (frame) => {
		const handle = hoopoeTask(() => applicationError).spawn(frame);
		const first = await handle.observe();
		const second = await handle.observe();
		assert.equal(first, second);
		return first;
	}),
);
assert.equal(nestedOutcome.tag, "produced");
assert.equal(nestedOutcome.value, applicationError);
assert(Object.isFrozen(nestedOutcome));

const contextStep = hoopoeCallable((frame) => hoopoeReturn(frame.context));
const inherited = hoopoeTaskRecipe(contextStep, false);
const nested = hoopoeTaskRecipe(contextStep, true);
await hoopoeRunTask(
	hoopoeTask(async (frame) => {
		assert.equal(await inherited.drive(frame), frame.context);
		assert.notEqual(await nested.drive(frame), frame.context);
	}),
);

const cancellationOrder = [];
let cancelledResume = 0;
const childStep = hoopoeCallable((frame) => {
	if (frame.resumeState !== 0) {
		cancelledResume += 1;
		return hoopoeReturn("suppressed");
	}
	hoopoeRegisterCleanup(() => cancellationOrder.push("child"));
	return hoopoeSuspend(new Promise(() => {}), 1, 0);
});
const childTask = hoopoeTaskRecipe(childStep, false);
const parentStep = hoopoeCallable((frame) => {
	if (frame.resumeState !== 0) {
		cancelledResume += 1;
		return hoopoeReturn("suppressed");
	}
	hoopoeRegisterCleanup(() => cancellationOrder.push("parent"));
	hoopoeTaskSpawn(childTask);
	return hoopoeSuspend(new Promise(() => {}), 1, 0);
});
const parentTask = hoopoeTaskRecipe(parentStep, false);
const cancelledRoot = hoopoeStartRoot(() => parentTask, true);
cancelledRoot.cancel();
assert.equal((await cancelledRoot.outcome).tag, "cancelled");
cancellationOrder.length = 0;
const cancelledOutcome = await hoopoeRunTask(
	hoopoeTask(async (frame) => {
		const handle = parentTask.spawn(frame);
		handle.cancel();
		return handle.observe();
	}),
);
assert.equal(cancelledOutcome.tag, "cancelled");
assert.deepEqual(cancellationOrder, ["child", "parent"]);
assert.equal(cancelledResume, 0);

const cleanupCounts = { child: 0, parent: 0 };
const defectiveChild = hoopoeTaskRecipe(
	hoopoeCallable(() => {
		hoopoeRegisterCleanup(() => {
			cleanupCounts.child += 1;
			throw new Error("child cleanup defect");
		});
		return hoopoeSuspend(new Promise(() => {}), 1, 0);
	}),
	false,
);
const defectiveParent = hoopoeTaskRecipe(
	hoopoeCallable(() => {
		hoopoeRegisterCleanup(() => {
			cleanupCounts.parent += 1;
			throw new Error("parent cleanup defect");
		});
		hoopoeTaskSpawn(defectiveChild);
		return hoopoeSuspend(new Promise(() => {}), 1, 0);
	}),
	false,
);
const defectiveRoot = hoopoeStartRoot(() => defectiveParent, true);
defectiveRoot.cancel();
const defectiveRootOutcome = await defectiveRoot.outcome;
assert.equal(defectiveRootOutcome.tag, "defected");
assert.equal(defectiveRootOutcome.defect.cancellationContext, true);
assert.deepEqual(cleanupCounts, { child: 1, parent: 1 });
cleanupCounts.child = 0;
cleanupCounts.parent = 0;
const cleanupOutcome = await hoopoeRunTask(
	hoopoeTask(async (frame) => {
		const handle = defectiveParent.spawn(frame);
		handle.cancel();
		return handle.observe();
	}),
);
assert.equal(cleanupOutcome.tag, "defected");
assert.equal(cleanupOutcome.defect.cancellationContext, true);
assert.deepEqual(
	cleanupOutcome.defect.errors.map((error) => error.message),
	["execution cancelled", "child cleanup defect", "parent cleanup defect"],
);
assert.deepEqual(cleanupCounts, { child: 1, parent: 1 });

const checkpointStep = hoopoeCallable((frame) => {
	if (frame.resumeState === 0) return hoopoeSuspend(() => hoopoeCheckpoint(), 1, 0);
	return hoopoeReturn("checkpoint resumed");
});
const checkpointTask = hoopoeTaskRecipe(checkpointStep, false);
const checkpointOutcome = await hoopoeRunTask(
	hoopoeTask(async (frame) => {
		const handle = checkpointTask.spawn(frame);
		handle.cancel();
		return handle.observe();
	}),
);
assert.equal(checkpointOutcome.tag, "cancelled");

const noCheckpointStep = hoopoeCallable(() => {
	let total = 0;
	for (let index = 0; index < 10000; index += 1) total += index;
	return hoopoeReturn(total);
});
const noCheckpointHandle = hoopoeTaskRecipe(noCheckpointStep, false).spawn();
noCheckpointHandle.cancel();
assert.equal((await noCheckpointHandle.observe()).tag, "produced");

const suppressedCancellation = hoopoeTask(async (frame) => {
	try {
		await hoopoeAwaitCancellable(frame, new Promise(() => {}));
	} catch {
		return "suppressed";
	}
});
const suppressedHandle = suppressedCancellation.spawn();
suppressedHandle.cancel();
assert.equal((await suppressedHandle.observe()).tag, "cancelled");

await hoopoeRunTask(
	hoopoeTask(async (frame) => {
		const earlier = hoopoeTask(() => "earlier").spawn(frame);
		const later = hoopoeTask(() => "later").spawn(frame);
		await Promise.all([earlier.peek(), later.peek()]);
		const handles = [later, earlier];
		const selection = await hoopoeTaskSelect(handles).drive(frame);
		assert.equal(selection.index, 0);
		assert.equal(selection.result.value, "later");
		assert.equal(earlier.observed, false);

		const slow = hoopoeTask(async () => sleep(20, "slow")).spawn(frame);
		const fast = hoopoeTask(async () => sleep(1, "fast")).spawn(frame);
		const first = await hoopoeTaskSelect([slow, fast]).drive(frame);
		assert.equal(first.index, 1);
		assert.equal(slow.observed, false);
		slow.cancel();
		await slow.observe();
	}),
);

const raceOrder = [];
const winner = hoopoeTaskRecipe(
	hoopoeCallable(() => hoopoeReturn("winner")),
	false,
);
const losingStep = hoopoeCallable((frame) => {
	if (frame.resumeState === 0) {
		hoopoeRegisterCleanup(() => raceOrder.push("loser cleanup"));
		return hoopoeSuspend(new Promise(() => {}), 1, 0);
	}
	return hoopoeReturn("loser");
});
const raceResult = await hoopoeRunTask(
	hoopoeTaskRace([winner, hoopoeTaskRecipe(losingStep, false)]),
);
assert.deepEqual(raceResult, hoopoeProduced("winner"));
assert.deepEqual(raceOrder, ["loser cleanup"]);

const defectiveLoserStep = hoopoeCallable((frame) => {
	if (frame.resumeState === 0) {
		hoopoeRegisterCleanup(() => {
			throw new Error("loser cleanup defect");
		});
		return hoopoeSuspend(new Promise(() => {}), 1, 0);
	}
	return hoopoeReturn("loser");
});
await assert.rejects(
	() => hoopoeRunTask(hoopoeTaskRace([winner, hoopoeTaskRecipe(defectiveLoserStep, false)])),
	(error) =>
		error instanceof AggregateError &&
		error.cancellationContext === true &&
		error.errors[1].message === "loser cleanup defect",
);

const siblingOrder = [];
const siblingStep = hoopoeCallable((frame) => {
	if (frame.resumeState === 0) {
		hoopoeRegisterCleanup(() => siblingOrder.push("sibling cleanup"));
		return hoopoeSuspend(new Promise(() => {}), 1, 0);
	}
	return hoopoeReturn(undefined);
});
await assert.rejects(
	() =>
		hoopoeRunTask(
			hoopoeTask((frame) =>
				hoopoeWithTaskContext(frame, (nestedFrame) => {
					hoopoeTask(() => {
						throw new Error("child defect");
					}).spawn(nestedFrame);
					hoopoeTaskRecipe(siblingStep, false).spawn(nestedFrame);
				}),
			),
		),
	/child defect/,
);
assert.deepEqual(siblingOrder, ["sibling cleanup"]);

const observedDefect = await hoopoeRunTask(
	hoopoeTask(async (frame) => {
		const handle = hoopoeTask(() => {
			throw new Error("isolated");
		}).spawn(frame);
		return handle.observe();
	}),
);
assert.equal(observedDefect.tag, "defected");
assert.equal(observedDefect.defect.message, "isolated");

const cycleCount = 10000;
const beforeSlots = hoopoeNextFrameSlot;
const cycleStep = hoopoeCallable((frame) => {
	const remaining = frame.liveLocals[0];
	if (remaining === 0 && frame.resumeState === 0) return hoopoeReturn("done");
	if (frame.resumeState === 0) return hoopoeSuspend(Promise.resolve(), 1, 1);
	return hoopoeTailCall(cycleStep, undefined, [remaining - 1], -1);
});
assert.equal(
	await hoopoeRunTask(
		hoopoeTask((frame) => hoopoeRunTaskActivation(cycleStep, frame, [cycleCount])),
	),
	"done",
);
assert.equal(hoopoeNextFrameSlot - beforeSlots, 1);

console.log("structured task runtime assertions passed");
