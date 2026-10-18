"use strict";
/* Offline mocked tests for the dabblebit.com launch-capture result handling.
   No network, no DOM, no real submissions — fetch and document are stubbed.
   Run: node scripts/test-notify-capture.cjs */
const assert = require("assert");

let assertions = 0;
const eq = (a, b, m) => { assertions++; assert.strictEqual(a, b, m); };
const ok = (c, m) => { assertions++; assert.ok(c, m); };

// ---- minimal DOM stub so main.js loads in node ----
let submitHandler = null;
const fakeButton = { disabled: false, textContent: "Notify me" };
const fakeEmail = { value: "", disabled: false, focus() {} };
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

const { classifyNotifyResult, notifyCopy, notifyConfig } = require("../assets/js/main.js");
// keep the suite fast; production default stays 15000
notifyConfig.timeoutMs = 60;

let fetchCalls = 0;
function resetState() {
  fakeButton.disabled = false;
  fakeButton.textContent = "Notify me";
  fakeEmail.value = "tester@example.com";
  fakeEmail.disabled = false;
  fakeStatus.textContent = "";
  fakeStatus.className = "";
  resetCalled = false;
  fetchCalls = 0;
}

async function fireSubmit(waitMs = 25) {
  let prevented = false;
  submitHandler({ preventDefault() { prevented = true; } });
  ok(prevented, "submit default is prevented");
  await new Promise((r) => setTimeout(r, waitMs)); // let the promise chain settle
}

function snap() {
  return {
    status: fakeStatus.textContent,
    cls: fakeStatus.className,
    input: fakeEmail.value,
    inputDisabled: fakeEmail.disabled,
    reset: resetCalled,
    btnDisabled: fakeButton.disabled,
    fetchCalls,
  };
}

const okRes = (data) => { fetchCalls++; return { ok: true, status: 200, json: async () => data }; };
const errRes = (status, data) => { fetchCalls++; return { ok: false, status, json: async () => data }; };
// never settles on its own; honors abort like a real fetch
function abortableHang(getSignal) {
  fetchCalls++;
  return new Promise((_, reject) => {
    const sig = getSignal();
    if (sig.aborted) return reject(abortErr());
    sig.addEventListener("abort", () => reject(abortErr()));
  });
}
function abortErr() { const e = new Error("aborted"); e.name = "AbortError"; return e; }

