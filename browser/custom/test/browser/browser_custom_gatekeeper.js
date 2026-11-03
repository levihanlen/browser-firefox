/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* eslint-disable sdl/no-insecure-url */

const { CustomGatekeeper, gatedSiteFor, isFlagged } =
  ChromeUtils.importESModule(
    "moz-src:///browser/custom/CustomGatekeeper.sys.mjs"
  );
const { GATEKEEPER_QUESTIONS } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/SiteTimer.sys.mjs"
);
const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);

const TEST_DIR = "browser/browser/custom/test/browser/";
const PAGE = `${TEST_DIR}file_gatekeeper.html`;
const SITE = "example.com";
const OTHER_SITE = "example.org";

/**
 * @param {string} origin
 * @param {string} [to]
 *   Where the page's link and Pass button go.
 * @returns {string}
 */
function pageURL(origin, to) {
  let url = new URL(PAGE, origin);
  if (to) {
    url.searchParams.set("to", to);
  }
  return url.href;
}

const SITE_URL = pageURL(`https://${SITE}`);
const OTHER_URL = pageURL(`https://${OTHER_SITE}`);
// Allowed in add_setup.
const ALLOWED_URL = pageURL("https://example.net");
const OWN_ORIGIN = "http://127.0.0.1:8888";

function uri(spec) {
  return Services.io.newURI(spec);
}

async function waitForCover(browser) {
  await TestUtils.waitForCondition(
    () => CustomGatekeeper._prompts.get(browser),
    "Waiting for the Gatekeeper"
  );
  let prompt = CustomGatekeeper._prompts.get(browser);
  await prompt.dialog._dialogReady;
  let document = prompt.dialog._frame.contentDocument;
  return {
    ...prompt,
    document,
    window: document.defaultView,
    get: id => document.getElementById(id),
  };
}

async function expectNoCover(browser) {
  await TestUtils.waitForTick();
  await TestUtils.waitForTick();
  Assert.ok(!CustomGatekeeper._prompts.has(browser), "No Gatekeeper");
}

/**
 * @param {object} cover
 * @param {boolean} pass
 *   Whether to give the answer that lets the site through.
 */
async function answer(cover, pass) {
  let buttons = [...cover.get("answers").children];
  await TestUtils.waitForCondition(
    () => buttons.every(b => !b.disabled),
    "Waiting for the answers"
  );
  let text = cover.get("question").textContent;
  let question = GATEKEEPER_QUESTIONS.find(q => q.text == text);
  Assert.ok(question, `“${text}” is a Gatekeeper question`);
  Assert.deepEqual(
    buttons.map(b => b.textContent).sort(),
    ["No", "Yes"],
    "Yes and No are the answers"
  );
  buttons.find(b => (b.textContent == question.pass) == pass).click();
}

async function letThrough(browser) {
  let cover = await waitForCover(browser);
  await answer(cover, true);
  await cover.closed;
}

async function load(browser, url) {
  let loaded = BrowserTestUtils.browserLoaded(browser, false, url);
  BrowserTestUtils.startLoadingURIString(browser, url);
  await loaded;
}

async function click(browser, selector, url) {
  let loaded = BrowserTestUtils.browserLoaded(browser, false, url);
  await BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, browser);
  await loaded;
}

function reset() {
  CustomGatekeeper._passes.clear();
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.custom.gatekeeper.allowedHosts", "example.net"],
      ["browser.custom.gatekeeper.waitSeconds", 0],
      ["browser.custom.gatekeeper.flaggedWaitSeconds", 0],
    ],
  });
  registerCleanupFunction(reset);
});

add_task(function test_default_prefs() {
  let defaults = Services.prefs.getDefaultBranch("");
  Assert.ok(defaults.getBoolPref("browser.custom.gatekeeper.enabled"));
  Assert.equal(
    defaults.getIntPref("browser.custom.gatekeeper.graceMinutes"),
    10
  );
  Assert.equal(defaults.getIntPref("browser.custom.gatekeeper.waitSeconds"), 1);
  Assert.equal(
    defaults.getIntPref("browser.custom.gatekeeper.flaggedWaitSeconds"),
    10
  );
  let hosts = defaults
    .getStringPref("browser.custom.gatekeeper.allowedHosts")
    .split(",");
  for (let host of ["keep.google.com", "accounts.google.com"]) {
    Assert.ok(hosts.includes(host), `${host} is allowed`);
  }
  Assert.equal(
    defaults.getPrefType("browser.custom.gatekeeper.url"),
    Ci.nsIPrefBranch.PREF_INVALID,
    "There's no Gatekeeper page to redirect to"
  );
});

