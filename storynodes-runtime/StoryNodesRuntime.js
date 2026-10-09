import { evaluateBooleanExpression, evaluateExpression, replaceRuntimeTokens } from "./expression.js";

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const asInteger = (value, label) => {
	const number = Number(value);
	if (!Number.isInteger(number)) throw new TypeError(`${label} must be an integer.`);
	return number;
};

export class StoryNodesRuntimeError extends Error {
	constructor(message, code = "RUNTIME_ERROR", details = null) {
		super(message);
		this.name = "StoryNodesRuntimeError";
		this.code = code;
		this.details = details;
	}
}

/**
 * Browser ES module runtime for StoryNodes Remake exports.
 * The imported `commands` object is supplied at construction time; command
 * node keys are looked up directly on that object.
 */
export class StoryNodesRuntime {
	constructor({ commands = {}, random = Math.random, calendarAlignment = null } = {}) {
		this.commands = commands?.commands || commands || {};
		this.random = typeof random === "function" ? random : Math.random;
		this.calendarAlignment = typeof calendarAlignment === "function" ? calendarAlignment : null;
		this.project = null;
		this.localizations = new Map();
		this.languages = [];
		this.languageId = null;
		this.currentLocationKey = null;
		this.renamedText = {};
		this.rngValues = {};
		this.calendarDates = {};
		this.calendarEpochDates = {};
		this.presentationEpochs = {};
		this.conversation = null;
		this.history = [];
		this.historyIndex = -1;
		this.lastResult = null;
	}

	loadProject(source) {
		const input = typeof source === "string" ? JSON.parse(source) : source;
		const project = input?.format === "storynodes-runtime" ? input.project : input;
		if (!project || typeof project !== "object" || !project.nodes || !project.text) {
			throw new StoryNodesRuntimeError("The data does not contain a Remake runtime project.", "INVALID_PROJECT");
		}
		if (input?.format === "storynodes-runtime" && Number(input.formatVersion) !== 1) {
			throw new StoryNodesRuntimeError(`Unsupported runtime package version: ${input.formatVersion}.`, "UNSUPPORTED_VERSION");
		}
		this.project = clone(project);
		this.localizations = new Map();
		this.languages = [];
		this.languageId = null;
		this.currentLocationKey = null;
		this.renamedText = {};
		this.rngValues = {};
		this.conversation = null;
		this.history = [];
		this.historyIndex = -1;
		this.lastResult = null;
		this.calendarDates = {};
		this.calendarEpochDates = {};
		this.presentationEpochs = {};
		for (const calendarKey of Object.keys(this.project.calendars || {})) {
			const date = this._readCalendarDate(calendarKey);
			this.calendarDates[calendarKey] = date;
			this.calendarEpochDates[calendarKey] = clone(date);
			const presentation = this.project.cycles?.[this.project.calendars[calendarKey].presentationcycle];
			this.presentationEpochs[calendarKey] = Number(presentation?.cyclesProxyStat?.value ?? 0);
		}
		return this;
	}

	async loadLocalizationIndex(indexData, loadFile) {
		this._requireProject();
		const index = typeof indexData === "string" ? JSON.parse(indexData) : indexData;
		if (!Array.isArray(index?.languages)) throw new StoryNodesRuntimeError("Localization index must contain a languages array.", "INVALID_LOCALIZATION_INDEX");
		const loaded = new Map();
		for (const language of index.languages) {
			if (!language?.file) continue;
			let data;
			if (typeof loadFile === "function") data = await loadFile(language.file, language);
			else if (loadFile && typeof loadFile === "object") data = loadFile[language.file];
			else throw new TypeError("loadLocalizationIndex requires a file loader or a map of localization files.");
			if (typeof data === "string") data = JSON.parse(data);
			if (!data) throw new StoryNodesRuntimeError(`Localization file '${language.file}' was not provided.`, "MISSING_LOCALIZATION", { file: language.file });
			const id = data.id ?? language.id;
			loaded.set(id, { id, name: data.name ?? language.name ?? String(id), lines: data.lines || {} });
		}
		this.localizations = loaded;
		this.languages = index.languages.map(language => ({ id: language.id, name: language.name, file: language.file }));
		if (this.languageId == null && this.languages.length) this.languageId = this.languages[0].id;
		return this.getLanguages();
	}

	getLanguages() { return clone(this.languages); }
	setLanguage(languageId) {
		if (!this.languages.some(language => language.id === languageId)) throw new StoryNodesRuntimeError(`Unknown language '${languageId}'.`, "UNKNOWN_LANGUAGE");
		this.languageId = languageId;
		return languageId;
	}
	getLanguage() { return this.languageId; }
	getProject() { this._requireProject(); return clone(this.project); }

	getNode(key) { this._requireProject(); return clone(this.project.nodes?.[key] ?? null); }
	getNodes(type = null) {
		this._requireProject();
		const keys = type ? (this.project.nodeTypes?.[type] || Object.keys(this.project.nodes).filter(key => this.project.nodes[key]?.type === type)) : Object.keys(this.project.nodes);
		return keys.filter(key => this.project.nodes[key]).map(key => ({ key, node: clone(this.project.nodes[key]) }));
	}
	getAllLocations() { this._requireProject(); return Object.entries(this.project.locations || {}).map(([key, location]) => ({ key, location: clone(location) })); }
	getAllCharacters() { this._requireProject(); return Object.entries(this.project.characters || {}).map(([key, character]) => ({ key, name: this.getText(key), character: clone(character) })); }
	getLocation(key) { this._requireProject(); return clone(this.project.locations?.[key] ?? null); }
	getCharacter(key) {
		this._requireProject();
		const character = this.project.characters?.[key];
		return character ? { key, name: this.getText(key), character: clone(character) } : null;
	}
	getStat(key) { this._requireProject(); return clone(this.project.stats?.[key] ?? null); }
	getCurrentLocationKey() { return this.currentLocationKey; }
	getCurrentNodeKey() { return this.conversation?.currentNodeKey ?? null; }
	getCurrentLineIndex() { return this.conversation?.currentLineIndex ?? null; }
	getConversationParticipants() { return clone(this.conversation?.participants || []); }
	getRenameHeader(nodeKey) {
		this._requireProject();
		const node = this.project.nodes?.[nodeKey];
		if (node?.type !== "rename") return "";
		const source = String(node.header || "");
		const translated = this.localizations.get(this.languageId)?.lines?.[`node:${nodeKey}:header`];
		return this.resolveText(typeof translated === "string" && translated.trim() ? translated : source);
	}
	getConversationState() {
		if (!this.conversation) return null;
		return {
			active: this.conversation.active,
			entryNodeKey: this.conversation.entryNodeKey,
			currentNodeKey: this.conversation.currentNodeKey,
			currentLineIndex: this.conversation.currentLineIndex,
			participants: clone(this.conversation.participants),
			waitingForRename: this.conversation.waitingForRename,
			result: clone(this.lastResult)
		};
	}

