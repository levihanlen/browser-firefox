/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { pageURLFor } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/EmbedBlocker.sys.mjs"
);
const { SiteTimer } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/SiteTimer.sys.mjs"
);

const TEST_DIR = "browser/browser/custom/test/browser/";
const SITE = "example.org";
const TIMED_URL = `https://example.org/${TEST_DIR}file_site_timer.html`;
const OTHER_ORIGIN_TIMED_URL = `https://test1.example.org/${TEST_DIR}file_site_timer.html`;
const UNTIMED_URL = `https://example.com/${TEST_DIR}file_site_timer.html`;
const OTHER_UNTIMED_URL = `https://example.net/${TEST_DIR}file_site_timer.html`;

/**
 * Adds a frame loading `src` to the page in `browser`.
 *
 * @param {MozBrowser} browser
 * @param {string} src
 * @returns {Promise<BrowsingContext>}
 *   The frame, once something other than its initial about:blank is in it.
 */
async function addFrame(browser, src) {
  let index = browser.browsingContext.children.length;
  await SpecialPowers.spawn(browser, [src], frameSrc => {
    let frame = content.document.createElement("iframe");
    frame.src = frameSrc;
    content.document.body.append(frame);
  });
  let frame;
  await TestUtils.waitForCondition(() => {
    frame = browser.browsingContext.children[index];
    let spec = frame?.currentWindowGlobal?.documentURI?.spec;
    return spec && spec != "about:blank";
  }, "Waiting for the frame to load");
  return frame;
}

function isBlocked(frame) {
  return frame.currentWindowGlobal.documentURI.spec.startsWith(
    "about:neterror?e=blockedByPolicy"
  );
}

async function getPlaceholder(frame) {
  return SpecialPowers.spawn(frame, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.body?.classList.contains("embed-blocked"),
      "Waiting for the placeholder"
    );
    let { body } = content.document;
    return {
      text: [...body.children].map(child => child.textContent),
      siteShown:
        content.getComputedStyle(body.querySelector("p")).display != "none",
      buttonIsPrimary: body
        .querySelector("button")
        .classList.contains("primary"),
    };
  });
}

function resetSessions() {
  for (let session of SiteTimer._sessions.values()) {
    clearTimeout(session.timer);
  }
  SiteTimer._sessions.clear();
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.custom.siteTimer.sites", SITE],
      ["browser.custom.siteTimer.waitSeconds", 0],
    ],
  });
  registerCleanupFunction(resetSessions);
});

add_task(function test_default_prefs() {
  let defaults = Services.prefs.getDefaultBranch("");
  Assert.ok(defaults.getBoolPref("browser.custom.siteTimer.blockEmbeds"));
  let sites = defaults
    .getStringPref("browser.custom.siteTimer.sites")
    .split(",");
  Assert.ok(sites.includes("youtube.com"));
  Assert.ok(
    sites.includes("youtube-nocookie.com"),
    "YouTube's cookieless embeds are timed too"
  );
});

add_task(function test_page_url_for() {
  for (let [embed, page] of [
    [
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ],
    [
      "https://www.youtube-nocookie.com/embed/abc?start=30&rel=0",
      "https://www.youtube.com/watch?v=abc&t=30s",
    ],
    [
      "https://www.youtube.com/embed/abc?list=PL1",
      "https://www.youtube.com/watch?v=abc&list=PL1",
    ],
    [
      "https://www.youtube.com/embed/videoseries?list=PL1",
      "https://www.youtube.com/playlist?list=PL1",
    ],
    [
      "https://www.youtube.com/embed/live_stream?channel=UC1",
      "https://www.youtube.com/channel/UC1/live",
    ],
    [
      "https://open.spotify.com/embed/track/123?utm_source=generator",
      "https://open.spotify.com/track/123",
    ],
    [
      "https://player.twitch.tv/?channel=someone&parent=example.com",
      "https://www.twitch.tv/someone",
    ],
    [
      "https://player.twitch.tv/?video=v123&parent=example.com",
      "https://www.twitch.tv/videos/123",
    ],
    [
      "https://clips.twitch.tv/embed?clip=Slug&parent=example.com",
      "https://clips.twitch.tv/Slug",
    ],
    [
      "https://platform.twitter.com/embed/Tweet.html?id=20",
      "https://x.com/i/status/20",
    ],
  ]) {
    Assert.equal(pageURLFor(embed), page, embed);
  }
  for (let url of [
    "https://www.youtube.com/watch?v=abc",
    "https://www.youtube.com/embed/",
    "https://www.instagram.com/p/abc/embed/",
    "https://127.0.0.1/embed/abc",
    "not a URL",
  ]) {
    Assert.equal(pageURLFor(url), url, `${url} opens as it is`);
  }
});

