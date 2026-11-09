/**
 * Browser: every `<form data-save>` on a form's admin page saves through the "update" action.
 * Inputs named `name`, `recipients`… are the form's columns; `config.captcha.provider` style names go into
 * the config. Checkboxes send true/false. A `[data-status]` inside the form shows the result.
 */
import { post } from "./post";

const setPath = (target: any, path: string[], value: unknown) => {
  const last = path.pop()!;
  for (const p of path) target = target[p] ??= {};
  target[last] = value;
};

export const wireSaveForms = (key: string) =>
  document.querySelectorAll<HTMLFormElement>("form[data-save]").forEach((form) =>
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body: any = { action: "update" };
      for (const el of Array.from(form.elements) as HTMLInputElement[]) {
        if (!el.name || el.disabled) continue;
        if (el.type === "radio" && !el.checked) continue;
        const value = el.type === "checkbox" ? el.checked : el.value;
        setPath(body, el.name.split("."), value);
      }
      const status = form.querySelector<HTMLElement>("[data-status]");
      const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (button) button.disabled = true;
      try {
        await post(`/api/forms/${key}`, body);
        if (status) Object.assign(status, { className: "text-muted-foreground text-sm", textContent: "Saved." });
        if (form.dataset.save === "reload") location.reload();
      } catch (err: any) {
        if (status) Object.assign(status, { className: "text-destructive text-sm", textContent: err.message });
      } finally {
        if (button) button.disabled = false;
      }
    }),
  );
