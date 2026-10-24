/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* eslint-disable sdl/no-insecure-url */

const { SiteTimer, timedSiteFor } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/SiteTimer.sys.mjs"
);

const TEST_DIR = "browser/browser/custom/test/browser/";
const SITE = "example.org";
const TIMED_URL = `https://example.org/${TEST_DIR}file_site_timer.html`;
const OTHER_ORIGIN_TIMED_URL = `https://test1.example.org/${TEST_DIR}file_site_timer.html`;
const UNTIMED_URL = `https://example.com/${TEST_DIR}file_site_timer.html`;

function uri(spec) {
  return Services.io.newURI(spec);
}

async function waitForPrompt(browser) {
  await TestUtils.waitForCondition(
    () => SiteTimer._prompts.get(browser),
    "Waiting for the site timer prompt"
  );
  let prompt = SiteTimer._prompts.get(browser);
  await prompt.dialog._dialogReady;
  let document = prompt.dialog._frame.contentDocument;
  return {
    ...prompt,
    document,
    window: document.defaultView,
    get: id => document.getElementById(id),
  };
}

async function expectNoPrompt(browser) {
  await TestUtils.waitForTick();
  await TestUtils.waitForTick();
  Assert.ok(!SiteTimer._prompts.has(browser), "No prompt");
}

function enterMinutes(prompt, minutes) {
  let input = prompt.get("minutes");
  input.value = String(minutes);
  input.dispatchEvent(new prompt.window.Event("input"));
}

async function answer(prompt, minutes, purpose) {
  if (purpose) {
    prompt.get("purpose").value = purpose;
  }
  enterMinutes(prompt, minutes);
  prompt.get("submit").click();
  await prompt.closed;
}

function resetSessions() {
  for (let session of SiteTimer._sessions.values()) {
    clearTimeout(session.timer);
  }
  SiteTimer._sessions.clear();
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.siteTimer.sites", SITE]],
  });
  registerCleanupFunction(resetSessions);
});

add_task(function test_default_prefs() {
  let defaults = Services.prefs.getDefaultBranch("");
  Assert.ok(defaults.getBoolPref("browser.custom.siteTimer.enabled"));
  let sites = defaults.getStringPref("browser.custom.siteTimer.sites");
  for (let site of ["youtube.com", "spotify.com", "reddit.com"]) {
    Assert.ok(sites.split(",").includes(site), `${site} is timed`);
  }
});

add_task(async function test_timed_site_for() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.siteTimer.sites", "youtube.com, Spotify.com"]],
  });
  for (let [spec, site] of [
    ["https://www.youtube.com/watch?v=a", "youtube.com"],
    ["https://music.youtube.com/", "youtube.com"],
    ["http://youtube.com/", "youtube.com"],
    ["https://open.spotify.com/", "spotify.com"],
  ]) {
    Assert.equal(timedSiteFor(uri(spec)), site, spec);
  }
  for (let spec of [
    "https://notyoutube.com/",
    "https://youtube.com.example.net/",
    "https://www.levihanlen.com/gatekeeper?url=https%3A%2F%2Fyoutube.com",
    "https://127.0.0.1/",
    "about:blank",
    "file:///tmp/youtube.com",
  ]) {
    Assert.equal(timedSiteFor(uri(spec)), null, `${spec} isn't timed`);
  }
  Assert.equal(timedSiteFor(null), null);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_untimed_site_has_no_prompt() {
  await BrowserTestUtils.withNewTab(UNTIMED_URL, expectNoPrompt);
});

add_task(async function test_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.siteTimer.enabled", false]],
  });
  await BrowserTestUtils.withNewTab(TIMED_URL, expectNoPrompt);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_asks_how_long() {
  await BrowserTestUtils.withNewTab(TIMED_URL, async browser => {
    let prompt = await waitForPrompt(browser);
    Assert.equal(prompt.get("heading").textContent, SITE);
    Assert.ok(prompt.get("summary").hidden);
    Assert.ok(!prompt.get("purpose-field").hidden);
    Assert.equal(prompt.get("submit").textContent, "Start");
    Assert.ok(prompt.get("submit").disabled, "Needs minutes");

    for (let invalid of ["0", "-3", "2.5", "601"]) {
      enterMinutes(prompt, invalid);
      Assert.ok(prompt.get("submit").disabled, `${invalid} isn't accepted`);
    }

    EventUtils.synthesizeKey("KEY_Escape", {}, prompt.window);
    await TestUtils.waitForTick();
    Assert.ok(!prompt.dialog._isClosing, "Escape doesn't dismiss the prompt");

    let before = Date.now();
    await answer(prompt, 5, "  learn a chord ");
    let session = SiteTimer._sessions.get(SITE);
    Assert.equal(session.plannedMinutes, 5);
    Assert.equal(session.purpose, "learn a chord");
    Assert.greaterOrEqual(session.deadline, before + 5 * 60 * 1000);
    Assert.lessOrEqual(session.deadline, Date.now() + 5 * 60 * 1000);

    let loaded = BrowserTestUtils.browserLoaded(browser);
    BrowserTestUtils.startLoadingURIString(browser, TIMED_URL + "?next");
    await loaded;
    await expectNoPrompt(browser);

    await BrowserTestUtils.withNewTab(OTHER_ORIGIN_TIMED_URL, expectNoPrompt);
  });
  resetSessions();
});

add_task(async function test_close_tab_before_starting() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TIMED_URL);
  let prompt = await waitForPrompt(tab.linkedBrowser);
  let closing = BrowserTestUtils.waitForTabClosing(tab);
  prompt.get("close-tab").click();
  await closing;
  await prompt.closed;
  Assert.ok(!SiteTimer._sessions.has(SITE));
});

