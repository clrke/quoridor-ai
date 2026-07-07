"use strict";

// Number of MCTS simulations used by the "Strong" level AI.
// The move-review coach always analyzes with this strength,
// regardless of which level the human chose to play against.
const COACH_NUM_MCTS_SIMULATIONS = 60000;

/*
* Controller part in the MVC pattern
*/
class Controller {
    constructor(uctConst, aiDevelopMode = false) {
        this.aiDevelopMode = aiDevelopMode;
        if (this.aiDevelopMode) {
            console.log('Welcome to AI Develop Mode!');
        }
        this.game = null;
        this.gameHistory = null;
        this.gameHistoryTrashCan = null;  // For Redo
        this.worker = null;
        this.numOfMCTSSimulations = null;
        this.uctConst = uctConst;

        // Move-review coach: reviews every human move against the Strong AI.
        // This must be set before the View is constructed, since the View
        // reads this.coachEnabled synchronously to label the toggle button.
        this.coachEnabled = !aiDevelopMode;
        // The Strong-AI analysis for the *current* human turn. Started the
        // moment it becomes the human's turn (see maybeStartCoachPrefetch),
        // not when they move — so by the time they do move, the analysis is
        // often already finished. Shape: {game, worker, resultMove, done,
        // failed, progress}, or null when nothing is running/available.
        this.coachPrefetch = null;
        this.pendingHumanMove = null;
        this.coachGame = null;  // snapshot of the game just before the pending human move

        this.view = new View(this, this.aiDevelopMode);
    }

    setNewWorker() {
        if (this.worker !== null) {
            this.worker.terminate();
        }
        this.worker = new Worker('js/worker.js');
        const onMessageFunc = function(event) {
            const data = event.data;
            if (typeof(data) === "number") {
                this.view.adjustProgressBar(data * 100);
            } else {
                const move = data;
                this.doMove(move);
            }
        }
        this.worker.onmessage = onMessageFunc.bind(this);
        this.worker.onerror = function(error) {
            console.log('Worker error: ' + error.message + '\n');
            throw error;
        };
    }

    // Kick off the Strong AI's move-review analysis right now, for the
    // current game position. Called the instant it becomes the human's
    // turn (see maybeStartCoachPrefetch) so the analysis runs in the
    // background while the human is still deciding on their move, rather
    // than only starting after they move.
    startCoachPrefetch() {
        this.cancelCoachPrefetch();
        const snapshot = Game.clone(this.game);
        const worker = new Worker('js/worker.js');
        const prefetch = {
            game: snapshot,
            worker: worker,
            resultMove: null,
            done: false,
            failed: false,
            progress: 0
        };
        const onMessageFunc = function(event) {
            const data = event.data;
            if (typeof(data) === "number") {
                prefetch.progress = data;
                // Only touch the view if the human has already moved and is
                // actively waiting on this exact prefetch's progress bar.
                if (this.pendingHumanMove !== null && this.coachPrefetch === prefetch) {
                    this.view.adjustCoachProgressBar(data * 100);
                }
            } else {
                // data is the move the Strong AI recommends for prefetch.game.
                prefetch.resultMove = data;
                prefetch.done = true;
                if (this.pendingHumanMove !== null && this.coachPrefetch === prefetch) {
                    this.view.showCoachResult(prefetch.game, this.pendingHumanMove, prefetch.resultMove);
                }
            }
        };
        worker.onmessage = onMessageFunc.bind(this);
        worker.onerror = function(error) {
            console.log('Coach prefetch worker error: ' + error.message + '\n');
            prefetch.done = true;
            prefetch.failed = true;
            // If the human is already waiting on this exact review, just
            // proceed with their move rather than leaving them stuck.
            if (this.pendingHumanMove !== null && this.coachPrefetch === prefetch) {
                this.applyPendingHumanMove();
            }
        }.bind(this);
        this.coachPrefetch = prefetch;
        worker.postMessage({
            game: snapshot,
            numOfMCTSSimulations: COACH_NUM_MCTS_SIMULATIONS,
            uctConst: this.uctConst,
            aiDevelopMode: false
        });
    }

