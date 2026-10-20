/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SearchService: TestSearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

const CUSTOM_URL = "https://www.levihanlen.com/home";
const SEARCH_URL = "https://www.levihanlen.com/search";

add_setup(async function () {
  await TestUtils.waitForCondition(
    () => Services.prefs.getIntPref("browser.custom.migrationVersion", 0) >= 1,
    "Waiting for CustomStartup's one-time migration to finish"
  );
});

add_task(function test_default_prefs() {
  let defaults = Services.prefs.getDefaultBranch("");
  Assert.equal(defaults.getStringPref("browser.startup.homepage"), CUSTOM_URL);
  Assert.equal(defaults.getStringPref("browser.custom.newTabURL"), CUSTOM_URL);
  Assert.ok(!defaults.getBoolPref("browser.tabs.closeWindowWithLastTab"));
  Assert.ok(!defaults.getBoolPref("browser.tabs.loadInBackground"));
  Assert.ok(!defaults.getBoolPref("datareporting.healthreport.uploadEnabled"));
  Assert.ok(
    !defaults.getBoolPref("datareporting.policy.dataSubmissionEnabled")
  );
  Assert.ok(!defaults.getBoolPref("app.shield.optoutstudies.enabled"));
  Assert.ok(!defaults.getBoolPref("nimbus.rollouts.enabled"));
  Assert.ok(
    !defaults.getBoolPref("browser.newtabpage.activity-stream.showSponsored")
  );
  Assert.ok(
    !defaults.getBoolPref(
      "browser.newtabpage.activity-stream.showSponsoredTopSites"
    )
  );
  Assert.ok(!defaults.getBoolPref("browser.aboutwelcome.enabled"));
});

add_task(function test_new_tab_url() {
  Assert.equal(window.BROWSER_NEW_TAB_URL, CUSTOM_URL);
  Assert.ok(
    isBlankPageURL(CUSTOM_URL),
    "New tabs treat the custom page as blank, so the address bar is focused"
  );
});

add_task(async function test_new_tab_url_follows_pref() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.newTabURL", ""]],
  });
  Assert.equal(window.BROWSER_NEW_TAB_URL, "about:newtab");
  await SpecialPowers.popPrefEnv();
  Assert.equal(window.BROWSER_NEW_TAB_URL, CUSTOM_URL);
});

add_task(async function test_default_search_engine() {
  let engine = await TestSearchService.getDefault();
  Assert.equal(engine.name, "levihanlen.com");
  Assert.equal(
    engine.getSubmission("hello world").uri.spec,
    `${SEARCH_URL}?q=hello+world`
  );
});

add_task(function test_sponsored_suggestions_off() {
  Assert.ok(
    !Services.prefs.getBoolPref("browser.urlbar.suggest.quicksuggest.sponsored")
  );
});
