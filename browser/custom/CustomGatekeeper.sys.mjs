/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  GATEKEEPER_QUESTIONS,
  SiteTimer,
  holdMedia,
  timedSiteFor,
} from "moz-src:///browser/custom/SiteTimer.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
});

const ENABLED_PREF = "browser.custom.gatekeeper.enabled";
const ALLOWED_HOSTS_PREF = "browser.custom.gatekeeper.allowedHosts";
const GRACE_PREF = "browser.custom.gatekeeper.graceMinutes";
const WAIT_PREF = "browser.custom.gatekeeper.waitSeconds";
const FLAGGED_WAIT_PREF = "browser.custom.gatekeeper.flaggedWaitSeconds";
const DIALOG_URL = "chrome://browser/content/custom/gatekeeper.html";

/**
 * Dispatched on a page on one of Levi's own sites, with an address as its
 * detail, to let that address's site through.
 */
const PASS_EVENT = "lh-gatekeeper-pass";

/**
 * Words that make the Gatekeeper wait longer before it can be answered when
 * they're in the address. The same words levihanlen.com's search flags.
 */
export const FLAGGED_WORDS = [
  "boob",
  "sex",
  "porn",
  "naked",
  "nude",
  "nsfw",
  "thetruespartan",
  "fate",
  "spartan",
];

/**
 * Hosts that are never covered, since they're Levi's own sites.
 *
 * @param {string} host
 * @returns {boolean}
 */
export function isOwnHost(host) {
  host = host.toLowerCase();
  return (
    host == "levihanlen.com" ||
    host.endsWith(".levihanlen.com") ||
    host == "localhost" ||
    host.endsWith(".localhost") ||
    host == "127.0.0.1" ||
    host == "::1"
  );
}

function isAllowedHost(host) {
  return Services.prefs
    .getStringPref(ALLOWED_HOSTS_PREF, "")
    .split(",")
    .map(h => h.trim().toLowerCase())
    .some(
      allowed => allowed && (host == allowed || host.endsWith(`.${allowed}`))
    );
}

/**
 * The site the Gatekeeper asks about before `uri` can be seen: its registrable
 * domain, so docs.github.com and github.com are one site, or the host for an
 * IP address or a name like "router".
 *
 * @param {?nsIURI} uri
 * @returns {?string}
 *   Null for what's let through as it is: Levi's own sites, allowed hosts such
 *   as sign-in pages, timed sites, which SiteTimer locks instead, and anything
 *   that isn't a web page.
 */
export function gatedSiteFor(uri) {
  if (
    !Services.prefs.getBoolPref(ENABLED_PREF, false) ||
    !uri ||
    (!uri.schemeIs("http") && !uri.schemeIs("https"))
  ) {
    return null;
  }
  let host = uri.host.toLowerCase();
  if (
    isOwnHost(host) ||
    isAllowedHost(host) ||
    (SiteTimer.enabled && timedSiteFor(uri))
  ) {
    return null;
  }
  try {
    return Services.eTLD.getBaseDomain(uri);
  } catch {
    return host;
  }
}

/**
 * @param {string} url
 * @returns {boolean}
 *   Whether `url` has one of FLAGGED_WORDS in it.
 */
export function isFlagged(url) {
  return FLAGGED_WORDS.some(word =>
    new RegExp(`\\b${word}s?\\b`, "i").test(url)
  );
}

/**
 * Covers a tab with a Gatekeeper question whenever it comes onto a site that
 * hasn't been let through, however it got there: typed in the address bar,
 * followed from a link, or redirected to. The page loads under the cover, so a
 * chain of redirects ends where it would have anyway, and only that site is
 * asked about. Answering lets the site through while a tab is on it, and for
 * browser.custom.gatekeeper.graceMinutes after the last one leaves, so going
 * off to sign in and coming back doesn't ask again. A wrong answer leaves the
 * site. Pages on levihanlen.com that ask their own question can let a site
 * through themselves with PASS_EVENT.
 */