    // Start the background analysis if — and only if — it's currently the
    // human's turn and coaching is enabled. Safe to call unconditionally
    // after any state change (it simply no-ops otherwise).
    maybeStartCoachPrefetch() {
        if (this.coachEnabled
            && !this.aiDevelopMode
            && this.game !== null
            && this.game.winner === null
            && this.game.pawnOfTurn.isHumanPlayer) {
            this.startCoachPrefetch();
        }
    }

    cancelCoachPrefetch() {
        if (this.coachPrefetch !== null && this.coachPrefetch.worker !== null) {
            this.coachPrefetch.worker.terminate();
        }
        this.coachPrefetch = null;
    }

    // Entry point for every move made by the human player (called from the view).
    // When coaching is enabled, show what the Strong AI would have played —
    // reusing the background analysis that was already started as soon as it
    // became the human's turn — and only proceed once they click "continue".
    humanMove(move) {
        if (!this.coachEnabled
            || this.aiDevelopMode
            || this.game === null
            || this.game.winner !== null
            || !this.game.pawnOfTurn.isHumanPlayer
            || !this.game.isPossibleNextMove(move)) {
            this.doMove(move);
            return;
        }
        this.pendingHumanMove = move;
        // The prefetch should already be running (or finished) for this exact
        // position; fall back to starting one now in case it's missing for
        // some reason (e.g. coaching was re-enabled after this turn began).
        if (this.coachPrefetch === null) {
            this.startCoachPrefetch();
        }
        this.coachGame = this.coachPrefetch.game;
        if (this.coachPrefetch.done) {
            if (this.coachPrefetch.failed) {
                this.applyPendingHumanMove();
            } else {
                this.view.showCoachResult(this.coachGame, move, this.coachPrefetch.resultMove);
            }
        } else {
            this.view.showCoachAnalyzing(this.coachPrefetch.progress * 100);
        }
    }

    // Proceed with the human move that was under review (called on "continue").
    applyPendingHumanMove() {
        // The prefetch for this position has now been consumed.
        this.cancelCoachPrefetch();
        const move = this.pendingHumanMove;
        this.pendingHumanMove = null;
        this.coachGame = null;
        this.view.hideCoachBox();
        if (move !== null) {
            this.doMove(move);
        }
    }

    // Proceed with the Strong AI's suggested move instead of the human's own
    // pending move (called from the coach modal's "use AI's move" button).
    // The pending human move was only ever stored, never applied to
    // this.game (humanMove() doesn't mutate game state until
    // applyPendingHumanMove() calls doMove()) -- but rather than relying on
    // that invariant, explicitly reset to the exact pre-move snapshot
    // (coachGame, captured before the human moved) before applying the AI's
    // move, so the player's move and wall count are guaranteed reverted/
    // clean regardless of how this is reached.
    applyCoachSuggestedMove() {
        if (this.coachPrefetch === null || this.coachGame === null) {
            return;
        }
        const aiMove = this.coachPrefetch.resultMove;
        const preMoveSnapshot = this.coachGame;
        this.cancelCoachPrefetch();
        this.pendingHumanMove = null;
        this.coachGame = null;
        this.view.hideCoachBox();
        if (aiMove !== null) {
            this.game = Game.clone(preMoveSnapshot);
            this.view.game = this.game;
            this.doMove(aiMove);
        }
    }

    // Abort any in-progress review (e.g. when starting a new game or undoing).
    cancelCoaching() {
        this.cancelCoachPrefetch();
        this.pendingHumanMove = null;
        this.coachGame = null;
        this.view.hideCoachBox();
    }

    setCoachEnabled(enabled) {
        this.coachEnabled = enabled;
        if (!enabled) {
            this.cancelCoaching();
        } else {
            this.maybeStartCoachPrefetch();
        }
    }

