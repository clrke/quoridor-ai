"use strict";

const { test, expect } = require("@playwright/test");

/*
* Regression coverage for the "Use AI's move instead" coach feature:
* the coach must defer applying the human's move until they choose to
* either continue with it or swap in the Strong AI's suggestion — and
* swapping must cleanly discard the human's own move (not stack both).
*/
test.describe("coach: use AI's move instead", () => {
    test("discards the player's own move and applies the AI's suggestion instead", async ({ page }) => {
        await page.goto("/index.html", { waitUntil: "networkidle" });
        await page.click("#about_close_button");
        await page.click("#restart_button");
        await page.click("#restart_yes");
        await page.click("#novice_level");
        await page.click(".pawn.pawn0.button");

        expect(await page.evaluate(() => controller.coachEnabled)).toBe(true);

        const preMoveState = await page.evaluate(() => JSON.stringify({
            pawn0: controller.game.board.pawns[0].position,
            pawn1: controller.game.board.pawns[1].position,
            walls: controller.game.board.pawns.map((p) => p.numberOfLeftWalls)
        }));

        // Deliberately place a wall in a far corner — virtually guaranteed
        // to differ from the Strong AI's actual top suggestion at move 1.
        const wallTarget = await page.evaluate(() => {
            if (controller.game.validNextWalls.horizontal[0][0]) return { row: 0, col: 0 };
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    if (controller.game.validNextWalls.horizontal[i][j]) return { row: i, col: j };
                }
            }
            return null;
        });
        const clickPoint = await page.evaluate(({ row, col }) => {
            const table = document.getElementById("board_table");
            const cell = table.rows[row * 2 + 1].cells[col * 2];
            const r = cell.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, wallTarget);
        await page.mouse.click(clickPoint.x, clickPoint.y);

        await expect(page.locator("#coach_message_box")).not.toHaveClass(/hidden/);

        // Game state must stay untouched while the modal is up — the move
        // is only pending, not yet applied.
        const duringModalState = await page.evaluate(() => JSON.stringify({
            pawn0: controller.game.board.pawns[0].position,
            pawn1: controller.game.board.pawns[1].position,
            walls: controller.game.board.pawns.map((p) => p.numberOfLeftWalls)
        }));
        expect(duringModalState).toBe(preMoveState);

        await page.waitForFunction(() => {
            const r = document.getElementById("coach_result");
            return r && !r.classList.contains("hidden");
        }, { timeout: 90_000 });

        const info = await page.evaluate(() => ({
            resultMove: controller.coachPrefetch.resultMove,
            playerMove: controller.pendingHumanMove
        }));
        // With a corner wall placement at move 1, the AI's real suggestion
        // should essentially always differ — if this ever fails, the coach
        // may be comparing against a stale/wrong position.
        expect(info.resultMove).not.toEqual(info.playerMove);
        await expect(page.locator("#coach_use_ai_move")).toBeVisible();

        await page.click("#coach_use_ai_move");
        await page.waitForTimeout(300);

        await expect(page.locator("#coach_message_box")).toHaveClass(/hidden/);

        const afterState = await page.evaluate(() => JSON.stringify({
            pawn0: controller.game.board.pawns[0].position,
            pawn1: controller.game.board.pawns[1].position,
            walls: controller.game.board.pawns.map((p) => p.numberOfLeftWalls)
        }));
        expect(afterState).not.toBe(preMoveState);

        // The player's own wall placement must have been discarded, not
        // stacked alongside the AI's move.
        const playerWallPlaced = await page.evaluate(
            ({ row, col }) => controller.game.board.walls.horizontal[row][col] === true,
            wallTarget
        );
        expect(playerWallPlaced).toBe(false);

        // Wall counts must reflect exactly the AI's move being applied —
        // no double-decrement from the discarded player move.
        const finalWalls = await page.evaluate(() => controller.game.board.pawns.map((p) => p.numberOfLeftWalls));
        const aiMoveWasWall = info.resultMove[1] !== null || info.resultMove[2] !== null;
        if (aiMoveWasWall) {
            expect(finalWalls.filter((w) => w === 9)).toHaveLength(1);
            expect(finalWalls.filter((w) => w === 10)).toHaveLength(1);
        } else {
            expect(finalWalls).toEqual([10, 10]);
        }
    });

    test("hides the \"use AI move\" button when the player's move already matches the AI's suggestion", async ({ page }) => {
        await page.goto("/index.html", { waitUntil: "networkidle" });
        await page.click("#about_close_button");
        await page.click("#restart_button");
        await page.click("#restart_yes");
        await page.click("#strong_level"); // this scenario needs a real analysis, not the turn<2 shortcut
        await page.click(".pawn.pawn0.button");

        // Play the exact move the coach itself suggests, by waiting for its
        // prefetch to finish and then clicking that destination — this
        // deterministically hits the "same move" branch instead of hoping
        // to guess the AI's move.
        await page.waitForFunction(() => controller.coachPrefetch && controller.coachPrefetch.done === true, { timeout: 120_000 });
        const aiMove = await page.evaluate(() => controller.coachPrefetch.resultMove);

        const clickPoint = await page.evaluate((move) => {
            const table = document.getElementById("board_table");
            const [movePawnTo, placeHorizontalWallAt, placeVerticalWallAt] = move;
            let cell;
            if (movePawnTo) {
                cell = table.rows[movePawnTo[0] * 2].cells[movePawnTo[1] * 2];
            } else if (placeHorizontalWallAt) {
                cell = table.rows[placeHorizontalWallAt[0] * 2 + 1].cells[placeHorizontalWallAt[1] * 2];
            } else {
                cell = table.rows[placeVerticalWallAt[0] * 2].cells[placeVerticalWallAt[1] * 2 + 1];
            }
            const r = cell.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, aiMove);
        await page.mouse.click(clickPoint.x, clickPoint.y);

        await page.waitForFunction(() => {
            const r = document.getElementById("coach_result");
            return r && !r.classList.contains("hidden");
        }, { timeout: 120_000 });

        await expect(page.locator("#coach_verdict")).toContainText("Perfect");
        await expect(page.locator("#coach_use_ai_move")).toBeHidden();
    });
});
