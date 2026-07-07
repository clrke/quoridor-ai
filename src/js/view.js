"use strict";

/*
* Mini board renderer for the move-review coach modal.
*
* Draws a small, self-contained SVG snapshot of the board (walls + pawns,
* as they were right before the human's pending move), with the human's
* move and the Strong AI's recommended move overlaid as colored markers
* (a dashed line + ring for pawn moves, a colored bar for wall placements).
* If both moves are identical, only a single blue "same" marker is drawn.
*
* Sizes below are plain SVG user units (not tied to the main board's CSS
* variables) so this can be generated as a plain string, independent of
* the live board's DOM/layout.
*/
const COACH_BOARD = {
    longLen: 36,   // size of a pawn cell (square)
    shortLen: 12,  // size of the gap between cells where walls sit
};
COACH_BOARD.step = COACH_BOARD.longLen + COACH_BOARD.shortLen;
COACH_BOARD.wallGap = COACH_BOARD.shortLen * 0.25;
COACH_BOARD.wallWidth = COACH_BOARD.shortLen - 2 * COACH_BOARD.wallGap;
COACH_BOARD.wallLength = 2 * COACH_BOARD.longLen + COACH_BOARD.shortLen - 2 * COACH_BOARD.wallGap;
COACH_BOARD.size = 9 * COACH_BOARD.longLen + 8 * COACH_BOARD.shortLen;

// Kept in sync with style.css's Bali-inspired palette (--color-board-bg,
// --color-sand, --color-teak, --color-gold, --color-espresso). The last
// three (player/ai/same) are semantic move-review indicators tuned earlier
// for contrast/clarity, not decorative, so they're intentionally left as-is.
const COACH_COLOR = {
    boardBg: "rgb(85, 101, 74)",
    cellBg: "rgb(231, 220, 195)",
    wall: "rgb(192, 138, 82)",
    pawn0: "rgb(201, 162, 39)",
    pawn1: "rgb(59, 42, 32)",
    player: "rgb(210, 40, 40)",
    ai: "rgb(52, 199, 89)",
    same: "rgb(41, 150, 244)"
};

function coachCellX(col) {
    return col * COACH_BOARD.step;
}
function coachCellY(row) {
    return row * COACH_BOARD.step;
}
function coachCellCenter(row, col) {
    return { x: coachCellX(col) + COACH_BOARD.longLen / 2, y: coachCellY(row) + COACH_BOARD.longLen / 2 };
}
function coachHorizontalWallRect(row, col) {
    return {
        x: coachCellX(col) + COACH_BOARD.wallGap,
        y: coachCellY(row) + COACH_BOARD.longLen + COACH_BOARD.wallGap,
        width: COACH_BOARD.wallLength,
        height: COACH_BOARD.wallWidth
    };
}
function coachVerticalWallRect(row, col) {
    return {
        x: coachCellX(col) + COACH_BOARD.longLen + COACH_BOARD.wallGap,
        y: coachCellY(row) + COACH_BOARD.wallGap,
        width: COACH_BOARD.wallWidth,
        height: COACH_BOARD.wallLength
    };
}

// Build the SVG markup overlaying a single move (pawn move or wall placement)
// in the given color. originCenter is the moving pawn's current position,
// used as the start point for the pawn-move indicator line.
function coachBuildMoveOverlay(move, color, originCenter) {
    if (!move) {
        return "";
    }
    if (move[0]) {
        const dest = coachCellCenter(move[0][0], move[0][1]);
        const ringR = COACH_BOARD.longLen * 0.42;
        return (
            '<line x1="' + originCenter.x + '" y1="' + originCenter.y + '" x2="' + dest.x + '" y2="' + dest.y +
            '" stroke="' + color + '" stroke-width="3.5" stroke-dasharray="6,5" stroke-linecap="round" opacity="0.95" />' +
            '<circle cx="' + dest.x + '" cy="' + dest.y + '" r="' + ringR + '" fill="none" stroke="' + color + '" stroke-width="4" />'
        );
    } else if (move[1]) {
        const r = coachHorizontalWallRect(move[1][0], move[1][1]);
        return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.width + '" height="' + r.height + '" fill="' + color + '" rx="2" />';
    } else if (move[2]) {
        const r = coachVerticalWallRect(move[2][0], move[2][1]);
        return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.width + '" height="' + r.height + '" fill="' + color + '" rx="2" />';
    }
    return "";
}