add_task(async function test_gated_site_for() {
  await SpecialPowers.pushPrefEnv({
    clear: [["browser.custom.gatekeeper.allowedHosts"]],
  });
  for (let [spec, site] of [
    ["https://en.wikipedia.org/w/index.php?a=1", "wikipedia.org"],
    ["https://docs.github.com/", "github.com"],
    ["https://www.google.com/maps", "google.com"],
    ["https://www.notlevihanlen.com/", "notlevihanlen.com"],
    ["http://192.168.1.1/", "192.168.1.1"],
    ["http://router/", "router"],
  ]) {
    Assert.equal(gatedSiteFor(uri(spec)), site, spec);
  }
  for (let spec of [
    "https://www.levihanlen.com/notes",
    "https://levihanlen.com/",
    "https://WWW.LEVIHANLEN.COM/",
    "http://localhost:3000/home",
    "http://app.localhost:3000/",
    "http://127.0.0.1:8000/",
    "http://[::1]:3000/",
    "https://accounts.google.com/signin",
    "https://keep.google.com/",
    "https://someone.auth0.com/authorize",
    "https://www.youtube.com/watch?v=a",
    "about:preferences",
    "file:///tmp/notes.txt",
  ]) {
    Assert.equal(gatedSiteFor(uri(spec)), null, `${spec} isn't gated`);
  }
  Assert.equal(gatedSiteFor(null), null);
  await SpecialPowers.popPrefEnv();

  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.siteTimer.enabled", false]],
  });
  Assert.equal(
    gatedSiteFor(uri("https://www.youtube.com/")),
    "youtube.com",
    "Timed sites are gated without the site timer"
  );
  await SpecialPowers.popPrefEnv();

  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.gatekeeper.enabled", false]],
  });
  Assert.equal(gatedSiteFor(uri("https://en.wikipedia.org/")), null);
  await SpecialPowers.popPrefEnv();
});

add_task(function test_is_flagged() {
  for (let url of [
    "https://example.com/nsfw-pics",
    "https://www.example.org/r/NSFW/",
    "https://example.com/?q=Spartans",
  ]) {
    Assert.ok(isFlagged(url), `${url} is flagged`);
  }
  for (let url of [
    "https://example.com/sextant",
    "https://www.essex.ac.uk/",
    "https://en.wikipedia.org/",
  ]) {
    Assert.ok(!isFlagged(url), `${url} isn't flagged`);
  }
});

add_task(async function test_typed_site_is_covered() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    let loaded = BrowserTestUtils.browserLoaded(browser, false, OTHER_URL);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      waitForFocus: SimpleTest.waitForFocus,
      value: OTHER_URL,
    });
    EventUtils.synthesizeKey("KEY_Enter");
    await loaded;
    Assert.equal(browser.currentURI.spec, OTHER_URL, "Loads the site itself");

    let cover = await waitForCover(browser);
    Assert.equal(cover.site, OTHER_SITE);
    Assert.equal(cover.get("url").textContent, OTHER_URL);
    Assert.ok(cover.get("flagged").hidden);
    Assert.equal(
      cover.dialog._overlay.getAttribute("hideContent"),
      "true",
      "The page doesn't show around the cover"
    );
    await answer(cover, true);
    await cover.closed;
    Assert.ok(CustomGatekeeper._passes.has(OTHER_SITE));
  });
  reset();
});

add_task(async function test_links_to_other_sites_are_covered() {
  await BrowserTestUtils.withNewTab(
    pageURL(`https://${SITE}`, OTHER_URL),
    async browser => {
      await letThrough(browser);

      let sameSite = pageURL(`https://test1.${SITE}`, OTHER_URL);
      await load(browser, sameSite);
      await expectNoCover(browser);

      await click(browser, "#link", OTHER_URL);
      let cover = await waitForCover(browser);
      Assert.equal(cover.site, OTHER_SITE);
    }
  );
  reset();
});

add_task(async function test_wrong_answer_goes_back() {
  let start = pageURL(`https://${SITE}`, OTHER_URL);
  await BrowserTestUtils.withNewTab(start, async browser => {
    await letThrough(browser);
    await click(browser, "#link", OTHER_URL);
    let cover = await waitForCover(browser);
    await answer(cover, false);
    // Going back can restore the page without loading it again.
    await TestUtils.waitForCondition(
      () => browser.currentURI.spec == start,
      "Waiting to go back"
    );
    await cover.closed;
    await expectNoCover(browser);
  });
  reset();
});

add_task(async function test_wrong_answer_closes_a_tab_with_no_history() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, OTHER_URL);
  let cover = await waitForCover(tab.linkedBrowser);
  let closing = BrowserTestUtils.waitForTabClosing(tab);
  await answer(cover, false);
  await closing;
  await cover.closed;
  Assert.ok(!CustomGatekeeper._passes.has(OTHER_SITE));
});

