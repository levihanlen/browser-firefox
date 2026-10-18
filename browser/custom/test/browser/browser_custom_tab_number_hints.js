/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { getTabNumberHint } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/TabNumberHints.sys.mjs"
);

function visibleHints() {
  return gBrowser.visibleTabs.map(tab => tab.getAttribute("custom-tab-hint"));
}

async function waitForHints(expected, message) {
  await TestUtils.waitForCondition(
    () => JSON.stringify(visibleHints()) == JSON.stringify(expected),
    message
  );
  Assert.deepEqual(visibleHints(), expected, message);
}

function addBlankTabs(count) {
  return Array.from({ length: count }, () =>
    BrowserTestUtils.addTab(gBrowser, "about:blank")
  );
}

async function removeTabs(tabs) {
  for (let tab of tabs) {
    await BrowserTestUtils.removeTab(tab);
  }
}

add_task(function test_hint_numbers() {
  Assert.equal(getTabNumberHint(0, 3), 1);
  Assert.equal(getTabNumberHint(2, 3), 3);
  Assert.equal(getTabNumberHint(7, 12), 8);
  Assert.equal(getTabNumberHint(8, 12), null);
  Assert.equal(getTabNumberHint(8, 9), 9);
  Assert.equal(getTabNumberHint(11, 12), 9);
});

add_task(async function test_hints_match_shortcuts() {
  let firstTab = gBrowser.selectedTab;
  let tabs = addBlankTabs(10);
  await waitForHints(
    ["1", "2", "3", "4", "5", "6", "7", "8", null, null, "9"],
    "First eight tabs are numbered and the last tab gets 9"
  );

  gBrowser.selectTabAtIndex(7);
  Assert.equal(gBrowser.selectedTab.getAttribute("custom-tab-hint"), "8");
  gBrowser.selectTabAtIndex(-1);
  Assert.equal(gBrowser.selectedTab.getAttribute("custom-tab-hint"), "9");
  gBrowser.selectedTab = firstTab;

  await removeTabs(tabs.slice(2));
  await waitForHints(["1", "2", "3"], "Hints update when tabs close");

  gBrowser.hideTab(tabs[0]);
  await waitForHints(["1", "2"], "Hidden tabs are skipped");
  gBrowser.showTab(tabs[0]);
  await waitForHints(["1", "2", "3"], "Shown tabs are numbered again");

  await removeTabs(tabs.slice(0, 2));
});

add_task(async function test_pref_turns_hints_off() {
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  await waitForHints(["1", "2"], "Hints are on by default");

  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.tabNumberHints.enabled", false]],
  });
  await waitForHints([null, null], "Hints are removed when the pref is off");
  await SpecialPowers.popPrefEnv();
  await waitForHints(["1", "2"], "Hints come back when the pref is on");

  await removeTabs([tab]);
});

add_task(async function test_hint_is_rendered() {
  await waitForHints(["1"], "The only tab is numbered");
  let label = gBrowser.selectedTab.querySelector(".tab-label");
  Assert.equal(getComputedStyle(label, "::before").content, '"(1)"');
});
