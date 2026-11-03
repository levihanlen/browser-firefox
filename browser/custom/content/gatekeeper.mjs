/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// CustomGatekeeper opens this with sizeTo "available", which caps the dialog
// at these sizes, so it covers the whole tab.
document.documentElement.style.maxWidth = "none";
document.documentElement.style.maxHeight = "none";

window.addEventListener("DOMContentLoaded", () => {
  // Opened by CustomGatekeeper.prompt, which reads the answer back from these
  // args.
  let [args] = window.arguments;
  let main = document.getElementById("gatekeeper");
  document.getElementById("url").textContent = args.url;
  document.getElementById("flagged").hidden = !args.flagged;

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
  setTimeout(() => {
    for (let b of buttons) {
      b.disabled = false;
    }
    waitNote.hidden = true;
  }, waitSeconds * 1000);

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
