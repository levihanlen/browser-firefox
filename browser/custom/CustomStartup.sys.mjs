/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

const NEW_TAB_URL_PREF = "browser.custom.newTabURL";
const SEARCH_ENGINE_NAME_PREF = "browser.custom.searchEngine.name";
const SEARCH_ENGINE_URL_PREF = "browser.custom.searchEngine.url";
const MIGRATION_VERSION_PREF = "browser.custom.migrationVersion";
const CURRENT_MIGRATION_VERSION = 2;

export const CustomStartup = {
  init() {
    this.applyNewTabURL();
    Services.prefs.addObserver(NEW_TAB_URL_PREF, () => this.applyNewTabURL());
    return this.migrate();
  },

  initWindow(window) {
    window.gBrowser.addTabsProgressListener({
      onStateChange(browser, webProgress, request, stateFlags) {
        if (
          webProgress.isTopLevel &&
          stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
          stateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW
        ) {
          CustomStartup.focusNewTabPage(window, browser);
        }
      },
    });
  },

  /**
   * Firefox focuses the address bar for the new tab page, but the custom page
   * has its own search box. Once the page loads, focus moves to it, unless
   * something has been typed in the address bar by then.
   *
   * @param {Window} window
   * @param {MozBrowser} browser
   *   The browser that finished loading.
   */
  focusNewTabPage(window, browser) {
    let { gBrowser, gURLBar } = window;
    let url = Services.prefs.getStringPref(NEW_TAB_URL_PREF, "");
    if (
      url &&
      browser == gBrowser.selectedBrowser &&
      browser.currentURI.spec == url &&
      gURLBar.focused &&
      !gURLBar.value
    ) {
      browser.focus();
    }
  },

  applyNewTabURL() {
    let url = Services.prefs.getStringPref(NEW_TAB_URL_PREF, "");
    if (url) {
      lazy.AboutNewTab.newTabURL = url;
    } else if (lazy.AboutNewTab.newTabURLOverridden) {
      lazy.AboutNewTab.resetNewTabURL();
    }
  },

  /**
   * One-time changes to a profile. They run once and are then left to the
   * user, so anything changed here can still be changed back in Settings.
   */
  async migrate() {
    let version = Services.prefs.getIntPref(MIGRATION_VERSION_PREF, 0);
    if (version >= CURRENT_MIGRATION_VERSION) {
      return;
    }
    if (version < 1) {
      await this.makeCustomSearchEngineDefault();
      // Firefox Suggest sets this default per region at startup, so a default
      // pref can't turn it off.
      Services.prefs.setBoolPref(
        "browser.urlbar.suggest.quicksuggest.sponsored",
        false
      );
    }
    if (version < 2) {
      // Like sponsored suggestions, Firefox Suggest is turned on per region at
      // startup.
      Services.prefs.setBoolPref("browser.urlbar.quicksuggest.enabled", false);
    }
    Services.prefs.setIntPref(
      MIGRATION_VERSION_PREF,
      CURRENT_MIGRATION_VERSION
    );
  },

  async makeCustomSearchEngineDefault() {
    let name = Services.prefs.getStringPref(SEARCH_ENGINE_NAME_PREF, "");
    let url = Services.prefs.getStringPref(SEARCH_ENGINE_URL_PREF, "");
    if (!name || !url) {
      return;
    }
    await lazy.SearchService.init();
    let engine =
      lazy.SearchService.getEngineByName(name) ??
      (await lazy.SearchService.addUserEngine({ name, url }));
    await lazy.SearchService.setDefault(
      engine,
      lazy.SearchService.CHANGE_REASON.USER
    );
  },
};
