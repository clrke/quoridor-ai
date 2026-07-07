"use strict";

const { test, expect } = require("@playwright/test");

/*
* Regression test for a real bug found earlier: redo() could leave the game
* permanently stuck on the AI's turn (soft-locked — no button did anything,
* the AI never moved) because it didn't re-trigger the AI after landing on
* an AI-turn state. See controller.js's redo() for the fix (it now falls
* through to aiDo() when redo lands with the AI to move).
*/
test("redo() never leaves the game stuck — the AI keeps moving afterward", async ({ page }) => {
    await page.goto("/index.html", { waitUntil: "networkidle" });
    await page.click("#about_close_button");
    await page.click("#restart_button");
    await page.click("#restart_yes");
    await page.click("#novice_level");
    await page.click(".pawn.pawn0.button");

    if (await page.evaluate(() => controller.coachEnabled)) {
        await page.click("#coach_toggle"); // simplify: apply moves immediately
    }

    // Human moves forward; the AI should respond automatically.
    const shadowPoint = await page.evaluate(() => {
        const shadow = document.getElementsByClassName("pawn shadow")[0];
        const r = shadow.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(shadowPoint.x, shadowPoint.y);
    await page.waitForFunction(() => controller.game.pawnOfTurn.isHumanPlayer === true, { timeout: 15_000 });

    await page.click("#undo_button");
    await page.click("#redo_button");

    // Whatever state redo() lands on, the game must not be soft-locked: if
    // it's the AI's turn, the AI must actually move within a few seconds
    // rather than sitting frozen forever.
    await page.waitForFunction(() => controller.game.pawnOfTurn.isHumanPlayer === true, { timeout: 20_000 });

    expect(await page.evaluate(() => controller.game.pawnOfTurn.isHumanPlayer)).toBe(true);
});
