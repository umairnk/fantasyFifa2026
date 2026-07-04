import { db } from "./firebase.js";

import {
    collection,
    getDocs
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


let currentSkillRows = [];
let currentSortKey = "totalPoints";
let currentSortDirection = "desc";


export async function loadInsightsPage(groupId = null, groupName = null) {
    const container = document.getElementById("insightsContainer");

    if (!groupId) {
        container.innerHTML = `
            <h2>📊 Insights</h2>

            <p class="warningText">
                Open a group first to see group insights.
            </p>
        `;
        return;
    }

    container.innerHTML = `
        <h2>📊 Insights</h2>

        <p class="smallText">
            Current group: <strong>${groupName || "Selected group"}</strong>
        </p>

        <div id="insightsSummary"></div>

        <hr>

        <h2>📈 Points Progress</h2>
        <p class="smallText">
            Cumulative points after each finished match.
        </p>
        <div id="pointsProgressChart"></div>

        <hr>

        <h2>🎯 Prediction Skill Table</h2>
        <p class="smallText">
            Click any column heading to sort.
        </p>
        <div id="skillTableContainer"></div>

        <hr>

        <h2>🔥 Extra Insights</h2>
        <div id="extraInsightsContainer"></div>
    `;

    await renderInsights(groupId);
}


async function renderInsights(groupId) {
    const group = await getGroup(groupId);

    if (!group || !group.members) {
        document.getElementById("insightsSummary").innerHTML = `
            <p class="warningText">No group members found.</p>
        `;
        return;
    }

    const players = Object.keys(group.members).sort();

    const matches = await getFinishedMatches();
    const allPredictions = {};

    for (const player of players) {
        allPredictions[player] = await getUserPredictions(player);
    }

    const skillRows =
        calculateSkillRows(players, matches, allPredictions);

    currentSkillRows = skillRows;

    const progressData =
        calculateProgressData(players, matches, allPredictions);

    renderSummary(players, matches, skillRows);
    renderProgressChart(progressData, players);
    renderSkillTable(skillRows);
    renderExtraInsights(skillRows, matches, allPredictions);
}


async function getFinishedMatches() {
    const snap = await getDocs(collection(db, "matches"));
    const matches = [];

    snap.forEach(docSnap => {
        const match = docSnap.data();

        if (
            match.status === "finished" &&
            match.homeGoals !== null &&
            match.awayGoals !== null &&
            match.homeGoals !== undefined &&
            match.awayGoals !== undefined &&
            match.winner
        ) {
            matches.push(match);
        }
    });

    matches.sort((a, b) => {
        const timeA = a.startTime || "";
        const timeB = b.startTime || "";

        if (timeA !== timeB) return timeA.localeCompare(timeB);

        return a.id.localeCompare(b.id);
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


function calculateSkillRows(players, matches, allPredictions) {
    return players.map(player => {
        const row = {
            player,
            matchesPredicted: 0,
            totalPoints: 0,
            averagePoints: 0,
            correctWinner: 0,
            correctWinnerGoals: 0,
            correctLoserGoals: 0,
            correctGoalDifference: 0,
            fourPointers: 0,
            threePointers: 0,
            twoPointers: 0,
            onePointers: 0,
            zeroPointers: 0
        };

        for (const match of matches) {
            const prediction = allPredictions[player][match.id];

            if (!prediction) continue;

            const points = calculatePoints(prediction, match);

            if (points === null) continue;

            row.matchesPredicted += 1;
            row.totalPoints += points;

            if (points === 4) row.fourPointers += 1;
            if (points === 3) row.threePointers += 1;
            if (points === 2) row.twoPointers += 1;
            if (points === 1) row.onePointers += 1;
            if (points === 0) row.zeroPointers += 1;

            const actualWinner = match.winner;

            const actualLoser =
                actualWinner === match.homeTeam
                    ? match.awayTeam
                    : match.homeTeam;

            const predictedGoalsForActualWinner =
                actualWinner === match.homeTeam
                    ? prediction.homeGoals
                    : prediction.awayGoals;

            const predictedGoalsForActualLoser =
                actualLoser === match.homeTeam
                    ? prediction.homeGoals
                    : prediction.awayGoals;

            const actualWinnerGoals =
                actualWinner === match.homeTeam
                    ? match.homeGoals
                    : match.awayGoals;

            const actualLoserGoals =
                actualLoser === match.homeTeam
                    ? match.homeGoals
                    : match.awayGoals;

            const predictedGoalDifference =
                prediction.homeGoals - prediction.awayGoals;

            const actualGoalDifference =
                match.homeGoals - match.awayGoals;

            if (prediction.winner === actualWinner) {
                row.correctWinner += 1;
            }

            if (predictedGoalsForActualWinner === actualWinnerGoals) {
                row.correctWinnerGoals += 1;
            }

            if (predictedGoalsForActualLoser === actualLoserGoals) {
                row.correctLoserGoals += 1;
            }

            if (predictedGoalDifference === actualGoalDifference) {
                row.correctGoalDifference += 1;
            }
        }

        row.averagePoints =
            row.matchesPredicted === 0
                ? 0
                : Number((row.totalPoints / row.matchesPredicted).toFixed(2));

        return row;
    });
}


function calculateProgressData(players, matches, allPredictions) {
    const totals = {};

    players.forEach(player => {
        totals[player] = 0;
    });

    return matches.map((match, index) => {
        const row = {
            matchNumber: index + 1,
            matchLabel: `${index + 1}. ${match.homeTeam} vs ${match.awayTeam}`
        };

        for (const player of players) {
            const prediction = allPredictions[player][match.id];
            const points = prediction ? calculatePoints(prediction, match) : null;

            if (points !== null) {
                totals[player] += points;
            }

            row[player] = totals[player];
        }

        return row;
    });
}


function renderSummary(players, matches, skillRows) {
    const topPlayer =
        [...skillRows].sort((a, b) =>
            b.totalPoints - a.totalPoints ||
            a.player.localeCompare(b.player)
        )[0];

    document.getElementById("insightsSummary").innerHTML = `
        <div class="comparisonSummary">
            <div>
                <h3>Players</h3>
                <p class="summaryPoints">${players.length}</p>
            </div>

            <div>
                <h3>Finished matches</h3>
                <p class="summaryPoints">${matches.length}</p>
            </div>

            <div>
                <h3>Current leader</h3>
                <p class="summaryPoints">
                    ${topPlayer ? topPlayer.player : "-"}
                </p>
                <p>${topPlayer ? `${topPlayer.totalPoints} points` : ""}</p>
            </div>
        </div>
    `;
}


function renderProgressChart(progressData, players) {
    const container = document.getElementById("pointsProgressChart");

    if (progressData.length === 0) {
        container.innerHTML = `
            <p class="smallText">
                No finished matches yet.
            </p>
        `;
        return;
    }

    const width = 900;
    const height = 420;
    const paddingLeft = 55;
    const paddingRight = 25;
    const paddingTop = 30;
    const paddingBottom = 55;

    const maxPoints = Math.max(
        1,
        ...progressData.flatMap(row =>
            players.map(player => row[player] || 0)
        )
    );

    const xStep =
        progressData.length === 1
            ? 0
            : (width - paddingLeft - paddingRight) / (progressData.length - 1);

    const yScale = value =>
        height - paddingBottom -
        (value / maxPoints) * (height - paddingTop - paddingBottom);

    const xScale = index =>
        progressData.length === 1
            ? paddingLeft + (width - paddingLeft - paddingRight) / 2
            : paddingLeft + index * xStep;

    const lines = players.map((player, playerIndex) => {
        const points = progressData.map((row, index) =>
            `${xScale(index)},${yScale(row[player] || 0)}`
        ).join(" ");

        const hue = (playerIndex * 57) % 360;

        return `
            <polyline
                points="${points}"
                fill="none"
                stroke="hsl(${hue}, 70%, 38%)"
                stroke-width="3"
                stroke-linejoin="round"
                stroke-linecap="round">
            </polyline>

            ${progressData.map((row, index) => `
                <circle
                    cx="${xScale(index)}"
                    cy="${yScale(row[player] || 0)}"
                    r="4"
                    fill="hsl(${hue}, 70%, 38%)">
                    <title>${player}: ${row[player] || 0} points after ${row.matchLabel}</title>
                </circle>
            `).join("")}
        `;
    }).join("");

    const xTicks = progressData.map((row, index) => `
        <text
            x="${xScale(index)}"
            y="${height - 25}"
            text-anchor="middle"
            font-size="11">
            ${row.matchNumber}
        </text>
    `).join("");

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(factor => {
        const value = Math.round(maxPoints * factor);
        const y = yScale(value);

        return `
            <line
                x1="${paddingLeft}"
                y1="${y}"
                x2="${width - paddingRight}"
                y2="${y}"
                stroke="#ddd">
            </line>

            <text
                x="${paddingLeft - 10}"
                y="${y + 4}"
                text-anchor="end"
                font-size="11">
                ${value}
            </text>
        `;
    }).join("");

    const legend = players.map((player, index) => {
        const hue = (index * 57) % 360;

        return `
            <span class="insightsLegendItem">
                <span class="insightsLegendColor"
                      style="background:hsl(${hue}, 70%, 38%);"></span>
                ${player}
            </span>
        `;
    }).join("");

    container.innerHTML = `
        <div class="leaderboardWrapper">
            <svg
                class="insightsChart"
                viewBox="0 0 ${width} ${height}"
                role="img"
                aria-label="Points progress chart">

                ${yTicks}

                <line
                    x1="${paddingLeft}"
                    y1="${height - paddingBottom}"
                    x2="${width - paddingRight}"
                    y2="${height - paddingBottom}"
                    stroke="#888">
                </line>

                <line
                    x1="${paddingLeft}"
                    y1="${paddingTop}"
                    x2="${paddingLeft}"
                    y2="${height - paddingBottom}"
                    stroke="#888">
                </line>

                ${lines}
                ${xTicks}

                <text
                    x="${width / 2}"
                    y="${height - 5}"
                    text-anchor="middle"
                    font-size="12">
                    Finished match number
                </text>
            </svg>
        </div>

        <div class="insightsLegend">
            ${legend}
        </div>
    `;
}


function renderSkillTable(rows) {
    const sortedRows = sortSkillRows(rows);

    const container = document.getElementById("skillTableContainer");

    container.innerHTML = `
        <div class="leaderboardWrapper">
            <table class="leaderboardTable">
                <thead>
                    <tr>
                        ${renderSortableHeader("player", "Player")}
                        ${renderSortableHeader("matchesPredicted", "Games")}
                        ${renderSortableHeader("totalPoints", "Points")}
                        ${renderSortableHeader("averagePoints", "Avg")}
                        ${renderSortableHeader("correctWinner", "Winner")}
                        ${renderSortableHeader("correctWinnerGoals", "Winner goals")}
                        ${renderSortableHeader("correctLoserGoals", "Loser goals")}
                        ${renderSortableHeader("correctGoalDifference", "Goal diff")}
                        ${renderSortableHeader("fourPointers", "4★")}
                        ${renderSortableHeader("zeroPointers", "0★")}
                    </tr>
                </thead>

                <tbody>
                    ${sortedRows.map(row => `
                        <tr>
                            <td class="playerColumn">👤 <strong>${row.player}</strong></td>
                            <td>${row.matchesPredicted}</td>
                            <td class="pointsColumn">
                                <span class="pointsBadge">${row.totalPoints}</span>
                            </td>
                            <td>${row.averagePoints}</td>
                            <td>${row.correctWinner}</td>
                            <td>${row.correctWinnerGoals}</td>
                            <td>${row.correctLoserGoals}</td>
                            <td>${row.correctGoalDifference}</td>
                            <td>${row.fourPointers}</td>
                            <td>${row.zeroPointers}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    document.querySelectorAll(".skillSortHeader").forEach(header => {
        header.addEventListener("click", () => {
            const key = header.dataset.sortKey;

            if (currentSortKey === key) {
                currentSortDirection =
                    currentSortDirection === "desc" ? "asc" : "desc";
            } else {
                currentSortKey = key;
                currentSortDirection =
                    key === "player" ? "asc" : "desc";
            }

            renderSkillTable(currentSkillRows);
        });
    });
}


function renderSortableHeader(key, label) {
    const arrow =
        currentSortKey === key
            ? currentSortDirection === "desc" ? " ▼" : " ▲"
            : "";

    return `
        <th class="skillSortHeader" data-sort-key="${key}">
            ${label}${arrow}
        </th>
    `;
}


function sortSkillRows(rows) {
    return [...rows].sort((a, b) => {
        const aValue = a[currentSortKey];
        const bValue = b[currentSortKey];

        if (typeof aValue === "string") {
            return currentSortDirection === "asc"
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        }

        return currentSortDirection === "asc"
            ? aValue - bValue || a.player.localeCompare(b.player)
            : bValue - aValue || a.player.localeCompare(b.player);
    });
}


function renderExtraInsights(skillRows, matches, allPredictions) {
    const container = document.getElementById("extraInsightsContainer");

    if (skillRows.length === 0) {
        container.innerHTML = "<p>No insights available yet.</p>";
        return;
    }

    const bestWinner =
        getTopRows(skillRows, "correctWinner");

    const bestGoalDiff =
        getTopRows(skillRows, "correctGoalDifference");

    const mostPerfect =
        getTopRows(skillRows, "fourPointers");

    const mostZero =
        getTopRows(skillRows, "zeroPointers");

    const leastZero =
        [...skillRows]
            .filter(row => row.matchesPredicted > 0)
            .sort((a, b) =>
                a.zeroPointers - b.zeroPointers ||
                b.totalPoints - a.totalPoints ||
                a.player.localeCompare(b.player)
            )
            .slice(0, 3);

    const mostCommonPrediction =
        calculateMostCommonPrediction(matches, allPredictions);

    container.innerHTML = `
        <div class="insightsGrid">

            ${renderInsightCard(
                "🏆 Best winner predictor",
                bestWinner,
                "correctWinner",
                "correct winners"
            )}

            ${renderInsightCard(
                "🎯 Best goal-difference predictor",
                bestGoalDiff,
                "correctGoalDifference",
                "correct goal differences"
            )}

            ${renderInsightCard(
                "⭐ Most perfect predictions",
                mostPerfect,
                "fourPointers",
                "4-star matches"
            )}

            ${renderInsightCard(
                "😬 Most 0-point predictions",
                mostZero,
                "zeroPointers",
                "0-point matches"
            )}

            ${renderInsightCard(
                "🛡️ Least 0-point predictions",
                leastZero,
                "zeroPointers",
                "0-point matches",
                true
            )}

            <div class="adminMatchCard">
                <h3>🧠 Most common prediction</h3>
                ${
                    mostCommonPrediction
                    ? `
                        <p>
                            <strong>${mostCommonPrediction.match}</strong>
                        </p>
                        <p>
                            ${mostCommonPrediction.prediction}
                        </p>
                        <p class="smallText">
                            Chosen by ${mostCommonPrediction.count} player(s).
                        </p>
                      `
                    : `<p class="smallText">Not enough predictions yet.</p>`
                }
            </div>

        </div>
    `;
}


function getTopRows(rows, key) {
    return [...rows]
        .sort((a, b) =>
            b[key] - a[key] ||
            b.totalPoints - a.totalPoints ||
            a.player.localeCompare(b.player)
        )
        .slice(0, 3);
}


function renderInsightCard(title, rows, key, suffix, lowerIsBetter = false) {
    return `
        <div class="adminMatchCard">
            <h3>${title}</h3>

            ${
                rows.length === 0
                ? `<p class="smallText">No data yet.</p>`
                : rows.map((row, index) => `
                    <p>
                        ${getMedal(index)}
                        <strong>${row.player}</strong> —
                        ${row[key]} ${suffix}
                    </p>
                `).join("")
            }

            ${
                lowerIsBetter
                ? `<p class="smallText">Lower is better.</p>`
                : ""
            }
        </div>
    `;
}


function calculateMostCommonPrediction(matches, allPredictions) {
    let best = null;

    for (const match of matches) {
        const counts = {};

        for (const player of Object.keys(allPredictions)) {
            const prediction = allPredictions[player][match.id];

            if (!prediction) continue;

            const key =
                `${prediction.homeGoals}-${prediction.awayGoals}, winner ${prediction.winner}`;

            counts[key] = (counts[key] || 0) + 1;
        }

        for (const key of Object.keys(counts)) {
            if (!best || counts[key] > best.count) {
                best = {
                    match: `${match.homeTeam} vs ${match.awayTeam}`,
                    prediction: key,
                    count: counts[key]
                };
            }
        }
    }

    return best;
}


function getMedal(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `${index + 1}.`;
}
