/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const ENABLED_PREF = "browser.custom.siteTimer.enabled";
const SITES_PREF = "browser.custom.siteTimer.sites";
const DIALOG_URL = "chrome://browser/content/custom/site-timer.html";

/**
 * The timed site `uri` is on: its registrable domain, when that's listed in
 * browser.custom.siteTimer.sites. www.youtube.com and music.youtube.com are
 * both youtube.com, so they share one timer.
 *
 * @param {?nsIURI} uri
 * @returns {?string}
 */
export function timedSiteFor(uri) {
  if (!uri || (!uri.schemeIs("http") && !uri.schemeIs("https"))) {
    return null;
  }
  let site;
  try {
    site = Services.eTLD.getBaseDomain(uri);
  } catch {
    return null;
  }
  let sites = Services.prefs
    .getStringPref(SITES_PREF, "")
    .split(",")
    .map(s => s.trim().toLowerCase());
  return sites.includes(site) ? site : null;
}

/**
 * Before a timed site such as YouTube can be used, asks how many minutes it
 * will take, and when they're up, interrupts it wherever it's open: the video
 * pauses and a prompt covers the page, which stays loaded underneath, until
 * more minutes are given or the tab is closed. One timer covers every tab on
 * the same site.
 */
export const SiteTimer = {
  /**
   * @type {Map<string, {plannedMinutes: number, purpose: string, deadline: number, timer: ?number}>}
   *   Timed sites that were given minutes, by site. `timer` is null once the
   *   time is up.
   */
  _sessions: new Map(),

  /**
   * @type {WeakMap<MozBrowser, {site: string, dialog: SubDialog, closed: Promise}>}
   *   Open prompts, by the browser they cover. `closed` resolves once the
   *   prompt's answer has been acted on.
   */
  _prompts: new WeakMap(),

  init() {
    Services.obs.addObserver(this, "wake_notification");
  },

  initWindow(window) {
    window.gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress) => {
        // Waits for the other listeners, since TabDialogBox closes dialogs on
        // location changes and would catch this one if it opened one now.
        if (webProgress.isTopLevel) {
          Services.tm.dispatchToMainThread(() => this.checkBrowser(browser));
        }
      },
    });
  },

  observe(subject, topic) {
    // Timers don't count time the computer spends asleep, so a deadline that
    // passed during sleep is caught here.
    if (topic == "wake_notification") {
      for (let [site, session] of this._sessions) {
        if (session.timer) {
          this._schedule(site, session);
        }
      }
    }
  },

  get enabled() {
    return Services.prefs.getBoolPref(ENABLED_PREF, false);
  },

  /**
   * Prompts in `browser` if it's on a timed site that has no time left.
   *
   * @param {MozBrowser} browser
   */
  checkBrowser(browser) {
    if (!this.enabled || !browser.isConnected || this._prompts.has(browser)) {
      return;
    }
    let site = timedSiteFor(browser.currentURI);
    if (!site) {
      return;
    }
    let session = this._sessions.get(site);
    if (session && Date.now() < session.deadline) {
      return;
    }
    this.prompt(browser, site);
  },

  /**
   * Gives `site` `minutes` more minutes, starting now, and closes its prompts.
   *
   * @param {string} site
   * @param {number} minutes
   * @param {string} [purpose]
   *   What the time is for, in the user's words. Kept from the last time when
   *   not given.
   */
  start(site, minutes, purpose) {
    let previous = this._sessions.get(site);
    if (previous) {
      lazy.clearTimeout(previous.timer);
    }
    let session = {
      plannedMinutes: (previous?.plannedMinutes ?? 0) + minutes,
      purpose: purpose || previous?.purpose || "",
      deadline: Date.now() + minutes * 60 * 1000,
      timer: null,
    };
    this._sessions.set(site, session);
    this._schedule(site, session);
    for (let browser of this.browsersOn(site)) {
      this._prompts.get(browser)?.dialog.abort();
    }
  },

  _schedule(site, session) {
    lazy.clearTimeout(session.timer);
    session.timer = lazy.setTimeout(
      () => this.timeUp(site),
      Math.max(0, session.deadline - Date.now())
    );
  },

  /**
   * Prompts in every tab on `site`. With none open, the time is simply over,
   * and the next visit starts fresh.
   *
   * @param {string} site
   */
  timeUp(site) {
    let session = this._sessions.get(site);
    if (!session) {
      return;
    }
    lazy.clearTimeout(session.timer);
    session.timer = null;
    session.deadline = Math.min(session.deadline, Date.now());
    let browsers = this.browsersOn(site);
    if (!browsers.length) {
      this._sessions.delete(site);
      return;
    }
    for (let browser of browsers) {
      this.checkBrowser(browser);
    }
  },

  /**
   * @param {string} site
   * @returns {MozBrowser[]}
   *   The loaded tabs on `site`, in every window.
   */
  browsersOn(site) {
    let browsers = [];
    for (let window of lazy.BrowserWindowTracker.orderedWindows) {
      for (let browser of window.gBrowser.browsers) {
        if (browser.isConnected && timedSiteFor(browser.currentURI) == site) {
          browsers.push(browser);
        }
      }
    }
    return browsers;
  },

  /**
   * Covers `browser` with the site timer prompt: how long, for a site with no
   * time yet, or how much longer, once its time is up.
   *
   * @param {MozBrowser} browser
   * @param {string} site
   */
  prompt(browser, site) {
    let session = this._sessions.get(site);
    let args = {
      site,
      timeUp: !!session,
      plannedMinutes: session?.plannedMinutes ?? 0,
      purpose: session?.purpose ?? "",
      // Set by the prompt. It only sets primitives, which still read the same
      // once its window is gone.
      minutes: 0,
      closeTab: false,
    };
    let { closedPromise, dialog } = browser
      .getTabBrowser()
      .getTabDialogBox(browser)
      .open(
        DIALOG_URL,
        { features: "resizable=no", keepOpenSameOriginNav: true },
        args
      );
    let releaseMedia = this._holdMedia(browser);
    let closed = closedPromise.then(() => {
      this._prompts.delete(browser);
      releaseMedia(args.minutes > 0);
      this._onPromptClosed(browser, site, args);
    });
    this._prompts.set(browser, { site, dialog, closed });
  },

  _onPromptClosed(browser, site, { minutes, purpose, closeTab }) {
    if (minutes > 0) {
      this.start(site, minutes, purpose);
      return;
    }
    let gBrowser = browser.getTabBrowser();
    if (closeTab && gBrowser) {
      gBrowser.removeTab(gBrowser.getTabForBrowser(browser));
    } else {
      // The prompt was closed some other way, such as by a navigation to
      // another part of the same site, or by the tab moving to another window.
      for (let other of this.browsersOn(site)) {
        this.checkBrowser(other);
      }
      this.checkBrowser(browser);
    }
    let session = this._sessions.get(site);
    if (
      session &&
      Date.now() >= session.deadline &&
      !this.browsersOn(site).some(other => other != browser)
    ) {
      this._sessions.delete(site);
    }
  },

  /**
   * Keeps media in `browser` paused, including media that starts later, such
   * as a video that autoplays once the page loads.
   *
   * @param {MozBrowser} browser
   * @returns {function(boolean): void}
   *   Stops holding the media. Pass true to play whatever was paused.
   */
  _holdMedia(browser) {
    let controller = browser.browsingContext?.mediaController;
    if (!controller) {
      return () => {};
    }
    let paused = false;
    let pause = () => {
      if (controller.isPlaying) {
        controller.pause("user");
        paused = true;
      }
    };
    controller.addEventListener("playbackstatechange", pause);
    pause();
    return play => {
      controller.removeEventListener("playbackstatechange", pause);
      if (play && paused) {
        controller.play();
      }
    };
  },
};
