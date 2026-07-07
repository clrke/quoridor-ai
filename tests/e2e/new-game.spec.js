"use strict";

const { test, expect } = require("@playwright/test");

test.describe("new game", () => {
    test("loads with no console/page errors and lets a human pawn move register", async ({ page }) => {
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

        await page.goto("/index.html", { waitUntil: "networkidle" });

        await page.click("#about_close_button");
        await page.click("#restart_button");
        await page.click("#restart_yes");
        await page.click("#novice_level"); // fastest AI level, keeps the spec quick
        await page.click(".pawn.pawn0.button"); // play as the light pawn (moves first)

        // Coach is on by default and defers applying a move until the coach
        // modal is dismissed (see coach-use-ai-move.spec.js for that flow) —
        // turn it off here so a click applies the move immediately, which is
        // all this smoke test cares about.
        if (await page.evaluate(() => controller.coachEnabled)) {
            await page.click("#coach_toggle");
        }

        // A legal-move "shadow" marker should appear on the board for the
        // human's first move.
        await expect(page.locator(".pawn.shadow").first()).toBeVisible();

        const beforePosition = await page.evaluate(() => ({ ...controller.game.board.pawns[0].position }));

        const shadowPoint = await page.evaluate(() => {
            const shadow = document.getElementsByClassName("pawn shadow")[0];
            const r = shadow.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await page.mouse.click(shadowPoint.x, shadowPoint.y);
        await page.waitForTimeout(300);

        const afterPosition = await page.evaluate(() => ({ ...controller.game.board.pawns[0].position }));
        expect(afterPosition).not.toEqual(beforePosition);

        expect(errors, `unexpected console/page errors: ${JSON.stringify(errors)}`).toEqual([]);
    });
});
