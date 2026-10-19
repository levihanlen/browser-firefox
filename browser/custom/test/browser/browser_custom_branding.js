/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const BRAND = "lh browser";

add_task(function test_brand_properties() {
  let bundle = Services.strings.createBundle(
    "chrome://branding/locale/brand.properties"
  );
  Assert.equal(bundle.GetStringFromName("brandShortName"), BRAND);
  Assert.equal(bundle.GetStringFromName("brandFullName"), BRAND);
});

add_task(async function test_fluent_brand_terms() {
  let l10n = new Localization([
    "branding/brand.ftl",
    "toolkit/branding/brandings.ftl",
    "browser/aboutDialog.ftl",
    "browser/preferences/preferences.ftl",
  ]);
  let [warning, community] = await l10n.formatValues([
    "warningDesc-version",
    "community-2",
  ]);
  Assert.ok(warning.startsWith(`${BRAND} is`), warning);
  Assert.ok(community.includes("built on Firefox"), community);
  Assert.ok(!warning.includes("Firefox"), warning);
});

add_task(function test_error_strings() {
  let bundle = Services.strings.createBundle(
    "chrome://global/locale/appstrings.properties"
  );
  let message = bundle.GetStringFromName("fileNotFound");
  Assert.ok(message.startsWith(BRAND), message);
});

add_task(function test_helpers_run_in_plugin_container() {
  Assert.ok(
    !Services.prefs.getBoolPref("layers.gpu-process-executable.enabled")
  );
  Assert.ok(!Services.prefs.getBoolPref("media.plugin_helper_process.enabled"));
});

add_task(async function test_logo_is_ours() {
  let response = await fetch("chrome://branding/content/about-logo.svg");
  let svg = await response.text();
  Assert.ok(svg.includes("#111014"), "The logo uses the site's near-black");
});
