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
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const ENABLED_PREF = "browser.custom.gatekeeper.enabled";
const ALLOWED_HOSTS_PREF = "browser.custom.gatekeeper.allowedHosts";
const GRACE_PREF = "browser.custom.gatekeeper.graceMinutes";
const MINUTES_PREF = "browser.custom.gatekeeper.defaultMinutes";
const NO_LIMIT_PREF = "browser.custom.gatekeeper.noLimitSites";
const WAIT_PREF = "browser.custom.gatekeeper.waitSeconds";
const FLAGGED_WAIT_PREF = "browser.custom.gatekeeper.flaggedWaitSeconds";
const DIALOG_URL = "chrome://browser/content/custom/gatekeeper.html";

/**
 * Dispatched on a page on one of Levi's own sites to let an address's site
 * through. Its detail is the address, or for a chosen number of minutes, JSON
 * of {url, minutes}.
 */
const PASS_EVENT = "lh-gatekeeper-pass";

/**
 * Dispatched the same way, with an address as its detail, to ask for
 * startingMinutes. CustomGatekeeperChild answers before it returns.
 */
const ASK_EVENT = "lh-gatekeeper-ask";

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
 * @param {string} site
 * @returns {number}
 *   The minutes `site` starts with, or 0 if it's one that gets no limit.
 */
function minutesFor(site) {
  let noLimit = Services.prefs
    .getStringPref(NO_LIMIT_PREF, "")
    .split(",")
    .map(s => s.trim().toLowerCase());
  return noLimit.includes(site)
    ? 0
    : Services.prefs.getIntPref(MINUTES_PREF, 30);
}

/**
 * @param {string} url
 * @returns {number}
 *   The minutes a Gatekeeper question about `url` should offer, or 0 where
 *   there's no limit to set: sites that aren't asked about, and those with no
 *   limit.
 */
