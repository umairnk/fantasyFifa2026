import {
    doc,
    getDoc,
    updateDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { db } from "./firebase.js";

import {
    getFinalRoundMatchesMap,
    getFinalRoundTreeGroups,
    propagateActualFinalRoundTeams
} from "./finalRoundEngine.js";

export async function loadFinalRoundAdminTree(options) {
    const {
        currentUserIsFullAdmin,
        onAfterSave
    } = options;

    const container = document.getElementById("adminMatchesContainer");
    const matchesMap = await getFinalRoundMatchesMap();
    const tree = getFinalRoundTreeGroups(matchesMap);

    container.innerHTML = `
        <p class="leaderboardInfoText">
            Showing FIFA-style match editor for QF • SF • 3rd Place • Final.
        </p>

        <div class="finalBracketTree">
            <div class="finalBracketColumn">
                <h3>Quarter Finals</h3>
                ${tree.qfs.map(match => renderAdminFinalMatchCard(match, currentUserIsFullAdmin)).join("")}
            </div>

            <div class="finalBracketColumn">
                <h3>Semi Finals</h3>
                ${tree.sfs.map(match => renderAdminFinalMatchCard(match, currentUserIsFullAdmin)).join("")}
            </div>

            <div class="finalBracketColumn">
                <h3>3rd Place & Final</h3>
                ${tree.placement.map(match => renderAdminFinalMatchCard(match, currentUserIsFullAdmin)).join("")}
            </div>
        </div>
    `;

    attachAdminFinalTreeEvents(onAfterSave);
}

function renderAdminFinalMatchCard(match, currentUserIsFullAdmin) {
    const teamInputs = currentUserIsFullAdmin
        ? `
            <input id="${match.id}_homeTeam" value="${match.homeTeam}">
            <span>vs</span>
            <input id="${match.id}_awayTeam" value="${match.awayTeam}">
          `
        : `
            <p><strong>${match.homeTeam}</strong> vs <strong>${match.awayTeam}</strong></p>
            <input type="hidden" id="${match.id}_homeTeam" value="${match.homeTeam}">
            <input type="hidden" id="${match.id}_awayTeam" value="${match.awayTeam}">
          `;

    return `
        <div class="adminMatchCard finalTreeCard">
            <h3>${matchTitle(match)}</h3>

            ${teamInputs}

            <br><br>

            <input type="number"
                   id="${match.id}_homeGoals"
                   placeholder="Home Goals"
                   value="${match.homeGoals ?? ""}">

            <input type="number"
                   id="${match.id}_awayGoals"
                   placeholder="Away Goals"
                   value="${match.awayGoals ?? ""}">

            <br><br>

            <label>Status:</label>
            <select id="${match.id}_status">
                <option value="upcoming" ${match.status === "upcoming" ? "selected" : ""}>Upcoming</option>
                <option value="live" ${match.status === "live" ? "selected" : ""}>Live</option>
                <option value="finished" ${match.status === "finished" ? "selected" : ""}>Finished</option>
            </select>

            <br><br>

            <label>Winner:</label>
            <select id="${match.id}_winner">
                <option value="">Auto from score</option>
                <option value="${match.homeTeam}" ${match.winner === match.homeTeam ? "selected" : ""}>${match.homeTeam}</option>
                <option value="${match.awayTeam}" ${match.winner === match.awayTeam ? "selected" : ""}>${match.awayTeam}</option>
            </select>

            <br><br>

            <button class="saveFinalMatchBtn" data-id="${match.id}">
                Save Result
            </button>
        </div>
    `;
}

function matchTitle(match) {
    if (match.stage === "QF") return match.id.replace("QFSFF_QF_", "Quarter Final ");
    if (match.stage === "SF") return match.id.replace("QFSFF_SF_", "Semi Final ");
    if (match.stage === "3RD") return "3rd Place Play-off";
    if (match.stage === "F") return "Final";
    return match.id;
}

function attachAdminFinalTreeEvents(onAfterSave) {
    document.querySelectorAll(".saveFinalMatchBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const matchId = button.dataset.id;

            const homeTeam = document.getElementById(`${matchId}_homeTeam`).value.trim();
            const awayTeam = document.getElementById(`${matchId}_awayTeam`).value.trim();
            const homeGoalsValue = document.getElementById(`${matchId}_homeGoals`).value;
            const awayGoalsValue = document.getElementById(`${matchId}_awayGoals`).value;
            const status = document.getElementById(`${matchId}_status`).value;
            const selectedWinner = document.getElementById(`${matchId}_winner`).value;

            const homeGoals = homeGoalsValue === "" ? null : Number(homeGoalsValue);
            const awayGoals = awayGoalsValue === "" ? null : Number(awayGoalsValue);

            let winner = selectedWinner;

            if (!winner && homeGoals !== null && awayGoals !== null) {
                if (homeGoals > awayGoals) winner = homeTeam;
                else if (awayGoals > homeGoals) winner = awayTeam;
                else winner = null;
            }

            if (status === "finished" && homeGoals === awayGoals && !winner) {
                alert("This match is tied. Please manually select the winner.");
                return;
            }

            button.disabled = true;
            button.innerText = "Saving...";

            await updateDoc(doc(db, "matches", matchId), {
                homeTeam,
                awayTeam,
                homeGoals,
                awayGoals,
                winner,
                status,
                updatedAt: new Date().toISOString()
            });

            await propagateActualFinalRoundTeams();

            if (onAfterSave) {
                await onAfterSave();
            }
        });
    });
}
