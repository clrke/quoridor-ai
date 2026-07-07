"use strict";

/*
* Light-weight unit tests for src/js/ai.js. Deliberately NOT trying to
* assert the MCTS AI plays a tactically "optimal" move here — that's
* inherently a bit stochastic (no seeded RNG) and is what the ad hoc
* Playwright investigation scripts under /tmp were for. These tests just
* guard the structural contract: AI always returns a legal move, and
* Game.clone() (which the AI, the coach prefetch, and undo/redo all rely on
* for deep-copying game state) actually produces an independent copy.
*/

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGameModules } = require("../helpers/loadGameModules");

const { Game, AI } = loadGameModules({ includeAI: true });

test("Game.clone() produces a fully independent deep copy", () => {
    const game = new Game(true);
    game.movePawn(7, 4, true);           // pawn0's move; turn passes to pawn1
    game.placeHorizontalWall(3, 3, true); // pawn1 places this wall

    const clone = Game.clone(game);

    // Mutate the clone; the original must be untouched.
    clone.board.pawns[0].position.row = 0;
    clone.board.pawns[1].numberOfLeftWalls = 0;
    clone.board.walls.horizontal[0][0] = true;
    clone._turn = 99;

    assert.equal(game.board.pawns[0].position.row, 7);
    assert.equal(game.board.pawns[1].numberOfLeftWalls, 9, "pawn1 placed the wall, so pawn1's count should be decremented on the original");
    assert.equal(game.board.walls.horizontal[0][0], false);
    assert.equal(game.turn, 2);
});

test("for the opening move, the AI returns a legal forward-progress move instantly (no MCTS search needed)", () => {
    const game = new Game(true);
    const ai = new AI(/* numOfMCTSSimulations */ 100, /* uctConst */ 1.0, false, false);

    const move = ai.chooseNextMove(game);

    assert.equal(game.isPossibleNextMove(move), true);
    // game.turn < 2 heuristic: opening move should be a straight pawn
    // advance toward the goal, not a wall.
    assert.notEqual(move[0], null);
});

test("AI.chooseNextMove always returns a legal move from a mid-game position", () => {
    const game = new Game(true);
    // Play a few opening moves so we're past the turn<2 shortcut and MCTS
    // search actually runs, but keep the simulation count low so this stays
    // fast (a few thousand sims is plenty to guarantee legality, which is
    // all this test checks).
    game.movePawn(7, 4, true);
    game.movePawn(1, 4, true);
    game.movePawn(6, 4, true);

    const ai = new AI(2000, 1.0, false, false);
    const move = ai.chooseNextMove(game);

    assert.equal(game.isPossibleNextMove(move), true);
});