export const CustomGatekeeper = {
  /**
   * @type {Map<string, number>}
   *   Sites that were let through, with when a tab last left each one, or when
   *   it was let through if none has yet.
   */
  _passes: new Map(),

  /**
   * @type {WeakMap<MozBrowser, ?string>}
   *   The site each browser was last seen on, from gatedSiteFor.
   */
  _sites: new WeakMap(),

  /**
   * @type {WeakMap<MozBrowser, {site: string, dialog: SubDialog, closed: Promise}>}
   *   Open covers, by the browser they cover. `closed` resolves once the
   *   cover's answer has been acted on.
   */
  _prompts: new WeakMap(),

  init() {
    ChromeUtils.registerWindowActor("CustomGatekeeper", {
      parent: {
        esModuleURI: "moz-src:///browser/custom/CustomGatekeeperParent.sys.mjs",
      },
      child: {
        esModuleURI: "moz-src:///browser/custom/CustomGatekeeperChild.sys.mjs",
        // Pages dispatch it on window without bubbles.
        events: { [PASS_EVENT]: { capture: true, wantUntrusted: true } },
      },
      matches: [
        "*://*.levihanlen.com/*",
        "*://*.localhost/*",
        "*://127.0.0.1/*",
        "*://[::1]/*",
      ],
      // Levi's sites are web pages like any other. The most one can do is let
      // a site through, and the parent checks it's one of his.
      safeForUntrustedWebProcess: true,
    });
  },

  initWindow(window) {
    let { gBrowser } = window;
    gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress) => {
        // Waits for the other listeners, since TabDialogBox closes dialogs on
        // location changes and would catch this one if it opened one now.
        if (webProgress.isTopLevel) {
          Services.tm.dispatchToMainThread(() => this.checkBrowser(browser));
        }
      },
    });
    gBrowser.tabContainer.addEventListener("TabClose", event =>
      this._leave(this._sites.get(event.target.linkedBrowser))
    );
  },

  /**
   * Covers `browser` if it has come onto a site that hasn't been let through.
   *
   * @param {MozBrowser} browser
   */
  checkBrowser(browser) {
    if (!browser.isConnected) {
      return;
    }
    // Error pages, such as for a mistyped address, have nothing to cover.
    let site = browser.documentURI?.schemeIs("about")
      ? null
      : gatedSiteFor(browser.currentURI);
    let previous = this._sites.get(browser);
    this._sites.set(browser, site);
    if (previous != site) {
      this._leave(previous);
    }
    if (
      site &&
      !this._prompts.has(browser) &&
      !this.isLetThrough(site, browser, previous == site)
    ) {
      this.prompt(browser, site);
    }
  },

  /**
   * @param {string} site
   * @param {MozBrowser} browser
   *   The browser that has come onto `site`.
   * @param {boolean} stayed
   *   Whether `browser` was already on `site`.
   * @returns {boolean}
   *   Whether `site` was let through and hasn't been left for longer than the
   *   grace period since.
   */
  isLetThrough(site, browser, stayed) {
    let left = this._passes.get(site);
    if (left === undefined) {
      return false;
    }
    let graceMs = Services.prefs.getIntPref(GRACE_PREF, 10) * 60 * 1000;
    if (
      stayed ||
      this.browsersOn(site).some(other => other != browser) ||
      Date.now() - left <= graceMs
    ) {
      return true;
    }
    this._passes.delete(site);
    return false;
  },

  _leave(site) {
    if (site && this._passes.has(site)) {
      this._passes.set(site, Date.now());
    }
  },

  /**
   * Lets `site` through and uncovers every tab on it.
   *
   * @param {string} site
   */
  letThrough(site) {
    this._passes.set(site, Date.now());
    for (let browser of this.browsersOn(site)) {
      this._prompts.get(browser)?.dialog.abort();
    }
  },

  /**
   * Lets the site `url` is on through, unless it's let through anyway.
   *
   * @param {string} url
   */
  letURLThrough(url) {
    let uri;
    try {
      uri = Services.io.newURI(url);
    } catch {
      return;
    }
    let site = gatedSiteFor(uri);
    if (site) {
      this.letThrough(site);
    }
  },

  /**
   * @param {string} site
   * @returns {MozBrowser[]}
   *   The tabs on `site`, in every window.
   */
  browsersOn(site) {
    let browsers = [];
    for (let window of lazy.BrowserWindowTracker.orderedWindows) {
      for (let browser of window.gBrowser.browsers) {
        if (browser.isConnected && gatedSiteFor(browser.currentURI) == site) {
          browsers.push(browser);
        }
      }
    }
    return browsers;
  },

  /**
   * Covers `browser` with the Gatekeeper question for `site`.
   *
   * @param {MozBrowser} browser
   * @param {string} site
   */
  prompt(browser, site) {
    let url = browser.currentURI.displaySpec;
    let flagged = isFlagged(url);
    let args = {
      url,
      flagged,
      waitSeconds: flagged
        ? Services.prefs.getIntPref(FLAGGED_WAIT_PREF, 10)
        : Services.prefs.getIntPref(WAIT_PREF, 1),
      questions: GATEKEEPER_QUESTIONS,
      // Goes back to before the site came up, or closes the tab if there's
      // nothing to go back to. The cover stays until the site is gone.
      leave: () => this._goBackFrom(browser, site),
      // Set by the cover.
      passed: false,
    };
    let { closedPromise, dialog } = browser
      .getTabBrowser()
      .getTabDialogBox(browser)
      .open(
        DIALOG_URL,
        {
          features: "resizable=no",
          keepOpenSameOriginNav: true,
          sizeTo: "available",
          hideContent: true,
        },
        args
      );
    let releaseMedia = holdMedia(browser);
    let closed = closedPromise.then(() => {
      this._prompts.delete(browser);
      releaseMedia(args.passed);
      if (args.passed) {
        this.letThrough(site);
      } else {
        // The cover was closed some other way, such as by a navigation to
        // another part of the site, or by the tab moving to another window,
        // where it has a new browser.
        for (let other of this.browsersOn(site)) {
          this.checkBrowser(other);
        }
        this.checkBrowser(browser);
      }
    });
    this._prompts.set(browser, { site, dialog, closed });
  },

  _goBackFrom(browser, site) {
    let history = browser.browsingContext?.sessionHistory;
    for (let index = (history?.index ?? 0) - 1; index >= 0; index--) {
      if (gatedSiteFor(history.getEntryAtIndex(index).URI) != site) {
        browser.gotoIndex(index);
        return;
      }
    }
    let gBrowser = browser.getTabBrowser();
    gBrowser.removeTab(gBrowser.getTabForBrowser(browser));
  },
};
