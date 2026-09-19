const HOOPOE_PUSH = Symbol("hoopoe.push");
const HOOPOE_TAIL = Symbol("hoopoe.tail");
const HOOPOE_RETURN = Symbol("hoopoe.return");
const HOOPOE_SUSPEND = Symbol("hoopoe.suspend");
const HOOPOE_DEFECT = Symbol("hoopoe.defect");
const HOOPOE_RESUME = Symbol("hoopoe.resume");
const HOOPOE_FRAME = Symbol("hoopoe.frame");
const HOOPOE_CALLABLE = Symbol("hoopoe.callable");
const HOOPOE_NO_DEFECT = Symbol("hoopoe.no-defect");
const HOOPOE_PENDING_DEFECT = Symbol("hoopoe.pending-defect");
let hoopoeCurrentActivation = null;
let hoopoeNextFrameSlot = 0;

function hoopoePush(callable, receiver, args, source, resumeState, resultSlot) {
	return { kind: HOOPOE_PUSH, callable, receiver, args, source, resumeState, resultSlot };
}

function hoopoeTailCall(callable, receiver, args, source) {
	return { kind: HOOPOE_TAIL, callable, receiver, args, source };
}

function hoopoeReturn(value) {
	return { kind: HOOPOE_RETURN, value };
}

function hoopoeSuspend(effect, resumeState, resultSlot) {
	return { kind: HOOPOE_SUSPEND, effect, resumeState, resultSlot };
}

function hoopoeDefect(defect) {
	return { kind: HOOPOE_DEFECT, defect };
}

function hoopoeResume(value, resumeState, resultSlot) {
	return { kind: HOOPOE_RESUME, value, resumeState, resultSlot };
}

function hoopoeTailCallMember(receiver, member, args, source) {
	return hoopoeTailCall(receiver[member], receiver, args, source);
}

function hoopoeCallable(step) {
	function callable(...args) {
		if (args.length === 1 && args[0]?.[HOOPOE_FRAME] === true) return step.call(this, args[0]);
		return hoopoeActivate(callable, this, args, -1);
	}
	return hoopoeMarkCallable(callable);
}

function hoopoeCaptureFrame(liveLocals) {
	return { liveLocals };
}

function hoopoeMarkCallable(callable) {
	Object.defineProperty(callable, HOOPOE_CALLABLE, { value: true });
	return callable;
}

function hoopoeRenderTasks(frame, initialMode) {
	if (frame.resumeState === 0) {
		frame.liveLocals[1] = [{ value: frame.liveLocals[0], mode: initialMode }];
		frame.liveLocals[2] = [];
		frame.resumeState = 2;
	}
	if (frame.resumeState === 1) {
		frame.liveLocals[2].push(frame.liveLocals[3].v);
		frame.resumeState = 2;
	}
	for (;;) {
		const task = frame.liveLocals[1].pop();
		if (task === undefined) return hoopoeReturn(new NString(frame.liveLocals[2].join("")));
		if (typeof task === "string") {
			frame.liveLocals[2].push(task);
			continue;
		}
		const { value, mode } = task;
		const member = mode === "display" ? "$hoopoe$display" : "$hoopoe$debug";
		const callable = value?.[member];
		if (callable?.[HOOPOE_CALLABLE] === true) {
			return hoopoePush(callable, value, [], -1, 1, 3);
		}
		if (typeof callable === "function") {
			frame.liveLocals[2].push(callable.call(value).v);
			continue;
		}
		const tag = hoopoeTagName(value);
		if (mode === "display" && (tag === "hoopoe.char" || tag === "hoopoe.string")) {
			frame.liveLocals[2].push(value.v);
			continue;
		}
		if (mode === "display" && ["string", "number", "bigint", "boolean"].includes(typeof value)) {
			frame.liveLocals[2].push(String(value));
			continue;
		}
		if (value === undefined) {
			frame.liveLocals[2].push("void");
		} else if (typeof value === "string") {
			frame.liveLocals[2].push(JSON.stringify(value));
		} else if (["number", "bigint", "boolean"].includes(typeof value)) {
			frame.liveLocals[2].push(String(value));
		} else if (tag === "hoopoe.int" || tag === "hoopoe.uint" || tag === "hoopoe.bool") {
			frame.liveLocals[2].push(String(value.v));
		} else if (tag === "hoopoe.float") {
			frame.liveLocals[2].push(Number.isInteger(value.v) ? value.v.toFixed(1) : String(value.v));
		} else if (tag === "hoopoe.char") {
			frame.liveLocals[2].push(
				`'${JSON.stringify(String(value.v)).slice(1, -1).replaceAll("'", "\\'")}'`,
			);
		} else if (tag === "hoopoe.string") {
			frame.liveLocals[2].push(JSON.stringify(value.v));
		} else {
			let entries;
			let open;
			let close;
			if (tag === "hoopoe.list" || tag === "hoopoe.tuple") {
				entries = Array.from(value.v);
				open = tag === "hoopoe.list" ? "#[" : "#(";
				close = tag === "hoopoe.list" ? "]" : ")";
			} else if (tag === "hoopoe.map") {
				entries = Array.from(value).flatMap(([key, item]) => [key, ": ", item]);
				open = "#{";
				close = "}";
			} else {
				const name = (tag ?? value?.constructor?.name ?? "Object").split("$").at(-1);
				const fields = value == null ? [] : Object.keys(value);
				entries = fields.flatMap((field) => [`${field}: `, value[field]]);
				open = fields.length === 0 ? name : `${name}(`;
				close = fields.length === 0 ? "" : ")";
			}
			frame.liveLocals[1].push(close);
			for (let index = entries.length - 1; index >= 0; index -= 1) {
				const entry = entries[index];
				frame.liveLocals[1].push(
					typeof entry === "string" && (entry === ": " || entry.endsWith(": "))
						? entry
						: { value: entry, mode: "debug" },
				);
				if (index > 0 && typeof entries[index - 1] !== "string") frame.liveLocals[1].push(", ");
			}
			frame.liveLocals[1].push(open);
		}
	}
}

