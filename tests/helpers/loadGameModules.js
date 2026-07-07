"use strict";

/*
* Loads the real browser source files (src/js/game.js, src/js/ai.js) into an
* isolated V8 context using Node's built-in `vm` module, and returns the
* classes they define (Game, Board, Pawn, PawnPosition, AI, ...).
*
* Why not just `require()` them? They're plain global `<script>` files (no
* module.exports — see index.html / worker.js, which load them via <script>
* tags / importScripts()), by design, since this app has no build step.
* Rather than bolt CommonJS exports onto production source (which risks the
* test-only code path drifting from what actually ships to the browser),
* this loads the *exact* unmodified source text the way a browser or the
* Worker does: as global scripts sharing one scope.
*/

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC_DIR = path.join(__dirname, "..", "..", "src", "js");

function loadGameModules({ includeAI = false } = {}) {
    const sandbox = {
        console,
        // A couple of MCTS/AI code paths call postMessage() when run
        // "forWorker" — tests always construct AI with forWorker=false, but
        // stub it out defensively so a mistake fails loudly instead of
        // throwing an opaque ReferenceError.
        postMessage: () => {
            throw new Error("postMessage() called in a unit test — construct AI with forWorker=false");
        }
    };
    vm.createContext(sandbox);

    const gameSrc = fs.readFileSync(path.join(SRC_DIR, "game.js"), "utf8");
    vm.runInContext(gameSrc, sandbox, { filename: "game.js" });
    // Top-level `class`/`const` declarations in a vm context become global
    // *lexical* bindings (usable as bare identifiers by later scripts run in
    // the same context, exactly like classic browser <script> tags sharing
    // one realm) but are NOT copied onto the context object itself. Expose
    // the ones tests/other loaded scripts need as real properties.
    vm.runInContext(
        "globalThis.PawnPosition = PawnPosition; globalThis.Pawn = Pawn; " +
        "globalThis.Board = Board; globalThis.Game = Game;",
        sandbox
    );

    if (includeAI) {
        const aiSrc = fs.readFileSync(path.join(SRC_DIR, "ai.js"), "utf8");
        vm.runInContext(aiSrc, sandbox, { filename: "ai.js" });
        vm.runInContext("globalThis.AI = AI; globalThis.MonteCarloTreeSearch = MonteCarloTreeSearch;", sandbox);
    }

    return sandbox;
}

module.exports = { loadGameModules };
