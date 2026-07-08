import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    setDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    calculatePoints,
    emptyLeaderboardRow,
    addPointsToRow,
    sortLeaderboard
}
from "./scoring.js";

import {
    getGroup
}
from "./groups.js";

import {
    calculateFinalRoundPoints
}
from "./finalRoundEngine.js";


const LEADERBOARD_ROUNDS = [
    "Overall",
    "RoundOf32",
    "RoundOf16",
    "QF-SF-F"
];


export async function recalculateGlobalLeaderboard() {
    let overallRows = [];

    for (const roundFilter of LEADERBOARD_ROUNDS) {
        const leaderboardId =
            getLeaderboardStorageId("global", roundFilter);

        const rows =
            await recalculateLeaderboard(leaderboardId, null, roundFilter);

        if (roundFilter === "Overall") {
            overallRows = rows;
        }
    }

    return overallRows;
}


export async function recalculateGroupLeaderboard(groupId) {
    let overallRows = [];

    for (const roundFilter of LEADERBOARD_ROUNDS) {
        const leaderboardId =
            getLeaderboardStorageId(groupId, roundFilter);

        const rows =
            await recalculateLeaderboard(leaderboardId, groupId, roundFilter);

        if (roundFilter === "Overall") {
            overallRows = rows;
        }
    }

    return overallRows;
}


async function recalculateLeaderboard(leaderboardId, groupId, roundFilter = "Overall") {
    const matchesSnap = await getDocs(collection(db, "matches"));

    const matches = {};

    matchesSnap.forEach(docSnap => {
        const match = docSnap.data();

        if (
            roundFilter === "Overall" ||
            match.round === roundFilter
        ) {
            matches[docSnap.id] = match;
        }
    });

    let players = [];

    if (groupId) {
        const group = await getGroup(groupId);

        if (!group || !group.members) {
            return [];
        }

        players = Object.keys(group.members);
    } else {
        const usersSnap = await getDocs(collection(db, "users"));

        usersSnap.forEach(userDoc => {
            players.push(userDoc.id);
        });
    }

    const leaderboard = {};

    for (const username of players) {
        leaderboard[username] = emptyLeaderboardRow(username);

        const predictionsSnap =
            await getDocs(collection(db, "predictions", username, "matches"));

        for (const predictionDoc of predictionsSnap.docs) {
            const prediction = predictionDoc.data();
            const match = matches[prediction.matchId];

            if (!match) continue;

            const points =
                match.round === "QF-SF-F"
                    ? calculateFinalRoundPoints(prediction, match)
                    : calculatePoints(prediction, match);

            if (points === null) continue;

            addPointsToRow(leaderboard[username], points);
        }
    }

    if (groupId) {
        await calculateIndividualWins(leaderboard, players, matches);
    }

    const rows = sortLeaderboard(Object.values(leaderboard));

    for (const row of rows) {
        await setDoc(
            doc(db, "leaderboards", leaderboardId, "users", row.player),
            row
        );
    }

    return rows;
}


async function calculateIndividualWins(leaderboard, players, matches) {
    for (const matchId of Object.keys(matches)) {
        const match = matches[matchId];

        if (
            match.status !== "finished" ||
            match.homeGoals === null ||
            match.awayGoals === null ||
            match.homeGoals === undefined ||
            match.awayGoals === undefined ||
            !match.winner
        ) {
            continue;
        }

        let bestPoints = -1;
        const matchScores = [];

        for (const player of players) {
            const predictionsSnap =
                await getDocs(collection(db, "predictions", player, "matches"));

            let prediction = null;

            predictionsSnap.forEach(predictionDoc => {
                if (predictionDoc.id === matchId) {
                    prediction = predictionDoc.data();
                }
            });

            if (!prediction) continue;

            const points =
                match.round === "QF-SF-F"
                    ? calculateFinalRoundPoints(prediction, match)
                    : calculatePoints(prediction, match);

            if (points === null) continue;

            matchScores.push({
                player,
                points
            });

            if (points > bestPoints) {
                bestPoints = points;
            }
        }

        matchScores.forEach(score => {
            if (score.points === bestPoints && bestPoints >= 0) {
                leaderboard[score.player].individualWins += 1;
            }
        });
    }
}


export async function loadGlobalLeaderboard() {
    await loadLeaderboardPage({
        title: "🏆 Global Leaderboard",
        leaderboardBaseId: "global",
        groupId: null,
        showWins: false,
        isGlobal: true
    });
}


export async function loadGroupLeaderboard(groupId, groupName) {
    await loadLeaderboardPage({
        title: `🏆 ${groupName} Leaderboard`,
        leaderboardBaseId: groupId,
        groupId,
        showWins: true,
        isGlobal: false
    });
}


