# Email (#37) — design

FolkBook sends email: password resets, reminder digests and birthday reminders. Self-hosters bring their own SMTP server; the hosted version (#45, later) will set the same settings through the environment.

Design screens: 5w (Settings → Email (SMTP)), 5l (Log in), 7a (Check your email), 7b (reset email), 5r (Settings → Reminders), 6a (digest email).

## Steps

1. **SMTP and password reset by email (this step):** the server's SMTP settings, Send test email, the "Email isn't set up" banner, "Forgot password?" sending a reset email, the email layout, and docs for self-hosters.
2. **Digests and birthday reminders:** daily or weekly digest, birthdays N days before, include memory aids or not, per-user preferences in Settings → Reminders, an unsubscribe link, and "We talked" links that open a confirmation page.

## Decisions

### Where the SMTP settings come from

- **The environment wins.** When `FOLKBOOK_SMTP_HOST` is set, every SMTP setting comes from `FOLKBOOK_SMTP_*` and the admin page shows them read-only ("Set in the server's environment"). The password is never shown, not even a hint.
- **Otherwise an admin saves them** in Settings → Email (SMTP): one row (`mail.SmtpSettings`), the password sealed with `core.secrets`. The API returns only its last four characters.
- **Fields:** host, port (1–65535; default 587), security (`starttls` / `ssl` / `none`), username and password (both optional: some relays need none), from (`FolkBook <folkbook@example.com>` or a bare address).
- **Email is "ready"** when a host and a from address are set and a saved password, if there is one, can still be read (a changed `DJANGO_SECRET_KEY` makes it unreadable: the page asks for it again, as with AI keys).

### Sending

- `MAILERS["default"]` is `mail.backend.EmailBackend`, Django's SMTP backend configured from the settings above each time it opens a connection. Tests swap it for `locmem` (Django does this for every mailer), so tests never reach a network.
- Every email has a plain-text part and an HTML part. The HTML is email-safe (tables, inline styles, Georgia/Arial, no images). Colors are copied from the light theme of `tokens.css` once, into `mail/templates/mail/base.html`: email clients don't support CSS variables.
- Emails are sent by background jobs (`mail.tasks`), never inside a request: a slow or broken SMTP server can't hold up the app, and the time spent sending never shows in how long a request takes (which could hint whether an account exists). Send test email is the exception: the admin waits for its answer.
- Links in emails point at `FOLKBOOK_URL` (default: the first `DJANGO_CSRF_TRUSTED_ORIGINS`, else `http://localhost:8080`). The SMTP page shows it ("Links in emails open http://…"), so a wrong address is noticed.
- **Send test email** sends to the admin's own address. It uses what's in the form; a password left empty means the saved one, but only for the saved host and username (a saved password is never sent to a different server). Errors are said in the app's words: the server refused the username or password; can't reach host:port; no answer in 15 seconds; couldn't start a secure connection (check Security and the port); the server refused the from address or the recipient. Never the server's reply text.

### Forgot password by email

- With email ready, the log-in page's "Forgot password?" asks for the email, and always answers "Check your email" (7a), whether or not there's an account: answers never tell who has one.
- Without email, it says "Ask your admin for a reset link" as before.
- `POST /api/auth/forgot-password {email}` (no login, CSRF token required): for an active account, a new `PasswordReset` (no `created_by`: the user asked) that **lasts 1 hour** and replaces older unused links, then a job sends the email (7b). The job gets the token sealed (`core.secrets`), so the task table never holds a usable link. Without email: 409.
- **At most 5 reset emails per account per hour.** Beyond that, nothing is sent and the answer stays the same.
- The job is safe to run twice: it records `PasswordReset.emailed_at` and skips a link that was already emailed, used or expired.
- The email can't be unsubscribed from (security email), and says so.

### Who sees what

- `GET /api/mail/status` → `{ready}`: open to anyone (the log-in page needs it). It says only whether email works.
- Everything else under `/api/mail` is for admins (403 for members) and takes the login cookie only.
- **The banner** "Email isn't set up; reminders only show on Today" with "Set up email →" sits at the top of Settings for admins while email isn't ready, and the Email (SMTP) section gets a dot. Members see the same sentence in Settings → Reminders (step 2).
