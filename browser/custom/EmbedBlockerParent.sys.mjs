/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  blockedURI: "moz-src:///browser/custom/EmbedBlocker.sys.mjs",
  pageURLFor: "moz-src:///browser/custom/EmbedBlocker.sys.mjs",
  timedSiteFor: "moz-src:///browser/custom/SiteTimer.sys.mjs",
  URILoadingHelper: "resource:///modules/URILoadingHelper.sys.mjs",
});

/**
 * Opens the timed site a frame was blocked from loading in a new tab next to
 * the frame's, where SiteTimer locks it.
 */
export class EmbedBlockerParent extends JSWindowActorParent {
  receiveMessage({ name }) {
    if (name != "EmbedBlocker:Open") {
      return;
    }
    let uri = lazy.blockedURI(this.manager.documentURI?.spec);
    if (!lazy.timedSiteFor(uri)) {
      return;
    }
    lazy.URILoadingHelper.openWebLinkIn(
      this.browsingContext.topChromeWindow,
      lazy.pageURLFor(uri.spec),
      "tab",
      {
        relatedToCurrent: true,
        userContextId: this.browsingContext.originAttributes.userContextId,
      }
    );
  }
}
