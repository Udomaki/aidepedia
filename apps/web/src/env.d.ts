/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface Session {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires: string;
}

namespace App {
  interface Locals {
    user?: Session['user'];
    session?: Session;
  }
}
