/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Passes PASS_EVENT on to CustomGatekeeperParent from pages on Levi's own
 * sites, which ask their own Gatekeeper question before sending you to a site.
 */
export class CustomGatekeeperChild extends JSWindowActorChild {
  handleEvent(event) {
    if (typeof event.detail == "string") {
      this.sendAsyncMessage("CustomGatekeeper:Pass", { url: event.detail });
    }
  }
}
