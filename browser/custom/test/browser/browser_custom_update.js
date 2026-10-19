/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { CustomUpdate } = ChromeUtils.importESModule(
  "moz-src:///browser/custom/CustomUpdate.sys.mjs"
);

let updatesDir;

function updateBar() {
  return gNotificationBox.getNotificationWithValue("lh-update");
}

async function stage(commit, subject) {
  await IOUtils.writeJSON(PathUtils.join(updatesDir, "update.json"), {
    commit,
    subject,
    builtAt: "2026-10-19T00:00:00Z",
  });
}

add_setup(async function () {
  updatesDir = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "lh-updates"
  );
  registerCleanupFunction(async () => {
    updateBar()?.close();
    await IOUtils.remove(updatesDir, { recursive: true });
  });
});

add_task(async function test_dev_builds_do_not_update() {
  Assert.equal(
    await CustomUpdate.readCurrentBuild(),
    null,
    "Builds not made by ./lh install have no build info"
  );
  Assert.equal(CustomUpdate.currentBuild, null);
});

add_task(async function test_bar_shows_for_a_newer_build() {
  await stage("new-commit", "Make tabs rounder");
  await CustomUpdate.check({ updatesDir, currentBuild: { commit: "old" } });

  let bar = updateBar();
  Assert.ok(bar, "The update bar is shown");
  Assert.ok(bar.messageText.textContent.includes("Make tabs rounder"));
  Assert.equal(CustomUpdate.stagedUpdate.updatesDir, updatesDir);

  await CustomUpdate.check({ updatesDir, currentBuild: { commit: "old" } });
  Assert.equal(
    gNotificationBox.allNotifications.filter(
      n => n.getAttribute("value") == "lh-update"
    ).length,
    1,
    "Checking again doesn't add a second bar"
  );
});

add_task(async function test_bar_goes_away_once_installed() {
  await stage("new-commit", "Make tabs rounder");
  await CustomUpdate.check({ updatesDir, currentBuild: { commit: "old" } });
  Assert.ok(updateBar());

  await CustomUpdate.check({
    updatesDir,
    currentBuild: { commit: "new-commit" },
  });
  await TestUtils.waitForCondition(() => !updateBar());
  Assert.equal(CustomUpdate.stagedUpdate, null);
});

add_task(async function test_no_bar_without_a_staged_build() {
  await IOUtils.remove(PathUtils.join(updatesDir, "update.json"));
  await CustomUpdate.check({ updatesDir, currentBuild: { commit: "old" } });
  Assert.ok(!updateBar());
  Assert.equal(CustomUpdate.stagedUpdate, null);
});
