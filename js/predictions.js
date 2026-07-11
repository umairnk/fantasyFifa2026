import { db } from "./firebase.js";
import { round32Matches } from "./defaultMatches.js";
import { round16Matches } from "./round16Matches.js";
import { finalRoundMatches } from "./finalRoundMatches.js";

import {
    doc,
    getDoc,
    setDoc,
    collection,
    getDocs,
    updateDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    calculatePoints
}
from "./scoring.js";

import {
    calculateFinalRoundScore
}
from "./finalRoundEngine.js";

import {
    getGroup
}
from "./groups.js";

import {
    loadFinalRoundPredictionTree
}
from "./predictionTree.js";


let predictions = {};
let hasUnsavedPredictionChanges = false;
let predictionNavigationWarningAttached = false;
let predictionNavButtonHandlers = [];

const PREDICTION_ROUNDS = [
    "RoundOf32",
    "RoundOf16",
    "QF-SF-F"
];

const OVERLAP_ROUNDS = [
    "All",
    ...PREDICTION_ROUNDS
];



export async function initializeMatches() {
    await initializeMatchRound(round32Matches, "RoundOf32");
    await initializeMatchRound(round16Matches, "RoundOf16");
    await initializeMatchRound(finalRoundMatches, "QF-SF-F");
}