// Build a full SVG snapshot of the board (as it was right before the pending
// human move), with the human's move and the Strong AI's recommended move
// overlaid. `same` collapses both overlays into a single blue marker.
function coachBuildBoardSVG(game, playerMove, aiMove, same) {
    const B = COACH_BOARD;
    const C = COACH_COLOR;
    const size = B.size;
    let svg = '<rect x="0" y="0" width="' + size + '" height="' + size + '" rx="' + (size * 0.02) + '" fill="' + C.boardBg + '" />';

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            svg += '<rect x="' + coachCellX(c) + '" y="' + coachCellY(r) + '" width="' + B.longLen + '" height="' + B.longLen +
                '" rx="' + (B.longLen * 0.05) + '" fill="' + C.cellBg + '" />';
        }
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (game.board.walls.horizontal[r][c]) {
                const wr = coachHorizontalWallRect(r, c);
                svg += '<rect x="' + wr.x + '" y="' + wr.y + '" width="' + wr.width + '" height="' + wr.height + '" fill="' + C.wall + '" />';
            }
            if (game.board.walls.vertical[r][c]) {
                const wr = coachVerticalWallRect(r, c);
                svg += '<rect x="' + wr.x + '" y="' + wr.y + '" width="' + wr.width + '" height="' + wr.height + '" fill="' + C.wall + '" />';
            }
        }
    }

    const pawnR = B.longLen * 0.35;
    const p0 = coachCellCenter(game.board.pawns[0].position.row, game.board.pawns[0].position.col);
    const p1 = coachCellCenter(game.board.pawns[1].position.row, game.board.pawns[1].position.col);
    svg += '<circle cx="' + p0.x + '" cy="' + p0.y + '" r="' + pawnR + '" fill="' + C.pawn0 + '" stroke="white" stroke-width="1.5" />';
    svg += '<circle cx="' + p1.x + '" cy="' + p1.y + '" r="' + pawnR + '" fill="' + C.pawn1 + '" stroke="white" stroke-width="1.5" />';

    const origin = coachCellCenter(game.pawnOfTurn.position.row, game.pawnOfTurn.position.col);
    if (same) {
        svg += coachBuildMoveOverlay(aiMove, C.same, origin);
    } else {
        svg += coachBuildMoveOverlay(playerMove, C.player, origin);
        svg += coachBuildMoveOverlay(aiMove, C.ai, origin);
    }

    return '<svg viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' + svg + '</svg>';
}

