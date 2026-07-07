"use strict";

const { defineConfig, devices } = require("@playwright/test");

/*
* Integration ("does the real app behave correctly in a real browser")
* tests. game.js/ai.js are plain global <script> files with no build step
* (see tests/helpers/loadGameModules.js for why unit tests load them via
* vm instead), and the app leans on a real Worker + DOM + Service Worker —
* so some things (the coach's background prefetch, undo/redo history,
* modal rendering) can only be verified end-to-end in an actual browser.
* These specs formalize the ad hoc /tmp/*.cjs Playwright scripts used
* during development into a checked-in, repeatable regression suite.
*/
module.exports = defineConfig({
    testDir: "./tests/e2e",
    timeout: 60_000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: "http://localhost:8123",
        trace: "retain-on-failure"
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } }
    ],
    webServer: {
        command: "python3 -m http.server 8123",
        cwd: "./src",
        url: "http://localhost:8123",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
});
