/** Ready-made HTML forms for the Setup tab: plain markup the site styles itself, already pointed at the form. */
const TRAP = `  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">`;
const form = (endpoint: string, body: string, button: string, multipart = false) =>
  `<form action="${endpoint}" method="POST"${multipart ? ' enctype="multipart/form-data"' : ""}>\n${body.trim()}\n${TRAP}\n  <button type="submit">${button}</button>\n</form>`;

export const templates = (endpoint: string) => [
  {
    name: "Contact",
    description: "Name, email and a message.",
    code: form(
      endpoint,
      `
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Email" required>
  <textarea name="message" placeholder="Message" required></textarea>`,
      "Send",
    ),
  },
  {
    name: "Newsletter",
    description: "An email and a consent box; put \"newsletter\" in the Mailchimp field so only people who tick it are added.",
    code: form(
      endpoint,
      `
  <input name="email" type="email" placeholder="Email" required>
  <label><input type="checkbox" name="newsletter" value="yes" required> Send me the newsletter</label>
  <input type="hidden" name="_subject" value="New newsletter signup">`,
      "Subscribe",
    ),
  },
  {
    name: "Booking",
    description: "A date, a time and how many people.",
    code: form(
      endpoint,
      `
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Email" required>
  <input name="phone" type="tel" placeholder="Phone">
  <input name="date" type="date" required>
  <input name="time" type="time" required>
  <input name="people" type="number" min="1" value="2">
  <textarea name="notes" placeholder="Anything we should know?"></textarea>
  <input type="hidden" name="_subject" value="New booking request">`,
      "Request booking",
    ),
  },
  {
    name: "Quote request",
    description: "Company, budget and what they need.",
    code: form(
      endpoint,
      `
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Work email" required>
  <input name="company" placeholder="Company">
  <select name="budget">
    <option>Under $1,000</option>
    <option>$1,000 – $5,000</option>
    <option>$5,000 – $20,000</option>
    <option>Over $20,000</option>
  </select>
  <textarea name="details" placeholder="What do you need?" required></textarea>
  <input type="hidden" name="_subject" value="New quote request">`,
      "Get a quote",
    ),
  },
  {
    name: "Job application",
    description: "A CV upload and a cover letter.",
    code: form(
      endpoint,
      `
  <input name="name" placeholder="Full name" required>
  <input name="email" type="email" placeholder="Email" required>
  <input name="position" placeholder="Position">
  <input name="linkedin" type="url" placeholder="LinkedIn or portfolio link">
  <label>CV (PDF) <input name="cv" type="file" accept=".pdf,.doc,.docx" required></label>
  <textarea name="cover_letter" placeholder="Why you?"></textarea>
  <input type="hidden" name="_subject" value="New job application">`,
      "Apply",
      true,
    ),
  },
  {
    name: "Feedback",
    description: "A 1–5 rating and a comment.",
    code: form(
      endpoint,
      `
  <fieldset>
    <legend>How was it?</legend>
    <label><input type="radio" name="rating" value="1" required> 1</label>
    <label><input type="radio" name="rating" value="2"> 2</label>
    <label><input type="radio" name="rating" value="3"> 3</label>
    <label><input type="radio" name="rating" value="4"> 4</label>
    <label><input type="radio" name="rating" value="5"> 5</label>
  </fieldset>
  <textarea name="comment" placeholder="What could be better?"></textarea>
  <input name="email" type="email" placeholder="Email (if you want an answer)">`,
      "Send feedback",
    ),
  },
  {
    name: "Event registration",
    description: "Ticket type and dietary needs.",
    code: form(
      endpoint,
      `
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Email" required>
  <select name="ticket">
    <option>General</option>
    <option>Student</option>
    <option>VIP</option>
  </select>
  <label><input type="checkbox" name="workshop" value="yes"> I will join the workshop</label>
  <input name="dietary" placeholder="Dietary needs">
  <input type="hidden" name="_subject" value="New registration">`,
      "Register",
    ),
  },
];