/*
* View part in the MVC pattern
*/
class View {
    constructor(controller, aiDevelopMode = false) {
        this.controller = controller;
        this.aiDevelopMode = aiDevelopMode;

        this._game = null;
        this.progressBarIntervalId = null;
        this.aiLevel = null;
        this.numOfMCTSSimulations = null;

        this.htmlBoardTable = document.getElementById("board_table");
        this.htmlPawns = [document.getElementById("pawn0"), document.getElementById("pawn1")];
        this.htmlMessageBox = document.getElementById("message_box");
        
        this.htmlAboutBox = document.getElementById("about_box");
        this.htmlChooseAILevelMessageBox = document.getElementById("choose_ai_level_message_box");
        this.htmlChoosePawnMessageBox = document.getElementById("choose_pawn_message_box");
        this.htmlRestartMessageBox = document.getElementById("restart_message_box");

        // Move-review coach modal elements
        this.htmlCoachMessageBox = document.getElementById("coach_message_box");
        this.htmlCoachToggle = document.getElementById("coach_toggle");
        const coachContinueButton = document.getElementById("coach_continue");
        if (coachContinueButton) {
            coachContinueButton.onclick = (function(e) {
                this.controller.applyPendingHumanMove();
            }).bind(this);
        }
        if (this.htmlCoachToggle) {
            this.htmlCoachToggle.onclick = (function(e) {
                this.controller.setCoachEnabled(!this.controller.coachEnabled);
                this.updateCoachToggleLabel();
            }).bind(this);
            this.updateCoachToggleLabel();
        }
        
        // for choosing AI level
        const aiLevelButton = {
            novice: document.getElementById("novice_level"),
            average: document.getElementById("average_level"),
            good: document.getElementById("good_level"),
            strong: document.getElementById("strong_level")
        }
        const onclickAILevelButton = function(e) {
            const x = e.target;
            if (x.id === "novice_level") {
                this.aiLevel = "Novice";
                this.numOfMCTSSimulations = 2500;
            } else if (x.id === "average_level") {
                this.aiLevel = "Average";
                this.numOfMCTSSimulations = 7500;
            } else if (x.id === "good_level") {
                this.aiLevel = "Good";
                this.numOfMCTSSimulations = 20000;
            } else if (x.id === "strong_level") {
                this.aiLevel = "Strong";
                this.numOfMCTSSimulations = 60000;
            } 
            this.htmlChooseAILevelMessageBox.classList.add("hidden");
            this.htmlChoosePawnMessageBox.classList.remove("hidden");
        };
        aiLevelButton.novice.onclick = onclickAILevelButton.bind(this);
        aiLevelButton.good.onclick = onclickAILevelButton.bind(this);
        aiLevelButton.strong.onclick = onclickAILevelButton.bind(this);
        aiLevelButton.average.onclick = onclickAILevelButton.bind(this);

        // for choosing pawn
        const pawn0Button = document.getElementsByClassName("pawn pawn0 button")[0];
        const pawn1Button = document.getElementsByClassName("pawn pawn1 button")[0];
        const onclickPawnButton = function(e) {
            const x = e.target;
            if (x.classList.contains("pawn0")) {
                this.startNewGame(true, this.numOfMCTSSimulations);
            } else if (x.classList.contains("pawn1")) {
                this.startNewGame(false, this.numOfMCTSSimulations);
            }
        };
        pawn0Button.onclick = onclickPawnButton.bind(this);
        pawn1Button.onclick = onclickPawnButton.bind(this);

        this.button = {
            confirm: document.getElementById("confirm_button"),
            cancel: document.getElementById("cancel_button"),
            undo: document.getElementById("undo_button"),
            redo: document.getElementById("redo_button"),
            aiDo: document.getElementById("aido_button")
        };
        this.button.confirm.disabled = true;
        this.button.cancel.disabled = true;
        this.button.undo.disabled = true;
        this.button.redo.disabled = true;
        this.button.aiDo.disabled = true;
        
        const onclickUndoButton = function(e) {
            this.button.undo.disabled = true;
            this.button.redo.disabled = true;
            this.button.aiDo.disabled = true;
            this.button.confirm.disabled = true;
            this.button.cancel.disabled = true;
            View.removePreviousFadeInoutBox();
            View.cancelPawnClick();
            View.cancelWallShadows();
            this.controller.undo();
        };
        this.button.undo.onclick = onclickUndoButton.bind(this);

        const onclickRedoButton = function(e) {
            this.button.redo.disabled = true;
            this.button.undo.disabled = true;
            this.button.aiDo.disabled = true;
            this.button.confirm.disabled = true;
            this.button.cancel.disabled = true;
            View.cancelPawnClick();
            View.cancelWallShadows();
            this.controller.redo();
        }
        this.button.redo.onclick = onclickRedoButton.bind(this);

        const restartButton = document.getElementById("restart_button");
        const onclickRestartButton = function(e) {
            this.button.undo.disabled = true;
            this.button.redo.disabled = true
            this.button.aiDo.disabled = true;
            View.removePreviousFadeInoutBox();
            this.htmlAboutBox.classList.add("hidden");
            this.htmlChoosePawnMessageBox.classList.add("hidden");
            this.htmlChooseAILevelMessageBox.classList.add("hidden");
            this.htmlRestartMessageBox.classList.remove("hidden");
        };
        restartButton.onclick = onclickRestartButton.bind(this);
        
        const restartYesNoButton = {
            yes: document.getElementById("restart_yes"),
            no: document.getElementById("restart_no")
        }
        const onclickRestartYesNoButton = function(e) {
            const x = e.target;
            this.htmlRestartMessageBox.classList.add("hidden");
            if (x.id === "restart_yes") {
                this.htmlChooseAILevelMessageBox.classList.remove("hidden");
            } else {
                this.enableUndoRedoButtonIfNecessary();
            }
        }
        restartYesNoButton.yes.onclick = onclickRestartYesNoButton.bind(this);
        restartYesNoButton.no.onclick = onclickRestartYesNoButton.bind(this);
        
        const onclickAboutButton = function(e) {
            if (this.htmlAboutBox.classList.contains("hidden")) {
                this.button.undo.disabled = true;
                this.button.redo.disabled = true;
                View.removePreviousFadeInoutBox();
                this.htmlRestartMessageBox.classList.add("hidden");
                this.htmlChooseAILevelMessageBox.classList.add("hidden");
                this.htmlChoosePawnMessageBox.classList.add("hidden");
                this.htmlAboutBox.classList.remove("hidden");
            } else {
                this.htmlAboutBox.classList.add("hidden");
                this.enableUndoRedoButtonIfNecessary();
            }
        }
        const aboutButton = document.getElementById("about_button");
        aboutButton.onclick = onclickAboutButton.bind(this);

        const onclickCloseButtonInAbout = function(e) {
            this.htmlAboutBox.classList.add("hidden");
            this.enableUndoRedoButtonIfNecessary();
        }
        const onclickCloseButtonInAboutFirst = function(e) {
            this.htmlAboutBox.classList.add("hidden");
            this.htmlChooseAILevelMessageBox.classList.remove("hidden");
            closeButtonInAbout.onclick = onclickCloseButtonInAbout.bind(this);
        }
        const closeButtonInAbout = document.getElementById("about_close_button");
        closeButtonInAbout.onclick = onclickCloseButtonInAboutFirst.bind(this);

        if (this.aiDevelopMode) {
            const onclickAiDoButton = function(e) {
                this._removePreviousRender();
                this.button.aiDo.disabled = true;
                this.button.confirm.disabled = true;
                this.button.cancel.disabled = true;
                View.cancelPawnClick();
                View.cancelWallShadows();
                this.controller.aiDo();
            };
            this.button.aiDo.onclick = onclickAiDoButton.bind(this);
            this.button.aiDo.classList.remove("hidden");
        }

        const htmlConfirmButtonStyle = window.getComputedStyle(this.button.confirm);
        // decide whether it is touch device or not, this display attribute is under css media query.
        this.isHoverPossible = (htmlConfirmButtonStyle.display === "none");

        // set UI for touch device
        if (!this.isHoverPossible) {
            this.setUIForTouchDevice();
        }
    }

