(() => {
  "use strict";

  const form = document.getElementById("private-login");
  const passwordInput = document.getElementById("private-password");
  const submitButton = document.getElementById("private-submit");
  const status = document.getElementById("private-status");
  const gate = document.getElementById("private-gate");
  const unlocked = document.getElementById("private-unlocked");
  const content = document.getElementById("private-content");
  const lockButton = document.getElementById("private-lock");
  if (!form || !passwordInput || !submitButton || !status || !gate || !unlocked || !content || !lockButton) return;

  let request = null;
  let attempt = 0;
  let pending = false;
  const encoder = new TextEncoder();

  function setPending(value) {
    pending = value;
    submitButton.disabled = value;
    form.setAttribute("aria-busy", String(value));
  }

  function lock({ focus = true, message = "" } = {}) {
    attempt += 1;
    request?.abort();
    request = null;
    content.replaceChildren();
    unlocked.hidden = true;
    gate.hidden = false;
    passwordInput.value = "";
    passwordInput.removeAttribute("aria-invalid");
    status.textContent = message;
    setPending(false);
    if (focus) passwordInput.focus();
  }

  function decodeBase64(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Invalid payload");
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  function readPayload(payload) {
    if (!payload || payload.version !== 1 || !Number.isInteger(payload.iterations) || payload.iterations < 600000 || payload.iterations > 2000000) {
      throw new Error("Unsupported payload");
    }
    const salt = decodeBase64(payload.salt);
    const iv = decodeBase64(payload.iv);
    const ciphertext = decodeBase64(payload.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) throw new Error("Invalid payload");
    return { salt, iv, ciphertext, iterations: payload.iterations };
  }

  async function unlock(payload, password) {
    const passwordBytes = encoder.encode(password);
    let material;
    try {
      material = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);
    } finally {
      passwordBytes.fill(0);
    }
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: payload.salt, iterations: payload.iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: payload.iv }, key, payload.ciphertext));
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    } finally {
      plaintext.fill(0);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    if (!globalThis.isSecureContext || !globalThis.crypto?.subtle) {
      status.textContent = "This browser cannot unlock this page. Open it in an up-to-date browser using HTTPS.";
      return;
    }
    if (!passwordInput.value) {
      status.textContent = "Enter the password to continue.";
      passwordInput.setAttribute("aria-invalid", "true");
      passwordInput.focus();
      return;
    }

    const currentAttempt = ++attempt;
    request = new AbortController();
    passwordInput.removeAttribute("aria-invalid");
    setPending(true);
    status.textContent = "Unlocking…";
    let stage = "fetch";
    try {
      const response = await fetch(new URL("assets/private/content.json", document.baseURI), {
        signal: request.signal,
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error("Payload unavailable");
      stage = "payload";
      const payload = readPayload(await response.json());
      stage = "decrypt";
      const html = await unlock(payload, passwordInput.value);
      if (currentAttempt !== attempt) return;

      // Only this locally authored, authenticated encrypted fragment is inserted.
      content.innerHTML = html;
      passwordInput.value = "";
      gate.hidden = true;
      unlocked.hidden = false;
      status.textContent = "";
      content.querySelector('[tabindex="-1"]')?.focus();
    } catch (error) {
      if (currentAttempt !== attempt || error.name === "AbortError") return;
      if (stage === "fetch") {
        status.textContent = "The page could not be loaded. Check your connection and try again.";
      } else if (stage === "payload") {
        status.textContent = "This page could not be opened. Please try again later.";
      } else {
        passwordInput.value = "";
        passwordInput.setAttribute("aria-invalid", "true");
        status.textContent = "That password did not unlock the page. Please try again.";
        passwordInput.focus();
      }
    } finally {
      if (currentAttempt === attempt) {
        request = null;
        setPending(false);
      }
    }
  });

  lockButton.addEventListener("click", () => lock({ message: "Locked." }));
  window.addEventListener("pagehide", () => lock({ focus: false }));
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) lock({ focus: false });
  });
})();
