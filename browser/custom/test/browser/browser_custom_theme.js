/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { CustomTheme } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/CustomTheme.sys.mjs"
);

const sheetService = Cc[
  "@mozilla.org/content/style-sheet-service;1"
].getService(Ci.nsIStyleSheetService);

const SITE_BACKGROUND = "rgb(17, 16, 20)";
const SITE_LIGHT = "rgba(179, 179, 179, 0.25)";
const SITE_FONT = "Custom EB Garamond";

function isRegistered() {
  return sheetService.sheetRegistered(
    CustomTheme.SHEET_URI,
    sheetService.USER_SHEET
  );
}

function toolboxBackground() {
  return getComputedStyle(document.getElementById("nav-bar")).backgroundColor;
}

add_task(function test_browser_window_is_themed() {
  Assert.ok(isRegistered(), "The theme sheet is registered");
  Assert.equal(toolboxBackground(), SITE_BACKGROUND);

  let label = gBrowser.selectedTab.querySelector(".tab-label");
  Assert.ok(getComputedStyle(label).fontFamily.includes(SITE_FONT));

  let tabStyle = getComputedStyle(
    gBrowser.selectedTab.querySelector(".tab-background")
  );
  Assert.equal(tabStyle.borderTopLeftRadius, "0px", "Corners are square");
  Assert.equal(
    tabStyle.backgroundColor,
    SITE_LIGHT,
    "The selected tab takes the light shade"
  );
});

add_task(async function test_font_is_available() {
  let faces = await document.fonts.load(`16px "${SITE_FONT}"`);
  Assert.greater(faces.length, 0, "EB Garamond loads from chrome://");
});

add_task(async function test_web_pages_are_not_themed() {
  await BrowserTestUtils.withNewTab(
    "data:text/html,<p>plain web page</p>",
    async browser => {
      let fontFamily = await SpecialPowers.spawn(
        browser,
        [],
        () => content.getComputedStyle(content.document.body).fontFamily
      );
      Assert.ok(!fontFamily.includes(SITE_FONT), "Web content keeps its font");
    }
  );
});

add_task(async function test_pref_turns_theme_off() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.custom.theme.enabled", false]],
  });
  Assert.ok(!isRegistered(), "The sheet is unregistered");
  Assert.notEqual(toolboxBackground(), SITE_BACKGROUND);

  await SpecialPowers.popPrefEnv();
  Assert.ok(isRegistered(), "The sheet is registered again");
  Assert.equal(toolboxBackground(), SITE_BACKGROUND);
});
