const TOKEN_PATTERN = /\{\{([^{}]+)\}\}/g;

export function replaceRuntimeTokens(text, resolveToken) {
	return String(text ?? "").replace(TOKEN_PATTERN, (whole, body) => {
		const parts = body.split(":");
		const token = { type: parts[0], parts: parts.slice(1), source: whole };
		const value = resolveToken(token);
		return value === undefined || value === null ? whole : String(value);
	});
}

function tokenize(source) {
	const tokens = [];
	let index = 0;
	while (index < source.length) {
		const rest = source.slice(index);
		const whitespace = /^\s+/.exec(rest);
		if (whitespace) { index += whitespace[0].length; continue; }
		const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(rest);
		if (number) { tokens.push({ type: "number", value: Number(number[0]) }); index += number[0].length; continue; }
		const operator = /^(===|!==|==|!=|<=|>=|&&|\|\||[()+\-*/%<>!])/.exec(rest);
		if (operator) { tokens.push({ type: operator[0], value: operator[0] }); index += operator[0].length; continue; }
		throw new SyntaxError(`Unexpected character at position ${index}.`);
	}
	tokens.push({ type: "end" });
	return tokens;
}

export function evaluateExpression(source, expectedType = null) {
	const tokens = tokenize(String(source ?? ""));
	let cursor = 0;
	const peek = () => tokens[cursor];
	const take = type => {
		if (peek().type !== type) throw new SyntaxError(`Expected '${type}'.`);
		return tokens[cursor++];
	};

	function primary() {
		if (peek().type === "number") return take("number").value;
		if (peek().type === "(") { take("("); const result = logicalOr(); take(")"); return result; }
		throw new SyntaxError("Expected a number or parenthesized expression.");
	}
	function unary() {
		if (peek().type === "!") { take("!"); return !Boolean(unary()); }
		if (peek().type === "+") { take("+"); return Number(unary()); }
		if (peek().type === "-") { take("-"); return -Number(unary()); }
		return primary();
	}
	function multiply() {
		let value = unary();
		while (["*", "/", "%"].includes(peek().type)) {
			const op = tokens[cursor++].type, right = unary();
			if (op === "*") value *= right;
			else if (op === "/") value /= right;
			else value %= right;
		}
		return value;
	}
	function add() {
		let value = multiply();
		while (["+", "-"].includes(peek().type)) {
			const op = tokens[cursor++].type, right = multiply();
			value = op === "+" ? value + right : value - right;
		}
		return value;
	}
	function relational() {
		let value = add();
		while (["<", "<=", ">", ">="].includes(peek().type)) {
			const op = tokens[cursor++].type, right = add();
			if (op === "<") value = value < right;
			else if (op === "<=") value = value <= right;
			else if (op === ">") value = value > right;
			else value = value >= right;
		}
		return value;
	}
	function equality() {
		let value = relational();
		while (["===", "!==", "==", "!="].includes(peek().type)) {
			const op = tokens[cursor++].type, right = relational();
			if (op === "===" || op === "==") value = value === right;
			else value = value !== right;
		}
		return value;
	}
	function logicalAnd() {
		let value = equality();
		while (peek().type === "&&") { take("&&"); const right = equality(); value = Boolean(value) && Boolean(right); }
		return value;
	}
	function logicalOr() {
		let value = logicalAnd();
		while (peek().type === "||") { take("||"); const right = logicalAnd(); value = Boolean(value) || Boolean(right); }
		return value;
	}

	const value = logicalOr();
	if (peek().type !== "end") throw new SyntaxError("Unexpected trailing expression content.");
	if (expectedType && typeof value !== expectedType) throw new TypeError(`Expression must evaluate to ${expectedType}.`);
	if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("Expression produced a non-finite number.");
	return value;
}

export function evaluateBooleanExpression(source) {
	try { return evaluateExpression(source, "boolean"); }
	catch { return false; }
}