	getText(key, context = {}) {
		this._requireProject();
		const source = own(this.renamedText, key) ? this.renamedText[key] : this.project.text?.[key]?.value;
		if (source === undefined || source === null) return String(key ?? "");
		const translated = this.localizations.get(this.languageId)?.lines?.[key];
		const text = own(this.renamedText, key) ? source : (typeof translated === "string" && translated.trim() ? translated : source);
		return this.resolveText(text, context);
	}
	resolveText(text, context = {}) {
		this._requireProject();
		return replaceRuntimeTokens(text, token => this._resolveToken(token, context));
	}

	getCurrentDate(calendarKey = this.project?.startdate?.calendar) {
		this._requireProject();
		if (!calendarKey || !this.project.calendars?.[calendarKey]) return null;
		return { calendarKey, values: clone(this.calendarDates[calendarKey] || this._readCalendarDate(calendarKey)) };
	}
	setDate(date, calendarKey = this.project?.startdate?.calendar) {
		this._requireProject();
		if (!this.project.calendars?.[calendarKey]) throw new StoryNodesRuntimeError(`Unknown calendar '${calendarKey}'.`, "UNKNOWN_CALENDAR");
		const previous = this.calendarDates[calendarKey] || this._readCalendarDate(calendarKey);
		const next = this._normalizeDate(date, calendarKey);
		const delta = this._dateToOrdinal(calendarKey, next) - this._dateToOrdinal(calendarKey, previous);
		this._writeCalendarDate(calendarKey, next);
		this.calendarDates[calendarKey] = next;
		for (const otherKey of Object.keys(this.project.calendars || {})) {
			if (otherKey === calendarKey) continue;
			this._shiftCalendar(otherKey, delta, calendarKey, next);
		}
		return this.getCurrentDate(calendarKey);
	}
	advanceDate(units = 1, calendarKey = this.project?.startdate?.calendar) {
		this._requireProject();
		units = asInteger(units, "units");
		if (units < 0) throw new RangeError("advanceDate only accepts non-negative base-unit counts.");
		for (const key of Object.keys(this.project.calendars || {})) this._shiftCalendar(key, units, calendarKey, this.calendarDates[calendarKey]);
		return this.getCurrentDate(calendarKey);
	}
	advanceTime(steps = 1) {
		this._requireProject();
		steps = asInteger(steps, "steps");
		if (steps < 0) throw new RangeError("advanceTime only accepts non-negative time-segment counts.");
		const segmentCount = Math.max(1, (this.project.timeSegments || []).length);
		const timeKey = this.project.time;
		const timeStat = this.project.stats?.[timeKey];
		if (!timeStat) throw new StoryNodesRuntimeError("The project time stat is missing.", "MISSING_TIME_STAT");
		const absolute = Math.max(0, Number(timeStat.value) || 0) + steps;
		const days = Math.floor(absolute / segmentCount);
		timeStat.value = absolute % segmentCount;
		if (days) this.advanceDate(days);
		return { date: this.getCurrentDate(), time: timeStat.value, segment: clone(this.project.timeSegments?.[timeStat.value] ?? null) };
	}
	getCurrentTime() {
		this._requireProject();
		const value = Number(this.project.stats?.[this.project.time]?.value ?? 0);
		const key = this.project.timeSegments?.[value] ?? null;
		return { index: value, key, label: key ? this.getText(key) : null };
	}

	navigateToLocation(locationKey) {
		this._requireProject();
		if (!this.project.locations?.[locationKey]) throw new StoryNodesRuntimeError(`Unknown location '${locationKey}'.`, "UNKNOWN_LOCATION");
		if (this.currentLocationKey !== null && !this.getLocations().some(option => option.key === locationKey)) {
			throw new StoryNodesRuntimeError(`Location '${locationKey}' is not a currently available connected destination.`, "LOCATION_NOT_REACHABLE");
		}
		this.currentLocationKey = locationKey;
		return this.getLocation(locationKey);
	}
	getLocations() {
		this._requireProject();
		if (!this.currentLocationKey) return [];
		const neighbours = new Set();
		const current = this.project.locations[this.currentLocationKey];
		for (const link of current?.connections || []) if (this.project.locations?.[link.target]) neighbours.add(link.target);
		for (const [key, location] of Object.entries(this.project.locations || {})) {
			if ((location.connections || []).some(link => link.target === this.currentLocationKey)) neighbours.add(key);
		}
		return [...neighbours].filter(key => this._resolvePresence(this.project.locations[key], this.project.locations[key]?.scheduleBindings, this.project.locations[key]?.proxyStats)).map(key => ({ key, location: clone(this.project.locations[key]), name: this.getText(this.project.locations[key]?.nameKey || key) }));
	}
	getActivities(locationKey = this.currentLocationKey) {
		this._requireProject();
		const location = this.project.locations?.[locationKey];
		if (!location) return [];
		return (location.activities || []).map(item => typeof item === "string" ? { key: item, scheduleBindings: [], proxyStats: {} } : item).filter(item => item?.key && this.project.activities?.[item.key] && this._resolvePresence(location, item.scheduleBindings, item.proxyStats)).map(item => ({ key: item.key, activity: clone(this.project.activities[item.key]), locationActivity: clone(item), name: this.getText(item.key) }));
	}
	getCharacters(locationKey = this.currentLocationKey) {
		this._requireProject();
		if (!locationKey || !this.project.locations?.[locationKey]) return [];
		const result = [];
		for (const [key, character] of Object.entries(this.project.characters || {})) {
			const bindings = ["regular", "autoDialogue", "autoAction"].flatMap(category => (character.scheduleBindings?.[category] || []).map((binding, index) => ({ ...binding, _category: category, _order: index })));
			const selected = this._resolveCharacterBinding(character, bindings, locationKey);
			if (!selected?.present) continue;
			result.push({ key, name: this.getText(key), character: clone(character), activityKey: selected.link?.activity ?? null, dialogueKey: selected.link?.dialogue ?? null, bindingCategory: selected.binding._category });
		}
		return result;
	}

