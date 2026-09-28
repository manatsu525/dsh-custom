window.__ModuleLoader__.load({
	id: "@local/dsh-client-ui-settings-web-search-anon",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		const ENDPOINT_VALUES = ["parallel", "keenable", "youcom"];

		const en = {
			title: "Web search",
			description: "Anonymous MCP search backends (no API key). Choose Parallel, Keenable, or You.com.",
			endpoint: "Endpoint",
			endpointHint: "Three anonymous MCP backends. Parallel is the default.",
			parallel: "Parallel Search MCP",
			keenable: "Keenable MCP",
			youcom: "You.com Free MCP",
			overridden: "Overridden",
			reset: "Reset to default",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			invalidEndpoint: "Choose parallel, keenable, or youcom."
		};
		const zh = {
			title: "联网搜索",
			description: "匿名 MCP 搜索后端（无需 API Key）。三选一：Parallel / Keenable / You.com。",
			endpoint: "Endpoint",
			endpointHint: "三个匿名 MCP 后端，默认 Parallel。",
			parallel: "Parallel Search MCP",
			keenable: "Keenable MCP",
			youcom: "You.com Free MCP",
			overridden: "已覆盖",
			reset: "恢复默认",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			invalidEndpoint: "请选择 parallel / keenable / youcom。"
		};

		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}

		const WEB_SEARCH_NS = "web-search-anon-mcp";

		function endpointFieldSpec() {
			return {
				field: "endpoint",
				format: (value) => typeof value === "string" && ENDPOINT_VALUES.includes(value) ? value : "parallel",
				parse: (text) => {
					const trimmed = String(text ?? "").trim();
					if (trimmed === "") return { kind: "clear" };
					if (ENDPOINT_VALUES.includes(trimmed)) return { kind: "set", value: trimmed };
					return undefined;
				}
			};
		}

		function AnonWebSearchCard(props) {
			const { t } = props;
			const state = props.useAnonWebSearchCard((snapshot) => snapshot);
			if (props.view === "summary") return t("description");
			const disabled = !state.writable;
			const current = ENDPOINT_VALUES.includes(state.endpoint.text) ? state.endpoint.text : "parallel";
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: { display: "flex", flexDirection: "column", gap: 8 },
						children: [
							(0, react_jsx_runtime.jsx)("div", {
								style: { fontWeight: 600 },
								children: t("endpoint")
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
								id: "plugin-config-web-search-anon-endpoint",
								label: t("endpoint"),
								value: current,
								disabled,
								options: [
									{ value: "parallel", label: t("parallel") },
									{ value: "keenable", label: t("keenable") },
									{ value: "youcom", label: t("youcom") }
								],
								onChange: (next) => {
									props.edit("endpoint", next);
								}
							}),
							(0, react_jsx_runtime.jsx)("p", {
								style: { margin: 0, opacity: 0.75, fontSize: 12 },
								children: state.endpoint.invalid ? t("invalidEndpoint") : t("endpointHint")
							}),
							state.endpoint.overridden ? (0, react_jsx_runtime.jsxs)("div", {
								style: { display: "flex", gap: 8, alignItems: "center" },
								children: [
									(0, react_jsx_runtime.jsx)("span", { children: t("overridden") }),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										disabled,
										onClick: () => props.resetField("endpoint"),
										children: t("reset")
									})
								]
							}) : null
						]
					})
				]
			});
		}

		var AnonWebSearchCardController = class {
			scope;
			form;
			store;
			constructor(scope) {
				this.scope = scope;
				this.form = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, [endpointFieldSpec()]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					endpoint: this.form.field("endpoint")
				};
			}
			inject() {
				return {
					hooks: { anonWebSearchCard: this.store },
					...this.form.actions()
				};
			}
			dispose() {
				this.form.dispose();
			}
		};

		const NS = "settings.webSearchAnon";
		const inject = [
			"slots",
			"locale",
			"remote",
			"configForms"
		];

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-settings-web-search-anon: dictionaries");
			const card = new AnonWebSearchCardController(ctx.configForms.get(WEB_SEARCH_NS));
			ctx.effect(() => () => {
				card.dispose();
			}, "ui-settings-web-search-anon: form subscription");
			ctx.effect(() => ctx.configForms.whileServed([WEB_SEARCH_NS], () => ctx.slots.inject("plugins.item", () => ctx.slots.register({
				name: "plugins.item",
				id: "web-search-anon",
				order: 40,
				label: () => t("title"),
				locale: NS,
				inject: () => card.inject()
			}, AnonWebSearchCard))), "ui-settings-web-search-anon: page");
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
