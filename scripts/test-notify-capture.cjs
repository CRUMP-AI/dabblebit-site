"use strict";
/* Offline mocked tests for the dabblebit.com launch-capture result handling.
   No network, no DOM, no real submissions — fetch and document are stubbed.
   Run: node scripts/test-notify-capture.cjs */
const assert = require("assert");

// ---- minimal DOM stub so main.js loads in node ----
let submitHandler = null;
const fakeButton = { disabled: false, textContent: "Notify me" };
const fakeEmail = { value: "", focus() {} };
const fakeStatus = { textContent: "", className: "" };
let resetCalled = false;
const fakeForm = {
  addEventListener(type, fn) { if (type === "submit") submitHandler = fn; },
  querySelector() { return fakeButton; },
  reset() { resetCalled = true; fakeEmail.value = ""; },
};
global.window = global;
global.document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById(id) {
    return (
      { "notify-form": fakeForm, "notify-email": fakeEmail, "notify-status": fakeStatus }[id] || null
    );
  },
};

const { classifyNotifyResult, notifyCopy } = require("../assets/js/main.js");

function resetState() {
  fakeButton.disabled = false;
  fakeButton.textContent = "Notify me";
  fakeStatus.textContent = "";
  fakeStatus.className = "";
  resetCalled = false;
  fakeEmail.value = "tester@example.com";
}

async function submitWith(fetchMock) {
  resetState();
  global.fetch = fetchMock;
  let prevented = false;
  submitHandler({ preventDefault() { prevented = true; } });
  assert.ok(prevented, "submit default is prevented");
  await new Promise((r) => setTimeout(r, 25)); // let the promise chain settle
  return {
    status: fakeStatus.textContent,
    cls: fakeStatus.className,
    input: fakeEmail.value,
    reset: resetCalled,
    btnDisabled: fakeButton.disabled,
  };
}

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status, data) => ({ ok: false, status, json: async () => data });

(async () => {
  // ---- pure classifier: successful ----
  assert.strictEqual(classifyNotifyResult(true, { success: "true" }), "ok");
  assert.strictEqual(classifyNotifyResult(true, { success: true }), "ok");

  // ---- pure classifier: rejected ----
  assert.strictEqual(classifyNotifyResult(false, { success: "true" }), "rejected",
    "transport failure wins over provider body");
  assert.strictEqual(classifyNotifyResult(true, { success: "false" }), "rejected");
  assert.strictEqual(classifyNotifyResult(true, {}), "rejected");
  assert.strictEqual(classifyNotifyResult(true, { success: 0 }), "rejected");

  // ---- pure classifier: malformed ----
  assert.strictEqual(classifyNotifyResult(true, null), "malformed");
  assert.strictEqual(classifyNotifyResult(true, "oops"), "malformed");
  assert.strictEqual(classifyNotifyResult(true, 42), "malformed");

  // ---- copy contract: only ok clears input; failures keep it ----
  assert.strictEqual(notifyCopy("ok").keepInput, false);
  for (const k of ["rejected", "malformed", "network"]) {
    assert.strictEqual(notifyCopy(k).keepInput, true, k + " preserves input");
    assert.ok(notifyCopy(k).cls.includes("err"), k + " renders as error");
    assert.ok(notifyCopy(k).text.length > 10, k + " has honest copy");
  }
  assert.ok(notifyCopy("ok").cls.includes("ok"), "ok renders as success");

  // ---- wired: successful response ----
  let r = await submitWith(async () => okRes({ success: "true" }));
  assert.ok(r.cls.includes("ok") && /You're in/.test(r.status), "success copy shown");
  assert.ok(r.reset && r.input === "", "input cleared on success");
  assert.strictEqual(r.btnDisabled, false, "button re-enabled");

  // ---- wired: provider rejection (HTTP 200, success false) ----
  r = await submitWith(async () => okRes({ success: "false" }));
  assert.ok(r.cls.includes("err"), "rejection renders as error");
  assert.ok(!r.reset && r.input === "tester@example.com", "rejection preserves input");

  // ---- wired: HTTP error status ----
  r = await submitWith(async () => errRes(400, { message: "bad request" }));
  assert.ok(r.cls.includes("err"), "http error renders as error");
  assert.ok(!r.reset && r.input === "tester@example.com", "http error preserves input");

  // ---- wired: malformed body (json() throws) ----
  r = await submitWith(async () => ({
    ok: true, status: 200, json: async () => { throw new Error("bad json"); },
  }));
  assert.ok(r.cls.includes("err"), "malformed renders as error");
  assert.ok(!r.reset && r.input === "tester@example.com", "malformed preserves input");

  // ---- wired: network error (fetch rejects) ----
  r = await submitWith(async () => { throw new Error("down"); });
  assert.ok(r.cls.includes("err") && /connection/.test(r.status), "network copy shown");
  assert.ok(!r.reset && r.input === "tester@example.com", "network error preserves input");
  assert.strictEqual(r.btnDisabled, false, "button re-enabled after network error");

  console.log("notify-capture: all 21 assertions passed");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