add_task(async function test_blocks_timed_embeds() {
  await BrowserTestUtils.withNewTab(UNTIMED_URL, async browser => {
    let frame = await addFrame(browser, TIMED_URL);
    Assert.ok(isBlocked(frame), "The timed site doesn't load in the frame");
    let placeholder = await getPlaceholder(frame);
    Assert.deepEqual(placeholder.text, [SITE, "Open in new tab"]);
    Assert.ok(placeholder.siteShown);
    Assert.ok(placeholder.buttonIsPrimary);

    frame = await addFrame(browser, OTHER_UNTIMED_URL);
    Assert.equal(
      frame.currentWindowGlobal.documentURI.spec,
      OTHER_UNTIMED_URL,
      "Untimed sites load in frames"
    );
  });
});

add_task(async function test_small_embeds_show_just_the_button() {
  await BrowserTestUtils.withNewTab(UNTIMED_URL, async browser => {
    let frame = await addFrame(browser, TIMED_URL);
    await getPlaceholder(frame);
    await SpecialPowers.spawn(browser, [], () => {
      content.document.querySelector("iframe").style.height = "40px";
    });
    await TestUtils.waitForCondition(
      async () => !(await getPlaceholder(frame)).siteShown,
      "The site's name is hidden"
    );
  });
});

add_task(async function test_open_in_new_tab() {
  await BrowserTestUtils.withNewTab(UNTIMED_URL, async browser => {
    let frame = await addFrame(browser, TIMED_URL);
    await getPlaceholder(frame);
    let embedTab = gBrowser.selectedTab;
    let opened = BrowserTestUtils.waitForNewTab(gBrowser, TIMED_URL, true);
    await SpecialPowers.spawn(frame, [], () => {
      content.document.querySelector("button").click();
    });
    let tab = await opened;
    Assert.equal(gBrowser.selectedTab, tab, "The new tab is in front");
    Assert.equal(
      gBrowser.tabs.indexOf(tab),
      gBrowser.tabs.indexOf(embedTab) + 1,
      "The new tab is next to the embed's"
    );
    await TestUtils.waitForCondition(
      () => SiteTimer._prompts.has(tab.linkedBrowser),
      "The new tab is locked"
    );
    BrowserTestUtils.removeTab(tab);
  });
  resetSessions();
});

add_task(async function test_frames_on_the_timed_site_load() {
  await BrowserTestUtils.withNewTab(TIMED_URL, async browser => {
    let frame = await addFrame(browser, OTHER_ORIGIN_TIMED_URL);
    Assert.equal(
      frame.currentWindowGlobal.documentURI.spec,
      OTHER_ORIGIN_TIMED_URL,
      "The timed site's own frames load"
    );
  });
  resetSessions();
});

add_task(async function test_disabled() {
  for (let pref of [
    "browser.custom.siteTimer.blockEmbeds",
    "browser.custom.siteTimer.enabled",
  ]) {
    await SpecialPowers.pushPrefEnv({ set: [[pref, false]] });
    await BrowserTestUtils.withNewTab(UNTIMED_URL, async browser => {
      let frame = await addFrame(browser, TIMED_URL);
      Assert.equal(
        frame.currentWindowGlobal.documentURI.spec,
        TIMED_URL,
        `Embeds load with ${pref} off`
      );
    });
    await SpecialPowers.popPrefEnv();
  }
});
