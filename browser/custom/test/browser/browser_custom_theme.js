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
const SITE_LIGHT = "rgb(57, 57, 60)";
const SITE_FONT = "Custom EB Garamond";
const ROW = 32;

// The custom pages' stylesheets, read as text and held to life-nextjs's
// rules, as its designSystem.test.ts holds the site's pages.
const SHEETS = [
  "theme.css",
  "site-timer.css",
  "gatekeeper.css",
  "embed-blocked.css",
  "tab-number-hints.css",
];

const RULES = [
  {
    rule: "colors are solid: nothing see-through",
    pattern:
      /\b(?:rgba|hsla)\(|\b(?:rgb|hsl|oklch)\([^)]*\/|#[0-9a-f]{8}\b|\bopacity:/i,
  },
  {
    rule: "corners are square",
    pattern: /border-radius[\w-]*:\s*(?!\s|0\b|0px\b|0 !|var\()/,
  },
  {
    rule: "no shadows",
    pattern: /box-shadow[\w-]*:\s*(?!\s|none\b|transparent\b|var\()/,
  },
  {
    rule: "the smallest size is 14px",
    pattern:
      /font-size[\w-]*:\s*(?:[0-9]|1[0-3])(?:\.\d+)?px|font-size[\w-]*:\s*0?\.\d+(?:rem|em)/,
  },
  {
    rule: "two weights: normal and 500",
    pattern: /font-weight[\w-]*:\s*(?!\s|normal\b|500\b|var\(|400 800)/,
  },
  { rule: "one font: nothing is monospace", pattern: /\bmonospace\b/ },
  {
    rule: "nothing animates",
    pattern: /\btransition:\s*(?!\s|none\b)|\banimation:\s*(?!\s|none\b)/,
  },
  { rule: "lines are solid", pattern: /\b(?:dashed|dotted)\b/ },
];

function isRegistered() {
  return sheetService.sheetRegistered(
    CustomTheme.SHEET_URI,
    sheetService.USER_SHEET
  );
}

function toolboxBackground() {
  return getComputedStyle(document.getElementById("nav-bar")).backgroundColor;
}

function box(element) {
  return element.getBoundingClientRect();
}

add_task(function test_browser_window_is_themed() {
  Assert.ok(isRegistered(), "The theme sheet is registered");
  Assert.equal(toolboxBackground(), SITE_BACKGROUND);

  let label = gBrowser.selectedTab.querySelector(".tab-label");
  Assert.ok(getComputedStyle(label).fontFamily.includes(SITE_FONT));
  Assert.equal(getComputedStyle(label).fontSize, "14px", "Text is text-sm");

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

add_task(function test_every_line_is_a_row() {
  for (let id of ["TabsToolbar", "nav-bar"]) {
    Assert.equal(
      box(document.getElementById(id)).height,
      ROW,
      `${id} is one row`
    );
  }
  Assert.equal(box(gBrowser.selectedTab).height, ROW, "A tab is one row");
  Assert.equal(box(gURLBar.querySelector(".urlbar-background")).height, ROW);

  let back = document.getElementById("back-button");
  let forward = document.getElementById("forward-button");
  for (let button of [back, forward]) {
    Assert.equal(box(button).width, ROW, `${button.id} is a square`);
    Assert.equal(box(button).height, ROW, `${button.id} is a square`);
  }
  if (back.nextElementSibling == forward) {
    Assert.equal(box(back).right, box(forward).left, "Squares touch");
  }

  let close = gBrowser.selectedTab.querySelector(".tab-close-button");
  Assert.equal(box(close).width, ROW, "Close is a square");
  Assert.equal(box(close).right, box(gBrowser.selectedTab).right);
});

add_task(function test_icons_are_tabler() {
  Assert.equal(
    getComputedStyle(document.getElementById("back-button")).listStyleImage,
    'url("chrome://browser/content/custom/icons/arrow-left.svg")'
  );
});

add_task(async function test_menu_rows() {
  let menu = document.getElementById("tabContextMenu");
  let shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  menu.openPopup(gBrowser.selectedTab, "after_start");
  await shown;

  for (let item of menu.querySelectorAll(":scope > menuitem:not([hidden])")) {
    Assert.equal(box(item).height, ROW, `${item.id} is one row`);
    Assert.equal(getComputedStyle(item).textTransform, "lowercase");
  }

  let hidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.hidePopup();
  await hidden;
});

add_task(function test_page_names_keep_their_case() {
  Assert.equal(
    getComputedStyle(gBrowser.selectedTab.querySelector(".tab-label"))
      .textTransform,
    "none",
    "A tab's title is written by the page"
  );
});

add_task(function test_nothing_animates() {
  Assert.equal(Services.prefs.getIntPref("ui.prefersReducedMotion"), 1);
  for (let element of document.querySelectorAll(
    "#navigator-toolbox .toolbarbutton-icon, .tabbrowser-tab"
  )) {
    Assert.ok(
      getComputedStyle(element)
        .transitionDuration.split(",")
        .every(duration => parseFloat(duration) == 0),
      "No fade"
    );
  }
});

add_task(async function test_sheets_follow_the_rules() {
  for (let name of SHEETS) {
    let response = await fetch(`chrome://browser/content/custom/${name}`);
    let lines = (await response.text())
      .replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "))
      .split("\n");
    let found = lines.flatMap((line, index) =>
      RULES.filter(({ pattern }) => pattern.test(line)).map(
        ({ rule }) => `${name}:${index + 1}  ${rule}  (${line.trim()})`
      )
    );
    Assert.deepEqual(found, [], `${name} follows the design system`);
  }
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
