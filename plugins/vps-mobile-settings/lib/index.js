/**
 * Host half: inject mobile Settings dialog CSS via webserver/index-inject.
 * Browser half (./client) shadows the welcome-notice onboarding step.
 */
export const name = "vps-mobile-settings";
export const inject = ["webServer"];

/**
 * Mobile layout: keep a visible LEFT nav (user needs it to switch 模型/插件/…),
 * but shrink it so content is usable. Avoid column+100dvh which can clip the
 * nav under browser chrome / translation bars.
 *
 * Class hashes (VOzbGW_*) are from @deepseek-ai/dsh-client-ui-settings-general
 * SettingsRoot.module.css in dsh 0.1.7-rc.2; attribute selectors are the fallback.
 */
const MOBILE_SETTINGS_CSS = `
@media (max-width: 720px) {
  [data-shortcut-modal="settings"],
  [data-shortcut-modal="settings"].VOzbGW_panel {
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    height: min(92dvh, calc(100vh - 24px)) !important;
    max-height: min(92dvh, calc(100vh - 24px)) !important;
    border-radius: 12px !important;
    flex-direction: row !important;
    align-items: stretch !important;
    overflow: hidden !important;
  }

  /* Left nav: narrow but always visible */
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
    height: auto !important;
    max-height: none !important;
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
    padding: 0 4px !important;
    font-size: 13px !important;
    line-height: 20px !important;
    text-align: center !important;
  }

  [data-shortcut-modal="settings"] .VOzbGW_navList,
  [data-shortcut-modal="settings"] > nav > div:last-child {
    display: flex !important;
    flex: 1 1 auto !important;
    flex-direction: column !important;
    flex-wrap: nowrap !important;
    gap: 4px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    -webkit-overflow-scrolling: touch;
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

  /* Content fills the rest */
  [data-shortcut-modal="settings"] > div.VOzbGW_content,
  [data-shortcut-modal="settings"] > .VOzbGW_content,
  [data-shortcut-modal="settings"] > div:last-child {
    display: flex !important;
    flex: 1 1 auto !important;
    flex-direction: column !important;
    min-width: 0 !important;
    min-height: 0 !important;
    width: auto !important;
    max-width: none !important;
  }

  [data-shortcut-modal="settings"] .VOzbGW_header,
  [data-shortcut-modal="settings"] > div > div:first-child {
    height: auto !important;
    min-height: 44px !important;
    padding: 12px 10px 6px !important;
  }

  [data-shortcut-modal="settings"] .VOzbGW_options,
  [data-shortcut-modal="settings"] > div > div:last-child {
    padding: 0 12px 16px !important;
  }
}
`.trim();

export function apply(ctx) {
  ctx.on("webserver/index-inject", (table) => {
    table.push({
      kind: "style",
      text: MOBILE_SETTINGS_CSS,
    });
  });
}
