/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "styleSheetService", () =>
  Cc["@mozilla.org/content/style-sheet-service;1"].getService(
    Ci.nsIStyleSheetService
  )
);

const ENABLED_PREF = "browser.custom.theme.enabled";

export const CustomTheme = {
  SHEET_URI: Services.io.newURI("chrome://browser/content/custom/theme.css"),

  init() {
    this.apply();
    Services.prefs.addObserver(ENABLED_PREF, () => this.apply());
  },

  apply() {
    let service = lazy.styleSheetService;
    let registered = service.sheetRegistered(
      this.SHEET_URI,
      service.USER_SHEET
    );
    let enabled = Services.prefs.getBoolPref(ENABLED_PREF, true);
    if (enabled && !registered) {
      service.loadAndRegisterSheet(this.SHEET_URI, service.USER_SHEET);
    } else if (!enabled && registered) {
      service.unregisterSheet(this.SHEET_URI, service.USER_SHEET);
    }
  },
};