(async () => {
  // ---- pure classifier: successful ----
  eq(classifyNotifyResult(true, { success: "true" }), "ok");
  eq(classifyNotifyResult(true, { success: true }), "ok");

  // ---- pure classifier: rejected ----
  eq(classifyNotifyResult(false, { success: "true" }), "rejected",
    "transport failure wins over provider body");
  eq(classifyNotifyResult(true, { success: "false" }), "rejected");
  eq(classifyNotifyResult(true, {}), "rejected");
  eq(classifyNotifyResult(true, { success: 0 }), "rejected");

  // ---- pure classifier: malformed ----
  eq(classifyNotifyResult(true, null), "malformed");
  eq(classifyNotifyResult(true, "oops"), "malformed");
  eq(classifyNotifyResult(true, 42), "malformed");

  // ---- copy contract ----
  eq(notifyCopy("ok").keepInput, false);
  for (const k of ["rejected", "malformed", "timeout", "network"]) {
    eq(notifyCopy(k).keepInput, true, k + " preserves input");
    ok(notifyCopy(k).cls.includes("err"), k + " renders as error");
    ok(notifyCopy(k).text.length > 10, k + " has honest copy");
  }
  ok(notifyCopy("ok").cls.includes("ok"), "ok renders as success");
  ok(/may or may not/.test(notifyCopy("timeout").text),
    "timeout copy does not claim the submission did/did not happen");

  // ---- wired: successful response ----
  resetState();
  global.fetch = async () => okRes({ success: "true" });
  await fireSubmit();
  let r = snap();
  ok(r.cls.includes("ok") && /You're in/.test(r.status), "success copy shown");
  ok(r.reset && r.input === "", "input cleared on success");
  eq(r.btnDisabled, false, "button re-enabled");
  eq(r.inputDisabled, false, "field re-enabled");

  // ---- wired: provider rejection keeps input ----
  resetState();
  global.fetch = async () => okRes({ success: "false" });
  await fireSubmit();
  r = snap();
  ok(r.cls.includes("err"), "rejection renders as error");
  ok(!r.reset && r.input === "tester@example.com", "rejection preserves input");

  // ---- wired: HTTP error keeps input ----
  resetState();
  global.fetch = async () => errRes(400, { message: "bad request" });
  await fireSubmit();
  r = snap();
  ok(r.cls.includes("err"), "http error renders as error");
  ok(!r.reset && r.input === "tester@example.com", "http error preserves input");

  // ---- wired: malformed body keeps input ----
  resetState();
  global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } });
  await fireSubmit();
  r = snap();
  ok(r.cls.includes("err"), "malformed renders as error");
  ok(!r.reset && r.input === "tester@example.com", "malformed preserves input");

  // ---- wired: network error keeps input ----
  resetState();
  global.fetch = async () => { fetchCalls++; throw new Error("down"); };
  await fireSubmit();
  r = snap();
  ok(r.cls.includes("err") && /connection/.test(r.status), "network copy shown");
  ok(!r.reset && r.input === "tester@example.com", "network error preserves input");
  eq(r.btnDisabled, false, "button re-enabled after network error");

  // ---- regression: input locked during flight (no mid-flight edit loss) ----
  resetState();
  let release;
  const gate = new Promise((res) => { release = res; });
  global.fetch = async () => { fetchCalls++; await gate; return okRes({ success: "true" }); };
  fakeEmail.value = "old@example.com";
  const p = fireSubmit();
  eq(fakeEmail.disabled, true, "field disabled while request pending");
  eq(fakeButton.disabled, true, "button disabled while request pending");
  release();
  await p;
  r = snap();
  ok(r.reset, "success clears the sent address");
  eq(r.inputDisabled, false, "field re-enabled after settle");

  // ---- duplicate-submit prevention while in flight ----
  resetState();
  let release2;
  const gate2 = new Promise((res) => { release2 = res; });
  global.fetch = async () => { fetchCalls++; await gate2; return okRes({ success: "true" }); };
  submitHandler({ preventDefault() {} });
  submitHandler({ preventDefault() {} }); // e.g. Enter while pending
  eq(fetchCalls, 1, "second submit during flight is ignored");
  release2();
  await new Promise((res) => setTimeout(res, 25));
  r = snap();
  ok(r.cls.includes("ok"), "first request still completes");

  // ---- never-settling request hits the bounded timeout, honestly ----
  resetState();
  global.fetch = (url, opts) => abortableHang(() => opts.signal);
  await fireSubmit(200); // longer than the 60ms test timeout
  r = snap();
  ok(r.cls.includes("err") && /may or may not/.test(r.status), "timeout shows honest copy");
  ok(!r.reset && r.input === "tester@example.com", "timeout preserves input");
  eq(r.btnDisabled, false, "button re-enabled after timeout");
  eq(r.inputDisabled, false, "field re-enabled after timeout");

  // ---- headers received, body pending past the timeout ----
  // (native fetch rejects a pending body read with AbortError on abort;
  // that must surface as timeout, not malformed)
  resetState();
  global.fetch = (url, opts) => {
    fetchCalls++;
    const sig = opts.signal;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => new Promise((_, reject) => {
        if (sig.aborted) return reject(abortErr());
        sig.addEventListener("abort", () => reject(abortErr()));
      }),
    });
  };
  await fireSubmit(200); // longer than the 60ms test timeout
  r = snap();
  ok(r.cls.includes("err") && /may or may not/.test(r.status),
    "body-pending timeout shows timeout copy, not malformed");
  ok(!r.reset && r.input === "tester@example.com", "body-pending timeout preserves input");

  // ---- failure then retry succeeds ----
  resetState();
  global.fetch = async () => { fetchCalls++; throw new Error("down"); };
  await fireSubmit();
  r = snap();
  ok(r.cls.includes("err"), "first attempt fails");
  global.fetch = async () => okRes({ success: "true" });
  await fireSubmit();
  r = snap();
  ok(r.cls.includes("ok") && r.reset, "retry after failure succeeds");

  console.log(`notify-capture: all ${assertions} assertions passed`);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