async function initializeMatchRound(matchesArray, roundName) {
    for (const match of matchesArray) {
        const matchRef = doc(db, "matches", match.id);
        const snap = await getDoc(matchRef);

        if (!snap.exists()) {
            await setDoc(matchRef, {
                id: match.id,
                round: roundName,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                startTime: match.startTime || null,
                homeGoals: null,
                awayGoals: null,
                winner: null,
                status: "upcoming",
                createdAt: new Date().toISOString()
            });
        } else {
            await setDoc(matchRef, {
                id: match.id,
                round: roundName,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                startTime: match.startTime || null,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }
    }
}

export async function loadPredictionPage(username, groupId = null, groupName = null) {
    const container = document.getElementById("predictionsContainer");
    container.innerHTML = "";
    disablePredictionLeaveWarning();
    hasUnsavedPredictionChanges = false;
    predictions = {};

    const userRef = doc(db, "users", username);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        container.innerHTML = "<p>User not found.</p>";
        return;
    }

    const userData = userSnap.data();

    const settings = await getTournamentSettings();
    const activeRound = settings.activePredictionRound || "RoundOf16";
    const submittedField = getSubmittedFieldForRound(activeRound);

    if (userData[submittedField]) {
        await showSubmittedPredictions(username, groupId, groupName, activeRound);
        return;
    }

    if (isPredictionRoundClosed(settings, activeRound)) {
        await showPredictionClosedPage(username, groupId, groupName, activeRound);
        return;
    }

    if (activeRound === "QF-SF-F") {
        await loadFinalRoundPredictionTree(username, groupId, groupName);
        insertQfsffScoringRules();
        return;
    }

    const matches = await getMatchesForRound(activeRound);
    const roundTitle = getRoundTitle(activeRound);

    container.innerHTML = `
        <h2>${roundTitle} Predictions</h2>

        <p class="warningText">
            Once submitted, predictions cannot be edited.
        </p>

        <p>
            For matches resolved by penalties, enter the score until the end of extra time.
        </p>

        <div class="scoringExplanation">
            <h2>How scoring works</h2>

            <p>Maximum score per match: <strong>4 points</strong>.</p>

            <ul>
                <li><strong>1 point</strong> for correct winner.</li>
                <li><strong>1 point</strong> for correct number of goals by the winner.</li>
                <li><strong>1 point</strong> for correct number of goals by the losing team.</li>
                <li><strong>1 point</strong> for correct goal difference.</li>
            </ul>

            <p>
                Example: Prediction Germany 4 - 2 France,
                actual result Germany 2 - 0 France.
                You get 1 point for correct winner and
                1 point for correct goal difference.
                Total: <strong>2 points</strong>.
            </p>

            <p class="smallText">
                Goal difference is important. A 4-2 prediction and a 2-0 result both have a goal difference of 2.
            </p>
        </div>
    `;

    matches.forEach(match => {
        predictions[match.id] = {
            homeGoals: null,
            awayGoals: null,
            winner: null
        };

        container.innerHTML += createMatchCard(match);
    });

    container.innerHTML += `
        <button id="submitPredictionsBtn" class="bigButton">
            Submit Predictions
        </button>
    `;

    attachPredictionEvents(matches);
    setupPredictionLeaveWarning();

    document
        .getElementById("submitPredictionsBtn")
        .addEventListener("click", () => {
            submitPredictions(username, matches);
        });
}


async function getRound32Matches() {
    const matchesSnap = await getDocs(collection(db, "matches"));
    const matches = [];

    matchesSnap.forEach(docSnap => {
        const match = docSnap.data();

        if (match.round === "RoundOf32") {
            matches.push(match);
        }
    });

    matches.sort((a, b) => a.id.localeCompare(b.id));

    return matches;
}

function getQfsffGameInfo(match) {
    const matchId = match.id || "";

    if (matchId.includes("_QF_01")) {
        return {
            order: 1,
            label: "Game 1: Quarter Final 1"
        };
    }

    if (matchId.includes("_QF_02")) {
        return {
            order: 2,
            label: "Game 2: Quarter Final 2"
        };
    }

    if (matchId.includes("_QF_03")) {
        return {
            order: 3,
            label: "Game 3: Quarter Final 3"
        };
    }

    if (matchId.includes("_QF_04")) {
        return {
            order: 4,
            label: "Game 4: Quarter Final 4"
        };
    }

    if (matchId.includes("_SF_01")) {
        return {
            order: 5,
            label: "Game 5: Semi Final 1"
        };
    }

    if (matchId.includes("_SF_02")) {
        return {
            order: 6,
            label: "Game 6: Semi Final 2"
        };
    }

    if (matchId.includes("_3RD_")) {
        return {
            order: 7,
            label: "Game 7: 3rd Place Match"
        };
    }

    if (matchId.includes("_F_")) {
        return {
            order: 8,
            label: "Game 8: Final"
        };
    }

    return {
        order: 999,
        label: matchId
    };
}


async function getMatchesForRound(round) {
    const matchesSnap = await getDocs(collection(db, "matches"));
    const matches = [];

    matchesSnap.forEach(docSnap => {
        const match = docSnap.data();

        if (match.round === round) {
            matches.push(match);
        }
    });

    if (round === "QF-SF-F") {
        matches.sort((a, b) =>
            getQfsffGameInfo(a).order -
            getQfsffGameInfo(b).order
        );
    } else {
        matches.sort((a, b) => a.id.localeCompare(b.id));
    }

    return matches;
}

async function getAllMatchesMap() {
    const matchesSnap = await getDocs(collection(db, "matches"));
    const matches = {};

    matchesSnap.forEach(docSnap => {
        matches[docSnap.id] = docSnap.data();
    });

    return matches;
}


async function getUserPredictions(username) {
    const snap =
        await getDocs(collection(db, "predictions", username, "matches"));

    const predictionsMap = {};

    snap.forEach(docSnap => {
        predictionsMap[docSnap.id] = docSnap.data();
    });

    return predictionsMap;
}

async function getTournamentSettings() {
    const snap = await getDoc(doc(db, "settings", "tournament"));

    if (!snap.exists()) {
        return {
            activePredictionRound: "RoundOf16",
            displayPredictions: {
                RoundOf32: true,
                RoundOf16: true,
                "QF-SF-F": false
            },
            predictionsOpen: {
                RoundOf32: false,
                RoundOf16: false,
                "QF-SF-F": false
            },
            predictionsClosed: {
                RoundOf32: true,
                RoundOf16: true,
                "QF-SF-F": false
            }
        };
    }

    return snap.data();
}


function getSubmittedFieldForRound(round) {
    if (round === "RoundOf32") return "predictionsSubmittedRound32";
    if (round === "RoundOf16") return "predictionsSubmittedRound16";
    if (round === "QF-SF-F") return "predictionsSubmittedQFSFF";

    return "predictionsSubmittedQFSFF";
}


function getRoundTitle(round) {

    if (round === "RoundOf32")
        return "Round of 32";

    if (round === "RoundOf16")
        return "Round of 16";

    if (round === "QF-SF-F")
        return "QF • SF • 3rd Place • Final";

    return round;
}


function insertQfsffScoringRules() {
    const container = document.getElementById("predictionsContainer");

    if (!container || document.getElementById("qfsffScoringRules")) {
        return;
    }

    const scoringHtml = `
        
    `;

    const firstRoundHeading = Array
        .from(container.querySelectorAll("h3"))
        .find(heading => heading.textContent.trim() === "Quarter Finals");

    if (firstRoundHeading) {
        firstRoundHeading.insertAdjacentHTML("beforebegin", scoringHtml);
        return;
    }

    container.insertAdjacentHTML("afterbegin", scoringHtml);
}


function getRoundDropdownOptions(selectedRound, includeAll = false) {
    const rounds = includeAll ? OVERLAP_ROUNDS : PREDICTION_ROUNDS;

    return rounds.map(round => `
        <option value="${round}" ${round === selectedRound ? "selected" : ""}>
            ${round === "All" ? "All predicted matches" : getRoundTitle(round)}
        </option>
    `).join("");
}


function isPredictionDisplayEnabled(settings, round) {
    if (round === "All") return true;

    const displayPredictions = settings.displayPredictions || {};

    return displayPredictions[round] === true;
}


function isPredictionRoundClosed(settings, round) {
    const predictionsClosed = settings.predictionsClosed || {};

    return predictionsClosed[round] === true;
}


function getDefaultPredictionTableRound(activeRound) {
    if (PREDICTION_ROUNDS.includes(activeRound)) {
        return activeRound;
    }

    return "RoundOf16";
}


function getRoundLabelForGame(round, gameNumber, match = null) {
    if (round === "QF-SF-F" && match) {
        return getQfsffGameInfo(match).label;
    }

    return `Game ${gameNumber}: ${getRoundTitle(round)}`;
}


async function showPredictionClosedPage(username, groupId, groupName, activeRound = "RoundOf16") {
    const container = document.getElementById("predictionsContainer");

    const settings = await getTournamentSettings();
    const displayEnabled = isPredictionDisplayEnabled(settings, activeRound);
    const roundTitle = getRoundTitle(activeRound);

    disablePredictionLeaveWarning();
    hasUnsavedPredictionChanges = false;

    if (!displayEnabled) {
        container.innerHTML = `
            <h2>${roundTitle} Predictions Closed</h2>

            <p class="warningText">
                The prediction deadline for ${roundTitle} has passed.
                Since you did not submit predictions in time, you cannot make predictions for this round anymore.
            </p>

            <p class="smallText">
                Other players' ${roundTitle} predictions are not visible yet.
                They will become visible after the admin enables prediction display.
            </p>
        `;

        return;
    }

    container.innerHTML = `
        <h2>${roundTitle} Predictions Closed</h2>

        <p class="warningText">
            The prediction deadline for ${roundTitle} has passed.
            Since you did not submit predictions in time, you cannot make predictions for this round anymore.
        </p>

        ${groupName ? `
            <p class="smallText">
                Current group: <strong>${groupName}</strong>
            </p>
        ` : `
            <p class="smallText">
                Open a group first if you want to see group predictions.
            </p>
        `}

        <div id="comparisonSection"></div>

        <hr>

        <div id="predictionsOverlapSection"></div>
    `;

    if (groupId) {
        await renderComparePlayers(username, groupId, activeRound);
        await renderPredictionsOverlap(groupId, activeRound);
    }
}


async function showSubmittedPredictions(username, groupId, groupName, activeRound = "RoundOf16") {
    const container = document.getElementById("predictionsContainer");

    const settings = await getTournamentSettings();
    const displayEnabled = isPredictionDisplayEnabled(settings, activeRound);
    const matches = await getMatchesForRound(activeRound);
    const matchesMap = await getAllMatchesMap();
    const myPredictions = await getUserPredictions(username);
    const roundTitle = getRoundTitle(activeRound);

    if (!displayEnabled) {
        container.innerHTML = `
            <h2>Your Submitted ${roundTitle} Predictions</h2>

            <p class="warningText">
                Predictions are locked and cannot be edited.
            </p>

            <p class="warningText">
                Other players' ${roundTitle} predictions are not visible yet.
                The admin must enable prediction display first.
            </p>

            ${renderMyPredictionsTable(matches, matchesMap, myPredictions)}
        `;

        return;
    }

    container.innerHTML = `
        <h2>Your Submitted Predictions</h2>

        <p class="warningText">
            Predictions are locked and cannot be edited.
        </p>

        ${groupName ? `
            <p class="smallText">
                Current group: <strong>${groupName}</strong>
            </p>
        ` : `
            <p class="smallText">
                Open a group first if you want to compare predictions with group members.
            </p>
        `}

        <div id="comparisonSection"></div>

        <hr>

        <div id="predictionsOverlapSection"></div>
    `;

    if (groupId) {
        await renderComparePlayers(username, groupId, activeRound);
        await renderPredictionsOverlap(groupId, activeRound);
    }
}

function renderMyPredictionsTable(matches, matchesMap, myPredictions) {
    return `
        <div class="leaderboardWrapper">
            <table class="leaderboardTable">
                <thead>
                    <tr>
                        <th>Match</th>
                        <th>Your Prediction</th>
                        <th>Winner</th>
                        <th>Actual Result</th>
                        <th>Points</th>
                    </tr>
                </thead>

                <tbody>
                    ${matches.map(match => {
                        const prediction = myPredictions[match.id];
                        const result = matchesMap[match.id];

                        if (!prediction) {
                            return `
                                <tr>
                                    <td>${match.homeTeam} vs ${match.awayTeam}</td>
                                    <td colspan="4">No prediction found</td>
                                </tr>
                            `;
                        }

                        const score = getPredictionScore(prediction, result);

                        return `
                            <tr>
                                <td>${match.homeTeam} vs ${match.awayTeam}</td>

                                <td>
                                    ${prediction.homeGoals} - ${prediction.awayGoals}
                                </td>

                                <td>
                                    <strong>${prediction.winner}</strong>
                                </td>

                                <td>
                                    ${formatActualResult(result)}
                                </td>

                                <td>
                                    ${score === null ? "-" : renderScore(score)}
                                </td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}


async function renderComparePlayers(currentUsername, groupId, activeRound = "RoundOf16") {
    const comparisonSection =
        document.getElementById("comparisonSection");

    const group = await getGroup(groupId);

    if (!group || !group.members) {
        comparisonSection.innerHTML = `
            <p>No group members found.</p>
        `;
        return;
    }

    const allMembers =
        Object.keys(group.members).sort();

    const members =
        allMembers
            .filter(member => member !== currentUsername)
            .sort();

    const defaultRound =
        getDefaultPredictionTableRound(activeRound);

    comparisonSection.innerHTML = `
        <hr>

        <h2>👥 Prediction Comparison</h2>

        <p class="smallText">
            Select a group member to compare predictions match by match.
        </p>

        ${
            members.length === 0
            ? `
                <p>No other members in this group yet.</p>
            `
            : `
                <div class="comparePlayers">
                    ${members.map(member => `
                        <button class="comparePlayerBtn"
                                data-player="${member}">
                            👤 ${member}
                        </button>
                    `).join("")}
                </div>
            `
        }

        <div id="headToHeadContainer"></div>

        <hr>

        <h2>📋 Group Prediction Table</h2>

        <p class="smallText">
            This table shows the selected round. The logged-in user is shown first, then all other group members in alphabetical order.
        </p>

        <div class="adminMatchCard">
            <label for="groupPredictionRoundSelect">
                <strong>Select round:</strong>
            </label>

            <select id="groupPredictionRoundSelect">
                ${getRoundDropdownOptions(defaultRound, false)}
            </select>
        </div>

        <div id="groupPredictionTableContainer"></div>
    `;

    document.querySelectorAll(".comparePlayerBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const selectedPlayer = button.dataset.player;
            const selectedRound =
                document.getElementById("groupPredictionRoundSelect").value;

            await renderHeadToHeadComparison(
                currentUsername,
                selectedPlayer,
                groupId,
                selectedRound
            );
        });
    });

    document
        .getElementById("groupPredictionRoundSelect")
        .addEventListener("change", async event => {
            await renderGroupPredictionTable(
                currentUsername,
                allMembers,
                event.target.value
            );
        });

    await renderGroupPredictionTable(
        currentUsername,
        allMembers,
        defaultRound
    );
}

