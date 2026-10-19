/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Updates built from the source tree by `./lh install`.
 *
 * `./lh install` stages a new build in <profile root>/updates with an
 * update.json describing it. This module offers a restart when one is
 * waiting, and on quit runs updates/apply-update.sh, which swaps the new
 * build into /Applications once the browser has exited. Builds that weren't
 * installed by `./lh install` (such as `./mach run`) carry no lh-build.json
 * and never look for updates.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const NOTIFICATION_VALUE = "lh-update";
const FIRST_CHECK_DELAY_MS = 10 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

export const CustomUpdate = {
  currentBuild: null,
  stagedUpdate: null,
  relaunchAfterQuit: false,
  _timer: null,

  get updatesDir() {
    return PathUtils.join(
      Services.dirsvc.get("UAppData", Ci.nsIFile).path,
      "updates"
    );
  },

  /**
   * Runs before the first window opens, so an update staged while the
   * browser is open is applied on quit however soon that comes.
   */
  init() {
    if (!this.buildInfoFile.exists()) {
      return;
    }
    Services.obs.addObserver(this, "quit-application-granted");
    this.readCurrentBuild().then(build => {
      this.currentBuild = build;
      lazy.setTimeout(() => this.check(), FIRST_CHECK_DELAY_MS);
      this._timer = lazy.setInterval(() => this.check(), CHECK_INTERVAL_MS);
    });
  },

  get buildInfoFile() {
    let file = Services.dirsvc.get("GreD", Ci.nsIFile);
    file.append("lh-build.json");
    return file;
  },

  async readCurrentBuild() {
    try {
      return await IOUtils.readJSON(this.buildInfoFile.path);
    } catch {
      return null;
    }
  },

  /**
   * Looks for a staged build newer than this one and shows or removes the
   * update bar in every window to match.
   *
   * @param {object} [options]
   * @param {string} [options.updatesDir]
   *   Where `./lh install` stages builds. Tests pass their own.
   * @param {?{commit: string}} [options.currentBuild]
   *   The running build, from its lh-build.json.
   */
  async check({
    updatesDir = this.updatesDir,
    currentBuild = this.currentBuild,
  } = {}) {
    let staged = null;
    try {
      staged = await IOUtils.readJSON(
        PathUtils.join(updatesDir, "update.json")
      );
    } catch {}
    if (staged && staged.commit == currentBuild?.commit) {
      staged = null;
    }
    this.stagedUpdate = staged ? { ...staged, updatesDir } : null;

    for (let win of lazy.BrowserWindowTracker.orderedWindows) {
      let box = win.gNotificationBox;
      let existing = box.getNotificationWithValue(NOTIFICATION_VALUE);
      if (!staged) {
        existing?.close();
      } else if (!existing) {
        await box.appendNotification(
          NOTIFICATION_VALUE,
          {
            label: `An update to lh browser is ready: ${staged.subject}`,
            priority: box.PRIORITY_INFO_MEDIUM,
          },
          [
            {
              label: "Restart to update",
              callback: () => {
                this.restartToUpdate();
                return true;
              },
            },
          ]
        );
      }
    }
  },

  restartToUpdate() {
    this.relaunchAfterQuit = true;
    Services.prefs.setBoolPref(
      "browser.sessionstore.resume_session_once",
      true
    );
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
    if (!Services.startup.shuttingDown) {
      this.relaunchAfterQuit = false;
      Services.prefs.clearUserPref("browser.sessionstore.resume_session_once");
    }
  },

  observe(subject, topic) {
    if (topic != "quit-application-granted") {
      return;
    }
    lazy.clearInterval(this._timer);
    // Checked on disk rather than through stagedUpdate, which can be up to a
    // minute old, so an update staged just before quitting still applies.
    // This looks for update.json, not the staged app: macOS hides app bundles
    // made by another program from this one.
    let updateInfo = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    updateInfo.initWithPath(PathUtils.join(this.updatesDir, "update.json"));
    if (updateInfo.exists()) {
      this.applyAfterExit(this.updatesDir, this.relaunchAfterQuit);
    }
  },

  /**
   * Starts apply-update.sh in the background. It waits for this process to
   * exit before swapping the app, and outlives it.
   *
   * @param {string} updatesDir
   * @param {boolean} relaunch
   *   Whether to reopen the browser after swapping it.
   */
  applyAfterExit(updatesDir, relaunch) {
    let sh = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    sh.initWithPath("/bin/sh");
    let process = Cc["@mozilla.org/process/util;1"].createInstance(
      Ci.nsIProcess
    );
    process.init(sh);
    let args = [
      "-c",
      'nohup /bin/sh "$0" "$@" >/dev/null 2>&1 &',
      PathUtils.join(updatesDir, "apply-update.sh"),
    ];
    if (relaunch) {
      args.push("--relaunch");
    }
    process.runw(false, args, args.length);
  },
};
