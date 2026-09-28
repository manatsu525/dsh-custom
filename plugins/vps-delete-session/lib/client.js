window.__ModuleLoader__.load({
	id: "@local/dsh-vps-delete-session",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");

		const DELETE_ROUTE = "/api/vps.deleteSession".slice(1);
		const NS = "vps-delete-session";

		const zh = {
			"menu.deleteSession": "删除对话",
			"dialog.title": "永久删除对话？",
			"dialog.desc": "将永久删除「{title}」。此操作不可恢复。",
			"dialog.willDelete": "将删除：",
			"dialog.item.sessionDir": "该会话目录：$DSH_HOME/sessions/…/session-<uuid>/（日志、锁、会话局部产物）",
			"dialog.item.projcache": "投影缓存：$DSH_HOME/storages/session_projcache/sessions/session-<uuid>.json",
			"dialog.item.spill": "可识别的会话 spill 临时目录（若存在）",
			"dialog.item.registry": "从工作区会话列表 / 置顶 / 归档登记中移除",
			"dialog.willNot": "不会删除：",
			"dialog.item.share": "共享工作区目录本身（例如 /home/share）——多用户文件会保留",
			"dialog.item.attachments": "内容寻址附件库（可能被其他会话引用）",
			"dialog.confirm": "永久删除",
			"dialog.cancel": "取消",
			"dialog.pending": "正在删除…",
			"dialog.close": "关闭",
			"dialog.failed": "删除失败",
		};
		const en = {
			"menu.deleteSession": "Delete conversation",
			"dialog.title": "Permanently delete conversation?",
			"dialog.desc": "This permanently deletes “{title}”. This cannot be undone.",
			"dialog.willDelete": "Will delete:",
			"dialog.item.sessionDir": "That session’s directory under $DSH_HOME/sessions/…/session-<uuid>/ (log, lock, session-local artifacts)",
			"dialog.item.projcache": "Projection cache: $DSH_HOME/storages/session_projcache/sessions/session-<uuid>.json",
			"dialog.item.spill": "Identifiable session spill scratch dir (if present)",
			"dialog.item.registry": "Remove from workspace session list / pinned / archived registry",
			"dialog.willNot": "Will NOT delete:",
			"dialog.item.share": "The shared workspace folder itself (e.g. /home/share) — other users’ files stay",
			"dialog.item.attachments": "Content-addressed attachment store (may be shared by other sessions)",
			"dialog.confirm": "Delete permanently",
			"dialog.cancel": "Cancel",
			"dialog.pending": "Deleting…",
			"dialog.close": "Close",
			"dialog.failed": "Delete failed",
		};

		function DeleteSessionMenuItem({ sessionId, useMenuOpenState, requestDelete, t }) {
			const [, setMenuOpen] = useMenuOpenState();
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuItemButton, {
				danger: true,
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, { size: 14 }),
				onSelect: () => {
					setMenuOpen(false);
					requestDelete(sessionId);
				},
				children: t("menu.deleteSession"),
			});
		}

		function DeleteConfirmDialog({ useDeleteRequest, settleDelete, confirmDelete, t }) {
			const request = useDeleteRequest((pending) => pending);
			if (request === null) return null;
			return (0, react_jsx_runtime.jsx)(DeleteConfirmForm, {
				request,
				confirmDelete,
				onSettle: settleDelete,
				t,
			}, request.sessionId);
		}

		function DeleteConfirmForm({ request, confirmDelete, onSettle, t }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const close = () => {
				if (busy) return;
				onSettle();
			};
			const confirm = () => {
				setBusy(true);
				setError(null);
				confirmDelete(request.sessionId)
					.then(() => {
						setBusy(false);
						onSettle();
					})
					.catch((reason) => {
						setBusy(false);
						setError(reason instanceof Error ? reason.message : String(reason));
					});
			};
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: close,
				closeLabel: t("dialog.close"),
				title: t("dialog.title"),
				description: t("dialog.desc", { title: request.displayTitle }),
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
					children: [
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: busy,
							onClick: close,
							children: t("dialog.cancel"),
						}),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: busy,
							onClick: confirm,
							style: {
								color: "var(--dsw-alias-label-error, #c62828)",
								borderColor: "var(--dsw-alias-label-error, #c62828)",
							},
							children: busy ? t("dialog.pending") : t("dialog.confirm"),
						}),
					],
				}),
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: { display: "flex", flexDirection: "column", gap: 10, fontSize: 13, lineHeight: 1.45 },
						children: [
							(0, react_jsx_runtime.jsx)("div", {
								style: { fontWeight: 600 },
								children: t("dialog.willDelete"),
							}),
							(0, react_jsx_runtime.jsxs)("ul", {
								style: { margin: 0, paddingLeft: 18 },
								children: [
									(0, react_jsx_runtime.jsx)("li", { children: t("dialog.item.sessionDir") }),
									(0, react_jsx_runtime.jsx)("li", { children: t("dialog.item.projcache") }),
									(0, react_jsx_runtime.jsx)("li", { children: t("dialog.item.spill") }),
									(0, react_jsx_runtime.jsx)("li", { children: t("dialog.item.registry") }),
								],
							}),
							(0, react_jsx_runtime.jsx)("div", {
								style: { fontWeight: 600, marginTop: 4 },
								children: t("dialog.willNot"),
							}),
							(0, react_jsx_runtime.jsxs)("ul", {
								style: { margin: 0, paddingLeft: 18 },
								children: [
									(0, react_jsx_runtime.jsx)("li", { children: t("dialog.item.share") }),
									(0, react_jsx_runtime.jsx)("li", { children: t("dialog.item.attachments") }),
								],
							}),
						],
					}),
					busy
						? (0, react_jsx_runtime.jsx)("div", {
								role: "status",
								style: { marginTop: 12, opacity: 0.8 },
								children: t("dialog.pending"),
							})
						: null,
					error !== null
						? (0, react_jsx_runtime.jsx)("div", {
								role: "alert",
								style: {
									marginTop: 12,
									color: "var(--dsw-alias-label-error, #c62828)",
								},
								children: `${t("dialog.failed")}: ${error}`,
							})
						: null,
				],
			});
		}

		async function callDeleteSession(sessionId, fetcher) {
			const response = await fetcher(DELETE_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId }),
				credentials: "same-origin",
			});
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				payload = null;
			}
			if (!response.ok || !payload || payload.ok !== true) {
				const detail =
					payload && typeof payload.message === "string"
						? payload.message
						: payload && typeof payload.error === "string"
							? payload.error
							: `HTTP ${response.status}`;
				throw new Error(detail);
			}
			return payload;
		}

		const inject = ["slots", "locale", "sessions"];

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(
				() =>
					ctx.locale.register(NS, {
						zh,
						en,
					}),
				"vps-delete-session: dictionaries",
			);

			const deleteRequest = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(null);

			const requestDelete = (sessionId) => {
				const row = ctx.sessions.list.getSnapshot().byId[sessionId];
				const displayTitle = row?.displayTitle ?? row?.title ?? sessionId;
				deleteRequest.set({
					sessionId,
					displayTitle,
				});
			};

			const settleDelete = () => {
				deleteRequest.set(null);
			};

			const confirmDelete = (sessionId) => callDeleteSession(sessionId, (input, init) => fetch(input, init));

			ctx.slots.inject("sidebar.workspaces.session.menu.item", () =>
				ctx.slots.register(
					{
						name: "sidebar.workspaces.session.menu.item",
						id: "delete",
						order: 500,
						locale: NS,
						inject: () => ({
							requestDelete,
						}),
					},
					DeleteSessionMenuItem,
				),
			);

			ctx.slots.inject("shell.overlay", () =>
				ctx.slots.register(
					{
						name: "shell.overlay",
						id: "vps.session-delete",
						locale: NS,
						inject: () => ({
							hooks: { deleteRequest },
							settleDelete,
							confirmDelete,
						}),
					},
					DeleteConfirmDialog,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.NS = NS;
		return module.exports;
	},
});
