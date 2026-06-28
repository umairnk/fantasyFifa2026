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


export async function recalculateGlobalLeaderboard() {
    return recalculateLeaderboard("global", null);
}


export async function recalculateGroupLeaderboard(groupId) {
    return recalculateLeaderboard(groupId, groupId);
}


async function recalculateLeaderboard(leaderboardId, groupId) {
    const matchesSnap = await getDocs(collection(db, "matches"));

    const matches = {};

    matchesSnap.forEach(docSnap => {
        matches[docSnap.id] = docSnap.data();
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

            const points = calculatePoints(prediction, match);

            if (points === null) continue;

            addPointsToRow(leaderboard[username], points);
        }
    }

    if (groupId) {
        calculateIndividualWins(leaderboard, players, matches);
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


function calculateIndividualWins(leaderboard, players, matches) {
    // Full exact match-win calculation will be improved later.
    // For now this keeps the field available only for group leaderboards.
    players.forEach(player => {
        if (!leaderboard[player].individualWins) {
            leaderboard[player].individualWins = 0;
        }
    });
}


export async function loadGlobalLeaderboard() {
    await loadLeaderboardPage({
        title: "🏆 Global Leaderboard",
        leaderboardId: "global",
        groupId: null,
        showWins: false
    });
}


export async function loadGroupLeaderboard(groupId, groupName) {
    await loadLeaderboardPage({
        title: `🏆 ${groupName} Leaderboard`,
        leaderboardId: groupId,
        groupId,
        showWins: true
    });
}


async function loadLeaderboardPage(config) {
    const container = document.getElementById("leaderboardContainer");

    container.innerHTML = `
        <h2>${config.title}</h2>

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
                <li><strong>1 point</strong> for correct goal difference.</li>
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
        .getElementById("recalculateLeaderboardBtn")
        .addEventListener("click", async () => {
            let rows;

            if (config.groupId) {
                rows = await recalculateGroupLeaderboard(config.groupId);
            } else {
                rows = await recalculateGlobalLeaderboard();
            }

            renderLeaderboard(rows, config.showWins);
            alert("Leaderboard recalculated.");
        });

    const snap =
        await getDocs(
            collection(db, "leaderboards", config.leaderboardId, "users")
        );

    const rows = [];

    snap.forEach(docSnap => {
        rows.push(docSnap.data());
    });

    renderLeaderboard(sortLeaderboard(rows), config.showWins);
}


function renderLeaderboard(rows, showWins) {
    const table = document.getElementById("leaderboardTable");

    if (rows.length === 0) {
        table.innerHTML = "<p>No leaderboard data yet.</p>";
        return;
    }

    table.innerHTML = `
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