/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { blockedURI } from "moz-src:///browser/custom/EmbedBlocker.sys.mjs";
import { timedSiteFor } from "moz-src:///browser/custom/SiteTimer.sys.mjs";

const SHEET_URL = "chrome://browser/content/custom/embed-blocked.css";

/**
 * Turns the Blocked Page in a frame EmbedBlocker blocked into the timed site's
 * name and an Open in new tab button. Blocked Pages for anything else are left
 * alone.
 */
export class EmbedBlockerChild extends JSWindowActorChild {
  handleEvent() {
    let site = timedSiteFor(blockedURI(this.document.documentURI));
    if (!site || !this.browsingContext.parent) {
      return;
    }
    let document = this.document;
    let body = document.createElement("body");
    body.className = "embed-blocked";
    let name = document.createElement("p");
    name.textContent = site;
    let open = document.createElement("button");
    open.className = "primary";
    open.textContent = "Open in new tab";
    open.addEventListener("click", () =>
      this.sendAsyncMessage("EmbedBlocker:Open")
    );
    body.append(name, open);
    let { windowUtils } = this.contentWindow;
    windowUtils.loadSheetUsingURIString(SHEET_URL, windowUtils.AUTHOR_SHEET);
    document.body = body;
  }
}