async function loadLeaderboardPage(config) {
    const container = document.getElementById("leaderboardContainer");

    container.innerHTML = `
        <h2>${config.title}</h2>

        <div class="adminMatchCard">
            <label for="leaderboardRoundSelect">
                <strong>Select leaderboard:</strong>
            </label>

            <select id="leaderboardRoundSelect">
                <option value="Overall">Overall</option>
                <option value="RoundOf32">Round of 32</option>
                <option value="RoundOf16">Round of 16</option>
                <option value="QF-SF-F">QF • SF • 3rd Place • Final</option>
            </select>
        </div>

        <button id="recalculateLeaderboardBtn">
            🔄 Recalculate Leaderboard
        </button>

        <hr class="leaderboardSeparator">

        <div id="leaderboardTable"></div>

        <div class="scoringExplanation">
            <h2>How scoring works</h2>

            <p>Maximum score per match: <strong>4 points</strong>.</p>

            <ul>
                <li><strong>1 point</strong> for correct winner.</li>
                <li><strong>1 point</strong> for correct number of goals by the winner.</li>
                <li><strong>1 point</strong> for correct number of goals by the losing team.</li>
                <li><strong>1 point</strong> for correct signed goal difference.</li>
            </ul>

            <p>
                Example: Prediction Germany 4 - 2 France,
                actual result Germany 2 - 0 France.
                The user gets 1 point for correct winner and
                1 point for correct goal difference.
                Total: <strong>2 points</strong>.
            </p>

            <p class="smallText">
                For matches decided by penalties, use the score after extra time.
            </p>
        </div>
    `;

    document
        .getElementById("leaderboardRoundSelect")
        .addEventListener("change", async event => {
            await loadStoredLeaderboard(config, event.target.value);
        });

    document
        .getElementById("recalculateLeaderboardBtn")
        .addEventListener("click", async () => {
            alert("The leaderboards are being calculated, please wait.");

            if (config.groupId) {
                await recalculateGroupLeaderboard(config.groupId);
            } else {
                await recalculateGlobalLeaderboard();
            }

            const selectedRound =
                document.getElementById("leaderboardRoundSelect").value;

            await loadStoredLeaderboard(config, selectedRound);

            alert("Leaderboards are updated.");
        });

    await loadStoredLeaderboard(config, "Overall");
}


async function loadStoredLeaderboard(config, roundFilter) {
    const leaderboardId =
        getLeaderboardStorageId(config.leaderboardBaseId, roundFilter);

    const snap =
        await getDocs(
            collection(db, "leaderboards", leaderboardId, "users")
        );

    let rows = [];

    snap.forEach(docSnap => {
        rows.push(docSnap.data());
    });

    rows = sortLeaderboard(rows);

    renderLeaderboard(
        config.isGlobal ? rows.slice(0, 10) : rows,
        config.showWins,
        config.isGlobal,
        rows.length,
        roundFilter
    );
}


function renderLeaderboard(
    rows,
    showWins,
    isGlobal = false,
    totalPlayers = null,
    roundFilter = "Overall"
) {
    const table = document.getElementById("leaderboardTable");

    if (rows.length === 0) {
        table.innerHTML = `
            <p>No leaderboard data yet for ${formatRoundName(roundFilter)}.</p>
        `;
        return;
    }

    table.innerHTML = `
        <p class="leaderboardInfoText">
            ${
                isGlobal
                ? `Showing top 10 out of total ${totalPlayers} players`
                : `Showing ${formatRoundName(roundFilter)} leaderboard`
            }
        </p>

        <div class="leaderboardWrapper">
            <table class="leaderboardTable">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Total Games</th>
                        <th>Total Points</th>
                        ${showWins ? "<th>Wins</th>" : ""}
                        <th>4P</th>
                        <th>3P</th>
                        <th>2P</th>
                        <th>1P</th>
                        <th>0P</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows.map((row, index) => `
                        <tr class="${getRankClass(index)}">
                            <td class="rankColumn">
                                ${getRankDisplay(index)}
                            </td>

                            <td class="playerColumn">
                                👤 <strong>${row.player}</strong>
                            </td>

                            <td>${row.totalGames}</td>

                            <td class="pointsColumn">
                                <span class="pointsBadge">
                                    ${row.totalPoints}
                                </span>
                            </td>

                            ${showWins ? `<td>${row.individualWins}</td>` : ""}

                            <td>${row.fourPointers}</td>
                            <td>${row.threePointers}</td>
                            <td>${row.twoPointers}</td>
                            <td>${row.onePointers}</td>
                            <td>${row.zeroPointers}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}


function getLeaderboardStorageId(baseId, roundFilter) {
    if (roundFilter === "Overall") {
        return baseId;
    }

    return `${baseId}_${roundFilter}`;
}


function formatRoundName(round) {
    if (round === "Overall") return "Overall";
    if (round === "RoundOf32") return "Round of 32";
    if (round === "RoundOf16") return "Round of 16";
    if (round === "QF-SF-F") return "QF • SF • 3rd Place • Final";

    return round;
}


function getRankClass(index) {
    if (index === 0) return "goldRow";
    if (index === 1) return "silverRow";
    if (index === 2) return "bronzeRow";
    return "";
}


function getRankDisplay(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return index + 1;
}