add_task(async function test_time_up_interrupts_every_tab_on_the_site() {
  SiteTimer.start(SITE, 5, "learn a chord");
  let first = await BrowserTestUtils.openNewForegroundTab(gBrowser, TIMED_URL);
  let second = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    OTHER_ORIGIN_TIMED_URL
  );
  let untimed = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNTIMED_URL
  );
  for (let tab of [first, second, untimed]) {
    await expectNoPrompt(tab.linkedBrowser);
  }

  SiteTimer.timeUp(SITE);
  let firstPrompt = await waitForPrompt(first.linkedBrowser);
  let secondPrompt = await waitForPrompt(second.linkedBrowser);
  await expectNoPrompt(untimed.linkedBrowser);

  Assert.equal(firstPrompt.get("heading").textContent, `Time's up on ${SITE}`);
  Assert.equal(
    firstPrompt.get("summary").textContent,
    "You gave yourself 5 minutes for “learn a chord”."
  );
  Assert.ok(firstPrompt.get("purpose-field").hidden);
  Assert.equal(firstPrompt.get("submit").textContent, "Keep going");

  await answer(firstPrompt, 1);
  await secondPrompt.closed;
  await expectNoPrompt(second.linkedBrowser);
  let session = SiteTimer._sessions.get(SITE);
  Assert.equal(session.plannedMinutes, 6);
  Assert.equal(session.purpose, "learn a chord");

  SiteTimer.timeUp(SITE);
  firstPrompt = await waitForPrompt(first.linkedBrowser);
  Assert.equal(
    firstPrompt.get("summary").textContent,
    "You gave yourself 6 minutes for “learn a chord”."
  );

  for (let tab of [first, second, untimed]) {
    BrowserTestUtils.removeTab(tab);
  }
  await firstPrompt.closed;
  await TestUtils.waitForCondition(
    () => !SiteTimer._sessions.has(SITE),
    "The time is over once no tab is on the site"
  );
});

add_task(async function test_close_tab_when_time_is_up() {
  SiteTimer.start(SITE, 5);
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TIMED_URL);
  SiteTimer.timeUp(SITE);
  let prompt = await waitForPrompt(tab.linkedBrowser);
  Assert.equal(
    prompt.get("summary").textContent,
    "You gave yourself 5 minutes."
  );
  let closing = BrowserTestUtils.waitForTabClosing(tab);
  prompt.get("close-tab").click();
  await closing;
  await prompt.closed;
  Assert.ok(!SiteTimer._sessions.has(SITE));

  await BrowserTestUtils.withNewTab(TIMED_URL, async browser => {
    prompt = await waitForPrompt(browser);
    Assert.equal(
      prompt.get("heading").textContent,
      SITE,
      "The next visit starts over"
    );
  });
  resetSessions();
});

add_task(async function test_time_up_with_no_tab_open() {
  SiteTimer.start(SITE, 5);
  SiteTimer.timeUp(SITE);
  Assert.ok(!SiteTimer._sessions.has(SITE));
});

add_task(async function test_timer_fires_on_time() {
  SiteTimer.start(SITE, 5);
  await BrowserTestUtils.withNewTab(TIMED_URL, async browser => {
    await expectNoPrompt(browser);
    SiteTimer.start(SITE, 0.005);
    let prompt = await waitForPrompt(browser);
    Assert.equal(prompt.get("heading").textContent, `Time's up on ${SITE}`);
  });
  resetSessions();
});

add_task(async function test_prompt_follows_navigation() {
  await BrowserTestUtils.withNewTab(TIMED_URL, async browser => {
    let prompt = await waitForPrompt(browser);

    await BrowserTestUtils.reloadTab(gBrowser.selectedTab);
    await TestUtils.waitForTick();
    Assert.ok(!prompt.dialog._isClosing, "Reloading keeps the prompt");

    let loaded = BrowserTestUtils.browserLoaded(browser);
    BrowserTestUtils.startLoadingURIString(browser, OTHER_ORIGIN_TIMED_URL);
    await loaded;
    await prompt.closed;
    prompt = await waitForPrompt(browser);
    Assert.equal(
      prompt.get("heading").textContent,
      SITE,
      "Another part of the site asks again"
    );

    loaded = BrowserTestUtils.browserLoaded(browser);
    BrowserTestUtils.startLoadingURIString(browser, UNTIMED_URL);
    await loaded;
    await prompt.closed;
    await expectNoPrompt(browser);
  });
  resetSessions();
});

add_task(async function test_media_pauses_until_answered() {
  SiteTimer.start(SITE, 5);
  await BrowserTestUtils.withNewTab(TIMED_URL, async browser => {
    let controller = browser.browsingContext.mediaController;
    // Under the prompt, play() can be cut short by the pause.
    let play = () =>
      SpecialPowers.spawn(browser, [], () =>
        content.document
          .getElementById("video")
          .play()
          .catch(() => {})
      );
    let isPaused = () =>
      SpecialPowers.spawn(
        browser,
        [],
        () => content.document.getElementById("video").paused
      );

    await play();
    await TestUtils.waitForCondition(() => controller.isPlaying, "Playing");

    SiteTimer.timeUp(SITE);
    let prompt = await waitForPrompt(browser);
    await TestUtils.waitForCondition(() => !controller.isPlaying, "Paused");
    Assert.ok(await isPaused());

    await play();
    await TestUtils.waitForCondition(
      async () => !controller.isPlaying && (await isPaused()),
      "Media started under the prompt is paused too"
    );

    await answer(prompt, 1);
    await TestUtils.waitForCondition(
      () => controller.isPlaying,
      "Plays again once more time is given"
    );
    Assert.ok(!(await isPaused()));
  });
  resetSessions();
});