    startNewGame(isHumanPlayerFirst, numOfMCTSSimulations) {
        this.cancelCoaching();
        this.numOfMCTSSimulations = numOfMCTSSimulations;
        this.setNewWorker();
        let game = new Game(isHumanPlayerFirst);
        this.game = game;
        this.gameHistory = [];
        this.gameHistoryTrashCan = [];
        if (this.aiDevelopMode) {
            this.game.board.pawns[0].isHumanPlayer = true;
            this.game.board.pawns[1].isHumanPlayer = true;
        }
        this.gameHistory.push(Game.clone(this.game));
        this.view.game = this.game;
        this.view.render();
        if (this.aiDevelopMode) {
            this.renderDistancesForAIDevelopMode();
        }
        if (!this.aiDevelopMode && !isHumanPlayerFirst) {
            this.aiDo();
        } else {
            this.maybeStartCoachPrefetch();
        }
    }

    doMove(move) {
        if (this.game.doMove(move, true)) {
            this.gameHistory.push(Game.clone(this.game));
            this.gameHistoryTrashCan = [];
            this.view.render();
            if (this.aiDevelopMode) {
                this.renderDistancesForAIDevelopMode();
            }
            if (!this.game.pawnOfTurn.isHumanPlayer) {
                this.aiDo();
            } else {
                this.maybeStartCoachPrefetch();
            }
        } else {
            // suppose that pawnMove can not be return false, if make the View perfect.
            // so if doMove return false, it's from placeWalls.
            this.view.printImpossibleWallMessage();
        }
    }

    undo() {
        this.cancelCoaching();
        this.setNewWorker();
        this.view.adjustProgressBar(0);
        
        // this pops and pushes current game state
        this.gameHistoryTrashCan.push(this.gameHistory.pop());  
        
        let game = this.gameHistory.pop(); // this pops one-turn-before game state
        while (!game.pawnOfTurn.isHumanPlayer) {
            this.gameHistoryTrashCan.push(game);
            game = this.gameHistory.pop();  // this pops last game state
        }
        this.game = game;
        this.gameHistory.push(Game.clone(this.game));
        this.view.game = this.game;
        this.view.render();
        this.maybeStartCoachPrefetch();
    }

    redo() {
        this.cancelCoaching();
        this.setNewWorker();

        // Mirror undo()'s "one round" granularity: skip forward through any
        // cached AI-turn state so one redo() restores exactly what one
        // undo() reverted, using the exact snapshots already sitting in the
        // trash can rather than recomputing anything. Bounded by the trash
        // can's own length so this never pops past empty -- that can happen
        // when the AI moved first (its opening state is itself a non-human
        // turn), the same asymmetric shape undo() already has to handle.
        let game = this.gameHistoryTrashCan.pop();
        while (game !== undefined && !game.pawnOfTurn.isHumanPlayer && this.gameHistoryTrashCan.length > 0) {
            this.gameHistory.push(Game.clone(game));
            game = this.gameHistoryTrashCan.pop();
        }
        this.game = game;
        this.gameHistory.push(Game.clone(this.game));
        this.view.game = this.game;
        this.view.render();

        // If the trash ran out before reaching the human's next decision
        // point, the redo frontier is exactly an AI-turn state with no
        // cached move left to restore. Previously this left the game
        // silently stuck forever (redo() never triggered the AI). Let the
        // AI actually compute and play its move here, the same way
        // doMove()/startNewGame() already do for every other AI turn.
        if (!this.game.pawnOfTurn.isHumanPlayer) {
            this.aiDo();
        } else {
            this.maybeStartCoachPrefetch();
        }
    }

    aiDo() {
        this.worker.postMessage({game: this.game, numOfMCTSSimulations: this.numOfMCTSSimulations, uctConst: this.uctConst, aiDevelopMode: this.aiDevelopMode});
    }

