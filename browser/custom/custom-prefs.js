/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global pref, sticky */

// The prebuilt engine in artifact builds was compiled for Firefox and looks
// for "Firefox GPU Helper" and "Firefox Media Plugin Helper", while this app
// packages "lh browser ..." helpers. Those helpers only exist to carry
// Mozilla's code-signing entitlements, so run both process types in
// plugin-container instead.
pref("layers.gpu-process-executable.enabled", false);
pref("media.plugin_helper_process.enabled", false);

// Theme matching levihanlen.com (CustomTheme.sys.mjs, content/theme.css).
// macOS context menus are drawn natively unless this is off, and native menus
// can't be styled.
pref("browser.custom.theme.enabled", true);
pref("widget.macos.native-context-menus", false);
// Find-in-page highlights in the site's selection colors.
pref("ui.textSelectAttentionBackground", "#dbdbdc");
pref("ui.textSelectAttentionForeground", "#111014");
pref("ui.textHighlightBackground", "#59585b");
pref("ui.textHighlightForeground", "#ffffff");

// Home and new tab
pref("browser.startup.homepage", "https://www.levihanlen.com/home");
pref("browser.custom.newTabURL", "https://www.levihanlen.com/home");

// Search engine added and made the default once per profile by CustomStartup.
pref("browser.custom.searchEngine.name", "levihanlen.com");
pref(
  "browser.custom.searchEngine.url",
  "https://www.levihanlen.com/search?q={searchTerms}"
);

// Sites typed or picked in the address bar open levihanlen.com/gatekeeper
// first (CustomGatekeeper.sys.mjs).
pref("browser.custom.gatekeeper.enabled", true);
pref("browser.custom.gatekeeper.url", "https://www.levihanlen.com/gatekeeper");

// Sites that ask how many minutes they'll take, and interrupt when the time is
// up (SiteTimer.sys.mjs). Registrable domains, so youtube.com covers
// www.youtube.com and music.youtube.com.
pref("browser.custom.siteTimer.enabled", true);
pref(
  "browser.custom.siteTimer.sites",
  "youtube.com,spotify.com,reddit.com,x.com,twitter.com,instagram.com,facebook.com,tiktok.com,netflix.com,twitch.tv"
);

// Address bar: no recommendations. Firefox Suggest resets its own defaults by
// region at startup, so CustomStartup also turns it off once per profile, and
// sticky keeps that user value even while it matches this default.
pref("browser.urlbar.quicksuggest.enabled", false, sticky);
pref("browser.search.suggest.enabled", false);
pref("browser.urlbar.suggest.searches", false);
pref("browser.urlbar.suggest.trending", false);
pref("browser.urlbar.trending.featureGate", false);
pref("browser.urlbar.suggest.recentsearches", false);
pref("browser.urlbar.suggest.topsites", false);
pref("browser.urlbar.suggest.history", false);
pref("browser.urlbar.autoFill", false);

// Tabs
pref("browser.tabs.closeWindowWithLastTab", false);
pref("browser.tabs.loadInBackground", false);
pref("browser.custom.tabNumberHints.enabled", true);

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
