// Account creation screen interactivity.
// Loaded with `defer`, so the HTML is fully parsed before this runs.

const form = document.querySelector("form");
const statusEl = document.getElementById("account-status");

// A deliberately loose "does this look like an email" check: something,
// then @, then something, a dot, then something, with no spaces anywhere.
// This is NOT strict RFC-correct email validation — that's a famous rabbit
// hole, and the only real proof an address works is sending mail to it,
// which is the actual auth service's job later, not ours here.
function isRoughlyEmailShaped(value) {
  return /^\S+@\S+\.\S+$/.test(value);
}

// Rana is for college students, so sign-up requires a school (.edu) address.
// How the pattern reads, left to right:
//   [^\s@]+          the part before @ (anything except spaces and @)
//   @                the @ itself
//   ([a-z0-9-]+\.)+  one or more domain pieces, each ending in a dot —
//                    so "ucla." or "g.harvard." (subdomains are allowed)
//   edu$             and the address must END in "edu"
// The trailing "i" makes it ignore capital letters (JORDAN@UCLA.EDU is fine).
// Because it must end in .edu, lookalikes are rejected:
//   jordan@edu.com              → ends in .com
//   jordan@school.edu.fake.com  → ends in .com
//
// IMPORTANT: this only catches honest mistakes. It runs in the user's own
// browser, so anyone can bypass it, and it can't prove the person owns the
// address. Real enforcement (a server-side check + a verification email)
// comes with the Supabase move.
function isEduEmail(value) {
  return /^[^\s@]+@([a-z0-9-]+\.)+edu$/i.test(value);
}

form.addEventListener("submit", (event) => {
  // Same reasoning as onboarding.js: stop the default page-reload submit
  // so we can validate and navigate ourselves.
  event.preventDefault();

  const formData = new FormData(form);
  const email = formData.get("email").trim();
  const password = formData.get("password");

  if (!email || !password) {
    showStatus("Please enter an email and password.", true);
    return;
  }

  if (!isRoughlyEmailShaped(email)) {
    showStatus("That email doesn't look right — check for a typo.", true);
    return;
  }

  if (!isEduEmail(email)) {
    showStatus("Rana is for college students — please use your school (.edu) email.", true);
    return;
  }

  // No account is actually created here — there's no backend to send this
  // to yet. The email is saved to the profile so the Account page can show
  // it; the password is never stored or logged.
  const profile = Rana.storage.getProfile();
  if (profile) Rana.storage.saveProfile({ ...profile, email });
  window.location.href = "dashboard.html";
});

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("status-message--error", isError);
}