    renderDistancesForAIDevelopMode() {
        //this.view.render2DArrayToBoard(AI.getShortestDistanceToEveryPosition(this.game.pawnOfTurn, this.game));
    }    
}


class AICompetition {
    constructor(isHumanPlayerFirstArrangement, numOfMCTSSimulations0, uctConst0, numOfMCTSSimulations1, uctConst1, numOfGamesToCompete = 50) {
        this.isHumanPlayerFirstArrangement = isHumanPlayerFirstArrangement;
        this.numOfGames = 0;
        this.numOfGamesToCompete = numOfGamesToCompete;
        this.ais = [
            {numOfMCTSSimulations: numOfMCTSSimulations0, uctConst: uctConst0, numWinsLight: 0, numWinsDark: 0},
            {numOfMCTSSimulations: numOfMCTSSimulations1, uctConst: uctConst1, numWinsLight: 0, numWinsDark: 0}
        ];
        this.game = null;
        this.gameHistory = []; // for view check this length propery...
        this.gameHistoryTrashCan = []; // for view check this length propery...
        this.view = new View(this, this.aiDevelopMode);
        this.worker = null;
        this.setNewWorker();
        this.startNewGame();
        this.view.htmlChooseAILevelMessageBox.classList.add("hidden");
    }

    setNewWorker() {
        if (this.worker !== null) {
            this.worker.terminate();
        }
        this.worker = new Worker('js/worker.js');
        const onMessageFunc = function(event) {
            const data = event.data;
            if (typeof(data) === "number") {
                this.view.adjustProgressBar(data * 100);
            } else {
                const move = data;
                this.doMove(move);
            }
        }
        this.worker.onmessage = onMessageFunc.bind(this);
        this.worker.onerror = function(error) {
            console.log('Worker error: ' + error.message + '\n');
            throw error;
        };
    }

    startNewGame() {
        let game = new Game(this.isHumanPlayerFirstArrangement);
        this.game = game;
        this.game.board.pawns[0].isHumanPlayer = true;
        this.game.board.pawns[1].isHumanPlayer = true;
        this.view.game = this.game;
        this.view.render();
        console.log("Game start!")
        const ai_light = this.ais[this.numOfGames%2];
        console.log(ai_light.numOfMCTSSimulations, ai_light.uctConst, "is light-colored pawn!");
        this.aiDo();
    }

    doMove(move) {
        if (this.game.doMove(move, true)) {
            this.view.render();
            if (this.game.winner === null) {
                this.aiDo();
            } else { // game ended.
                if (this.game.winner.index === 0) {
                    this.ais[(this.numOfGames % 2)].numWinsLight++;
                } else {
                    this.ais[((this.numOfGames + 1) % 2)].numWinsDark++;
                }
                this.numOfGames++;
                console.log("Game ended! Here the statistics following...")
                console.log("Number of total games:", this.numOfGames);
                console.log(this.ais[0].numOfMCTSSimulations, this.ais[0].uctConst, "numWinsLight:", this.ais[0].numWinsLight, "numWinsDark", this.ais[0].numWinsDark);
                console.log(this.ais[1].numOfMCTSSimulations, this.ais[1].uctConst, "numWinsLight:", this.ais[1].numWinsLight, "numWinsDark", this.ais[1].numWinsDark);
                if (this.numOfGames < this.numOfGamesToCompete) {
                    this.startNewGame();
                } else {
                    console.log("Competition Ended.");
                }
            }
        } else {
            // suppose that pawnMove can not be return false, if make the View perfect.
            // so if doMove return false, it's from placeWalls.
            this.view.printImpossibleWallMessage();
        }
    }

    aiDo() {
        const index = (this.numOfGames + this.game.turn) % 2 
        this.worker.postMessage({game: this.game, numOfMCTSSimulations: this.ais[index].numOfMCTSSimulations, uctConst: this.ais[index].uctConst, aiDevelopMode: false});
    }
}


