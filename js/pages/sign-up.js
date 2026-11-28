// Sign-up. Rana asks for a school email and a password.
//
// This screen is deliberately inert: there is no account service yet. It
// checks the email, saves ONLY the email to the profile (so Profile can show
// it), and moves on. The password is never stored or logged. Real accounts
// (and a verification email) come with the Supabase move.

// A deliberately loose "does this look like an email" check: something, then
// @, then something, a dot, then something, with no spaces anywhere. It is
// NOT strict RFC validation (a famous rabbit hole); the only real proof an
// address works is sending mail to it, which is the account service's job.
function isRoughlyEmailShaped(value) {
  return /^\S+@\S+\.\S+$/.test(value);
}

// Rana is for college students, so sign-up requires a school (.edu) address.
// Reading the pattern left to right:
//   [^\s@]+          the part before @ (anything except spaces and @)
//   @                the @ itself
//   ([a-z0-9-]+\.)+  one or more domain pieces, each ending in a dot, so
//                    "ucla." or "g.harvard." (subdomains are allowed)
//   edu$             and the address must END in "edu"
// The trailing "i" ignores capital letters. Because it must end in .edu,
// lookalikes are rejected: jordan@edu.com and jordan@school.edu.fake.com.
//
// IMPORTANT: this only catches honest mistakes. It runs in the user's own
// browser, so anyone can bypass it, and it can't prove the person owns the address.
function isEduEmail(value) {
  return /^[^\s@]+@([a-z0-9-]+\.)+edu$/i.test(value);
}

Rana.page.start({
  requires: "active-plan", // a plan that has been started; a draft goes back to the plan reveal
  render({ profile }) {
    const { el, button } = Rana.ui;

    const email = Rana.ui.field({ label: "School email (.edu)", kind: "text", placeholder: "you@school.edu", autocomplete: "email", onEnter: submit });
    email.input.type = "email";
    email.input.inputMode = "email";
    email.input.value = profile.email || "";

    const password = Rana.ui.field({ label: "Password", kind: "text", autocomplete: "new-password", onEnter: submit });
    password.input.type = "password";

    function submit() {
      const address = email.getValue();
      email.setError(null);
      password.setError(null);

      if (!address) return email.setError("Enter your school email.");
      if (!isRoughlyEmailShaped(address)) return email.setError("That email doesn't look right. Check for a typo.");
      if (!isEduEmail(address)) return email.setError("Rana is for college students. Use your school (.edu) email.");
      if (!password.input.value) return password.setError("Choose a password.");

      Rana.storage.saveProfile({ ...profile, email: address });
      window.location.href = "today.html";
    }

    document.getElementById("main").append(el("div", "signup", [
      Rana.ui.interview(Rana.coach.LINES.signUp, { pose: "wave" }),
      el("div", "signup__fields", [email, password]),
      el("p", "signup__note", "Rana is a training tool, not medical advice. Talk to a doctor before starting a new training or nutrition program, especially if you have an existing condition."),
    ]));
    document.body.append(Rana.ui.footerBar(button({ label: "Continue", kind: "primary", onClick: submit })));
  },
});
