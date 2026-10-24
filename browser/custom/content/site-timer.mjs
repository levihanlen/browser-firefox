/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_MINUTES = 600;

function formatMinutes(minutes) {
  return minutes == 1 ? "1 minute" : `${minutes} minutes`;
}

window.addEventListener("DOMContentLoaded", () => {
  // Opened by SiteTimer.prompt, which reads the answer back from these args.
  let [args] = window.arguments;
  let form = document.getElementById("site-timer");
  let heading = document.getElementById("heading");
  let purpose = document.getElementById("purpose");
  let minutes = document.getElementById("minutes");
  let minutesLabel = document.getElementById("minutes-label");
  let submit = document.getElementById("submit");

  if (args.timeUp) {
    heading.textContent = `Time's up on ${args.site}`;
    let summary = document.getElementById("summary");
    summary.textContent = args.purpose
      ? `You gave yourself ${formatMinutes(args.plannedMinutes)} for “${args.purpose}”.`
      : `You gave yourself ${formatMinutes(args.plannedMinutes)}.`;
    summary.hidden = false;
    document.getElementById("purpose-field").hidden = true;
    minutesLabel.textContent = "How many more minutes?";
    submit.textContent = "Keep going";
  } else {
    heading.textContent = args.site;
    minutesLabel.textContent = "How many minutes will it take?";
    submit.textContent = "Start";
  }

  let enteredMinutes = () => {
    let value = Number(minutes.value);
    return minutes.value &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= MAX_MINUTES
      ? value
      : 0;
  };
  minutes.addEventListener("input", () => {
    submit.disabled = !enteredMinutes();
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!enteredMinutes()) {
      return;
    }
    args.minutes = enteredMinutes();
    if (!args.timeUp) {
      args.purpose = purpose.value.trim();
    }
    window.close();
  });

  document.getElementById("close-tab").addEventListener("click", () => {
    args.closeTab = true;
    window.close();
  });

  // Escape would close the prompt without an answer.
  window.addEventListener("keydown", event => {
    if (event.key == "Escape") {
      event.preventDefault();
    }
  });
});
