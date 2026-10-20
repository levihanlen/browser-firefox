/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ENABLED_PREF = "browser.custom.gatekeeper.enabled";
const URL_PREF = "browser.custom.gatekeeper.url";

/**
 * Hosts the address bar loads directly. Everything else goes to the
 * Gatekeeper page, which decides what to let through.
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

/**
 * Sends sites typed or picked in the address bar through the Gatekeeper page
 * on levihanlen.com, which asks a question and then sets window.location to
 * the site. Only address bar loads come here, so links and the Gatekeeper's
 * own redirect load normally.
 */
export const CustomGatekeeper = {
  /**
   * @param {string} url
   *   The URL the address bar is about to load.
   * @returns {string}
   *   The URL to load instead: the Gatekeeper page for `url`, or `url` itself
   *   when it's one of Levi's own sites or not a web page.
   */
  gatedURL(url) {
    let gatekeeper = Services.prefs.getStringPref(URL_PREF, "");
    if (!gatekeeper || !Services.prefs.getBoolPref(ENABLED_PREF, false)) {
      return url;
    }
    let uri;
    try {
      uri = Services.io.newURI(url);
    } catch {
      return url;
    }
    if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
      return url;
    }
    if (isOwnHost(uri.host)) {
      return url;
    }
    let gated = new URL(gatekeeper);
    gated.searchParams.set("url", url);
    return gated.href;
  },
};
