import { html } from "./markup.js";
import { formField, statusBanner } from "./parts.js";

/**
 * Subscribe form (`docs/ui-design.md` §6.3, §6.4): the button, the dialog, the inline form after a bad
 * address, the outcome banners, and every subscribe message. The page script and the JSON reply use the
 * same messages, so a reader sees the same words with or without script.
 */

/**
 * @typedef {ReturnType<typeof html>} Html
 * @typedef {{ id: string, displayName: string }} Company
 * @typedef {"empty" | "invalid" | "long"} AddressProblem
 * @typedef {{ state: "idle" }
 *   | { state: "created" | "exists", email: string }
 *   | { state: "invalid", value: string, problem: AddressProblem }} Subscription
 *   What the last subscribe request did, or idle when there was none.
 */

/**
 * @returns {Html} The button that opens the dialog through invoker commands.
 */
export function subscribeButton() {
  return html`<button
    type="button"
    class="btn"
    commandfor="subscribe"
    command="show-modal"
  >
    Get email alerts
  </button>`;
}

/**
 * @param {Company} company The page's company.
 * @returns {Html} The native dialog. No CSS hides it, so a browser without `<dialog>` shows it inline.
 */
export function subscribeDialog(company) {
  const cancel = html`<button
    type="button"
    class="btn"
    commandfor="subscribe"
    command="close"
  >
    Cancel
  </button>`;
  return html`<dialog
    id="subscribe"
    class="dialog"
    aria-labelledby="subscribe-title"
  >
    ${subscribeContent(company, { cancel, problem: undefined, value: "" })}
  </dialog>`;
}

/**
 * @param {Company} company The page's company.
 * @param {{ value: string, problem: AddressProblem }} rejected What was typed and why it was refused.
 * @returns {Html} The same form, open in the page, with the field marked and focused.
 */
export function subscribeInline(company, rejected) {
  return html`<section
    class="subscribe-inline card"
    aria-labelledby="subscribe-title"
  >
    ${subscribeContent(company, { ...rejected, cancel: undefined })}
  </section>`;
}

/**
 * @param {Company} company The page's company.
 * @param {{ state: "created" | "exists", email: string }} outcome A stored or existing subscription.
 * @returns {Html} The status banner shown first in main.
 */
export function subscribeBanner(company, outcome) {
  return statusBanner(
    outcome.state === "created" ? "positive" : "neutral",
    subscriptionMessage(company, outcome),
  );
}

/**
 * @param {Company} company The page's company.
 * @param {Exclude<Subscription, { state: "idle" }>} subscription The outcome.
 * @returns {string} The sentence for the banner, the field error, or the JSON reply.
 */
export function subscriptionMessage(company, subscription) {
  if (subscription.state === "invalid") {
    return addressError(subscription.problem);
  }
  return subscription.state === "created"
    ? `Subscribed ${subscription.email} to ${company.displayName}.`
    : `${subscription.email} is already subscribed.`;
}

/**
 * @param {Company} company The page's company.
 * @param {{ value: string, problem: AddressProblem | undefined, cancel: Html | undefined }} state Field value, its
 *   problem, and the dialog's Cancel button.
 * @returns {Html} Heading, intro, and the POST form.
 */
function subscribeContent(company, { value, problem, cancel }) {
  const email = formField({
    attributes: html` autocomplete="email" required maxlength="254"`,
    error: problem && addressError(problem),
    focus: problem !== undefined,
    id: "subscribe-email",
    label: "Email address",
    name: "email",
    type: "email",
    value,
  });
  return html`<h2 id="subscribe-title">
      Email alerts for ${company.displayName}
    </h2>
    <p class="dialog__intro">
      Get an email when the daily check finds new coverage of
      ${company.displayName}.
    </p>
    <form
      method="post"
      action="/companies/${company.id}/subscriptions"
      novalidate
      data-subscribe
    >
      ${email}
      <div class="form-actions">
        ${cancel}
        <button type="submit" class="btn btn--primary">Subscribe</button>
      </div>
    </form>`;
}

/**
 * @param {AddressProblem} problem Why the address was refused.
 * @returns {string} The field error, starting with the field's name.
 */
function addressError(problem) {
  if (problem === "empty") {
    return "Email address: enter your email address.";
  }
  return problem === "long"
    ? "Email address: use 254 characters or fewer."
    : "Email address: enter an address like name@example.com.";
}