add_task(async function test_a_pass_covers_every_tab_on_the_site() {
  let first = await BrowserTestUtils.openNewForegroundTab(gBrowser, OTHER_URL);
  let second = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    pageURL(`https://test1.${OTHER_SITE}`)
  );
  let firstCover = await waitForCover(first.linkedBrowser);
  let secondCover = await waitForCover(second.linkedBrowser);
  await answer(secondCover, true);
  await firstCover.closed;
  await expectNoCover(first.linkedBrowser);

  let third = await BrowserTestUtils.openNewForegroundTab(gBrowser, OTHER_URL);
  await expectNoCover(third.linkedBrowser);

  for (let tab of [first, second, third]) {
    BrowserTestUtils.removeTab(tab);
  }
  reset();
});

add_task(async function test_cover_follows_the_tab_to_another_window() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, OTHER_URL);
  let cover = await waitForCover(tab.linkedBrowser);
  let opened = BrowserTestUtils.waitForNewWindow();
  gBrowser.replaceTabWithWindow(tab);
  let win = await opened;
  await cover.closed;
  await waitForCover(win.gBrowser.selectedBrowser);
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_coming_back_after_signing_in() {
  await BrowserTestUtils.withNewTab(SITE_URL, async browser => {
    await letThrough(browser);

    await load(browser, ALLOWED_URL);
    await expectNoCover(browser);
    await load(browser, SITE_URL);
    await expectNoCover(browser);

    await load(browser, ALLOWED_URL);
    await expectNoCover(browser);
    CustomGatekeeper._passes.set(SITE, Date.now() - 11 * 60 * 1000);
    await load(browser, SITE_URL);
    await waitForCover(browser);
  });
  reset();
});

add_task(async function test_the_pass_ends_when_the_last_tab_closes() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, SITE_URL);
  await letThrough(tab.linkedBrowser);
  let before = Date.now();
  BrowserTestUtils.removeTab(tab);
  Assert.greaterOrEqual(
    CustomGatekeeper._passes.get(SITE),
    before,
    "The grace period starts when the tab closes"
  );
  reset();
});

add_task(async function test_own_sites_let_sites_through() {
  let own = pageURL(OWN_ORIGIN, OTHER_URL);
  await BrowserTestUtils.withNewTab(own, async browser => {
    await expectNoCover(browser);
    await click(browser, "#pass", OTHER_URL);
    await expectNoCover(browser);
    Assert.ok(CustomGatekeeper._passes.has(OTHER_SITE));
  });
  reset();
});

add_task(async function test_other_sites_cannot_let_sites_through() {
  await BrowserTestUtils.withNewTab(
    pageURL(`https://${SITE}`, OTHER_URL),
    async browser => {
      await letThrough(browser);
      await click(browser, "#pass", OTHER_URL);
      await waitForCover(browser);
      Assert.ok(!CustomGatekeeper._passes.has(OTHER_SITE));
    }
  );
  reset();
});

add_task(async function test_waits_before_answering() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.custom.gatekeeper.waitSeconds", 60],
      ["browser.custom.gatekeeper.flaggedWaitSeconds", 90],
    ],
  });
  await BrowserTestUtils.withNewTab(OTHER_URL, async browser => {
    let cover = await waitForCover(browser);
    Assert.ok(
      [...cover.get("answers").children].every(b => b.disabled),
      "The answers wait"
    );
    Assert.equal(
      cover.get("wait-note").textContent,
      "wait 60 seconds to answer."
    );
    Assert.ok(cover.get("flagged").hidden);
  });
  await BrowserTestUtils.withNewTab(`${OTHER_URL}?q=nsfw`, async browser => {
    let cover = await waitForCover(browser);
    Assert.ok(!cover.get("flagged").hidden, "Flagged words are pointed out");
    Assert.equal(
      cover.get("wait-note").textContent,
      "wait 90 seconds to answer."
    );
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_escape_keeps_the_cover() {
  await BrowserTestUtils.withNewTab(OTHER_URL, async browser => {
    let cover = await waitForCover(browser);
    EventUtils.synthesizeKey("KEY_Escape", {}, cover.window);
    await TestUtils.waitForTick();
    Assert.ok(!cover.dialog._isClosing, "Escape doesn't dismiss the cover");
  });
});

add_task(async function test_no_cover_where_not_gated() {
  await BrowserTestUtils.withNewTab(pageURL(OWN_ORIGIN), expectNoCover);
  await BrowserTestUtils.withNewTab(ALLOWED_URL, expectNoCover);

  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.gatekeeper.enabled", false]],
  });
  await BrowserTestUtils.withNewTab(OTHER_URL, expectNoCover);
  await SpecialPowers.popPrefEnv();
});