const hoopoeProtocolDisplayStep = hoopoeCallable((frame) => hoopoeRenderTasks(frame, "display"));

function hoopoeOutputStep(frame, newline) {
	if (frame.resumeState === 0) {
		return hoopoePush(hoopoeProtocolDisplayStep, undefined, [frame.liveLocals[0]], -1, 1, 1);
	}
	if (newline) console.log(frame.liveLocals[1].v);
	else process.stdout.write(frame.liveLocals[1].v);
	return hoopoeReturn(undefined);
}

const hoopoePrintStep = hoopoeCallable((frame) => hoopoeOutputStep(frame, false));
const hoopoePrintlnStep = hoopoeCallable((frame) => hoopoeOutputStep(frame, true));

function hoopoeMethodStep(receiver, member, args, step) {
	if (args.length === 1 && args[0]?.[HOOPOE_FRAME] === true) return step.call(receiver, args[0]);
	return hoopoeActivate(receiver[member], receiver, Array.from(args), -1);
}

function hoopoeRegisterCleanup(cleanup) {
	const frame = hoopoeCurrentActivation?.frames.at(-1);
	if (frame === undefined) throw new Error("cleanup registration requires a Hoopoe activation");
	frame.cleanupScopes.at(-1).push(cleanup);
	return cleanup;
}

function hoopoeCommitStateTransition(headerDepth, replacements) {
	const frame = hoopoeCurrentActivation?.frames.at(-1);
	if (frame === undefined || frame.cleanupScopes.length <= headerDepth) {
		throw new Error("state transition requires a replacement cleanup scope");
	}
	const acquired = frame.cleanupScopes.pop();
	let primary = hoopoeUnwindScopes(frame, headerDepth);
	const header = frame.cleanupScopes.at(-1);
	const slots = [];
	for (let index = 0; index < replacements.length; index += 2) {
		const slot = header.indexOf(replacements[index]);
		if (slot < 0) throw new Error("state cleanup is not active");
		slots.push(slot);
	}
	for (let index = replacements.length - 2; index >= 0; index -= 2) {
		const oldCleanup = replacements[index];
		try {
			hoopoeRunCleanup(oldCleanup);
		} catch (cleanup) {
			primary = hoopoeCleanupDefect(primary, cleanup);
		}
	}
	if (primary !== HOOPOE_NO_DEFECT) {
		for (const slot of slots.sort((left, right) => right - left)) header.splice(slot, 1);
		for (let index = acquired.length - 1; index >= 0; index -= 1) {
			try {
				hoopoeRunCleanup(acquired[index]);
			} catch (cleanup) {
				primary = hoopoeCleanupDefect(primary, cleanup);
			}
		}
		throw primary;
	}
	for (let index = 0; index < replacements.length; index += 2) {
		const newCleanup = replacements[index + 1];
		header[slots[index / 2]] = newCleanup;
	}
}

