/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_MINUTES = 600;

// CustomGatekeeper opens this with sizeTo "available", which caps the dialog
// at these sizes, so it covers the whole tab.
document.documentElement.style.maxWidth = "none";
document.documentElement.style.maxHeight = "none";

function formatTime(minutes) {
  let hours = Math.floor(minutes / 60);
  let rest = minutes % 60;
  let parts = [];
  if (hours) {
    parts.push(hours == 1 ? "1 hour" : `${hours} hours`);
  }
  if (rest || !hours) {
    parts.push(rest == 1 ? "1 minute" : `${rest} minutes`);
  }
  return parts.join(" ");
}

window.addEventListener("DOMContentLoaded", () => {
  // Opened by CustomGatekeeper.prompt, which reads the answer back from these
  // args.
  let [args] = window.arguments;
  let main = document.getElementById("gatekeeper");
  let url = document.getElementById("url");
  let minutes = document.getElementById("minutes");
  let leave = document.getElementById("leave");
  url.textContent = args.url;
  document.getElementById("flagged").hidden = !args.flagged;
  document.getElementById("minutes-field").hidden = !args.limited;
  if (args.startMinutes) {
    minutes.value = args.startMinutes;
  }
  if (args.timeUp) {
    document.getElementById("heading").textContent = "Time's up";
    url.textContent = `You've been on ${args.site} for ${formatTime(args.spentMinutes)}.`;
    document.getElementById("minutes-label").textContent =
      "How many more minutes?";
    leave.hidden = false;
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

  let { questions } = args;
  let { text, pass } = questions[Math.floor(Math.random() * questions.length)];
  document.getElementById("question").textContent = text;
  let buttons = ["Yes", "No"].map(answer => {
    let button = document.createElement("button");
    button.type = "button";
    button.textContent = answer;
    button.disabled = true;
    button.addEventListener("click", () => {
      if (answer == pass) {
        args.passed = true;
        args.minutes = args.limited ? enteredMinutes() : 0;
        window.close();
        return;
      }
      for (let b of buttons) {
        b.disabled = true;
      }
      args.leave();
    });
    return button;
  });
  if (Math.random() < 0.5) {
    buttons.reverse();
  }
  document.getElementById("answers").replaceChildren(...buttons);

  let waitNote = document.getElementById("wait-note");
  let { waitSeconds } = args;
  waitNote.textContent =
    waitSeconds == 1
      ? "wait 1 second to answer."
      : `wait ${waitSeconds} seconds to answer.`;
  let waited = false;
  let updateButtons = () => {
    for (let b of buttons) {
      b.disabled = !waited || (args.limited && !enteredMinutes());
    }
  };
  minutes.addEventListener("input", updateButtons);
  setTimeout(() => {
    waited = true;
    updateButtons();
    waitNote.hidden = true;
  }, waitSeconds * 1000);

  leave.addEventListener("click", () => {
    leave.disabled = true;
    args.leave();
  });

  // Keystrokes meant for the page, such as Enter in a search box as the cover
  // opens, must not answer, so nothing has focus but the cover itself.
  main.tabIndex = -1;
  document.subDialogSetDefaultFocus = () => main.focus();

  // Escape would close the cover without an answer.
  window.addEventListener("keydown", event => {
    if (event.key == "Escape") {
      event.preventDefault();
    }
  });
});