async function renderGroupPredictionTable(currentUsername, allMembers, selectedRound = "RoundOf16") {
    const container =
        document.getElementById("groupPredictionTableContainer");

    const settings = await getTournamentSettings();

    if (!isPredictionDisplayEnabled(settings, selectedRound)) {
        container.innerHTML = `
            <p class="warningText">
                ${getRoundTitle(selectedRound)} predictions are not visible yet.
                The admin must enable prediction display first.
            </p>
        `;
        return;
    }

    const matches = await getMatchesForRound(selectedRound);
    const matchesMap = await getAllMatchesMap();

    if (matches.length === 0) {
        container.innerHTML = `
            <p class="smallText">
                No matches found for ${getRoundTitle(selectedRound)}.
            </p>
        `;
        return;
    }

    const orderedPlayers = [
        currentUsername,
        ...allMembers
            .filter(member => member !== currentUsername)
            .sort()
    ];

    const allPredictions = {};

    for (const player of orderedPlayers) {
        allPredictions[player] = await getUserPredictions(player);
    }

    container.innerHTML = `
        <style>
            #groupPredictionTableContainer .groupPredictionWrapper {
                max-height: 80vh;
                overflow: auto;
            }

            #groupPredictionTableContainer .groupPredictionTable thead th {
                position: sticky;
                top: 0;
                z-index: 10;
            }

            #groupPredictionTableContainer .gameNumber {
                font-weight: bold;
                color: darkgreen;
                margin-bottom: 6px;
            }
        </style>

        <div class="leaderboardWrapper groupPredictionWrapper">
            <table class="leaderboardTable groupPredictionTable">
                <thead>
                    <tr>
                        <th>Match</th>

                        ${orderedPlayers.map((player, index) => `
                            <th>
                                ${index === 0 ? "You" : player}
                            </th>
                        `).join("")}
                    </tr>
                </thead>

                <tbody>
                    ${matches.map((match, index) => {
                        const result = matchesMap[match.id];

                        return `
                            <tr>
                                <td class="predictionMatchInfo">
                                    ${renderMatchInfoCell(match, result, index + 1, selectedRound)}
                                </td>

                                ${orderedPlayers.map(player => `
                                    <td>
                                        ${renderPlayerPredictionCell(
                                            allPredictions[player][match.id],
                                            result
                                        )}
                                    </td>
                                `).join("")}
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderMatchInfoCell(match, result, gameNumber, roundName = "RoundOf32") {
    return `
        <div class="gameNumber">
            ${getRoundLabelForGame(roundName, gameNumber, match)}
        </div>

        <strong>${match.homeTeam} vs ${match.awayTeam}</strong>

        <br>

        <span class="smallText">
            ${formatGermanMatchTime(match.startTime)}
        </span>

        <br>

        <span>
            Winner:
            <strong>
                ${
                    result &&
                    result.status === "finished" &&
                    result.winner
                    ? result.winner
                    : "Not decided"
                }
            </strong>
        </span>

        ${
            result &&
            result.status === "finished" &&
            result.homeGoals !== null &&
            result.awayGoals !== null &&
            result.homeGoals !== undefined &&
            result.awayGoals !== undefined
            ? `
                <br>
                <span>
                    Result:
                    <strong>
                        ${result.homeGoals} - ${result.awayGoals}
                    </strong>
                </span>
              `
            : ""
        }
    `;
}

function renderPlayerPredictionCell(prediction, result) {
    if (!prediction) {
        return `
            <span class="smallText">No prediction</span>
        `;
    }

    const score = getPredictionScore(prediction, result);

    return `
        <strong>
            ${prediction.homeGoals} - ${prediction.awayGoals}
        </strong>

        <br>

        <span>
            Winner:
            <strong>${prediction.winner}</strong>
        </span>

        ${
            score === null
            ? ""
            : `
                <br>
                <span>${renderScore(score)}</span>
              `
        }
    `;
}


function formatGermanMatchTime(startTime) {
    if (!startTime) return "Time not set";

    const date = new Date(startTime);

    return date.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }) + " Uhr";
}