    set game(game) {
        this._game = game;

        View.removeWalls();
        this.htmlPawns[0].classList.remove("hidden");
        this.htmlPawns[1].classList.remove("hidden");

        // initialize number of left walls box
        let symbolPawnList = document.getElementsByClassName("pawn symbol");
        let wallNumList = document.getElementsByClassName("wall_num");
        if (this.game.board.pawns[0].goalRow === 8) {
            symbolPawnList[0].classList.remove("pawn1");
            wallNumList[0].classList.remove("pawn1");
            symbolPawnList[0].classList.add("pawn0");
            wallNumList[0].classList.add("pawn0");

            symbolPawnList[1].classList.remove("pawn0");
            wallNumList[1].classList.remove("pawn0");
            symbolPawnList[1].classList.add("pawn1");
            wallNumList[1].classList.add("pawn1");
            this.htmlWallNum = {pawn0: wallNumList[0], pawn1: wallNumList[1]};
        } else {
            symbolPawnList[0].classList.remove("pawn0");
            wallNumList[0].classList.remove("pawn0");
            symbolPawnList[0].classList.add("pawn1");
            wallNumList[0].classList.add("pawn1");

            symbolPawnList[1].classList.remove("pawn1");
            wallNumList[1].classList.remove("pawn1");
            symbolPawnList[1].classList.add("pawn0");
            wallNumList[1].classList.add("pawn0");
            this.htmlWallNum = {pawn0: wallNumList[1], pawn1: wallNumList[0]};
        }
    }
    get game() {
        return this._game;
    }
    
    setUIForTouchDevice() {
        const onclickConfirmButton = function(e) {
            this.button.confirm.disabled = true;
            this.button.cancel.disabled = true;
            const clickedPawns = document.getElementsByClassName("pawn clicked");
            if (clickedPawns.length > 0) {
                const clickedPawn = clickedPawns[0];
                const row = clickedPawn.parentElement.parentElement.rowIndex / 2;
                const col = clickedPawn.parentElement.cellIndex / 2;
                View.cancelPawnClick();
                this.submitMove([[row, col], null, null]);
            } else {
                const horizontalWallShadows = document.getElementsByClassName("horizontal_wall shadow");
                const verticalWallShadows = document.getElementsByClassName("vertical_wall shadow");
                if (horizontalWallShadows.length > 0) {
                    const horizontalWallShadow = horizontalWallShadows[0];
                    const row = (horizontalWallShadow.parentElement.parentElement.rowIndex - 1) / 2;
                    const col = horizontalWallShadow.parentElement.cellIndex / 2;
                    View.cancelWallShadows();
                    this.submitMove([null, [row, col], null]);
                } else if (verticalWallShadows.length > 0) {
                    const verticalWallShadow = verticalWallShadows[0];
                    const row = verticalWallShadow.parentElement.parentElement.rowIndex / 2;
                    const col = (verticalWallShadow.parentElement.cellIndex - 1) / 2;
                    View.cancelWallShadows();
                    this.submitMove([null, null, [row, col]]);
                }
            }
        };
        const onclickCancelButton = function(e) {
            this.button.confirm.disabled = true;
            this.button.cancel.disabled = true;
            View.cancelPawnClick();
            View.cancelWallShadows();
        };
        
        this.button.confirm.onclick = onclickConfirmButton.bind(this);
        this.button.cancel.onclick = onclickCancelButton.bind(this);
    }

    startNewGame(isHumanPlayerFirst, numOfMCTSSimulations) {
        this.htmlChoosePawnMessageBox.classList.add("hidden");
        this.controller.startNewGame(isHumanPlayerFirst, numOfMCTSSimulations);
    }

