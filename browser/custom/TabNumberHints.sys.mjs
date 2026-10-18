/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ENABLED_PREF = "browser.custom.tabNumberHints.enabled";
const HINT_ATTRIBUTE = "custom-tab-hint";
const STYLESHEET = "chrome://browser/content/custom/tab-number-hints.css";

// Everything that can change which tabs gBrowser.visibleTabs returns, and so
// which tab Cmd/Ctrl+1-9 selects.
const TAB_EVENTS = [
  "TabOpen",
  "TabClose",
  "TabMove",
  "TabShow",
  "TabHide",
  "TabPinned",
  "TabUnpinned",
  "TabSelect",
  "TabGrouped",
  "TabUngrouped",
  "TabGroupCollapse",
  "TabGroupExpand",
  "TabGroupRemoved",
  "SplitViewCreated",
  "SplitViewRemoved",
];

/**
 * The shortcut number for the visible tab at `index`, matching
 * Tabbrowser.selectTabAtIndex: Cmd/Ctrl+1-8 pick the first eight tabs and
 * Cmd/Ctrl+9 picks the last one.
 *
 * @param {number} index
 * @param {number} count
 *   The number of visible tabs.
 * @returns {?number}
 */
export function getTabNumberHint(index, count) {
  if (index < 8) {
    return index + 1;
  }
  if (index == count - 1) {
    return 9;
  }
  return null;
}

export const TabNumberHints = {
  initWindow(window) {
    window.windowUtils.loadSheetUsingURIString(
      STYLESHEET,
      window.windowUtils.AUTHOR_SHEET
    );

    let pending = false;
    let scheduleUpdate = () => {
      if (pending) {
        return;
      }
      pending = true;
      window.requestAnimationFrame(() => {
        pending = false;
        this.updateWindow(window);
      });
    };

    for (let type of TAB_EVENTS) {
      window.addEventListener(type, scheduleUpdate);
    }
    Services.prefs.addObserver(ENABLED_PREF, scheduleUpdate);
    window.addEventListener(
      "unload",
      () => Services.prefs.removeObserver(ENABLED_PREF, scheduleUpdate),
      { once: true }
    );

    this.updateWindow(window);
  },

  updateWindow(window) {
    let { gBrowser } = window;
    let hints = new Map();
    if (Services.prefs.getBoolPref(ENABLED_PREF, true)) {
      let visibleTabs = gBrowser.visibleTabs;
      visibleTabs.forEach((tab, index) => {
        let hint = getTabNumberHint(index, visibleTabs.length);
        if (hint) {
          hints.set(tab, String(hint));
        }
      });
    }
    for (let tab of gBrowser.tabs) {
      let hint = hints.get(tab);
      if (hint) {
        tab.setAttribute(HINT_ATTRIBUTE, hint);
      } else {
        tab.removeAttribute(HINT_ATTRIBUTE);
      }
    }
  },
};
