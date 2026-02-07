document.addEventListener("DOMContentLoaded", () => {

  // ---------- ELEMENTS ----------
  const lockScreen = document.getElementById("lockScreen");
  const vault = document.getElementById("vault");

  const masterInput = document.getElementById("masterPassword");
  const unlockBtn = document.getElementById("unlockBtn");

  const siteInput = document.getElementById("site");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const saveBtn = document.getElementById("saveBtn");

  const list = document.getElementById("passwordList");

  let vaultKey = null;

  // ---------- CRYPTO HELPERS ----------

  async function getKeyFromPassword(password) {
    const enc = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("securevault-salt"),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptText(text, key) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(text)
    );

    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    };
  }

  async function decryptText(encryptedObj, key) {
    if (!encryptedObj || !encryptedObj.data || !encryptedObj.iv) {
      return "[Decryption failed]";
    }

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(encryptedObj.iv)
      },
      key,
      new Uint8Array(encryptedObj.data)
    );

    return new TextDecoder().decode(decrypted);
  }

  // ---------- MASTER PASSWORD ----------

  chrome.storage.local.get(["masterHash"], (res) => {
    if (!res.masterHash) {
      unlockBtn.textContent = "Set Master Password";
    }
  });

  unlockBtn.addEventListener("click", async () => {
    const entered = masterInput.value.trim();
    if (!entered) {
      alert("Enter master password");
      return;
    }

    const hash = btoa(entered);

    chrome.storage.local.get(["masterHash"], async (res) => {

      // First time setup
      if (!res.masterHash) {
        chrome.storage.local.set({ masterHash: hash });
        vaultKey = await getKeyFromPassword(entered);
        unlockVault();
        return;
      }

      // Correct password
      if (hash === res.masterHash) {
        vaultKey = await getKeyFromPassword(entered);
        unlockVault();
        return;
      }

      alert("Wrong master password");
    });
  });

  function unlockVault() {
    lockScreen.style.display = "none";
    vault.style.display = "block";
    loadPasswords();
  }

  // ---------- SAVE PASSWORD ----------

  saveBtn.addEventListener("click", async () => {
    if (!vaultKey) {
      alert("Vault locked");
      return;
    }

    const site = siteInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!site || !username || !password) {
      alert("Fill all fields");
      return;
    }

    const encryptedPassword = await encryptText(password, vaultKey);

    chrome.storage.local.get(["passwords"], (res) => {
      const passwords = res.passwords || [];

      passwords.push({
        site,
        username,
        password: encryptedPassword
      });

      chrome.storage.local.set({ passwords }, () => {
        siteInput.value = "";
        usernameInput.value = "";
        passwordInput.value = "";
        loadPasswords();
      });
    });
  });

  // ---------- LOAD PASSWORDS ----------

  async function loadPasswords() {
    if (!vaultKey) return;

    chrome.storage.local.get(["passwords"], async (res) => {
      list.innerHTML = "";

      for (const item of (res.passwords || [])) {
        try {
          const decrypted = await decryptText(item.password, vaultKey);

          const li = document.createElement("li");
          li.textContent = `${item.site} | ${item.username} | ${decrypted}`;
          list.appendChild(li);
        } catch (err) {
          console.error("Decrypt error", err);
        }
      }
    });
  }

});
