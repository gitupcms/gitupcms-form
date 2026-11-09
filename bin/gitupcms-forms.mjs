#!/usr/bin/env node
// Starts the built server; settings come from ./.env (see .env.example) or the environment.
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
await import("../dist/server/entry.mjs");
