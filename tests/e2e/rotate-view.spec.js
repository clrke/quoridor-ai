"use strict";

const { test, expect } = require("@playwright/test");

test.describe("rotate view", () => {
    test("flips the board visually and moves still land on the clicked cell", async ({ page }) => {
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

        await page.goto("/index.html", { waitUntil: "networkidle" });

        await page.click("#about_close_button");
        await page.click("#restart_button");
        await page.click("#restart_yes");
        await page.click("#novice_level");
        await page.click(".pawn.pawn0.button");

        if (await page.evaluate(() => controller.coachEnabled)) {
            await page.click("#coach_toggle");
        }

        // Off by default.
        await expect(page.locator("#rotate_button")).toHaveText("rotate view: off");
        await expect(page.locator("#board_table")).not.toHaveClass(/rotated/);

        await page.click("#rotate_button");
        await expect(page.locator("#rotate_button")).toHaveText("rotate view: on");
        await expect(page.locator("#board_table")).toHaveClass(/rotated/);

        // A real, coordinate-based mouse click (not the DOM-identity click()
        // Playwright normally uses) on the shadow marker while the board is
        // visually rotated -- this is the actual regression this feature
        // could introduce: view.js's click handlers read the clicked
        // element's native rowIndex/cellIndex, not screen position, so the
        // move applied must still match the *visual* cell the shadow sits
        // in even though the table is rotated 180deg.
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

        // Rotation is a view preference, not game state: it must survive a
        // brand-new game (board_table is never recreated, only its cell
        // contents are re-rendered).
        await page.click("#restart_button");
        await page.click("#restart_yes");
        await page.click("#novice_level");
        await page.click(".pawn.pawn0.button");
        await expect(page.locator("#board_table")).toHaveClass(/rotated/);
        await expect(page.locator("#rotate_button")).toHaveText("rotate view: on");

        expect(errors, `unexpected console/page errors: ${JSON.stringify(errors)}`).toEqual([]);
    });
});