function hoopoeRunCleanup(cleanup) {
	const owner = hoopoeCurrentActivation;
	hoopoeCurrentActivation = null;
	try {
		const result = cleanup();
		if (result?.kind === "suspended") {
			throw new Error("Close.close must complete synchronously");
		}
		return result;
	} finally {
		hoopoeCurrentActivation = owner;
	}
}

function hoopoeEnterCleanupScope() {
	const frame = hoopoeCurrentActivation?.frames.at(-1);
	if (frame === undefined) throw new Error("cleanup scope entry requires a Hoopoe activation");
	frame.cleanupScopes.push([]);
}

function hoopoeCleanupDefect(primary, cleanup) {
	if (primary === HOOPOE_NO_DEFECT) return cleanup;
	const defects = primary instanceof AggregateError ? [...primary.errors] : [primary];
	defects.push(cleanup);
	return new AggregateError(defects, "Hoopoe activation cleanup failed");
}

function hoopoeUnwindScopes(frame, targetDepth, primary = HOOPOE_NO_DEFECT) {
	while (frame.cleanupScopes.length > targetDepth) {
		const cleanups = frame.cleanupScopes.pop();
		for (let index = cleanups.length - 1; index >= 0; index -= 1) {
			try {
				hoopoeRunCleanup(cleanups[index]);
			} catch (cleanup) {
				primary = hoopoeCleanupDefect(primary, cleanup);
			}
		}
	}
	return primary;
}

function hoopoeUnwindCleanupScopes(targetDepth) {
	const frame = hoopoeCurrentActivation?.frames.at(-1);
	if (frame === undefined) throw new Error("cleanup unwind requires a Hoopoe activation");
	const defect = hoopoeUnwindScopes(frame, targetDepth);
	if (defect !== HOOPOE_NO_DEFECT) throw defect;
}

function hoopoeLeaveCleanupScope() {
	const frame = hoopoeCurrentActivation?.frames.at(-1);
	if (frame === undefined || frame.cleanupScopes.length === 1) {
		throw new Error("cleanup scope exit requires a nested Hoopoe cleanup scope");
	}
	const defect = hoopoeUnwindScopes(frame, frame.cleanupScopes.length - 1);
	if (defect !== HOOPOE_NO_DEFECT) throw defect;
}

function hoopoeFrame(
	callable,
	receiver,
	args,
	source,
	resultSlot = null,
	slot = hoopoeNextFrameSlot++,
	executionFrame = null,
) {
	return {
		[HOOPOE_FRAME]: true,
		callable,
		receiver,
		resumeState: 0,
		liveLocals: [...args],
		cleanupScopes: [[]],
		frameSlot: slot,
		resultSlot,
		source,
		context: executionFrame?.context ?? null,
		cancellation: executionFrame?.execution ?? null,
		signal: executionFrame?.signal ?? null,
	};
}

function hoopoeUnwindActivation(activation, primary) {
	while (activation.frames.length !== 0) {
		primary = hoopoeUnwindScopes(activation.frames.pop(), 0, primary);
	}
	return primary;
}

function hoopoeThrowActivationDefect(activation, primary) {
	if (activation.executionFrame !== null) {
		throw { [HOOPOE_PENDING_DEFECT]: true, activation, primary };
	}
	throw hoopoeUnwindActivation(activation, primary);
}

function hoopoeIsPendingActivationDefect(value) {
	return value?.[HOOPOE_PENDING_DEFECT] === true;
}

function hoopoeFinalizeActivationDefect(pending, primary = pending.primary) {
	return hoopoeUnwindActivation(pending.activation, primary);
}

function hoopoeSuspension(activation, packet, value) {
	let retained = activation;
	return Object.freeze({
		kind: "suspended",
		value,
		resume(result = value) {
			if (retained === null) throw new Error("Hoopoe suspension is already settled");
			const current = retained.frames.at(-1);
			current.liveLocals[packet.resultSlot] = result;
			const resumed = retained;
			retained = null;
			return hoopoeResumeActivation(resumed);
		},
		cancel(reason = new Error("Hoopoe activation cancelled")) {
			if (retained === null) throw new Error("Hoopoe suspension is already settled");
			const cancelled = retained;
			retained = null;
			throw hoopoeUnwindActivation(cancelled, reason);
		},
	});
}

