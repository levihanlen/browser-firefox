/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  SiteTimer,
  timedSiteFor,
} from "moz-src:///browser/custom/SiteTimer.sys.mjs";

const ENABLED_PREF = "browser.custom.siteTimer.blockEmbeds";
const CONTRACT_ID = "@levihanlen.com/embed-blocker;1";
const CLASS_ID = Components.ID("{b1338f69-d3cd-4c2b-9dcc-8ca248a74bd9}");

/**
 * The URL a Blocked Page was blocked from loading.
 *
 * @param {string} documentURI
 *   The Blocked Page's about:neterror URL.
 * @returns {?nsIURI}
 */
export function blockedURI(documentURI) {
  try {
    return Services.io.newURI(new URL(documentURI).searchParams.get("u"));
  } catch {
    return null;
  }
}

/**
 * The page to open in a tab for an embed, since a player on its own makes a
 * poor page: YouTube's /embed/ID opens as the video's watch page, Spotify's
 * /embed/track/ID as the track, and so on. Anything else opens as it is.
 *
 * @param {string} url
 *   The embed's URL.
 * @returns {string}
 */
export function pageURLFor(url) {
  let embed = URL.parse(url);
  let site;
  try {
    site = Services.eTLD.getBaseDomainFromHost(embed.hostname);
  } catch {
    return url;
  }
  let path = embed.pathname.split("/").filter(Boolean);
  let params = embed.searchParams;
  switch (site) {
    case "youtube.com":
    case "youtube-nocookie.com": {
      if (path[0] != "embed" || !path[1]) {
        break;
      }
      let page;
      if (path[1] == "videoseries" && params.has("list")) {
        page = new URL("https://www.youtube.com/playlist");
      } else if (path[1] == "live_stream" && params.has("channel")) {
        let channel = encodeURIComponent(params.get("channel"));
        return `https://www.youtube.com/channel/${channel}/live`;
      } else {
        page = new URL("https://www.youtube.com/watch");
        page.searchParams.set("v", path[1]);
        if (params.has("start")) {
          page.searchParams.set("t", `${params.get("start")}s`);
        }
      }
      if (params.has("list")) {
        page.searchParams.set("list", params.get("list"));
      }
      return page.href;
    }
    case "spotify.com":
      if (path[0] == "embed" && path.length > 1) {
        return `https://open.spotify.com/${path.slice(1).join("/")}`;
      }
      break;
    case "twitch.tv":
      if (embed.hostname == "player.twitch.tv" && params.has("channel")) {
        let channel = encodeURIComponent(params.get("channel"));
        return `https://www.twitch.tv/${channel}`;
      }
      if (embed.hostname == "player.twitch.tv" && params.has("video")) {
        let video = encodeURIComponent(params.get("video").replace(/^v/, ""));
        return `https://www.twitch.tv/videos/${video}`;
      }
      if (embed.hostname == "clips.twitch.tv" && params.has("clip")) {
        return `https://clips.twitch.tv/${encodeURIComponent(params.get("clip"))}`;
      }
      break;
    case "twitter.com":
    case "x.com":
      if (path.at(-1) == "Tweet.html" && params.has("id")) {
        return `https://x.com/i/status/${encodeURIComponent(params.get("id"))}`;
      }
      break;
  }
  return url;
}

/**
 * Keeps timed sites, such as YouTube, from loading in frames on other sites,
 * where SiteTimer's lock can't reach them. The frame shows Firefox's Blocked
 * Page, which EmbedBlockerChild turns into the site's name and an Open in new
 * tab button, and that tab is locked like any other. Frames on the timed site
 * itself, such as YouTube's own live chat, load as usual.
 */
export const EmbedBlocker = {
  init() {
    Components.manager
      .QueryInterface(Ci.nsIComponentRegistrar)
      .registerFactory(CLASS_ID, "EmbedBlocker", CONTRACT_ID, this);
    Services.catMan.addCategoryEntry(
      "content-policy",
      CONTRACT_ID,
      CONTRACT_ID,
      false,
      true
    );
    ChromeUtils.registerWindowActor("EmbedBlocker", {
      parent: {
        esModuleURI: "moz-src:///browser/custom/EmbedBlockerParent.sys.mjs",
      },
      child: {
        esModuleURI: "moz-src:///browser/custom/EmbedBlockerChild.sys.mjs",
        events: { DOMContentLoaded: {} },
      },
      matches: ["about:neterror?e=blockedByPolicy*"],
      allFrames: true,
      // The Blocked Page shares the embedding page's process. The most it can
      // ask for is a tab on the timed site it was blocked from.
      safeForUntrustedWebProcess: true,
    });
  },

  get enabled() {
    return SiteTimer.enabled && Services.prefs.getBoolPref(ENABLED_PREF, false);
  },

  /**
   * @param {nsIURI} uri
   * @param {?BrowsingContext} browsingContext
   *   The frame about to load `uri`.
   * @returns {boolean}
   *   Whether `uri` is on a timed site that the frame's tab isn't on.
   */
  isBlocked(uri, browsingContext) {
    let site = this.enabled && timedSiteFor(uri);
    return !!site && timedSiteFor(browsingContext?.top.currentURI) != site;
  },

  shouldLoad(contentLocation, loadInfo) {
    return loadInfo.externalContentPolicyType ==
      Ci.nsIContentPolicy.TYPE_SUBDOCUMENT &&
      this.isBlocked(contentLocation, loadInfo.browsingContext)
      ? Ci.nsIContentPolicy.REJECT_POLICY
      : Ci.nsIContentPolicy.ACCEPT;
  },

  shouldProcess() {
    return Ci.nsIContentPolicy.ACCEPT;
  },

  createInstance(iid) {
    return this.QueryInterface(iid);
  },

  QueryInterface: ChromeUtils.generateQI(["nsIContentPolicy", "nsIFactory"]),
};
