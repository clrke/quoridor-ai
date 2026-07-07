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

        // Move-review coach: after every human move, the Strong AI reviews it.
        // This must be set before the View is constructed, since the View
        // reads this.coachEnabled synchronously to label the toggle button.
        this.coachEnabled = !aiDevelopMode;
        this.coachWorker = null;
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

    // Create a dedicated worker used only for reviewing the human's move
    // with the Strong AI. It is kept separate from the opponent AI worker.
    setNewCoachWorker() {
        if (this.coachWorker !== null) {
            this.coachWorker.terminate();
        }
        this.coachWorker = new Worker('js/worker.js');
        const onMessageFunc = function(event) {
            const data = event.data;
            if (typeof(data) === "number") {
                this.view.adjustCoachProgressBar(data * 100);
            } else {
                // data is the move the Strong AI recommends for coachGame.
                this.view.showCoachResult(this.coachGame, this.pendingHumanMove, data);
            }
        };
        this.coachWorker.onmessage = onMessageFunc.bind(this);
        this.coachWorker.onerror = function(error) {
            console.log('Coach worker error: ' + error.message + '\n');
            // If the review fails for any reason, just proceed with the move.
            this.applyPendingHumanMove();
        }.bind(this);
    }

    // Entry point for every move made by the human player (called from the view).
    // When coaching is enabled, first ask the Strong AI what it would have played,
    // show the comparison modal, and only proceed once the human clicks "continue".
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
        this.coachGame = Game.clone(this.game);
        this.setNewCoachWorker();
        this.view.showCoachAnalyzing();
        this.coachWorker.postMessage({
            game: this.coachGame,
            numOfMCTSSimulations: COACH_NUM_MCTS_SIMULATIONS,
            uctConst: this.uctConst,
            aiDevelopMode: false
        });
    }

    // Proceed with the human move that was under review (called on "continue").
    applyPendingHumanMove() {
        if (this.coachWorker !== null) {
            this.coachWorker.terminate();
            this.coachWorker = null;
        }
        const move = this.pendingHumanMove;
        this.pendingHumanMove = null;
        this.coachGame = null;
        this.view.hideCoachBox();
        if (move !== null) {
            this.doMove(move);
        }
    }

    // Abort any in-progress review (e.g. when starting a new game or undoing).
    cancelCoaching() {
        if (this.coachWorker !== null) {
            this.coachWorker.terminate();
            this.coachWorker = null;
        }
        this.pendingHumanMove = null;
        this.coachGame = null;
        this.view.hideCoachBox();
    }

    setCoachEnabled(enabled) {
        this.coachEnabled = enabled;
        if (!enabled) {
            this.cancelCoaching();
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
    }

    redo() {
        this.cancelCoaching();
        this.game = this.gameHistoryTrashCan.pop();
        this.gameHistory.push(Game.clone(this.game));
        this.view.game = this.game;
        this.view.render();
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


