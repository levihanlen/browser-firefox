/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_MINUTES = 600;
const TICK_MS = 200;

// SiteTimer opens this with sizeTo "available", which caps the dialog at these
// sizes, so it covers the whole tab.
document.documentElement.style.maxWidth = "none";
document.documentElement.style.maxHeight = "none";

function formatMinutes(minutes) {
  return minutes == 1 ? "1 minute" : `${minutes} minutes`;
}

function formatWait(seconds) {
  if (seconds % 60 == 0) {
    return formatMinutes(seconds / 60);
  }
  return seconds == 1 ? "1 second" : `${seconds} seconds`;
}

function formatCountdown(seconds) {
  let s = String(seconds % 60).padStart(2, "0");
  return `${Math.floor(seconds / 60)}:${s}`;
}

window.addEventListener("DOMContentLoaded", () => {
  // Opened by SiteTimer.prompt, which reads the answer back from these args.
  let [args] = window.arguments;
  let main = document.getElementById("site-timer");
  let waitStep = document.getElementById("wait-step");
  let waitMessage = document.getElementById("wait-message");
  let countdown = document.getElementById("countdown");
  let questionStep = document.getElementById("question-step");
  let question = document.getElementById("question");
  let answers = document.getElementById("answers");
  let planStep = document.getElementById("plan-step");
  let purpose = document.getElementById("purpose");
  let minutes = document.getElementById("minutes");
  let start = document.getElementById("start");

  let heading = document.getElementById("heading");
  if (args.timeUp) {
    heading.textContent = `Time's up on ${args.site}`;
    let summary = document.getElementById("summary");
    summary.textContent = args.lastPurpose
      ? `You gave yourself ${formatMinutes(args.lastMinutes)} for “${args.lastPurpose}”.`
      : `You gave yourself ${formatMinutes(args.lastMinutes)}.`;
    summary.hidden = false;
  } else {
    heading.textContent = args.site;
  }

  // Keystrokes meant for the page, such as Enter in a comment box when the
  // time runs out, must not press Close tab, so nothing has focus but the
  // inputs.
  main.tabIndex = -1;
  document.subDialogSetDefaultFocus = () =>
    (planStep.hidden ? main : purpose).focus();
  let showStep = step => {
    for (let s of [waitStep, questionStep, planStep]) {
      s.hidden = s != step;
    }
    if (step != planStep) {
      main.focus();
    }
  };

  let ask = () => {
    let { questions } = args;
    let { text, pass } =
      questions[Math.floor(Math.random() * questions.length)];
    question.textContent = text;
    let buttons = ["Yes", "No"].map(answer => {
      let button = document.createElement("button");
      button.type = "button";
      button.textContent = answer;
      button.addEventListener("click", () => {
        if (answer == pass) {
          showStep(planStep);
          purpose.focus();
        } else {
          wait(`Wait ${formatWait(args.waitSeconds)} more.`);
        }
      });
      return button;
    });
    if (Math.random() < 0.5) {
      buttons.reverse();
    }
    answers.replaceChildren(...buttons);
    showStep(questionStep);
  };

  // Only counts time the tab is in view, so the wait can't be sat out on
  // another tab or with the window minimized.
  let wait = message => {
    waitMessage.textContent = message;
    showStep(waitStep);
    let remaining = args.waitSeconds * 1000;
    let last = performance.now();
    let tick = () => {
      let now = performance.now();
      if (args.isWatched()) {
        remaining -= Math.min(now - last, 1000);
      }
      last = now;
      if (remaining <= 0) {
        clearInterval(interval);
        ask();
        return;
      }
      countdown.textContent = formatCountdown(Math.ceil(remaining / 1000));
    };
    let interval = setInterval(tick, TICK_MS);
    tick();
  };

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
    start.disabled = !enteredMinutes();
  });
  // Only a click starts: Enter in the inputs does nothing.
  start.addEventListener("click", () => {
    args.minutes = enteredMinutes();
    args.purpose = purpose.value.trim();
    window.close();
  });

  document.getElementById("close-tab").addEventListener("click", () => {
    args.closeTab = true;
    window.close();
  });

  // Escape would close the prompt without an answer, and a stray Escape
  // shouldn't close the tab either.
  window.addEventListener("keydown", event => {
    if (event.key == "Escape") {
      event.preventDefault();
    }
  });

  wait(`Wait ${formatWait(args.waitSeconds)}.`);
});