    printMessage(message) {
        let textNode;
        for (let i = 0; i < this.htmlMessageBox.childNodes.length; i++) {
            if (this.htmlMessageBox.childNodes[i].nodeType === Node.TEXT_NODE) {
                textNode = this.htmlMessageBox.childNodes[i];
                break;
            }
        }
        textNode.nodeValue = message;
    }

    printImpossibleWallMessage() {
        View.removePreviousFadeInoutBox();
        const box = document.createElement("div");
        box.classList.add("fade_box")
        box.classList.add("inout");
        box.id = "note_message_box";
        box.innerHTML = "There must remain at least one path to the goal for each pawn.";
        const boardTableContainer = document.getElementById("board_table_container");
        boardTableContainer.appendChild(box);
    }

    printGameResultMessage(message) {
        View.removePreviousFadeInoutBox();
        const box = document.createElement("div");
        box.classList.add("fade_box")
        box.classList.add("inout");
        box.id = "game_result_message_box";
        box.innerHTML = message;
        const boardTableContainer = document.getElementById("board_table_container");
        boardTableContainer.appendChild(box);
    }

    render() {
        this._removePreviousRender();
        this._renderNumberOfLeftWalls();
        this._renderPawnPositions();
        this._renderWalls();
        if (this.game.winner !== null) {
            if (this.game.winner.isHumanPlayer) {
                this.printGameResultMessage("You win against " + this.aiLevel + " AI!");
                this.printMessage("You win!");
            } else {
                this.printGameResultMessage(this.aiLevel + " AI wins!");
                this.printMessage(this.aiLevel + " AI wins!");
            }
        } else {
            if (this.game.pawnOfTurn.isHumanPlayer) {
                this._renderValidNextPawnPositions();
                this._renderValidNextWalls();
                this.printMessage("Your turn");
            } else {
                this.printMessage(this.aiLevel + " AI's turn");
            }

            if (this.aiDevelopMode) {
                this.button.aiDo.disabled = false;
            }
        }
        
        if (this.controller.gameHistory.length > 2) {
            this.button.undo.disabled = false;
        } else {
            this.button.undo.disabled = true;
        }
        
        if (this.controller.gameHistoryTrashCan.length > 0) {
            this.button.redo.disabled = false;
        } else {
            this.button.redo.disabled = true;
        }
    }

    _removePreviousRender() {
        for (let i = 0; i < this.htmlBoardTable.rows.length; i++) {
            for (let j = 0; j < this.htmlBoardTable.rows[0].cells.length; j++) {
                let element = this.htmlBoardTable.rows[i].cells[j];
                element.removeAttribute("onmouseenter");
                element.removeAttribute("onmouseleave");
                element.onclick = null;
            }
        }
        // remove pawn shadows which are for previous board
        let previousPawnShadows = document.getElementsByClassName("pawn shadow");
        while(previousPawnShadows.length !== 0) {
            previousPawnShadows[0].remove();
        }
    }

    _renderNumberOfLeftWalls() {
        this.htmlWallNum.pawn0.innerHTML = this.game.board.pawns[0].numberOfLeftWalls;
        this.htmlWallNum.pawn1.innerHTML = this.game.board.pawns[1].numberOfLeftWalls;
    }

    _renderPawnPositions() {
        this.htmlBoardTable.rows[this.game.board.pawns[0].position.row * 2].cells[this.game.board.pawns[0].position.col * 2].appendChild(this.htmlPawns[0]);
        this.htmlBoardTable.rows[this.game.board.pawns[1].position.row * 2].cells[this.game.board.pawns[1].position.col * 2].appendChild(this.htmlPawns[1]);
    }

