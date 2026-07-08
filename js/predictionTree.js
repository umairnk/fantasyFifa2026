import {
    updateDoc,
    doc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { db } from "./firebase.js";

import {
    FINAL_ROUND_ID,
    FINAL_ROUND_MATCH_IDS,
    getFinalRoundMatchesMap,
    getFinalRoundTreeGroups,
    createEmptyFinalPrediction,
    updatePredictionTeamsFromTree,
    saveFinalRoundPredictions
} from "./finalRoundEngine.js";

let finalPredictionMap = {};
let finalHasUnsavedChanges = false;
let finalDraftUsername = null;

export async function loadFinalRoundPredictionTree(username) {
    finalDraftUsername = username;
    const container = document.getElementById("predictionsContainer");
    const matchesMap = await getFinalRoundMatchesMap();
    const matches = Object.values(matchesMap).sort((a, b) => a.id.localeCompare(b.id));

    finalPredictionMap = {};

    matches.forEach(match => {
        finalPredictionMap[match.id] = createEmptyFinalPrediction(match);
    });

    restoreFinalRoundDraft(username);
    updatePredictionTeamsFromTree(finalPredictionMap);

    container.innerHTML = `
        <h2>🏆 QF • SF • 3rd Place • Final Predictions</h2>

        <p class="warningText">
            Predict the complete final bracket once. Winners automatically move forward in the tree.
        </p>

        <p class="smallText">
            Enter scores after extra time. If the score is level, manually select who advances.
        </p>

        ${renderFinalRoundScoringRules()}

        <div id="finalRoundDraftNotice" class="smallText"></div>

        <div id="finalRoundTreeContainer"></div>

        <button id="submitFinalRoundPredictionsBtn" class="bigButton">
            Submit Final Round Predictions
        </button>
    `;

    renderFinalRoundTree(matchesMap);

    document
        .getElementById("submitFinalRoundPredictionsBtn")
        .addEventListener("click", async () => {
            await submitFinalRoundTreePredictions(username);
        });
}

function renderFinalRoundScoringRules() {
    return `
        <div id="qfsffScoringRules" class="scoringExplanation">
            <h2>Scoring Rules</h2>

            <p>
                <strong>Quarter Finals:</strong>
                Same rules as before. Maximum <strong>4 points</strong> per match:
            </p>

            <ul>
                <li><strong>1 point</strong> for correct winner.</li>
                <li><strong>1 point</strong> for correct number of goals by the winner.</li>
                <li><strong>1 point</strong> for correct number of goals by the loser.</li>
                <li><strong>1 point</strong> for correct goal difference.</li>
            </ul>

            <p>
                <strong>Semifinals, 3rd Place and Final:</strong>
                If both predicted teams are correct, the same scoring rules apply.
                If only one qualified team is correct, only that team's correct number
                of goals will count, and if this team wins, the winner point will also count.
                If none of the two qualified teams are correctly predicted, then
                <strong>0 points</strong> will be awarded.
            </p>

            <p style="color: darkorange; font-weight: bold;">
                Bonus Point: Correctly predicting the winner of a Semifinal or the
                3rd Place match gives 1 bonus point. Correctly predicting the winner
                of the Final gives 2 bonus points.
            </p>

            <p class="smallText">
                Example: Prediction for SF1: France 2-0 Belgium with Winner = France. 
                Real score is France 2-0 Spain with Winner = France. Total points = 3
                where 1 point for correct score for France, 1 point for correct winner, and 1 Bonus point 
            </p>
        </div>
    `;
}

function getFinalRoundDraftKey(username) {
    return `predictionDraft_${username}_${FINAL_ROUND_ID}`;
}

function saveFinalRoundDraft() {
    if (!finalDraftUsername) return;

    updatePredictionTeamsFromTree(finalPredictionMap);
    localStorage.setItem(
        getFinalRoundDraftKey(finalDraftUsername),
        JSON.stringify(finalPredictionMap)
    );

    const notice = document.getElementById("finalRoundDraftNotice");
    if (notice) {
        notice.innerHTML = "Draft saved locally on this device.";
    }
}

function restoreFinalRoundDraft(username) {
    const rawDraft = localStorage.getItem(getFinalRoundDraftKey(username));
    if (!rawDraft) return;

    try {
        const draft = JSON.parse(rawDraft);

        Object.keys(finalPredictionMap).forEach(matchId => {
            if (!draft[matchId]) return;

            finalPredictionMap[matchId].homeGoals =
                draft[matchId].homeGoals ?? null;
            finalPredictionMap[matchId].awayGoals =
                draft[matchId].awayGoals ?? null;
            finalPredictionMap[matchId].winner =
                draft[matchId].winner || null;
        });

        finalHasUnsavedChanges = true;
    } catch (error) {
        console.warn("Could not restore final round prediction draft", error);
    }
}

function clearFinalRoundDraft() {
    if (!finalDraftUsername) return;
    localStorage.removeItem(getFinalRoundDraftKey(finalDraftUsername));
}

function renderFinalRoundTree(matchesMap) {
    updatePredictionTeamsFromTree(finalPredictionMap);

    const tree = getFinalRoundTreeGroups(matchesMap);
    const container = document.getElementById("finalRoundTreeContainer");

    container.innerHTML = `
        <div class="finalBracketTree">
            <div class="finalBracketColumn">
                <h3>Quarter Finals</h3>
                ${tree.qfs.map(match => renderFinalPredictionCard(match)).join("")}
            </div>

            <div class="finalBracketColumn">
                <h3>Semi Finals</h3>
                ${tree.sfs.map(match => renderFinalPredictionCard(match)).join("")}
            </div>

            <div class="finalBracketColumn">
                <h3>3rd Place & Final</h3>
                ${tree.placement.map(match => renderFinalPredictionCard(match)).join("")}
            </div>
        </div>
    `;

    attachFinalTreeEvents(matchesMap);
}

function renderFinalPredictionCard(match) {
    const prediction = finalPredictionMap[match.id];

    return `
        <div class="matchCard finalTreeCard" id="final_card_${match.id}">
            <h4>${getStageTitle(match)}</h4>

            ${renderTeamRow(match.id, "home", prediction.homeTeam, prediction.homeGoals)}
            ${renderTeamRow(match.id, "away", prediction.awayTeam, prediction.awayGoals)}

            <p>
                Winner:
                <strong id="${match.id}_winner">
                    ${prediction.winner || "Not selected"}
                </strong>
            </p>
        </div>
    `;
}

function renderTeamRow(matchId, side, teamName, goals) {
    return `
        <div class="teamRow ${finalPredictionMap[matchId].winner === teamName ? "selectedWinner" : ""}"
             data-match="${matchId}"
             data-team="${teamName}"
             data-side="${side}">

            <button class="teamButton finalTeamButton"
                    data-match="${matchId}"
                    data-team="${teamName}"
                    data-side="${side}">
                ${teamName}
            </button>

            <div>
                <button class="goalMinus finalGoalMinus"
                        data-match="${matchId}"
                        data-team="${side}">-</button>

                <span id="${matchId}_${side}Goals">
                    ${goals === null || goals === undefined ? "-" : goals}
                </span>

                <button class="goalPlus finalGoalPlus"
                        data-match="${matchId}"
                        data-team="${side}">+</button>
            </div>
        </div>
    `;
}

function getStageTitle(match) {
    if (match.stage === "QF") return match.id.replace("QFSFF_QF_", "Quarter Final ");
    if (match.stage === "SF") return match.id.replace("QFSFF_SF_", "Semi Final ");
    if (match.stage === "3RD") return "3rd Place Play-off";
    if (match.stage === "F") return "Final";
    return match.id;
}

function attachFinalTreeEvents(matchesMap) {
    document.querySelectorAll(".finalTeamButton").forEach(button => {
        button.addEventListener("click", () => {
            const matchId = button.dataset.match;
            const team = button.dataset.team;

            setFinalTreeWinner(matchId, team);
            finalHasUnsavedChanges = true;
            saveFinalRoundDraft();
            renderFinalRoundTree(matchesMap);
        });
    });

    document.querySelectorAll(".finalGoalPlus").forEach(button => {
        button.addEventListener("click", () => {
            changeFinalGoal(button.dataset.match, button.dataset.team, 1);
            autoSetFinalWinner(button.dataset.match);
            finalHasUnsavedChanges = true;
            saveFinalRoundDraft();
            renderFinalRoundTree(matchesMap);
        });
    });

    document.querySelectorAll(".finalGoalMinus").forEach(button => {
        button.addEventListener("click", () => {
            changeFinalGoal(button.dataset.match, button.dataset.team, -1);
            autoSetFinalWinner(button.dataset.match);
            finalHasUnsavedChanges = true;
            saveFinalRoundDraft();
            renderFinalRoundTree(matchesMap);
        });
    });
}

function changeFinalGoal(matchId, side, delta) {
    const key = side === "home" ? "homeGoals" : "awayGoals";
    const current = finalPredictionMap[matchId][key];

    if (current === null || current === undefined) {
        finalPredictionMap[matchId][key] = delta > 0 ? 0 : null;
        return;
    }

    finalPredictionMap[matchId][key] = Math.max(0, current + delta);
}

function autoSetFinalWinner(matchId) {
    const prediction = finalPredictionMap[matchId];

    if (prediction.homeGoals === null || prediction.awayGoals === null) {
        return;
    }

    if (prediction.homeGoals > prediction.awayGoals) {
        prediction.winner = prediction.homeTeam;
    } else if (prediction.awayGoals > prediction.homeGoals) {
        prediction.winner = prediction.awayTeam;
    } else if (
        prediction.winner !== prediction.homeTeam &&
        prediction.winner !== prediction.awayTeam
    ) {
        prediction.winner = null;
    }
}

function setFinalTreeWinner(matchId, team) {
    const prediction = finalPredictionMap[matchId];

    if (
        prediction.homeGoals !== null &&
        prediction.awayGoals !== null &&
        prediction.homeGoals > prediction.awayGoals &&
        team !== prediction.homeTeam
    ) {
        return;
    }

    if (
        prediction.homeGoals !== null &&
        prediction.awayGoals !== null &&
        prediction.awayGoals > prediction.homeGoals &&
        team !== prediction.awayTeam
    ) {
        return;
    }

    prediction.winner = team;
}

async function submitFinalRoundTreePredictions(username) {
    updatePredictionTeamsFromTree(finalPredictionMap);

    for (const matchId of Object.keys(finalPredictionMap)) {
        const prediction = finalPredictionMap[matchId];

        if (
            !prediction.homeTeam ||
            !prediction.awayTeam ||
            prediction.homeTeam.includes("Winner") ||
            prediction.awayTeam.includes("Winner") ||
            prediction.homeTeam.includes("Loser") ||
            prediction.awayTeam.includes("Loser") ||
            prediction.homeGoals === null ||
            prediction.awayGoals === null ||
            !prediction.winner
        ) {
            alert(`Please complete ${prediction.matchId} first.`);
            return;
        }
    }

    const confirmSubmit = confirm(
        "Submit your complete QF-SF-F prediction tree? Once submitted, it cannot be edited."
    );

    if (!confirmSubmit) return;

    await saveFinalRoundPredictions(username, finalPredictionMap);

    finalHasUnsavedChanges = false;
    clearFinalRoundDraft();
    alert("Final round predictions submitted successfully.");

    window.location.reload();
}