async function renderHeadToHeadComparison(currentUsername, otherUsername, groupId, selectedRound = "RoundOf16") {
    const container =
        document.getElementById("headToHeadContainer");

    container.innerHTML = `
        <h2>Loading comparison...</h2>
    `;

    const settings = await getTournamentSettings();

    if (!isPredictionDisplayEnabled(settings, selectedRound)) {
        container.innerHTML = `
            <p class="warningText">
                ${getRoundTitle(selectedRound)} predictions are not visible yet.
                The admin must enable prediction display first.
            </p>
        `;
        return;
    }

    const matches = await getMatchesForRound(selectedRound);
    const matchesMap = await getAllMatchesMap();

    const myPredictions =
        await getUserPredictions(currentUsername);

    const otherPredictions =
        await getUserPredictions(otherUsername);

    const group = await getGroup(groupId);
    const groupMembers = Object.keys(group.members);

    let myTotal = 0;
    let otherTotal = 0;
    let myWins = 0;
    let otherWins = 0;
    let draws = 0;

    const matchCards = [];

    for (const match of matches) {
        const result = matchesMap[match.id];

        const myPrediction = myPredictions[match.id];
        const otherPrediction = otherPredictions[match.id];

        const myScore =
            myPrediction ? getPredictionScore(myPrediction, result) : null;

        const otherScore =
            otherPrediction ? getPredictionScore(otherPrediction, result) : null;

        if (myScore !== null) myTotal += myScore.totalPoints;
        if (otherScore !== null) otherTotal += otherScore.totalPoints;

        let matchWinnerText = "";

        if (myScore !== null && otherScore !== null) {
            if (myScore.totalPoints > otherScore.totalPoints) {
                myWins++;
                matchWinnerText = `🏆 Match Winner: ${currentUsername}`;
            } else if (otherScore.totalPoints > myScore.totalPoints) {
                otherWins++;
                matchWinnerText = `🏆 Match Winner: ${otherUsername}`;
            } else {
                draws++;
                matchWinnerText = "🤝 Draw";
            }
        }

        const miniLeaderboard =
            await renderMiniLeaderboardForMatch(
                match,
                result,
                groupMembers
            );

        matchCards.push(`
            <div class="comparisonMatchCard">

                <h3>${match.homeTeam} vs ${match.awayTeam}</h3>

                <p>
                    <strong>Actual:</strong>
                    ${formatActualResult(result)}
                </p>

                <div class="comparisonTwoColumns">

                    <div class="comparisonPlayerBox">
                        <h4>👤 ${currentUsername}</h4>
                        ${renderPredictionBox(myPrediction, myScore)}
                    </div>

                    <div class="comparisonPlayerBox">
                        <h4>👤 ${otherUsername}</h4>
                        ${renderPredictionBox(otherPrediction, otherScore)}
                    </div>

                </div>

                ${matchWinnerText ? `
                    <p class="matchWinnerText">
                        ${matchWinnerText}
                    </p>
                ` : ""}

                ${miniLeaderboard}

            </div>
        `);
    }

    container.innerHTML = `
        <hr>

        <h2>Head-to-Head — ${getRoundTitle(selectedRound)}</h2>

        <div class="comparisonSummary">

            <div>
                <h3>${currentUsername}</h3>
                <p class="summaryPoints">${myTotal}</p>
                <p>Match Wins: ${myWins}</p>
            </div>

            <div>
                <h3>${otherUsername}</h3>
                <p class="summaryPoints">${otherTotal}</p>
                <p>Match Wins: ${otherWins}</p>
            </div>

            <div>
                <h3>Draws</h3>
                <p class="summaryPoints">${draws}</p>
            </div>

        </div>

        ${matchCards.join("")}
    `;
}