export function startingMinutes(url) {
  let site;
  try {
    site = gatedSiteFor(Services.io.newURI(url));
  } catch {
    return 0;
  }
  return site ? minutesFor(site) : 0;
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
 * asked about. Answering lets the site through for a number of minutes, which
 * only run while the site is in view, unless it's one of
 * browser.custom.gatekeeper.noLimitSites. When they're up, every tab on the
 * site is covered again, and staying takes a new number. The visit lasts while
 * a tab is on the site, and for browser.custom.gatekeeper.graceMinutes after
 * the last one leaves, so going off to sign in and coming back doesn't ask
 * again or start the minutes over. A wrong answer leaves the site. Pages on
 * levihanlen.com that ask their own question can let a site through themselves
 * with PASS_EVENT.
 */
export const CustomGatekeeper = {
  /**
   * @type {Map<string, {left: number, limitMs: ?number, spentMs: number, viewingSince: ?number, timer: ?number, timeUp: boolean}>}
   *   Sites that were let through. `left` is when a tab last left, or when it
   *   was let through if none has yet. `spentMs` is the time in view over the
   *   whole visit, not counting the stretch since `viewingSince`, and
   *   `limitMs` is what it can reach, or null for no limit.
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

  /** Whether the computer is asleep, when nothing's in view. */
  _asleep: false,

  init() {
    Services.obs.addObserver(this, "sleep_notification");
    Services.obs.addObserver(this, "wake_notification");
    ChromeUtils.registerWindowActor("CustomGatekeeper", {
      parent: {
        esModuleURI: "moz-src:///browser/custom/CustomGatekeeperParent.sys.mjs",
      },
      child: {
        esModuleURI: "moz-src:///browser/custom/CustomGatekeeperChild.sys.mjs",
        // Pages dispatch it on window without bubbles.
        events: {
          [PASS_EVENT]: { capture: true, wantUntrusted: true },
          [ASK_EVENT]: { capture: true, wantUntrusted: true },
        },
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
    let syncClocks = () => this._syncClocks();
    gBrowser.tabContainer.addEventListener("TabSelect", syncClocks);
    window.addEventListener("visibilitychange", syncClocks);
    window.addEventListener(
      "unload",
      () => Services.tm.dispatchToMainThread(syncClocks),
      { once: true }
    );
  },

  observe(subject, topic) {
    this._asleep = topic == "sleep_notification";
    this._syncClocks();
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
    this._syncClocks();
  },

  /**
   * @param {string} site
   * @param {MozBrowser} browser
   *   The browser that has come onto `site`.
   * @param {boolean} stayed
   *   Whether `browser` was already on `site`.
   * @returns {boolean}
   *   Whether `site` was let through, has time left, and hasn't been left for
   *   longer than the grace period since.
   */
  isLetThrough(site, browser, stayed) {
    let pass = this._passes.get(site);
    if (!pass) {
      return false;
    }
    if (stayed || this._isVisiting(site, pass, browser)) {
      return !pass.timeUp;
    }
    this._stopClock(pass);
    this._passes.delete(site);
    return false;
  },

  /**
   * @param {string} site
   * @param {object} pass
   *   The pass for `site`.
   * @param {MozBrowser} [browser]
   *   A tab that has come onto `site`, which doesn't count.
   * @returns {boolean}
   *   Whether another tab is on `site`, or one left within the grace period.
   */
  _isVisiting(site, pass, browser) {
    let graceMs = Services.prefs.getIntPref(GRACE_PREF, 10) * 60 * 1000;
    return (
      this.browsersOn(site).some(other => other != browser) ||
      Date.now() - pass.left <= graceMs
    );
  },

  _leave(site) {
    let pass = this._passes.get(site);
    if (pass) {
      pass.left = Date.now();
    }
  },

  /**
   * Lets `site` through and uncovers every tab on it. The rest of a visit goes
   * on counting from where it was.
   *
   * @param {string} site
   * @param {number} [minutes]
   *   How long it's let through for, 0 for no limit.
   */
  letThrough(site, minutes = minutesFor(site)) {
    let old = this._passes.get(site);
    if (old) {
      this._stopClock(old);
    }
    let spentMs = old?.spentMs ?? 0;
    this._passes.set(site, {
      left: Date.now(),
      limitMs: minutes > 0 ? spentMs + minutes * 60 * 1000 : null,
      spentMs,
      viewingSince: null,
      timer: null,
      timeUp: false,
    });
    for (let browser of this.browsersOn(site)) {
      this._prompts.get(browser)?.dialog.abort();
    }
    this._syncClocks();
  },

  /**
   * Lets the site `url` is on through, unless it's let through anyway. Without
   * `minutes` that's all it does, so a link that doesn't ask about time can't
   * add any, or get past a site whose time is up.
   *
   * @param {string} url
   * @param {number} [minutes]
   */
  letURLThrough(url, minutes) {
    let uri;
    try {
      uri = Services.io.newURI(url);
    } catch {
      return;
    }
    let site = gatedSiteFor(uri);
    if (!site) {
      return;
    }
    let pass = this._passes.get(site);
    if (Number.isInteger(minutes) && minutes > 0) {
      this.letThrough(site, minutes);
    } else if (!pass || !this._isVisiting(site, pass)) {
      this.letThrough(site);
    }
  },

  /**
   * @returns {Set<string>}
   *   The gated sites on tabs being looked at, not counting covered ones.
   */
  _sitesInView() {
    let sites = new Set();
    if (this._asleep) {
      return sites;
    }
    for (let window of lazy.BrowserWindowTracker.orderedWindows) {
      if (window.document.hidden) {
        continue;
      }
      for (let browser of window.gBrowser.selectedBrowsers) {
        let site = gatedSiteFor(browser.currentURI);
        if (site && !this._prompts.has(browser)) {
          sites.add(site);
        }
      }
    }
    return sites;
  },

  /** Runs the clock of every site in view, and stops every other. */
  _syncClocks() {
    let inView = this._sitesInView();
    for (let [site, pass] of this._passes) {
      if (!inView.has(site) || pass.limitMs === null || pass.timeUp) {
        this._stopClock(pass);
      } else if (pass.viewingSince === null) {
        pass.viewingSince = Date.now();
        pass.timer = lazy.setTimeout(
          () => this.timeUp(site),
          pass.limitMs - pass.spentMs
        );
      }
    }
  },

  _stopClock(pass) {
    if (pass.viewingSince !== null) {
      pass.spentMs += Date.now() - pass.viewingSince;
      pass.viewingSince = null;
      lazy.clearTimeout(pass.timer);
    }
  },

  /**
   * Covers every tab on `site`.
   *
   * @param {string} site
   */
  timeUp(site) {
    let pass = this._passes.get(site);
    if (!pass) {
      return;
    }
    this._stopClock(pass);
    pass.timeUp = true;
    for (let browser of this.browsersOn(site)) {
      this.checkBrowser(browser);
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
   * Covers `browser` with the Gatekeeper question for `site`, which says how
   * long the visit has been when time's up.
   *
   * @param {MozBrowser} browser
   * @param {string} site
   */
  prompt(browser, site) {
    let url = browser.currentURI.displaySpec;
    let flagged = isFlagged(url);
    let pass = this._passes.get(site);
    let timeUp = !!pass?.timeUp;
    let args = {
      url,
      site,
      flagged,
      limited: minutesFor(site) > 0,
      // Staying once time's up takes a number chosen on the spot.
      startMinutes: timeUp ? 0 : minutesFor(site),
      timeUp,
      spentMinutes: Math.round((pass?.spentMs ?? 0) / (60 * 1000)),
      waitSeconds: flagged
        ? Services.prefs.getIntPref(FLAGGED_WAIT_PREF, 10)
        : Services.prefs.getIntPref(WAIT_PREF, 1),
      questions: GATEKEEPER_QUESTIONS,
      // Goes back to before the site came up, or closes the tab if there's
      // nothing to go back to. The cover stays until the site is gone.
      leave: () => this._goBackFrom(browser, site),
      // Set by the cover.
      passed: false,
      minutes: 0,
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
        this.letThrough(site, args.minutes);
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
