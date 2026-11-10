declare namespace App {
  interface Locals {
    admin: { id: string; name: string; email: string };
    /** The workspace the admin is looking at (cookie, else the first). */
    workspace: { id: string; name: string; forms: number };
  }
}
