/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* eslint-disable sdl/no-insecure-url */

const { CustomGatekeeper } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/CustomGatekeeper.sys.mjs"
);
const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);

const TEST_DIR = "browser/browser/custom/test/browser/";
const GATEKEEPER_URL = `https://example.com/${TEST_DIR}file_gatekeeper.html`;
const TARGET_URL = `https://example.org/${TEST_DIR}file_search_page.html`;

function gatedURLFor(gatekeeper, target) {
  let url = new URL(gatekeeper);
  url.searchParams.set("url", target);
  return url.href;
}

async function typeInAddressBar(value) {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    waitForFocus: SimpleTest.waitForFocus,
    value,
  });
  EventUtils.synthesizeKey("KEY_Enter");
}

add_task(function test_default_prefs() {
  let defaults = Services.prefs.getDefaultBranch("");
  Assert.ok(defaults.getBoolPref("browser.custom.gatekeeper.enabled"));
  Assert.equal(
    defaults.getStringPref("browser.custom.gatekeeper.url"),
    "https://www.levihanlen.com/gatekeeper"
  );
});

add_task(function test_gated_url() {
  Assert.equal(
    CustomGatekeeper.gatedURL("https://en.wikipedia.org/w/index.php?a=1&b=2"),
    "https://www.levihanlen.com/gatekeeper?url=https%3A%2F%2Fen.wikipedia.org%2Fw%2Findex.php%3Fa%3D1%26b%3D2"
  );
  Assert.equal(
    CustomGatekeeper.gatedURL("http://192.168.1.1/"),
    "https://www.levihanlen.com/gatekeeper?url=http%3A%2F%2F192.168.1.1%2F"
  );
  for (let url of [
    "https://www.levihanlen.com/notes",
    "https://levihanlen.com/",
    "https://WWW.LEVIHANLEN.COM/",
    "http://localhost:3000/home",
    "http://app.localhost:3000/",
    "http://127.0.0.1:8000/",
    "http://[::1]:3000/",
    "https://www.youtube.com/watch?v=a",
    "about:preferences",
    "file:///tmp/notes.txt",
    "not a url",
  ]) {
    Assert.equal(CustomGatekeeper.gatedURL(url), url, `${url} isn't gated`);
  }
  Assert.ok(
    CustomGatekeeper.gatedURL("https://www.notlevihanlen.com/").startsWith(
      "https://www.levihanlen.com/gatekeeper?"
    ),
    "Lookalike hosts are gated"
  );
});

add_task(async function test_timed_sites_are_gated_without_the_site_timer() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.siteTimer.enabled", false]],
  });
  Assert.equal(
    CustomGatekeeper.gatedURL("https://www.youtube.com/"),
    gatedURLFor(
      "https://www.levihanlen.com/gatekeeper",
      "https://www.youtube.com/"
    )
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_gated_url_follows_prefs() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.gatekeeper.enabled", false]],
  });
  Assert.equal(
    CustomGatekeeper.gatedURL("https://example.org/"),
    "https://example.org/"
  );
  await SpecialPowers.popPrefEnv();

  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.gatekeeper.url", GATEKEEPER_URL]],
  });
  Assert.equal(
    CustomGatekeeper.gatedURL("https://example.org/"),
    gatedURLFor(GATEKEEPER_URL, "https://example.org/")
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_typed_site_opens_gatekeeper() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.gatekeeper.url", GATEKEEPER_URL]],
  });
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    let gated = gatedURLFor(GATEKEEPER_URL, TARGET_URL);
    let loaded = BrowserTestUtils.browserLoaded(browser, false, gated);
    await typeInAddressBar(TARGET_URL);
    await loaded;
    Assert.equal(browser.currentURI.spec, gated);
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_gatekeeper_pass_is_not_gated_again() {
  let gatekeeper = GATEKEEPER_URL + "#pass";
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.gatekeeper.url", gatekeeper]],
  });
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    let loaded = BrowserTestUtils.browserLoaded(browser, false, TARGET_URL);
    await typeInAddressBar(TARGET_URL);
    await loaded;
    Assert.equal(browser.currentURI.spec, TARGET_URL);
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_link_clicks_are_not_gated() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.gatekeeper.url", GATEKEEPER_URL]],
  });
  await BrowserTestUtils.withNewTab(TARGET_URL, async browser => {
    let linked = TARGET_URL + "?linked";
    let loaded = BrowserTestUtils.browserLoaded(browser, false, linked);
    await BrowserTestUtils.synthesizeMouseAtCenter("#link", {}, browser);
    await loaded;
    Assert.equal(browser.currentURI.spec, linked);
  });
  await SpecialPowers.popPrefEnv();
});