function renderPredictionBox(prediction, score) {
    if (!prediction) {
        return `
            <p>No prediction found.</p>
        `;
    }

    return `
        <p>
            Prediction:
            <strong>
                ${prediction.homeGoals} - ${prediction.awayGoals}
            </strong>
        </p>

        <p>
            Winner:
            <strong>${prediction.winner}</strong>
        </p>

        <p>
            Points:
            ${score === null ? "-" : renderScore(score)}
        </p>
    `;
}


async function renderMiniLeaderboardForMatch(match, result, groupMembers) {
    if (
        result.status !== "finished" ||
        result.homeGoals === null ||
        result.awayGoals === null
    ) {
        return "";
    }

    const rows = [];

    for (const member of groupMembers) {
        const userPredictions = await getUserPredictions(member);
        const prediction = userPredictions[match.id];

        if (!prediction) continue;

        const score = getPredictionScore(prediction, result);

        if (score === null) continue;

        rows.push({
            player: member,
            score
        });
    }

    rows.sort((a, b) =>
        b.score.totalPoints - a.score.totalPoints ||
        a.player.localeCompare(b.player)
    );

    if (rows.length === 0) {
        return "";
    }

    return `
        <div class="miniLeaderboard">

            <h4>Mini Leaderboard for this match</h4>

            <table>
                <tbody>
                    ${rows.map((row, index) => `
                        <tr>
                            <td>${getRankDisplay(index)}</td>
                            <td>${row.player}</td>
                            <td>${renderScore(row.score)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>

        </div>
    `;
}


function getPredictionScore(prediction, result) {
    if (!prediction) {
        return null;
    }

    if (result && result.round === "QF-SF-F") {
        return calculateFinalRoundScore(prediction, result);
    }

    const normalPoints = calculatePoints(prediction, result);

    if (normalPoints === null) {
        return null;
    }

    return {
        normalPoints,
        bonusPoints: 0,
        totalPoints: normalPoints
    };
}


function renderBonus(bonusPoints) {
    if (!bonusPoints || bonusPoints < 1) {
        return "";
    }

    return ` ${"🅱️".repeat(bonusPoints)}`;
}


function renderScore(score) {
    return `${renderStars(score.normalPoints)}${renderBonus(score.bonusPoints)}`;
}


function formatActualResult(result) {
    if (
        !result ||
        result.status !== "finished" ||
        result.homeGoals === null ||
        result.awayGoals === null
    ) {
        return "Not finished";
    }

    return `
        ${result.homeTeam}
        ${result.homeGoals} - ${result.awayGoals}
        ${result.awayTeam}
    `;
}


function renderStars(points) {
    if (points === 4) return "⭐⭐⭐⭐";
    if (points === 3) return "⭐⭐⭐";
    if (points === 2) return "⭐⭐";
    if (points === 1) return "⭐";
    return "❌";
}


function formatMatchTime(startTime) {
    if (!startTime) return "";

    const date = new Date(startTime);

    return date.toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
}


function createMatchCard(match) {
    return `
        <div class="matchCard" id="card_${match.id}">

            <h3>${match.homeTeam} vs ${match.awayTeam}</h3>

            <p class="matchMeta">
                ${formatMatchTime(match.startTime)}
                <span class="statusBadge ${match.status || "upcoming"}">
                    ${match.status || "upcoming"}
                </span>
            </p>

            <div class="teamRow"
                 data-match="${match.id}"
                 data-team="${match.homeTeam}"
                 data-side="home">

                <button class="teamButton"
                        data-match="${match.id}"
                        data-team="${match.homeTeam}"
                        data-side="home">
                    ${match.homeTeam}
                </button>

                <div>
                    <button class="goalMinus"
                            data-match="${match.id}"
                            data-team="home">-</button>

                    <span id="${match.id}_homeGoals">-</span>

                    <button class="goalPlus"
                            data-match="${match.id}"
                            data-team="home">+</button>
                </div>
            </div>

            <div class="teamRow"
                 data-match="${match.id}"
                 data-team="${match.awayTeam}"
                 data-side="away">

                <button class="teamButton"
                        data-match="${match.id}"
                        data-team="${match.awayTeam}"
                        data-side="away">
                    ${match.awayTeam}
                </button>

                <div>
                    <button class="goalMinus"
                            data-match="${match.id}"
                            data-team="away">-</button>

                    <span id="${match.id}_awayGoals">-</span>

                    <button class="goalPlus"
                            data-match="${match.id}"
                            data-team="away">+</button>
                </div>
            </div>

            <p>
                Winner:
                <strong id="${match.id}_winner">
                    Not selected
                </strong>
            </p>

            <p class="smallText">
                If scores are equal, select the winner manually.
            </p>

        </div>
    `;
}


function attachPredictionEvents(matches) {
    document.querySelectorAll(".teamButton").forEach(button => {
        button.addEventListener("click", event => {
            event.stopPropagation();

            const matchId = button.dataset.match;
            const selectedTeam = button.dataset.team;

            markPredictionChanged();
            setWinner(matchId, selectedTeam);
        });
    });

    document.querySelectorAll(".goalPlus").forEach(btn => {
        btn.addEventListener("click", event => {
            event.stopPropagation();

            const matchId = btn.dataset.match;
            const team = btn.dataset.team;

            if (team === "home") {
                predictions[matchId].homeGoals =
                    predictions[matchId].homeGoals === null
                        ? 0
                        : predictions[matchId].homeGoals + 1;
            } else {
                predictions[matchId].awayGoals =
                    predictions[matchId].awayGoals === null
                        ? 0
                        : predictions[matchId].awayGoals + 1;
            }

            markPredictionChanged();
            markPredictionChanged();
            updateGoalDisplay(matchId);
            autoSelectWinner(matchId);
        });
    });

    document.querySelectorAll(".goalMinus").forEach(btn => {
        btn.addEventListener("click", event => {
            event.stopPropagation();

            const matchId = btn.dataset.match;
            const team = btn.dataset.team;

            if (
                team === "home" &&
                predictions[matchId].homeGoals !== null &&
                predictions[matchId].homeGoals > 0
            ) {
                predictions[matchId].homeGoals--;
            }

            if (
                team === "away" &&
                predictions[matchId].awayGoals !== null &&
                predictions[matchId].awayGoals > 0
            ) {
                predictions[matchId].awayGoals--;
            }

            markPredictionChanged();
            updateGoalDisplay(matchId);
            autoSelectWinner(matchId);
        });
    });
}


function updateGoalDisplay(matchId) {
    document.getElementById(`${matchId}_homeGoals`).innerText =
        predictions[matchId].homeGoals === null
            ? "-"
            : predictions[matchId].homeGoals;

    document.getElementById(`${matchId}_awayGoals`).innerText =
        predictions[matchId].awayGoals === null
            ? "-"
            : predictions[matchId].awayGoals;
}

function autoSelectWinner(matchId) {
    const homeGoals = predictions[matchId].homeGoals;
    const awayGoals = predictions[matchId].awayGoals;

    if (homeGoals === null || awayGoals === null) {
        document.getElementById(`${matchId}_winner`).innerText =
            predictions[matchId].winner || "Not selected";
        return;
    }

    const homeButton =
        document.querySelector(
            `.teamButton[data-match="${matchId}"][data-side="home"]`
        );

    const awayButton =
        document.querySelector(
            `.teamButton[data-match="${matchId}"][data-side="away"]`
        );

    if (homeGoals > awayGoals) {
        setWinner(matchId, homeButton.dataset.team);
    }

    if (awayGoals > homeGoals) {
        setWinner(matchId, awayButton.dataset.team);
    }

    if (homeGoals === awayGoals) {
        document.getElementById(`${matchId}_winner`).innerText =
            predictions[matchId].winner || "Not selected";
    }
    updateWinnerButtonState(matchId);
}


function setWinner(matchId, selectedTeam) {
    const matchCard = document.getElementById(`card_${matchId}`);

    const homeButton =
        document.querySelector(
            `.teamButton[data-match="${matchId}"][data-side="home"]`
        );

    const awayButton =
        document.querySelector(
            `.teamButton[data-match="${matchId}"][data-side="away"]`
        );

    const homeTeam = homeButton.dataset.team;
    const awayTeam = awayButton.dataset.team;

    const homeGoals = predictions[matchId].homeGoals;
    const awayGoals = predictions[matchId].awayGoals;

    if (
        homeGoals !== null &&
        awayGoals !== null &&
        homeGoals > awayGoals &&
        selectedTeam !== homeTeam
    ) {
        return;
    }

    if (
        homeGoals !== null &&
        awayGoals !== null &&
        awayGoals > homeGoals &&
        selectedTeam !== awayTeam
    ) {
        return;
    }

    predictions[matchId].winner = selectedTeam;

    document
        .querySelectorAll(`.teamRow[data-match="${matchId}"]`)
        .forEach(row => row.classList.remove("selectedWinner"));

    document
        .querySelector(
            `.teamRow[data-match="${matchId}"][data-team="${selectedTeam}"]`
        )
        .classList.add("selectedWinner");

    document.getElementById(`${matchId}_winner`).innerText =
        selectedTeam;

    updateWinnerButtonState(matchId);
}

function updateWinnerButtonState(matchId) {
    const homeButton =
        document.querySelector(
            `.teamButton[data-match="${matchId}"][data-side="home"]`
        );

    const awayButton =
        document.querySelector(
            `.teamButton[data-match="${matchId}"][data-side="away"]`
        );

    const homeGoals = predictions[matchId].homeGoals;
    const awayGoals = predictions[matchId].awayGoals;

    homeButton.disabled = false;
    awayButton.disabled = false;

    homeButton.classList.remove("disabledWinnerButton");
    awayButton.classList.remove("disabledWinnerButton");

    if (homeGoals === null || awayGoals === null) {
        return;
    }

    if (homeGoals > awayGoals) {
        awayButton.disabled = true;
        awayButton.classList.add("disabledWinnerButton");
    }

    if (awayGoals > homeGoals) {
        homeButton.disabled = true;
        homeButton.classList.add("disabledWinnerButton");
    }
}


async function submitPredictions(username, matches) {
    const confirmSubmit = confirm(
        "Are you sure? Once submitted, predictions cannot be edited."
    );

    if (!confirmSubmit) return;

    const settings = await getTournamentSettings();
    const activeRound = settings.activePredictionRound || "RoundOf16";
    const submittedField = getSubmittedFieldForRound(activeRound);

    for (const match of matches) {
        const prediction = predictions[match.id];

        if (
            prediction.homeGoals === null ||
            prediction.awayGoals === null ||
            !prediction.winner
        ) {
            alert(
                `Please complete prediction for ${match.homeTeam} vs ${match.awayTeam}.`
            );
            return;
        }
    }

    for (const match of matches) {
        const prediction = predictions[match.id];

        const winnerIsHome =
            prediction.winner === match.homeTeam;

        const winnerIsAway =
            prediction.winner === match.awayTeam;

        if (
            winnerIsHome &&
            prediction.homeGoals < prediction.awayGoals
        ) {
            alert(
                `${match.homeTeam} cannot be winner with fewer goals than ${match.awayTeam}.`
            );
            return;
        }

        if (
            winnerIsAway &&
            prediction.awayGoals < prediction.homeGoals
        ) {
            alert(
                `${match.awayTeam} cannot be winner with fewer goals than ${match.homeTeam}.`
            );
            return;
        }
    }

    for (const match of matches) {
        await setDoc(
            doc(db, "predictions", username, "matches", match.id),
            {
                matchId: match.id,
                round: activeRound,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeGoals: predictions[match.id].homeGoals,
                awayGoals: predictions[match.id].awayGoals,
                winner: predictions[match.id].winner,
                submittedAt: new Date().toISOString()
            }
        );
    }

    await updateDoc(doc(db, "users", username), {
        [submittedField]: true
    });

    hasUnsavedPredictionChanges = false;
    disablePredictionLeaveWarning();

    alert("Predictions submitted successfully.");

    loadPredictionPage(
        username,
        localStorage.getItem("currentGroupId"),
        localStorage.getItem("currentGroupName")
    );
}


function markPredictionChanged() {
    hasUnsavedPredictionChanges = true;
}


function setupPredictionLeaveWarning() {
    if (predictionNavigationWarningAttached) return;

    predictionNavigationWarningAttached = true;

    window.addEventListener("beforeunload", handleBeforeUnloadPredictionWarning);

    const navButtonIds = [
        "homeBtn",
        "groupsBtn",
        "predictionsBtn",
        "leaderboardBtn",
        "logoutBtn",
        "adminBtn"
    ];

    predictionNavButtonHandlers = [];

    navButtonIds.forEach(buttonId => {
        const button = document.getElementById(buttonId);

        if (!button) return;

        const handler = event => {
            if (!hasUnsavedPredictionChanges) return;

            const leave = confirm(
                "Predictions are not submitted and may be lost. Do you want to leave this page?"
            );

            if (!leave) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return false;
            }

            hasUnsavedPredictionChanges = false;
            disablePredictionLeaveWarning();
        };

        button.addEventListener("click", handler, true);

        predictionNavButtonHandlers.push({
            button,
            handler
        });
    });
}


function handleBeforeUnloadPredictionWarning(event) {
    if (!hasUnsavedPredictionChanges) return;

    event.preventDefault();
    event.returnValue = "Predictions are not submitted and may be lost.";
}


function disablePredictionLeaveWarning() {
    if (!predictionNavigationWarningAttached) return;

    window.removeEventListener("beforeunload", handleBeforeUnloadPredictionWarning);

    predictionNavButtonHandlers.forEach(item => {
        item.button.removeEventListener("click", item.handler, true);
    });

    predictionNavButtonHandlers = [];
    predictionNavigationWarningAttached = false;
}


function getRankDisplay(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return index + 1;
}


async function renderPredictionsOverlap(groupId, activeRound = "RoundOf16") {
    const container = document.getElementById("predictionsOverlapSection");

    const defaultOverlapRound = "All";

    container.innerHTML = `
        <hr>

        <h2>🔁 Predictions Overlap</h2>

        <p class="smallText">
            This shows how similar each player's predictions are to every other player in this group.
        </p>

        <div class="adminMatchCard">
            <label for="predictionsOverlapRoundSelect">
                <strong>Select overlap scope:</strong>
            </label>

            <select id="predictionsOverlapRoundSelect">
                ${getRoundDropdownOptions(defaultOverlapRound, true)}
            </select>
        </div>

        <button id="recalculatePredictionsOverlapBtn" class="bigButton">
            Recalculate Predictions Overlap
        </button>

        <div id="predictionsOverlapTable"></div>
    `;

    document
        .getElementById("predictionsOverlapRoundSelect")
        .addEventListener("change", async event => {
            await loadPredictionsOverlap(groupId, event.target.value);
        });

    document
        .getElementById("recalculatePredictionsOverlapBtn")
        .addEventListener("click", async () => {
            alert("Predictions overlap is being calculated, please wait.");

            const selectedRound =
                document.getElementById("predictionsOverlapRoundSelect").value;

            const overlapData =
                await calculateAndSavePredictionsOverlap(groupId, selectedRound);

            renderPredictionsOverlapTable(overlapData);

            alert("Predictions overlap is updated.");
        });

    await loadPredictionsOverlap(groupId, defaultOverlapRound);
}


async function loadPredictionsOverlap(groupId, roundFilter = "All") {
    const storageId = getPredictionsOverlapStorageId(groupId, roundFilter);

    const overlapSnap =
        await getDoc(doc(db, "predictionsOverlap", storageId));

    if (overlapSnap.exists()) {
        renderPredictionsOverlapTable(overlapSnap.data());
    } else {
        document.getElementById("predictionsOverlapTable").innerHTML = `
            <p class="smallText">
                Predictions overlap has not been calculated yet for ${roundFilter === "All" ? "all visible predicted matches" : getRoundTitle(roundFilter)}.
            </p>
        `;
    }
}

async function calculateAndSavePredictionsOverlap(groupId, roundFilter = "All") {
    const group = await getGroup(groupId);

    if (!group || !group.members) {
        return {
            players: [],
            matrix: {},
            totalMatches: 0,
            roundFilter
        };
    }

    const players = Object.keys(group.members).sort();
    const matches = await getMatchesForOverlapFilter(roundFilter);

    const allPredictions = {};

    for (const player of players) {
        allPredictions[player] = await getUserPredictions(player);
    }

    const matrix = {};

    for (const rowPlayer of players) {
        matrix[rowPlayer] = {};

        for (const columnPlayer of players) {
            let similarity = 0;
            let comparedMatches = 0;

            for (const match of matches) {
                const rowPrediction =
                    allPredictions[rowPlayer][match.id];

                const columnPrediction =
                    allPredictions[columnPlayer][match.id];

                if (!rowPrediction || !columnPrediction) {
                    continue;
                }

                comparedMatches += 1;

                if (rowPrediction.winner === columnPrediction.winner) {
                    similarity += 1;
                }

                if (rowPrediction.homeGoals === columnPrediction.homeGoals) {
                    similarity += 1;
                }

                if (rowPrediction.awayGoals === columnPrediction.awayGoals) {
                    similarity += 1;
                }

                const rowGoalDifference =
                    rowPrediction.homeGoals - rowPrediction.awayGoals;

                const columnGoalDifference =
                    columnPrediction.homeGoals - columnPrediction.awayGoals;

                if (rowGoalDifference === columnGoalDifference) {
                    similarity += 1;
                }
            }

            const totalComparisons = comparedMatches * 4;

            matrix[rowPlayer][columnPlayer] =
                totalComparisons === 0
                    ? 0
                    : Math.round((similarity / totalComparisons) * 100);
        }
    }

    const overlapData = {
        players,
        matrix,
        totalMatches: matches.length,
        roundFilter,
        updatedAt: new Date().toISOString()
    };

    await setDoc(
        doc(db, "predictionsOverlap", getPredictionsOverlapStorageId(groupId, roundFilter)),
        overlapData
    );

    return overlapData;
}

function renderPredictionsOverlapTable(overlapData) {
    const container =
        document.getElementById("predictionsOverlapTable");

    if (!overlapData.players || overlapData.players.length === 0) {
        container.innerHTML = `
            <p>No overlap data available.</p>
        `;
        return;
    }

    const players = overlapData.players;
    const roundLabel =
        overlapData.roundFilter === "All"
            ? "All visible predicted matches"
            : getRoundTitle(overlapData.roundFilter);

    container.innerHTML = `
        <style>
            #predictionsOverlapTable .overlapWrapper {
                max-height: 80vh;
                overflow: auto;
            }

            #predictionsOverlapTable .overlapTable thead th {
                position: sticky;
                top: 0;
                z-index: 20;
            }

            #predictionsOverlapTable .overlapTable th:first-child,
            #predictionsOverlapTable .overlapTable td:first-child {
                position: sticky;
                left: 0;
                z-index: 15;
                background: white;
            }

            #predictionsOverlapTable .overlapTable thead th:first-child {
                z-index: 25;
            }

            #predictionsOverlapTable .overlapCell {
                font-weight: bold;
                text-align: center;
                min-width: 70px;
            }

            #predictionsOverlapTable .overlapDiagonal {
                outline: 3px solid #1b5e20;
            }

            #predictionsOverlapTable .overlapVeryHigh {
                background: #2e7d32;
                color: white;
            }

            #predictionsOverlapTable .overlapHigh {
                background: #66bb6a;
                color: #073b07;
            }

            #predictionsOverlapTable .overlapMedium {
                background: #ffd54f;
                color: #3b3000;
            }

            #predictionsOverlapTable .overlapLow {
                background: #ffb74d;
                color: #3b2200;
            }

            #predictionsOverlapTable .overlapVeryLow {
                background: #ef5350;
                color: white;
            }
        </style>

        <p class="leaderboardInfoText">
            Predictions Overlap: ${roundLabel}
        </p>

        <div class="leaderboardWrapper overlapWrapper">
            <table class="leaderboardTable overlapTable">
                <thead>
                    <tr>
                        <th>Player</th>
                        ${players.map(player => `
                            <th>${player}</th>
                        `).join("")}
                    </tr>
                </thead>

                <tbody>
                    ${players.map(rowPlayer => `
                        <tr>
                            <td class="playerColumn">
                                👤 <strong>${rowPlayer}</strong>
                            </td>

                            ${players.map(columnPlayer => {
                                const value = overlapData.matrix[rowPlayer][columnPlayer];
                                const diagonalClass = rowPlayer === columnPlayer
                                    ? " overlapDiagonal"
                                    : "";

                                return `
                                    <td class="overlapCell ${getOverlapHeatClass(value)}${diagonalClass}">
                                        ${value}%
                                    </td>
                                `;
                            }).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>

        <p class="smallText">
            Based on ${overlapData.totalMatches} matches.
            Each match compares winner, Team A goals, Team B goals, and signed goal difference.
        </p>
    `;
}


function getOverlapHeatClass(value) {
    if (value >= 90) return "overlapVeryHigh";
    if (value >= 75) return "overlapHigh";
    if (value >= 50) return "overlapMedium";
    if (value >= 25) return "overlapLow";
    return "overlapVeryLow";
}


async function getMatchesForOverlapFilter(roundFilter) {
    const settings = await getTournamentSettings();

    if (roundFilter !== "All") {
        if (!isPredictionDisplayEnabled(settings, roundFilter)) {
            return [];
        }

        return await getMatchesForRound(roundFilter);
    }

    const matchesSnap = await getDocs(collection(db, "matches"));
    const matches = [];

    matchesSnap.forEach(docSnap => {
        const match = docSnap.data();

        if (
            PREDICTION_ROUNDS.includes(match.round) &&
            isPredictionDisplayEnabled(settings, match.round)
        ) {
            matches.push(match);
        }
    });

    matches.sort((a, b) => a.id.localeCompare(b.id));

    return matches;
}


function getPredictionsOverlapStorageId(groupId, roundFilter) {
    if (roundFilter === "All") {
        return groupId;
    }

    return `${groupId}_${roundFilter}`;
}

