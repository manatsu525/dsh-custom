/**
 * Host half: inject mobile Settings dialog CSS (+ touch-scroll helper) via
 * webserver/index-inject. Browser half (./client) skips welcome-notice.
 */
export const name = "vps-mobile-settings";
export const inject = ["webServer"];

/**
 * Mobile layout: left nav ~96px; content scrolls in .VOzbGW_options.
 *
 * Android quirk we hit: with flex:1 1 auto the options pane grows to its
 * content height, the panel clips it (overflow:hidden), and touch scrolling
 * fails — until an input is focused and the soft keyboard shrinks the
 * viewport enough that options finally overflows. Fix: flex-basis 0% so
 * options is always a definite scrollport; plus a small touch helper that
 * scrolls the nearest .VOzbGW_options when the browser won't.
 */
const MOBILE_SETTINGS_CSS = `
@media (max-width: 720px) {
  [data-shortcut-modal="settings"],
  [data-shortcut-modal="settings"].VOzbGW_panel {
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    height: min(88dvh, calc(100vh - 48px)) !important;
    max-height: min(88dvh, calc(100vh - 48px)) !important;
    border-radius: 12px !important;
    flex-direction: row !important;
    align-items: stretch !important;
    overflow: hidden !important;
    touch-action: manipulation;
  }

  [data-shortcut-modal="settings"] > nav,
  [data-shortcut-modal="settings"] > nav.VOzbGW_nav,
  [data-shortcut-modal="settings"] .VOzbGW_nav {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    flex: 0 0 96px !important;
    width: 96px !important;
    max-width: 96px !important;
    min-width: 96px !important;
    height: 100% !important;
    max-height: 100% !important;
    align-self: stretch !important;
    flex-direction: column !important;
    gap: 10px !important;
    padding: 14px 6px 10px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
    border-right: 0.5px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35));
    border-bottom: none !important;
  }

  [data-shortcut-modal="settings"] .VOzbGW_navTitle,
  [data-shortcut-modal="settings"] > nav > div:first-child {
    flex: none !important;
    padding: 0 4px !important;
    font-size: 13px !important;
    line-height: 20px !important;
    text-align: center !important;
  }

  [data-shortcut-modal="settings"] .VOzbGW_navList,
  [data-shortcut-modal="settings"] > nav > div:last-child {
    display: flex !important;
    flex: 1 1 0% !important;
    flex-direction: column !important;
    gap: 4px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  [data-shortcut-modal="settings"] .VOzbGW_navCell,
  [data-shortcut-modal="settings"] > nav button {
    display: flex !important;
    flex: none !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 4px !important;
    width: 100% !important;
    height: auto !important;
    min-height: 52px !important;
    padding: 8px 4px !important;
    box-sizing: border-box !important;
  }

  [data-shortcut-modal="settings"] .VOzbGW_navLabel,
  [data-shortcut-modal="settings"] > nav button span {
    flex: none !important;
    width: 100% !important;
    max-width: 100% !important;
    font-size: 11px !important;
    line-height: 14px !important;
    text-align: center !important;
    white-space: normal !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
  }

  [data-shortcut-modal="settings"] > div.VOzbGW_content,
  [data-shortcut-modal="settings"] > .VOzbGW_content,
  [data-shortcut-modal="settings"] > div:last-child {
    display: flex !important;
    flex: 1 1 0% !important;
    flex-direction: column !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: 100% !important;
    max-height: 100% !important;
    width: auto !important;
    max-width: none !important;
    overflow: hidden !important;
  }

  [data-shortcut-modal="settings"] .VOzbGW_header,
  [data-shortcut-modal="settings"] > div.VOzbGW_content > div:first-child {
    flex: 0 0 auto !important;
    height: auto !important;
    min-height: 44px !important;
    padding: 12px 10px 6px !important;
  }

  /* Definite scrollport — flex-basis 0% is required on Android Chrome */
  [data-shortcut-modal="settings"] .VOzbGW_options,
  [data-shortcut-modal="settings"] > div.VOzbGW_content > div:last-child {
    flex: 1 1 0% !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: 100% !important;
    padding: 0 12px 16px !important;
    overflow-x: hidden !important;
    overflow-y: scroll !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior: contain !important;
    touch-action: pan-y !important;
  }
}
`.trim();

/** Fallback: manually scroll .VOzbGW_options when native touch scroll fails. */
const TOUCH_SCROLL_HELPER = `
(function () {
  if (window.__dshVpsSettingsTouchScroll) return;
  window.__dshVpsSettingsTouchScroll = true;
  var lastY = null;
  var target = null;
  function optionsFrom(node) {
    if (!node || !node.closest) return null;
    return node.closest('.VOzbGW_options') ||
      (node.closest('[data-shortcut-modal="settings"]') &&
        node.closest('[data-shortcut-modal="settings"]').querySelector('.VOzbGW_options'));
  }
  function isEditable(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('input, textarea, select, [contenteditable="true"]');
  }
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { lastY = null; target = null; return; }
    var t = e.target;
    if (isEditable(t)) { lastY = null; target = null; return; }
    target = optionsFrom(t);
    lastY = target ? e.touches[0].clientY : null;
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', function (e) {
    if (!target || lastY == null || e.touches.length !== 1) return;
    if (isEditable(e.target)) return;
    var y = e.touches[0].clientY;
    var dy = lastY - y;
    lastY = y;
    if (dy === 0) return;
    var max = target.scrollHeight - target.clientHeight;
    if (max <= 0) return;
    var next = Math.max(0, Math.min(max, target.scrollTop + dy));
    if (next !== target.scrollTop) {
      target.scrollTop = next;
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false, capture: true });
  document.addEventListener('touchend', function () {
    lastY = null; target = null;
  }, { passive: true, capture: true });
})();
`.trim();

export function apply(ctx) {
  ctx.on("webserver/index-inject", (table) => {
    table.push({ kind: "style", text: MOBILE_SETTINGS_CSS });
    table.push({
      kind: "script",
      placement: "head",
      text: TOUCH_SCROLL_HELPER,
    });
  });
}
