/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global pref */

// Home and new tab
pref("browser.startup.homepage", "https://www.levihanlen.com/search");
pref("browser.custom.newTabURL", "https://www.levihanlen.com/search");

// Search engine added and made the default once per profile by CustomStartup.
pref("browser.custom.searchEngine.name", "levihanlen.com");
pref(
  "browser.custom.searchEngine.url",
  "https://www.levihanlen.com/search?q={searchTerms}"
);

// Tabs
pref("browser.tabs.closeWindowWithLastTab", false);
pref("browser.tabs.loadInBackground", false);

// Telemetry, studies and experiments
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.usage.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("toolkit.telemetry.archive.enabled", false);
pref("app.normandy.enabled", false);
pref("app.shield.optoutstudies.enabled", false);
pref("nimbus.rollouts.enabled", false);

// Sponsored content and recommendations
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons", false);
pref(
  "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features",
  false
);
pref("browser.discovery.enabled", false);

// Mozilla first-run and what's-new pages
pref("browser.aboutwelcome.enabled", false);
pref("startup.homepage_welcome_url", "");
pref("startup.homepage_override_url", "");
