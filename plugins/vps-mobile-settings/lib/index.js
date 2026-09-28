/**
 * Host half: inject mobile Settings dialog CSS via webserver/index-inject.
 * Browser half (./client) shadows the welcome-notice onboarding step.
 */
export const name = "vps-mobile-settings";
export const inject = ["webServer"];

/** Structural overrides for SettingsRoot panel (data-shortcut-modal="settings"). */
const MOBILE_SETTINGS_CSS = `
@media (max-width: 720px) {
  /* Full-viewport settings dialog */
  [data-shortcut-modal="settings"] {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100dvh !important;
    height: 100vh !important;
    border-radius: 0 !important;
    flex-direction: column !important;
  }

  /* Nav: horizontal scrollable strip above content (not a ~60% side column) */
  [data-shortcut-modal="settings"] > nav {
    width: 100% !important;
    max-width: 100% !important;
    flex: none !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 8px !important;
    padding: 12px 10px 8px !important;
    border-bottom: 0.5px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35));
    box-sizing: border-box !important;
  }

  /* Title stays compact on the left */
  [data-shortcut-modal="settings"] > nav > div:first-child {
    flex: none !important;
    padding: 0 4px !important;
    font-size: 15px !important;
    white-space: nowrap !important;
  }

  /* Section buttons scroll horizontally */
  [data-shortcut-modal="settings"] > nav > div:last-child {
    flex: 1 1 auto !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 4px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    min-width: 0 !important;
    -webkit-overflow-scrolling: touch;
  }

  [data-shortcut-modal="settings"] > nav button {
    flex: none !important;
    height: 36px !important;
    padding: 6px 10px !important;
    white-space: nowrap !important;
  }

  /* Content column takes remaining height */
  [data-shortcut-modal="settings"] > div {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    width: 100% !important;
  }

  /* Tighten header / options padding so Models isn't a thin strip */
  [data-shortcut-modal="settings"] > div > div:first-child {
    height: auto !important;
    min-height: 44px !important;
    padding: 10px 10px 6px !important;
  }

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