function hoopoeDrive(activation) {
	for (;;) {
		const frame = activation.frames.at(-1);
		let outcome;
		try {
			outcome = frame.callable.apply(frame.receiver, [frame]);
		} catch (defect) {
			outcome = hoopoeDefect(defect);
		}
		if (outcome === null || typeof outcome !== "object") {
			outcome = hoopoeDefect(new Error("generated Hoopoe state returned a non-terminal value"));
		}
		switch (outcome.kind) {
			case HOOPOE_PUSH:
				frame.resumeState = outcome.resumeState;
				if (outcome.callable?.[HOOPOE_CALLABLE] === true) {
					activation.frames.push(
						hoopoeFrame(
							outcome.callable,
							outcome.receiver,
							outcome.args,
							outcome.source,
							outcome.resultSlot,
							undefined,
							activation.executionFrame,
						),
					);
				} else {
					try {
						frame.liveLocals[outcome.resultSlot] = outcome.callable.apply(
							outcome.receiver,
							outcome.args,
						);
					} catch (defect) {
						hoopoeThrowActivationDefect(activation, defect);
					}
				}
				break;
			case HOOPOE_TAIL: {
				activation.frames.pop();
				const defect = hoopoeUnwindScopes(frame, 0);
				if (defect !== HOOPOE_NO_DEFECT) hoopoeThrowActivationDefect(activation, defect);
				if (outcome.callable?.[HOOPOE_CALLABLE] === true) {
					activation.frames.push(
						hoopoeFrame(
							outcome.callable,
							outcome.receiver,
							outcome.args,
							outcome.source,
							frame.resultSlot,
							frame.frameSlot,
							activation.executionFrame,
						),
					);
				} else {
					let value;
					try {
						value = outcome.callable.apply(outcome.receiver, outcome.args);
					} catch (externalDefect) {
						hoopoeThrowActivationDefect(activation, externalDefect);
					}
					if (activation.frames.length === 0) return value;
					activation.frames.at(-1).liveLocals[frame.resultSlot] = value;
				}
				break;
			}
			case HOOPOE_RETURN: {
				activation.frames.pop();
				const defect = hoopoeUnwindScopes(frame, 0);
				if (defect !== HOOPOE_NO_DEFECT) hoopoeThrowActivationDefect(activation, defect);
				if (activation.frames.length === 0) return outcome.value;
				activation.frames.at(-1).liveLocals[frame.resultSlot] = outcome.value;
				break;
			}
			case HOOPOE_RESUME:
				frame.liveLocals[outcome.resultSlot] = outcome.value;
				frame.resumeState = outcome.resumeState;
				break;
			case HOOPOE_SUSPEND: {
				frame.resumeState = outcome.resumeState;
				let value;
				try {
					value = typeof outcome.effect === "function" ? outcome.effect() : outcome.effect;
				} catch (defect) {
					hoopoeThrowActivationDefect(activation, defect);
				}
				return hoopoeSuspension(activation, outcome, value);
			}
			case HOOPOE_DEFECT:
				hoopoeThrowActivationDefect(activation, outcome.defect);
				break;
			default:
				hoopoeThrowActivationDefect(activation, new Error("unknown Hoopoe activation terminal"));
		}
	}
}

function hoopoeResumeActivation(activation) {
	if (hoopoeCurrentActivation !== null)
		throw new Error("cannot resume a Hoopoe activation reentrantly");
	hoopoeCurrentActivation = activation;
	let result;
	try {
		result = hoopoeDrive(activation);
	} catch (defect) {
		hoopoeCurrentActivation = null;
		throw defect;
	}
	hoopoeCurrentActivation = null;
	return result;
}

function hoopoeActivate(callable, receiver, args, source, executionFrame = null) {
	if (hoopoeCurrentActivation !== null) {
		throw new Error("generated Hoopoe calls must be pushed by the activation driver");
	}
	return hoopoeResumeActivation({
		frames: [hoopoeFrame(callable, receiver, args, source, null, undefined, executionFrame)],
		executionFrame,
	});
}
