window.__ModuleLoader__.load({
	id: "@local/dsh-vps-mobile-settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		/**
		 * Shadow of settings.onboarding id "welcome-notice" (内测声明).
		 * Completes immediately so the modal never paints. Registered at a lower
		 * priority than the models plugin (default 0) so entriesOfSlot picks us.
		 */
		function SkipWelcomeNotice(props) {
			const complete = props.complete;
			react.useLayoutEffect(() => {
				if (typeof complete === "function") complete();
			}, [complete]);
			return null;
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.onboarding", () =>
				ctx.slots.register(
					{
						name: "settings.onboarding",
						id: "welcome-notice",
						order: -100,
						priority: -1,
					},
					SkipWelcomeNotice,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
