"use strict";

/*
* Unit tests for the core Quoridor rules in src/js/game.js — pure logic,
* no DOM/Worker/browser involved, runs in milliseconds via Node's built-in
* test runner (`node --test`). See tests/helpers/loadGameModules.js for why
* this loads the real source file instead of re-implementing the rules.
*/

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGameModules } = require("../helpers/loadGameModules");

const { Game } = loadGameModules();

test("new game sets up both pawns, walls, and turn order correctly", () => {
    const game = new Game(true); // human plays pawn0 (light, moves first)

    assert.equal(game.turn, 0);
    assert.equal(game.winner, null);

    assert.equal(game.pawn0.position.row, 8);
    assert.equal(game.pawn0.position.col, 4);
    assert.equal(game.pawn0.goalRow, 0);
    assert.equal(game.pawn0.numberOfLeftWalls, 10);
    assert.equal(game.pawn0.isHumanPlayer, true);

    assert.equal(game.pawn1.position.row, 0);
    assert.equal(game.pawn1.position.col, 4);
    assert.equal(game.pawn1.goalRow, 8);
    assert.equal(game.pawn1.numberOfLeftWalls, 10);
    assert.equal(game.pawn1.isHumanPlayer, false);

    // Light-colored pawn (index 0) moves first.
    assert.equal(game.pawnOfTurn, game.pawn0);
});

test("movePawn advances turn and alternates whose turn it is", () => {
    const game = new Game(true);

    const moved = game.movePawn(7, 4, true); // one step up, a legal opening move

    assert.equal(moved, true);
    assert.equal(game.pawn0.position.row, 7);
    assert.equal(game.turn, 1);
    assert.equal(game.pawnOfTurn, game.pawn1);
});

test("movePawn with needCheck rejects illegal moves and does not mutate state", () => {
    const game = new Game(true);

    // (0, 0) is nowhere near pawn0's legal next positions from (8, 4).
    const moved = game.movePawn(0, 0, true);

    assert.equal(moved, false);
    assert.equal(game.pawn0.position.row, 8);
    assert.equal(game.pawn0.position.col, 4);
    assert.equal(game.turn, 0);
});

test("reaching the goal row wins regardless of which column you enter on", () => {
    // Regression test: the win condition is ANY cell in the goal row, not one
    // specific square (game.js checks `goalRow === position.row` only). This
    // is also why a single wall can rarely "fully block" a pawn that's one
    // row from goal on an open board — see tests/unit/wallLegality.test.js.
    const game = new Game(true);

    // needCheck=false teleports directly, bypassing move legality — used
    // here purely to reach a goal-row position cheaply for the assertion.
    const moved = game.movePawn(0, 8, false);

    assert.equal(moved, true);
    assert.equal(game.winner, game.pawn0);
});

test("placing a wall decrements the placer's wall count and advances the turn", () => {
    const game = new Game(true);

    const placed = game.placeHorizontalWall(4, 4, true);

    assert.equal(placed, true);
    assert.equal(game.pawn0.numberOfLeftWalls, 9);
    assert.equal(game.pawn1.numberOfLeftWalls, 10);
    assert.equal(game.turn, 1);
    assert.equal(game.board.walls.horizontal[4][4], true);
});

test("a fully boxed-in pawn correctly has no path to its goal row", () => {
    // This exercises the core path-finding DFS (_existPathToGoalLineFor)
    // that the wall-legality rule ("you may never place a wall that leaves
    // a player with zero path to their goal row") ultimately relies on.
    //
    // We set openWays directly rather than placing 3 real wall pieces: real
    // wall pieces can't legally box in a single mid-edge cell on their own
    // (a horizontal and vertical wall sharing a coordinate would illegally
    // cross — see the "stays legal" test below for the realistic case),
    // but the path-finding algorithm itself should correctly detect "no
    // path" for *any* fully-closed set of edges, however it arose.
    const game = new Game(true); // pawn0 starts at (8, 4), goalRow 0

    game.openWays.upDown[7][4] = false;    // seal "up"
    game.openWays.leftRight[8][3] = false; // seal "left"
    game.openWays.leftRight[8][4] = false; // seal "right" ("down" is already the board edge)

    assert.equal(game._existPathToGoalLineFor(game.pawn0), false);
});

test("a partially boxed-in pawn (one side still open) still has a path", () => {
    const game = new Game(true);

    game.openWays.upDown[7][4] = false;    // seal "up"
    game.openWays.leftRight[8][3] = false; // seal "left"
    // "right" stays open — pawn0 can still get out and around to row 0.

    assert.equal(game._existPathToGoalLineFor(game.pawn0), true);
});

test("a wall placement with an open lane elsewhere on the goal row stays legal", () => {
    // Companion to the trap test above: with the board otherwise open, a
    // pawn one row from its goal still has multiple open columns to step
    // into, so blocking straight ahead does NOT trap it — confirms a single
    // wall can't "fully block" a goal-row approach unless the pawn is
    // already cornered by other walls/the board edge.
    const game = new Game(true);

    assert.equal(game.testIfExistPathsToGoalLinesAfterPlaceHorizontalWall(7, 4), true);
});

test("a pawn can jump straight over an adjacent opponent pawn", () => {
    const game = new Game(true);

    // Put pawn0 directly below pawn1 with the board otherwise open.
    game.board.pawns[0].position.row = 4;
    game.board.pawns[0].position.col = 4;
    game.board.pawns[1].position.row = 3;
    game.board.pawns[1].position.col = 4;

    assert.equal(game.pawnOfTurn, game.pawn0);
    assert.equal(game.validNextPositions[2][4], true, "should be able to jump straight over the opponent");
    assert.equal(game.validNextPositions[3][4], false, "cannot land on the opponent's own square");
});
