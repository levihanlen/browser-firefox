/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomGatekeeper: "moz-src:///browser/custom/CustomGatekeeper.sys.mjs",
  isOwnHost: "moz-src:///browser/custom/CustomGatekeeper.sys.mjs",
});

/**
 * Lets a site through for a page on one of Levi's own sites. The child is only
 * registered on those, but runs in a web content process, so the page is
 * checked again here.
 */
export class CustomGatekeeperParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    let page = this.manager.documentURI;
    if (
      name == "CustomGatekeeper:Pass" &&
      (page?.schemeIs("http") || page?.schemeIs("https")) &&
      lazy.isOwnHost(page.host)
    ) {
      lazy.CustomGatekeeper.letURLThrough(data.url);
    }
  }
}