	getValue(target) {
		this._requireProject();
		const resolved = this._resolveTarget(target);
		if (!resolved) return undefined;
		return Number(resolved.owner[resolved.key]?.value ?? resolved.owner[resolved.key]);
	}
	setValue(target, value) {
		this._requireProject();
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) throw new TypeError("Runtime values must be finite numbers.");
		const resolved = this._resolveTarget(target);
		if (!resolved) throw new StoryNodesRuntimeError("The requested value target could not be resolved.", "UNKNOWN_VALUE_TARGET", { target });
		if (resolved.owner[resolved.key] && typeof resolved.owner[resolved.key] === "object") resolved.owner[resolved.key].value = numeric;
		else resolved.owner[resolved.key] = numeric;
		return numeric;
	}
	adjustValue(target, operation, amount) {
		const current = this.getValue(target);
		if (!Number.isFinite(current)) throw new StoryNodesRuntimeError("The requested value target does not contain a number.", "NON_NUMERIC_VALUE", { target });
		const change = Number(amount);
		if (!Number.isFinite(change)) throw new TypeError("Adjustment amount must be a finite number.");
		const next = operation === "set" ? change : operation === "subtract" ? current - change : current + change;
		return this.setValue(target, next);
	}
	setName(target, value) {
		this._requireProject();
		const key = typeof target === "string" ? target : target?.type === "participantName" ? this._participantCharacterKey(target.participantIndex) : target?.key;
		if (!key) throw new StoryNodesRuntimeError("Rename target could not be resolved.", "UNKNOWN_RENAME_TARGET", { target });
		this.renamedText[key] = String(value ?? "");
		if (this.conversation) this.conversation.waitingForRename = false;
		return this.renamedText[key];
	}
	getVariation(characterKey, categoryId) { return this.project?.characters?.[characterKey]?.variations?.[categoryId] ?? null; }
	setVariation(characterKey, categoryId, optionId) {
		const character = this.project?.characters?.[characterKey];
		if (!character) throw new StoryNodesRuntimeError(`Unknown character '${characterKey}'.`, "UNKNOWN_CHARACTER");
		character.variations ||= {};
		if (optionId == null || optionId === "") delete character.variations[categoryId];
		else character.variations[categoryId] = optionId;
		return character.variations[categoryId] ?? null;
	}

	beginConversation(startNodeKey, participantCharacterKeys = []) {
		this._requireProject();
		const node = this.project.nodes?.[startNodeKey];
		if (!node) throw new StoryNodesRuntimeError(`Unknown conversation entry node '${startNodeKey}'.`, "UNKNOWN_NODE");
		const definitions = node.type === "start" ? (node.participants || []) : [];
		if (!Array.isArray(participantCharacterKeys) || participantCharacterKeys.length !== definitions.length) {
			throw new StoryNodesRuntimeError(`Expected ${definitions.length} participant character keys for this entry node.`, "INVALID_PARTICIPANTS");
		}
		const requestedParticipants = [...participantCharacterKeys];
		const participants = requestedParticipants.map((characterKey, index) => {
			const definition = definitions[index] || {};
			if (characterKey == null) {
				if (definition.type !== "random") throw new StoryNodesRuntimeError(`Participant ${index} cannot be null unless it is a random joiner.`, "INVALID_RANDOM_JOINER", { index });
				const assigned = requestedParticipants.filter(Boolean);
				const available = this.getCharacters().map(entry => entry.key).filter(key => !assigned.includes(key));
				if (!available.length) throw new StoryNodesRuntimeError(`No locally available character can fill random participant ${index}.`, "NO_RANDOM_JOINER", { index, locationKey: this.currentLocationKey });
				const chosen = available[Math.min(available.length - 1, Math.floor(this.random() * available.length))];
				requestedParticipants[index] = chosen;
				return chosen;
			}
			if (!this.project.characters?.[characterKey]) throw new StoryNodesRuntimeError(`Unknown participant character '${characterKey}'.`, "UNKNOWN_CHARACTER", { index, characterKey });
			if (definition.type === "specific" && definition.characterKey && definition.characterKey !== characterKey) throw new StoryNodesRuntimeError(`Participant ${index} must use its configured specific character.`, "PARTICIPANT_MISMATCH", { index, expected: definition.characterKey, actual: characterKey });
			return characterKey;
		});
		this.conversation = {
			active: true,
			entryNodeKey: startNodeKey,
			currentNodeKey: startNodeKey,
			currentLineIndex: null,
			nextLineIndex: 0,
			participantDefinitions: clone(definitions),
			participants,
			waitingForRename: false,
			processedNodeKey: null,
			referenceStack: [],
			phase: "ready"
		};
		this.lastResult = null;
		this.history = [];
		this.historyIndex = -1;
		this._recordHistory({ kind: "begin" });
		return this.progressConversation();
	}

	async progressConversation() {
		this._requireConversation();
		if (this.historyIndex >= 0 && this.historyIndex < this.history.length - 1) {
			this.historyIndex++;
			this._restoreSnapshot(this.history[this.historyIndex].state);
			return clone(this.lastResult);
		}
		if (this.lastResult?.type === "outputs" || this.conversation.waitingForRename) return clone(this.lastResult);
		if (this.lastResult?.type === "line") {
			this.conversation.nextLineIndex = (this.conversation.currentLineIndex ?? -1) + 1;
			this.conversation.currentLineIndex = null;
		}
		const result = await this._runUntilPresentable();
		this.lastResult = result;
		this._recordHistory({ kind: "progress" });
		return clone(result);
	}
	async chooseOutput(nodeKey) {
		this._requireConversation();
		if (this.lastResult?.type !== "outputs" || !this.lastResult.nodeKeys.includes(nodeKey)) throw new StoryNodesRuntimeError(`Node '${nodeKey}' is not an available output.`, "INVALID_OUTPUT_CHOICE", { nodeKey, available: this.lastResult?.nodeKeys || [] });
		const future = this.history[this.historyIndex + 1];
		if (future?.action?.kind === "choice" && future.action.nodeKey === nodeKey) {
			this.historyIndex++;
			this._restoreSnapshot(future.state);
			return clone(this.lastResult);
		}
		this.history.splice(this.historyIndex + 1);
		this.conversation.currentNodeKey = nodeKey;
		this.conversation.currentLineIndex = null;
		this.conversation.nextLineIndex = 0;
		this.conversation.processedNodeKey = null;
		this.conversation.waitingForRename = false;
		this.lastResult = null;
		const result = await this._runUntilPresentable();
		this.lastResult = result;
		this._recordHistory({ kind: "choice", nodeKey });
		return clone(result);
	}
	backtrackConversation(steps = 1) {
		steps = asInteger(steps, "steps");
		if (steps < 0) throw new RangeError("steps must be non-negative.");
		if (this.historyIndex < 0) return null;
		this.historyIndex = Math.max(0, this.historyIndex - steps);
		this._restoreSnapshot(this.history[this.historyIndex].state);
		return clone(this.lastResult);
	}
	moveForwardConversation(steps = 1) {
		steps = asInteger(steps, "steps");
		if (steps < 0) throw new RangeError("steps must be non-negative.");
		if (this.historyIndex < 0) return null;
		this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + steps);
		this._restoreSnapshot(this.history[this.historyIndex].state);
		return clone(this.lastResult);
	}
	getConversationHistory() {
		return { index: this.historyIndex, length: this.history.length, canBacktrack: this.historyIndex > 0, canMoveForward: this.historyIndex >= 0 && this.historyIndex < this.history.length - 1, entries: this.history.map((entry, index) => ({ index, result: clone(entry.state.lastResult), action: clone(entry.action) })) };
	}
	getAvailableChoices() { return this.lastResult?.type === "outputs" ? clone(this.lastResult.nodeKeys) : []; }
	getCurrentResult() { return clone(this.lastResult); }

	createSaveData() {
		this._requireProject();
		return {
			format: "storynodes-save",
			formatVersion: 1,
			projectId: this.project.id,
			state: this._captureMutableState(),
			conversation: this.conversation ? {
				active: this.conversation.active,
				entryNodeKey: this.conversation.entryNodeKey,
				currentNodeKey: this.conversation.currentNodeKey,
				currentLineIndex: this.conversation.currentLineIndex,
				nextLineIndex: this.conversation.nextLineIndex,
				participantDefinitions: clone(this.conversation.participantDefinitions),
				participants: clone(this.conversation.participants),
				waitingForRename: this.conversation.waitingForRename,
				processedNodeKey: this.conversation.processedNodeKey,
				referenceStack: clone(this.conversation.referenceStack),
				phase: this.conversation.phase
			} : null,
			currentResult: clone(this.lastResult)
		};
	}
	serializeSaveData() { return JSON.stringify(this.createSaveData()); }
	loadSaveData(saveData) {
		this._requireProject();
		const data = typeof saveData === "string" ? JSON.parse(saveData) : saveData;
		if (data?.format !== "storynodes-save" || Number(data.formatVersion) !== 1) throw new StoryNodesRuntimeError("Unsupported or malformed StoryNodes save data.", "INVALID_SAVE");
		if (data.projectId !== this.project.id) throw new StoryNodesRuntimeError("Save data belongs to a different project.", "SAVE_PROJECT_MISMATCH");
		this._restoreMutableState(data.state);
		this.conversation = clone(data.conversation);
		this.lastResult = clone(data.currentResult);
		this.history = [];
		this.historyIndex = -1;
		return this.getConversationState();
	}

	validateProject() {
		const issues = [];
		if (!this.project) return [{ severity: "error", code: "NO_PROJECT", message: "No project is loaded." }];
		for (const [nodeKey, node] of Object.entries(this.project.nodes || {})) {
			for (const output of node.outputs || []) {
				const target = typeof output === "string" ? output : output?.target;
				if (target && !this.project.nodes?.[target]) issues.push({ severity: "warning", code: "MISSING_OUTPUT_TARGET", nodeKey, target });
			}
			if (node.type === "reference") {
				const target = node.reference?.node || node.reference?.tree;
				if (target && !this.project.nodes?.[target]) issues.push({ severity: "warning", code: "MISSING_REFERENCE_TARGET", nodeKey, target });
			}
		}
		return issues;
	}

	// Value target forms match Remake adjust-node targets.
	_resolveTarget(target) {
		if (typeof target === "string") {
			if (this.project.stats?.[target]) return { owner: this.project.stats, key: target };
			for (const character of Object.values(this.project.characters || {})) if (character.proxyStats?.[target]) return { owner: character.proxyStats, key: target };
			for (const location of Object.values(this.project.locations || {})) {
				if (location.proxyStats?.[target]) return { owner: location.proxyStats, key: target };
				for (const activity of location.activities || []) if (activity?.proxyStats?.[target]) return { owner: activity.proxyStats, key: target };
			}
			return null;
		}
		if (!target) return null;
		switch (target.type) {
			case "global": return this.project.stats?.[target.statKey] ? { owner: this.project.stats, key: target.statKey } : null;
			case "participant": {
				const key = this.conversation?.participants?.[target.participantIndex];
				const proxy = this.project.characters?.[key]?.proxyStats;
				return proxy?.[target.statKey] ? { owner: proxy, key: target.statKey } : null;
			}
			case "relationship": {
				const source = this.conversation?.participants?.[target.participantIndex];
				const other = this.conversation?.participants?.[target.targetParticipantIndex];
				const relation = this.project.characters?.[source]?.relationships?.[other];
				return relation?.[target.statKey] ? { owner: relation, key: target.statKey } : null;
			}
			case "schedulePriority": {
				const characterKey = this.conversation?.participants?.[target.participantIndex];
				const proxy = this.project.characters?.[characterKey]?.proxyStats;
				if (proxy?.[target.priorityKey]) return { owner: proxy, key: target.priorityKey };
				for (const location of Object.values(this.project.locations || {})) {
					if (location.proxyStats?.[target.priorityKey]) return { owner: location.proxyStats, key: target.priorityKey };
					for (const activity of location.activities || []) if (activity?.proxyStats?.[target.priorityKey]) return { owner: activity.proxyStats, key: target.priorityKey };
				}
				return null;
			}
			default: return null;
		}
	}
	_resolveToken(token, context) {
		const [a, b, c] = token.parts;
		switch (token.type) {
			case "name": return this.getText(a, context);
			case "value": {
				if (this.project.stats?.[a]) return this.project.stats[a].value;
				if (this.project.rngs?.[a]) return this._rollRng(a);
			for (const [calendarKey, calendar] of Object.entries(this.project.calendars || {})) {
				if (calendar.maincycleProxyStat?.key === a) return context.date && context.calendarKey === calendarKey ? context.date[1] : calendar.maincycleProxyStat.value;
			}
			for (const cycle of Object.values(this.project.cycles || {})) {
				if (cycle.cyclesProxyStat?.key !== a) continue;
				if (context.date && context.calendarKey && this.project.calendars?.[context.calendarKey]) {
					const coordinate = cycle.cycles?.length ? context.date[Number(cycle.level) + 1] : context.date[0];
					if (coordinate !== undefined) return coordinate;
				}
				return cycle.cyclesProxyStat.value;
			}
				const target = this._resolveTarget(a);
				if (target) return target.owner[target.key]?.value ?? target.owner[target.key];
				return undefined;
			}
			case "pname": {
				const participantIndex = Number(a);
				if (!Number.isInteger(participantIndex) || participantIndex < 0) return undefined;
				const characterKey = this.conversation?.participants?.[participantIndex];
				if (!characterKey || !this.project.characters?.[characterKey]) return undefined;
				if (b !== undefined) {
					if (!Array.isArray(this.project.nameCategories) || !this.project.nameCategories.includes(b)) return undefined;
					const alternateNameKey = this.project.characters[characterKey].names?.[b];
					if (alternateNameKey) {
						const alternateName = this.getText(alternateNameKey, context);
						if (alternateName.trim()) return alternateName;
					}
				}
				return this.getText(characterKey, context);
			}
			case "pstat": {
				const participantIndex = Number(a), characterKey = this.conversation?.participants?.[participantIndex];
				const stat = this.project.characters?.[characterKey]?.proxyStats?.[b];
				return stat?.value;
			}
			case "rstat": {
				const sourceKey = this.conversation?.participants?.[Number(a)];
				const targetKey = this.conversation?.participants?.[Number(b)];
				return this.project.characters?.[sourceKey]?.relationships?.[targetKey]?.[c]?.value;
			}
			default: return undefined;
		}
	}
	_rollRng(key) {
		if (!own(this.rngValues, key)) {
			const rng = this.project.rngs[key];
			const min = Math.ceil(Math.min(Number(rng.min), Number(rng.max)));
			const max = Math.floor(Math.max(Number(rng.min), Number(rng.max)));
			this.rngValues[key] = Math.floor(this.random() * (max - min + 1)) + min;
		}
		return this.rngValues[key];
	}
	_resolvePresence(owner, bindings = [], proxyStats = {}) {
		const ordered = (bindings || []).map((binding, index) => ({ binding, index, priority: Number(proxyStats?.[binding.priority]?.value ?? 0) })).sort((a, b) => b.priority - a.priority || a.index - b.index);
		for (const { binding } of ordered) {
			const schedule = this.project.schedules?.[binding.schedule];
			if (!schedule) continue;
			const date = this.calendarDates[schedule.calendar] || this._readCalendarDate(schedule.calendar);
			const day = this._getScheduleDay(schedule, date);
			const timeframe = this._getTimeframe(day, Number(this.project.stats?.[this.project.time]?.value ?? 0));
			if (!timeframe) continue;
			if (Number(timeframe.presence) === 1) return true;
			if (Number(timeframe.presence) === 2) return false;
		}
		return false;
	}
	_resolveCharacterBinding(character, bindings, locationKey) {
		const ordered = bindings.map((binding, index) => ({ binding, index, priority: Number(character.proxyStats?.[binding.priority]?.value ?? 0) })).sort((a, b) => b.priority - a.priority || a.index - b.index);
		for (const { binding } of ordered) {
			const schedule = this.project.schedules?.[binding.schedule];
			if (!schedule) continue;
			const date = this.calendarDates[schedule.calendar] || this._readCalendarDate(schedule.calendar);
			const frame = this._getTimeframe(this._getScheduleDay(schedule, date), Number(this.project.stats?.[this.project.time]?.value ?? 0));
			if (!frame || Number(frame.presence) === 0) continue;
			if (Number(frame.presence) === 2) return { present: false, binding, link: null };
			const link = binding.timeframeLinks?.[frame.key] || null;
			return { present: link?.location === locationKey, binding, link };
		}
		return null;
	}
	_getTimeframe(day, segment) {
		if (!day || !Array.isArray(day.timeframes)) return null;
		let start = 0;
		for (const frame of day.timeframes) {
			const end = Number(frame.end);
			if (segment >= start && segment < end) return frame;
			start = end;
		}
		return null;
	}
	_getScheduleDay(schedule, date) {
		if (!schedule || !date) return null;
		if (Number(schedule.type) === 0) return this._traverseDate(schedule.onetimedays, date, 1);
		const level = Number(schedule.level);
		if (level === 0) {
			const interval = Math.max(1, Number(schedule.interval) || 1);
			const start = this._normalizeDate(schedule.start || {}, schedule.calendar);
			const offset = this._dateToOrdinal(schedule.calendar, date) - this._dateToOrdinal(schedule.calendar, start) + 1;
			return schedule.customdays?.[((offset % interval) + interval) % interval] ?? null;
		}
		if (level === -1) {
			const calendar = this.project.calendars?.[schedule.calendar];
			const presentation = this.project.cycles?.[calendar?.presentationcycle];
			const length = presentation?.cycles?.length || Number(presentation?.cycleLength) || 0;
			if (!length) return null;
			const initial = Number(this.presentationEpochs[schedule.calendar] ?? presentation.cyclesProxyStat?.value ?? 0);
			const epoch = this.calendarEpochDates[schedule.calendar] || this._readCalendarDate(schedule.calendar);
			const elapsed = this._dateToOrdinal(schedule.calendar, date) - this._dateToOrdinal(schedule.calendar, epoch);
			const index = ((initial + elapsed + 1) % length + length) % length;
			return schedule.presdays?.[index] ?? null;
		}
		return this._traverseDate(schedule[level], date, level);
	}
	_traverseDate(container, date, level) {
		let current = container;
		let depth = Number(level);
		while (date[depth] !== undefined && date[depth] !== null) {
			if (!current || typeof current !== "object") return null;
			current = current[date[depth]];
			depth++;
		}
		if (!current || typeof current !== "object") return null;
		return current[date[0]] || null;
	}
	_dateToOrdinal(calendarKey, date) {
		const calendar = this.project.calendars?.[calendarKey];
		const root = this.project.cycles?.[calendar?.maincycle];
		if (!calendar || !root) return 0;
		const year = Math.max(0, Number(date[1]) || 0);
		let ordinal = 0;
		for (let y = 0; y < year; y++) ordinal += this._cycleTotal(calendarKey, root, { ...date, 1: y });
		let cycle = root;
		let level = 2;
		while (cycle?.cycles?.length) {
			const index = Math.max(0, Number(date[level]) || 0);
			for (let i = 0; i < index && i < cycle.cycles.length; i++) ordinal += this._cycleTotal(calendarKey, this.project.cycles[cycle.cycles[i]], { ...date, [level]: i, 1: year });
			cycle = this.project.cycles[cycle.cycles[Math.min(index, cycle.cycles.length - 1)]];
			level++;
		}
		return ordinal + Math.max(0, Number(date[0]) || 0);
	}
	_cycleTotal(calendarKey, cycle, date) {
		if (!cycle) return 0;
		if (!cycle.cycles?.length) return this._cycleLength(calendarKey, cycle, date);
		return cycle.cycles.reduce((sum, key, index) => sum + this._cycleTotal(calendarKey, this.project.cycles[key], { ...date, [Number(cycle.level) + 1]: index }), 0);
	}
	_cycleLength(calendarKey, cycle, date) {
		let length = Number(cycle.cycleLength) || 0;
		for (const override of cycle.override || []) {
			if (evaluateBooleanExpression(this.resolveText(override.condition || "", { date, calendarKey }))) { length = Number(override.value) || 0; break; }
		}
		return Math.max(0, length);
	}
	_normalizeDate(date, calendarKey) {
		const source = Array.isArray(date) ? date : Array.isArray(date?.values) ? date.values : date || {};
		const result = [];
		if (Array.isArray(source)) return source.map(value => value == null ? null : Number(value));
		for (const [key, value] of Object.entries(source)) if (Number.isInteger(Number(key))) result[Number(key)] = value == null ? null : Number(value);
		const fallback = this.calendarDates[calendarKey] || this._readCalendarDate(calendarKey);
		for (let i = 0; i < fallback.length; i++) if (result[i] == null) result[i] = fallback[i];
		return result;
	}
	_readCalendarDate(calendarKey) {
		const calendar = this.project.calendars?.[calendarKey];
		if (!calendar) return [];
		const values = [];
		values[1] = Number(calendar.maincycleProxyStat?.value ?? 0);
		let cycle = this.project.cycles?.[calendar.maincycle];
		let guard = 0;
		while (cycle && guard++ < 64) {
			const current = Number(cycle.cyclesProxyStat?.value ?? 0);
			if (!cycle.cycles?.length) { values[0] = current; break; }
			const childIndex = Math.max(0, Math.min(cycle.cycles.length - 1, current));
			values[Number(cycle.level) + 1] = childIndex;
			cycle = this.project.cycles?.[cycle.cycles[childIndex]];
		}
		return values;
	}
	_writeCalendarDate(calendarKey, date) {
		const calendar = this.project.calendars?.[calendarKey];
		if (!calendar) return;
		calendar.maincycleProxyStat.value = Number(date[1] ?? 0);
		let cycle = this.project.cycles?.[calendar.maincycle];
		let guard = 0;
		while (cycle && guard++ < 64) {
			if (!cycle.cycles?.length) { cycle.cyclesProxyStat.value = Number(date[0] ?? 0); break; }
			const level = Number(cycle.level) + 1;
			const index = Math.max(0, Math.min(cycle.cycles.length - 1, Number(date[level] ?? 0)));
			cycle.cyclesProxyStat.value = index;
			cycle = this.project.cycles?.[cycle.cycles[index]];
		}
	}
	_shiftCalendar(calendarKey, units, sourceCalendarKey, sourceDate) {
		if (!this.project.calendars?.[calendarKey] || !units) return;
		let date;
		if (this.calendarAlignment) {
			date = this.calendarAlignment({ runtime: this, calendarKey, sourceCalendarKey, sourceDate: clone(sourceDate), currentDate: clone(this.calendarDates[calendarKey]), baseUnits: units });
		} else {
			date = clone(this.calendarDates[calendarKey] || this._readCalendarDate(calendarKey));
			if (units > 0) this._incrementCalendarDate(calendarKey, date, units);
			else this._decrementCalendarDate(calendarKey, date, -units);
		}
		if (!Array.isArray(date)) throw new StoryNodesRuntimeError("calendarAlignment must return a date coordinate array.", "INVALID_CALENDAR_ALIGNMENT");
		this._writeCalendarDate(calendarKey, date);
		this.calendarDates[calendarKey] = date;
		this._updatePresentationCycle(calendarKey, units);
	}
	_incrementCalendarDate(calendarKey, date, units) {
		const calendar = this.project.calendars[calendarKey];
		for (let unit = 0; unit < units; unit++) {
			let cycle = this.project.cycles?.[calendar.maincycle];
			const path = [];
			let guard = 0;
			while (cycle && guard++ < 64) {
				path.push(cycle);
				if (!cycle.cycles?.length) break;
				const level = Number(cycle.level) + 1;
				const index = Math.max(0, Math.min(cycle.cycles.length - 1, Number(date[level] ?? 0)));
				date[level] = index;
				cycle = this.project.cycles?.[cycle.cycles[index]];
			}
			if (!cycle) throw new StoryNodesRuntimeError(`Calendar '${calendarKey}' contains an invalid cycle tree.`, "INVALID_CALENDAR");
			const dayLength = this._cycleLength(calendarKey, cycle, date);
			const nextDay = Number(date[0] ?? 0) + 1;
			if (nextDay < dayLength) { date[0] = nextDay; continue; }
			date[0] = 0;
			let carried = true;
			for (let p = path.length - 2; p >= 0 && carried; p--) {
				const parent = path[p];
				const level = Number(parent.level) + 1;
				const selected = Number(date[level] ?? 0);
				if (selected + 1 < parent.cycles.length) {
					date[level] = selected + 1;
					this._resetDateBelow(calendarKey, parent.cycles[selected + 1], date);
					carried = false;
				} else {
					date[level] = 0;
				}
			}
			if (carried) date[1] = Number(date[1] ?? 0) + 1;
		}
	}
	_decrementCalendarDate(calendarKey, date, units) {
		const calendar = this.project.calendars[calendarKey];
		for (let unit = 0; unit < units; unit++) {
			if (Number(date[0] ?? 0) > 0) { date[0] = Number(date[0]) - 1; continue; }
			let cycle = this.project.cycles?.[calendar.maincycle];
			const path = [];
			let guard = 0;
			while (cycle && guard++ < 64) {
				path.push(cycle);
				if (!cycle.cycles?.length) break;
				const level = Number(cycle.level) + 1;
				const index = Math.max(0, Math.min(cycle.cycles.length - 1, Number(date[level] ?? 0)));
				cycle = this.project.cycles?.[cycle.cycles[index]];
			}
			if (!cycle) throw new StoryNodesRuntimeError(`Calendar '${calendarKey}' contains an invalid cycle tree.`, "INVALID_CALENDAR");
			let borrow = true;
			for (let p = path.length - 2; p >= 0 && borrow; p--) {
				const parent = path[p];
				const level = Number(parent.level) + 1;
				const selected = Number(date[level] ?? 0);
				if (selected > 0) {
					date[level] = selected - 1;
					this._setDateToLastDay(calendarKey, parent.cycles[selected - 1], date);
					borrow = false;
				} else date[level] = parent.cycles.length - 1;
			}
			if (borrow) {
				if (Number(date[1] ?? 0) <= 0) { date[0] = 0; date[1] = 0; continue; }
				date[1] = Number(date[1]) - 1;
				this._setDateToLastDay(calendarKey, calendar.maincycle, date);
			}
		}
	}
	_setDateToLastDay(calendarKey, cycleKey, date) {
		let cycle = this.project.cycles?.[cycleKey], guard = 0;
		while (cycle && guard++ < 64) {
			if (!cycle.cycles?.length) { date[0] = Math.max(0, this._cycleLength(calendarKey, cycle, date) - 1); return; }
			const level = Number(cycle.level) + 1;
			const index = cycle.cycles.length - 1;
			date[level] = index;
			cycle = this.project.cycles?.[cycle.cycles[index]];
		}
	}
	_resetDateBelow(calendarKey, cycleKey, date) {
		let cycle = this.project.cycles?.[cycleKey], guard = 0;
		while (cycle && guard++ < 64) {
			if (!cycle.cycles?.length) { date[0] = 0; return; }
			const level = Number(cycle.level) + 1;
			date[level] = 0;
			cycle = this.project.cycles?.[cycle.cycles[0]];
		}
	}
	_updatePresentationCycle(calendarKey, units) {
		const calendar = this.project.calendars?.[calendarKey];
		const cycle = this.project.cycles?.[calendar?.presentationcycle];
		if (!cycle) return;
		const length = cycle.cycles?.length || Number(cycle.cycleLength) || 0;
		if (!length) return;
		const current = Number(cycle.cyclesProxyStat?.value ?? 0);
		cycle.cyclesProxyStat.value = ((current + units) % length + length) % length;
	}

	async _runUntilPresentable() {
		let guard = 0;
		while (guard++ < 10000) {
			const key = this.conversation.currentNodeKey;
			const node = this.project.nodes?.[key];
			if (!node) throw new StoryNodesRuntimeError(`Conversation reached missing node '${key}'.`, "MISSING_NODE", { key });
			if (node.type === "dialogue") {
				const lines = node.lines || [];
				const lineIndex = this.conversation.nextLineIndex;
				if (lineIndex < lines.length) {
					this.conversation.currentLineIndex = lineIndex;
					this.conversation.nextLineIndex = lineIndex + 1;
					this.conversation.phase = "line";
					return { type: "line", nodeKey: key, lineIndex, line: clone(lines[lineIndex]) };
				}
				this.conversation.currentLineIndex = null;
				return this._outputsFor(node, key);
			}
			if (node.type === "reference") {
				const target = node.reference?.node || node.reference?.tree;
				if (!target || !this.project.nodes?.[target]) throw new StoryNodesRuntimeError(`Reference node '${key}' has no valid target.`, "INVALID_REFERENCE", { key, target });
				this.conversation.referenceStack.push(key);
				this.conversation.currentNodeKey = target;
				this.conversation.nextLineIndex = 0;
				this.conversation.currentLineIndex = null;
				continue;
			}
			if (this.conversation.processedNodeKey !== key) {
				this.conversation.processedNodeKey = key;
				if (node.type === "adjust") this._executeAdjust(node);
				else if (node.type === "charvar") this._executeCharacterVariation(node);
				else if (node.type === "rename") {
					if (node.userControlled) {
						this.conversation.waitingForRename = true;
						this.conversation.phase = "rename";
						return this._outputsFor(node, key);
					}
					this._applyRename(node, this.resolveText(node.replacement || ""));
				}
				else if (node.type === "command") await this._executeCommand(node, key);
			}
			return this._outputsFor(node, key);
		}
		throw new StoryNodesRuntimeError("Conversation exceeded the node traversal safety limit; check for an automatic-node loop.", "NODE_LOOP");
	}
	_outputsFor(node, sourceKey) {
		const nodeKeys = [];
		for (const output of node.outputs || []) {
			const target = typeof output === "string" ? output : output?.target;
			if (!target || !this.project.nodes?.[target]) continue;
			const edgeCondition = typeof output === "string" ? "" : output?.condition || "";
			if (edgeCondition && !evaluateBooleanExpression(this.resolveText(edgeCondition))) continue;
			const targetNode = this.project.nodes[target];
			if (targetNode.type !== "start" && targetNode.showCondition && !evaluateBooleanExpression(this.resolveText(targetNode.showCondition))) continue;
			nodeKeys.push(target);
		}
		this.conversation.phase = "outputs";
		this.conversation.processedNodeKey = sourceKey;
		return { type: "outputs", sourceNodeKey: sourceKey, nodeKeys };
	}
	_executeAdjust(node) {
		let amount;
		try { amount = evaluateExpression(this.resolveText(node.expression || "0"), "number"); }
		catch { return; }
		const target = node.target;
		try { this.adjustValue(target, node.operation || "add", amount); } catch { /* malformed authored targets do not mutate runtime state */ }
	}
	_executeCharacterVariation(node) {
		const target = node.target || {};
		const characterKey = target.type === "character" ? target.characterKey : this.conversation.participants?.[target.participantIndex];
		const character = this.project.characters?.[characterKey];
		if (!character) return;
		character.variations ||= {};
		for (const [category, option] of Object.entries(node.variations || {})) if (option != null && option !== "") character.variations[category] = option;
	}
	_applyRename(node, value) {
		const target = node.target || {};
		const key = target.type === "participantName" ? this._participantCharacterKey(target.participantIndex) : target.key;
		if (key) this.renamedText[key] = String(value);
	}
	async _executeCommand(node, nodeKey) {
		const handler = this.commands?.[node.command];
		if (typeof handler !== "function") throw new StoryNodesRuntimeError(`No command function named '${node.command}' was imported.`, "MISSING_COMMAND", { nodeKey, command: node.command });
		await handler({ runtime: this, node: clone(node), nodeKey, participants: clone(this.conversation.participants), locationKey: this.currentLocationKey });
		this._resetHistoryAtCommandBarrier();
	}
	_participantCharacterKey(index) { return this.conversation?.participants?.[index] ?? null; }
	_evaluateCondition(expression) { return !expression || evaluateBooleanExpression(this.resolveText(expression)); }

	_recordHistory(action = null) {
		if (this.historyIndex < this.history.length - 1) this.history.splice(this.historyIndex + 1);
		this.history.push({ action: clone(action), state: this._captureMutableState(), result: clone(this.lastResult) });
		this.historyIndex = this.history.length - 1;
	}
	_resetHistoryAtCommandBarrier() {
		this.history = [{ action: { kind: "command-barrier" }, state: this._captureMutableState(), result: clone(this.lastResult) }];
		this.historyIndex = 0;
	}
	_captureMutableState() {
		const stats = Object.fromEntries(Object.entries(this.project?.stats || {}).map(([key, entry]) => [key, entry?.value]));
		const characters = {};
		for (const [key, character] of Object.entries(this.project?.characters || {})) {
			characters[key] = {
				proxyStats: Object.fromEntries(Object.entries(character.proxyStats || {}).map(([id, value]) => [id, clone(value)])),
				relationships: clone(character.relationships || {}),
				variations: clone(character.variations || {})
			};
		}
		const locations = {};
		for (const [key, location] of Object.entries(this.project?.locations || {})) locations[key] = { proxyStats: clone(location.proxyStats || {}), activities: (location.activities || []).map(item => ({ key: typeof item === "string" ? item : item?.key, proxyStats: clone(item?.proxyStats || {}) })) };
		return {
			stats, characters, locations,
			calendarDates: clone(this.calendarDates),
			cycleValues: Object.fromEntries(Object.entries(this.project?.cycles || {}).map(([key, cycle]) => [key, cycle.cyclesProxyStat?.value])),
			calendarValues: Object.fromEntries(Object.entries(this.project?.calendars || {}).map(([key, calendar]) => [key, calendar.maincycleProxyStat?.value])),
			renamedText: clone(this.renamedText), rngValues: clone(this.rngValues), currentLocationKey: this.currentLocationKey,
			conversation: clone(this.conversation), lastResult: clone(this.lastResult)
		};
	}
	_restoreMutableState(state) {
		if (!state) return;
		for (const [key, value] of Object.entries(state.stats || {})) if (this.project.stats?.[key]) this.project.stats[key].value = value;
		for (const [key, saved] of Object.entries(state.characters || {})) {
			const character = this.project.characters?.[key]; if (!character) continue;
			for (const [statKey, value] of Object.entries(saved.proxyStats || {})) if (character.proxyStats?.[statKey]) character.proxyStats[statKey] = clone(value);
			character.relationships = clone(saved.relationships || character.relationships);
			character.variations = clone(saved.variations || character.variations);
		}
		for (const [key, saved] of Object.entries(state.locations || {})) {
			const location = this.project.locations?.[key]; if (!location) continue;
			location.proxyStats = clone(saved.proxyStats || location.proxyStats);
			for (const entry of saved.activities || []) {
				const item = (location.activities || []).find(activity => (typeof activity === "string" ? activity : activity?.key) === entry.key);
				if (item && typeof item === "object") item.proxyStats = clone(entry.proxyStats || item.proxyStats);
			}
		}
		this.calendarDates = clone(state.calendarDates || {});
		for (const [key, value] of Object.entries(state.cycleValues || {})) if (this.project.cycles?.[key]?.cyclesProxyStat) this.project.cycles[key].cyclesProxyStat.value = value;
		for (const [key, value] of Object.entries(state.calendarValues || {})) if (this.project.calendars?.[key]?.maincycleProxyStat) this.project.calendars[key].maincycleProxyStat.value = value;
		this.renamedText = clone(state.renamedText || {});
		this.rngValues = clone(state.rngValues || {});
		this.currentLocationKey = state.currentLocationKey ?? null;
		this.conversation = clone(state.conversation);
		this.lastResult = clone(state.lastResult);
	}
	_restoreSnapshot(state) { this._restoreMutableState(state); }
	_requireProject() { if (!this.project) throw new StoryNodesRuntimeError("Load a runtime project before using this API.", "NO_PROJECT"); }
	_requireConversation() { this._requireProject(); if (!this.conversation?.active) throw new StoryNodesRuntimeError("No conversation is active.", "NO_CONVERSATION"); }
}

export function createRuntime(options = {}) { return new StoryNodesRuntime(options); }
