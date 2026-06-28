import { db } from "./firebase.js";
import { round32Matches } from "./defaultMatches.js";

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
    getGroup
}
from "./groups.js";


let predictions = {};


export async function initializeMatches() {
    for (const match of round32Matches) {
        const matchRef = doc(db, "matches", match.id);
        const snap = await getDoc(matchRef);

        if (!snap.exists()) {
            await setDoc(matchRef, {
                id: match.id,
                round: "RoundOf32",
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
                round: "RoundOf32",
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

    const userRef = doc(db, "users", username);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        container.innerHTML = "<p>User not found.</p>";
        return;
    }

    const userData = userSnap.data();

    if (userData.predictionsSubmittedRound32) {
        await showSubmittedPredictions(username, groupId, groupName);
        return;
    }

    const matches = await getRound32Matches();

    container.innerHTML = `
        <h2>Round of 32 Predictions</h2>

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
            homeGoals: 0,
            awayGoals: 0,
            winner: match.homeTeam
        };

        container.innerHTML += createMatchCard(match);
    });

    container.innerHTML += `
        <button id="submitPredictionsBtn" class="bigButton">
            Submit Predictions
        </button>
    `;

    attachPredictionEvents(matches);

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


async function showSubmittedPredictions(username, groupId, groupName) {
    const container = document.getElementById("predictionsContainer");

    const matches = await getRound32Matches();
    const matchesMap = await getAllMatchesMap();
    const myPredictions = await getUserPredictions(username);

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

        ${renderMyPredictionsTable(matches, matchesMap, myPredictions)}

        <div id="comparisonSection"></div>
    `;

    if (groupId) {
        await renderComparePlayers(username, groupId);
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

                        const points = calculatePoints(prediction, result);

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
                                    ${points === null ? "-" : renderStars(points)}
                                </td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}


async function renderComparePlayers(currentUsername, groupId) {
    const comparisonSection =
        document.getElementById("comparisonSection");

    const group = await getGroup(groupId);

    if (!group || !group.members) {
        comparisonSection.innerHTML = `
            <p>No group members found.</p>
        `;
        return;
    }

    const members =
        Object.keys(group.members)
            .filter(member => member !== currentUsername)
            .sort();

    if (members.length === 0) {
        comparisonSection.innerHTML = `
            <h2>Compare With</h2>
            <p>No other members in this group yet.</p>
        `;
        return;
    }

    comparisonSection.innerHTML = `
        <hr>

        <h2>Compare With</h2>

        <div class="comparePlayers">
            ${members.map(member => `
                <button class="comparePlayerBtn"
                        data-player="${member}">
                    👤 ${member}
                </button>
            `).join("")}
        </div>

        <div id="headToHeadContainer"></div>
    `;

    document.querySelectorAll(".comparePlayerBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const selectedPlayer = button.dataset.player;

            await renderHeadToHeadComparison(
                currentUsername,
                selectedPlayer,
                groupId
            );
        });
    });
}


async function renderHeadToHeadComparison(currentUsername, otherUsername, groupId) {
    const container =
        document.getElementById("headToHeadContainer");

    container.innerHTML = `
        <h2>Loading comparison...</h2>
    `;

    const matches = await getRound32Matches();
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

        const myPoints =
            myPrediction ? calculatePoints(myPrediction, result) : null;

        const otherPoints =
            otherPrediction ? calculatePoints(otherPrediction, result) : null;

        if (myPoints !== null) myTotal += myPoints;
        if (otherPoints !== null) otherTotal += otherPoints;

        let matchWinnerText = "";

        if (myPoints !== null && otherPoints !== null) {
            if (myPoints > otherPoints) {
                myWins++;
                matchWinnerText = `🏆 Match Winner: ${currentUsername}`;
            } else if (otherPoints > myPoints) {
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
                        ${renderPredictionBox(myPrediction, myPoints)}
                    </div>

                    <div class="comparisonPlayerBox">
                        <h4>👤 ${otherUsername}</h4>
                        ${renderPredictionBox(otherPrediction, otherPoints)}
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

        <h2>Head-to-Head</h2>

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


function renderPredictionBox(prediction, points) {
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
            ${points === null ? "-" : renderStars(points)}
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

        const points = calculatePoints(prediction, result);

        if (points === null) continue;

        rows.push({
            player: member,
            points
        });
    }

    rows.sort((a, b) =>
        b.points - a.points ||
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
                            <td>${renderStars(row.points)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>

        </div>
    `;
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

            <div class="teamRow selectedWinner"
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

                    <span id="${match.id}_homeGoals">0</span>

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

                    <span id="${match.id}_awayGoals">0</span>

                    <button class="goalPlus"
                            data-match="${match.id}"
                            data-team="away">+</button>
                </div>
            </div>

            <p>
                Winner:
                <strong id="${match.id}_winner">
                    ${match.homeTeam}
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

            setWinner(matchId, selectedTeam);
        });
    });

    document.querySelectorAll(".goalPlus").forEach(btn => {
        btn.addEventListener("click", event => {
            event.stopPropagation();

            const matchId = btn.dataset.match;
            const team = btn.dataset.team;

            if (team === "home") {
                predictions[matchId].homeGoals++;
            } else {
                predictions[matchId].awayGoals++;
            }

            updateGoalDisplay(matchId);
            autoSelectWinner(matchId);
        });
    });

    document.querySelectorAll(".goalMinus").forEach(btn => {
        btn.addEventListener("click", event => {
            event.stopPropagation();

            const matchId = btn.dataset.match;
            const team = btn.dataset.team;

            if (team === "home" && predictions[matchId].homeGoals > 0) {
                predictions[matchId].homeGoals--;
            }

            if (team === "away" && predictions[matchId].awayGoals > 0) {
                predictions[matchId].awayGoals--;
            }

            updateGoalDisplay(matchId);
            autoSelectWinner(matchId);
        });
    });
}


function updateGoalDisplay(matchId) {
    document.getElementById(`${matchId}_homeGoals`).innerText =
        predictions[matchId].homeGoals;

    document.getElementById(`${matchId}_awayGoals`).innerText =
        predictions[matchId].awayGoals;
}


function autoSelectWinner(matchId) {
    const homeGoals = predictions[matchId].homeGoals;
    const awayGoals = predictions[matchId].awayGoals;

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
            predictions[matchId].winner;
    }
}


function setWinner(matchId, selectedTeam) {
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
}


async function submitPredictions(username, matches) {
    const confirmSubmit = confirm(
        "Are you sure? Once submitted, predictions cannot be edited."
    );

    if (!confirmSubmit) return;

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
                round: "RoundOf32",
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
        predictionsSubmittedRound32: true
    });

    alert("Predictions submitted successfully.");

    loadPredictionPage(
        username,
        localStorage.getItem("currentGroupId"),
        localStorage.getItem("currentGroupName")
    );
}


function getRankDisplay(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return index + 1;
}
