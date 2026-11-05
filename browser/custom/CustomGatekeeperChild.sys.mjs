/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  startingMinutes: "moz-src:///browser/custom/CustomGatekeeper.sys.mjs",
});

/**
 * Passes PASS_EVENT on to CustomGatekeeperParent from pages on Levi's own
 * sites, which ask their own Gatekeeper question before sending you to a site,
 * and answers ASK_EVENT, so they can offer the same minutes.
 */
export class CustomGatekeeperChild extends JSWindowActorChild {
  handleEvent(event) {
    if (typeof event.detail != "string") {
      return;
    }
    if (event.type == "lh-gatekeeper-ask") {
      let window = this.contentWindow;
      window.dispatchEvent(
        new window.CustomEvent("lh-gatekeeper-minutes", {
          detail: lazy.startingMinutes(event.detail),
        })
      );
      return;
    }
    let { url, minutes } = event.detail.startsWith("{")
      ? JSON.parse(event.detail)
      : { url: event.detail };
    this.sendAsyncMessage("CustomGatekeeper:Pass", { url, minutes });
  }
}
