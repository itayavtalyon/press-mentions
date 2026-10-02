/**
 * Subscribe in the dialog (`docs/ui-design.md` decision table, Subscribe with script). The form still
 * posts the plain way without script. With script, the same form body goes out with `fetch` and
 * `Accept: application/json`, and the outcome shows in the dialog without a reload.
 */

/**
 * @typedef {{ outcome: "created" | "exists" | "invalid", message: string }} Outcome The server's JSON reply.
 * @typedef {(input: string, init: RequestInit) => Promise<Response>} Fetch The network port.
 */

export const FAILURE_TEXT =
  "Couldn't subscribe right now. Try again in a moment.";
const ERROR_ID = "subscribe-email-error";
const OUTCOMES = new Set(["created", "exists", "invalid"]);

/**
 * Takes over submit for the form inside the subscribe dialog. The inline form after a refused address is
 * not in a dialog, so it keeps posting the plain way.
 * @param {ParentNode} root Page or fragment.
 * @param {Fetch} send Network port.
 * @returns {void}
 */
export function initSubscribe(root, send) {
  const form = [...root.querySelectorAll("form")].find(
    (candidate) => candidate.dataset.subscribe !== undefined,
  );
  const dialog = form?.closest("dialog");
  if (form === undefined || dialog === null || dialog === undefined) {
    return;
  }
  form.addEventListener("submit", (submitEvent) => {
    submitEvent.preventDefault();
    void submitSubscription(form, dialog, send);
  });
  dialog.addEventListener("close", () => {
    resetDialog(form, dialog);
  });
}

/**
 * Sends the address and shows the outcome. A failure of any kind leaves the form as it was.
 * @param {HTMLFormElement} form The dialog's form.
 * @param {HTMLDialogElement} dialog The dialog.
 * @param {Fetch} send Network port.
 * @returns {Promise<void>} Settles when the outcome is on screen.
 */
export async function submitSubscription(form, dialog, send) {
  const input = form.elements.namedItem("email");
  const button = form.querySelector("button[type=submit]");
  if (button === null || !(input instanceof HTMLInputElement)) {
    return;
  }
  clearMessages(form, input);
  button.setAttribute("disabled", "");
  const outcome = await requestOutcome(form.action, input.value, send);
  button.removeAttribute("disabled");
  if (outcome === undefined) {
    showFailure(form, input);
  } else if (outcome.outcome === "invalid") {
    showFieldError(input, outcome.message);
  } else {
    showDone(form, dialog, outcome.message);
  }
}

/**
 * @param {unknown} value A parsed JSON body.
 * @returns {value is Outcome} Whether it is the subscribe reply.
 */
export function isOutcome(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "outcome" in value &&
    "message" in value &&
    OUTCOMES.has(String(value.outcome)) &&
    typeof value.message === "string"
  );
}

/**
 * @param {string} action Where the form posts.
 * @param {string} email Typed address.
 * @param {Fetch} send Network port.
 * @returns {Promise<Outcome | undefined>} The outcome, or undefined for anything that is not one.
 */
async function requestOutcome(action, email, send) {
  /**
   * @type {unknown}
   */
  let body;
  try {
    const response = await send(action, {
      body: new URLSearchParams({ email }),
      headers: { Accept: "application/json" },
      method: "POST",
    });
    const type = response.headers.get("content-type") ?? "";
    body = type.includes("application/json")
      ? await response.json()
      : undefined;
  } catch {
    // The network failed or the body was not JSON. The dialog says to try again; nothing is assumed stored.
  }
  return isOutcome(body) ? body : undefined;
}

/**
 * @param {HTMLFormElement} form The dialog's form.
 * @param {HTMLInputElement} input The email field.
 * @returns {void}
 */
function clearMessages(form, input) {
  input.removeAttribute("aria-invalid");
  input.removeAttribute("aria-describedby");
  for (const message of form.querySelectorAll("[data-subscribe-message]")) {
    message.remove();
  }
}

/**
 * @param {HTMLInputElement} input The email field.
 * @param {string} message Server message naming the field.
 * @returns {void}
 */
function showFieldError(input, message) {
  const error = input.ownerDocument.createElement("p");
  error.className = "field-error";
  error.id = ERROR_ID;
  error.dataset.subscribeMessage = "";
  error.textContent = message;
  input.after(error);
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", ERROR_ID);
  input.focus();
}

/**
 * @param {HTMLFormElement} form The dialog's form.
 * @param {HTMLInputElement} input The email field.
 * @returns {void}
 */
function showFailure(form, input) {
  const failure = form.ownerDocument.createElement("p");
  failure.className = "field-error";
  failure.setAttribute("role", "alert");
  failure.dataset.subscribeMessage = "";
  failure.textContent = FAILURE_TEXT;
  form.append(failure);
  input.focus();
}

/**
 * Replaces the form with the outcome and a Close button. Closing returns focus to the opener.
 * @param {HTMLFormElement} form The dialog's form.
 * @param {HTMLDialogElement} dialog The dialog.
 * @param {string} message What happened.
 * @returns {void}
 */
function showDone(form, dialog, message) {
  const done = form.ownerDocument.createElement("div");
  done.dataset.subscribeDone = "";
  const outcome = form.ownerDocument.createElement("p");
  outcome.setAttribute("role", "status");
  outcome.textContent = message;
  const closeButton = form.ownerDocument.createElement("button");
  closeButton.type = "button";
  closeButton.className = "btn";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    dialog.close();
  });
  done.append(outcome, closeButton);
  form.toggleAttribute("hidden", true);
  form.after(done);
  closeButton.focus();
}

/**
 * Puts the empty form back, so the dialog starts fresh next time.
 * @param {HTMLFormElement} form The dialog's form.
 * @param {HTMLDialogElement} dialog The dialog.
 * @returns {void}
 */
function resetDialog(form, dialog) {
  for (const done of dialog.querySelectorAll("[data-subscribe-done]")) {
    done.remove();
  }
  form.toggleAttribute("hidden", false);
  form.reset();
  const input = form.elements.namedItem("email");
  if (input instanceof HTMLInputElement) {
    clearMessages(form, input);
  }
}