    _renderValidNextPawnPositions() {
        let onclickNextPawnPosition;
        if (this.isHoverPossible) {
            onclickNextPawnPosition = function(e) {
                const x = e.target;
                const row = x.parentElement.parentElement.rowIndex / 2;
                const col = x.parentElement.cellIndex / 2;
                this.submitMove([[row, col], null, null]);
            };
        } else {
            onclickNextPawnPosition = function(e) {
                View.cancelPawnClick();
                View.cancelWallShadows();
                const x = e.target;
                let pawnShadows = document.getElementsByClassName("pawn shadow");
                for (let i = 0; i < pawnShadows.length; i++) {
                    if (pawnShadows[i] !== x) {
                        pawnShadows[i].classList.add("hidden");
                    }
                }
                x.classList.add("clicked");
                this.button.confirm.disabled = false;
                this.button.cancel.disabled = false;
            };
        }
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                if (this.game.validNextPositions[i][j] === true) {
                    let element = this.htmlBoardTable.rows[i * 2].cells[j * 2];
                    let pawnShadow = document.createElement("div");
                    pawnShadow.classList.add("pawn");
                    pawnShadow.classList.add("pawn" + this.game.pawnIndexOfTurn);
                    pawnShadow.classList.add("shadow");
                    element.appendChild(pawnShadow);
                    pawnShadow.onclick = onclickNextPawnPosition.bind(this);
                }
            }
        }
    }

    _renderWalls() {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                if(this.game.board.walls.horizontal[i][j] === true) {
                    let horizontalWall = document.createElement("div");
                    horizontalWall.classList.add("horizontal_wall");
                    if (!this.htmlBoardTable.rows[i*2+1].cells[j*2].hasChildNodes()) {
                        this.htmlBoardTable.rows[i*2+1].cells[j*2].appendChild(horizontalWall);
                    }
                }
                if(this.game.board.walls.vertical[i][j] === true) {
                    let verticalWall = document.createElement("div");
                    verticalWall.classList.add("vertical_wall");
                    if (!this.htmlBoardTable.rows[i*2].cells[j*2+1].hasChildNodes()) {
                        this.htmlBoardTable.rows[i*2].cells[j*2+1].appendChild(verticalWall);
                    }
                }
            }
        }        
    }

    _renderValidNextWalls() {
        if (this.game.pawnOfTurn.numberOfLeftWalls <= 0) {
            return;
        }
        let onclickNextHorizontalWall, onclickNextVerticalWall;
        if (this.isHoverPossible) {
            onclickNextHorizontalWall = function(e) {
                const x = e.currentTarget;
                View.horizontalWallShadow(x, false);
                const row = (x.parentElement.rowIndex - 1) / 2;
                const col = x.cellIndex / 2;
                this.submitMove([null, [row, col], null]);
            };
            onclickNextVerticalWall = function(e) {
                const x = e.currentTarget;
                View.verticalWallShadow(x, false);
                const row = x.parentElement.rowIndex / 2;
                const col = (x.cellIndex - 1) / 2;
                this.submitMove([null, null, [row, col]]);
            };
        } else {
            onclickNextHorizontalWall = function(e) {
                View.cancelPawnClick();
                View.cancelWallShadows();
                const x = e.currentTarget;
                View.horizontalWallShadow(x, true);
                this.button.confirm.disabled = false;
                this.button.cancel.disabled = false;
            };
            onclickNextVerticalWall = function(e) {
                View.cancelPawnClick();
                View.cancelWallShadows();
                const x = e.currentTarget;
                View.verticalWallShadow(x, true);
                this.button.confirm.disabled = false;
                this.button.cancel.disabled = false;
            };
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                if (this.game.validNextWalls.horizontal[i][j] === true) {
                    let element = this.htmlBoardTable.rows[i * 2 + 1].cells[j * 2];
                    if (this.isHoverPossible) {
                        element.setAttribute("onmouseenter", "View.horizontalWallShadow(this, true)");
                        element.setAttribute("onmouseleave", "View.horizontalWallShadow(this, false)");
                    }                    
                    element.onclick = onclickNextHorizontalWall.bind(this);
                }
                if (this.game.validNextWalls.vertical[i][j] === true) {
                    let element = this.htmlBoardTable.rows[i * 2].cells[j * 2 + 1];
                    if (this.isHoverPossible) {
                        element.setAttribute("onmouseenter", "View.verticalWallShadow(this, true)");
                        element.setAttribute("onmouseleave", "View.verticalWallShadow(this, false)");
                    }
                    element.onclick = onclickNextVerticalWall.bind(this);
                }
            }
        }
    }

    // this is for debug or test
    render2DArrayToBoard(arr2D) {
        // remove texts printed before
        for (let i = 0; i < arr2D.length; i++) {
            for (let j = 0; j < arr2D[0].length; j++) {
                const cell = this.htmlBoardTable.rows[2*i].cells[2*j];
                if (cell.firstChild !== null && cell.firstChild.nodeType === Node.TEXT_NODE) {
                    cell.firstChild.remove();
                };
            }
        }

        if (arr2D.length === 9 && arr2D[0].length === 9) {
            for (let i = 0; i < arr2D.length; i++) {
                for (let j = 0; j < arr2D[0].length; j++) {
                    const textNode = document.createTextNode(arr2D[i][j])
                    const cell = this.htmlBoardTable.rows[2*i].cells[2*j];
                    cell.insertBefore(textNode, cell.firstChild);
                }
            }
        }
    }

    adjustProgressBar(percentage) {
        percentage = Math.round(percentage);
        const htmlProgressBar = document.getElementById("progress_bar");
        if (this.progressBarIntervalId !== null) {
            clearInterval(this.progressBarIntervalId);
            this.progressBarIntervalId = null;
        }
        let width = parseInt(htmlProgressBar.style.width, 10);
        if (width > percentage) {
            width = 0;
            htmlProgressBar.style.width = width + '%';
        }
        const frame = function() {
            if (width >= percentage) {
                clearInterval(this.progressBarIntervalId);
                this.progressBarIntervalId = null;
                if (percentage >= 100) {
                    width = 0;
                    htmlProgressBar.style.width = width + '%';
                }
            } else {
                width++;
                htmlProgressBar.style.width = width + '%'; 
            }
        }
        if (percentage >= 100) {
            this.progressBarIntervalId = setInterval(frame.bind(this), 1);
        } else {
            this.progressBarIntervalId = setInterval(frame.bind(this), 10);
        }
    }

    enableUndoRedoButtonIfNecessary() {
        const gameHistory = this.controller.gameHistory;
        if (gameHistory !== null && gameHistory.length > 2) {
            this.button.undo.disabled = false;
        }

        const gameHistoryTrashCan = this.controller.gameHistoryTrashCan;
        if (gameHistoryTrashCan !== null && gameHistoryTrashCan.length > 0) {
            this.button.redo.disabled = false;
        }
    }

    static horizontalWallShadow(x, turnOn) {
        if (turnOn === true) {
            const _horizontalWallShadow = document.createElement("div");
            _horizontalWallShadow.classList.add("horizontal_wall");
            _horizontalWallShadow.classList.add("shadow");
            x.appendChild(_horizontalWallShadow);
        } else {
            while (x.firstChild) {
                x.removeChild(x.firstChild);
            }  
        }
    }
    
    static verticalWallShadow(x, turnOn) {
        if (turnOn === true) {
            const _verticalWallShadow = document.createElement("div");
            _verticalWallShadow.classList.add("vertical_wall");
            _verticalWallShadow.classList.add("shadow");
            x.appendChild(_verticalWallShadow);
        } else {
            while (x.firstChild) {
                x.removeChild(x.firstChild);
            }
        }
   
    }

    static cancelWallShadows() {
        let previousWallShadows = document.getElementsByClassName("horizontal_wall shadow");
        while(previousWallShadows.length !== 0) {
            previousWallShadows[0].remove();
        }
        previousWallShadows = document.getElementsByClassName("vertical_wall shadow");
        while(previousWallShadows.length !== 0) {
            previousWallShadows[0].remove();
        }
    }
    
    static cancelPawnClick() {
        let pawnShadows = document.getElementsByClassName("pawn shadow");
        for (let i = 0; i < pawnShadows.length; i++) {
            pawnShadows[i].classList.remove("clicked");
            pawnShadows[i].classList.remove("hidden");
        }
    }

    static removePreviousFadeInoutBox() {
        let previousBoxes;
        if (previousBoxes = document.getElementsByClassName("fade_box inout")) {
            while(previousBoxes.length !== 0) {
                previousBoxes[0].remove();
            }
        }
    }

    static removeWalls() {
        let previousWalls = document.querySelectorAll("td > .horizontal_wall");
        for (let i = 0; i < previousWalls.length; i++) {
            previousWalls[i].remove();
        }
        previousWalls = document.querySelectorAll("td > .vertical_wall");
        for (let i = 0; i < previousWalls.length; i++) {
            previousWalls[i].remove();
        }
    }

    // Send a move made by the human player through the controller.
    // Routed via humanMove so the Strong-AI move-review coach can intercept it.
    submitMove(move) {
        if (typeof this.controller.humanMove === "function") {
            this.controller.humanMove(move);
        } else {
            this.controller.doMove(move);
        }
    }

    updateCoachToggleLabel() {
        if (!this.htmlCoachToggle) {
            return;
        }
        const on = !!(this.controller && this.controller.coachEnabled);
        this.htmlCoachToggle.textContent = on ? "coach: on" : "coach: off";
        this.htmlCoachToggle.classList.toggle("off", !on);
    }

    // Show the coach modal in its "analyzing" state while the Strong AI thinks.
    // Clears out the previous move's board/text/legend right away so none of
    // it can remain visible (even briefly) while the new move is reviewed.
    // initialPercentage lets the progress bar pick up where a background
    // prefetch analysis already left off, instead of always restarting at 0%.
    showCoachAnalyzing(initialPercentage = 0) {
        const result = document.getElementById("coach_result");
        const analyzing = document.getElementById("coach_analyzing");
        this.clearCoachResult();
        if (result) result.classList.add("hidden");
        if (analyzing) analyzing.classList.remove("hidden");
        this.adjustCoachProgressBar(initialPercentage);
        if (this.htmlCoachMessageBox) {
            this.htmlCoachMessageBox.classList.remove("hidden");
        }
    }

    // Wipe every piece of the previous move-review result: the mini board
    // SVG, the verdict text and the legend.
    clearCoachResult() {
        const boardContainer = document.getElementById("coach_board_container");
        const verdict = document.getElementById("coach_verdict");
        if (boardContainer) { boardContainer.innerHTML = ""; boardContainer.removeAttribute("aria-label"); }
        if (verdict) { verdict.textContent = ""; verdict.className = ""; }
    }

    adjustCoachProgressBar(percentage) {
        const bar = document.getElementById("coach_progress_bar");
        if (bar) {
            bar.style.width = Math.round(percentage) + "%";
        }
    }

    hideCoachBox() {
        if (this.htmlCoachMessageBox) {
            this.htmlCoachMessageBox.classList.add("hidden");
        }
        this.clearCoachResult();
    }

    // Display the comparison between the human's move (red) and the
    // Strong AI's recommended move (green), rendered directly on a mini
    // board snapshot. If both moves are identical, show a single blue marker.
    showCoachResult(game, playerMove, aiMove) {
        // Always start from a clean slate so nothing from a previous
        // move-review can linger underneath the new one.
        this.clearCoachResult();

        const boardContainer = document.getElementById("coach_board_container");
        const verdict = document.getElementById("coach_verdict");
        const legendPlayer = document.getElementById("coach_legend_player");
        const legendAi = document.getElementById("coach_legend_ai");
        const legendSame = document.getElementById("coach_legend_same");
        const same = View.movesEqual(playerMove, aiMove);

        if (boardContainer) {
            boardContainer.innerHTML = coachBuildBoardSVG(game, playerMove, aiMove, same);
            // The move markers are conveyed visually (color + legend), but keep a
            // text equivalent as an aria-label for screen reader users.
            boardContainer.setAttribute("aria-label", same ?
                "Your move matches the Strong AI's suggestion: " + View.describeMove(playerMove, game) + "." :
                "Your move: " + View.describeMove(playerMove, game) + ". Strong AI suggests: " + View.describeMove(aiMove, game) + ".");
        }
        if (legendPlayer) legendPlayer.classList.toggle("hidden", same);
        if (legendAi) legendAi.classList.toggle("hidden", same);
        if (legendSame) legendSame.classList.toggle("hidden", !same);

        if (verdict) {
            if (same) {
                verdict.textContent = "Perfect — your move matches the Strong AI's choice!";
                verdict.className = "coach_move_same";
            } else {
                verdict.textContent = "The Strong AI would have played a different move.";
                verdict.className = "";
            }
        }

        const analyzing = document.getElementById("coach_analyzing");
        const result = document.getElementById("coach_result");
        if (analyzing) analyzing.classList.add("hidden");
        if (result) result.classList.remove("hidden");
        if (this.htmlCoachMessageBox) {
            this.htmlCoachMessageBox.classList.remove("hidden");
        }
    }

    // Whether two moves (each [pawnMove, horizontalWall, verticalWall]) are the same.
    static movesEqual(moveA, moveB) {
        if (!moveA || !moveB) {
            return false;
        }
        for (let i = 0; i < 3; i++) {
            const a = moveA[i];
            const b = moveB[i];
            if (!a && !b) {
                continue;
            }
            if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) {
                return false;
            }
        }
        return true;
    }

    // Build a short human-readable description of a move.
    // Board coordinates are shown in file(a-i)/rank(1-9) notation.
    static describeMove(move, game) {
        const files = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
        const coord = function(row, col) {
            return files[col] + (row + 1);
        };
        if (move[0]) {
            const row = move[0][0];
            const col = move[0][1];
            let direction = "";
            if (game && game.pawnOfTurn && game.pawnOfTurn.position) {
                const cur = game.pawnOfTurn.position;
                const dRow = row - cur.row;
                const dCol = col - cur.col;
                const isJump = (Math.abs(dRow) === 2 || Math.abs(dCol) === 2 || (dRow !== 0 && dCol !== 0));
                if (isJump) {
                    direction = "jump ";
                }
                if (dRow < 0 && dCol === 0) direction += "up";
                else if (dRow > 0 && dCol === 0) direction += "down";
                else if (dRow === 0 && dCol < 0) direction += "left";
                else if (dRow === 0 && dCol > 0) direction += "right";
                else if (isJump) direction = direction.trim();
            }
            direction = direction.trim();
            return "Move pawn" + (direction ? " " + direction : "") + " → " + coord(row, col);
        } else if (move[1]) {
            return "Horizontal wall @ " + coord(move[1][0], move[1][1]);
        } else if (move[2]) {
            return "Vertical wall @ " + coord(move[2][0], move[2][1]);
        }
        return "unknown move";
    }
}

