import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    updateDoc,
    getDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    recalculateGlobalLeaderboard,
    recalculateGroupLeaderboard
}
from "./leaderboard.js";


export async function isAdmin(username) {
    const snap = await getDoc(doc(db, "users", username));
    return snap.exists() && snap.data().isAdmin === true;
}


export async function loadAdminPage() {
    const container = document.getElementById("adminContainer");
    container.innerHTML = "<h2>Admin Match Editor</h2>";

    const snapshot = await getDocs(collection(db, "matches"));

    const matches = [];

    snapshot.forEach(docSnap => {
        matches.push(docSnap.data());
    });

    matches.sort((a, b) => a.id.localeCompare(b.id));

    matches.forEach(match => {
        container.innerHTML += `
            <div class="adminMatchCard">

                <h3>${match.id}</h3>

                <input id="${match.id}_homeTeam"
                       value="${match.homeTeam}">

                <span>vs</span>

                <input id="${match.id}_awayTeam"
                       value="${match.awayTeam}">

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

                    <option value="${match.homeTeam}"
                        ${match.winner === match.homeTeam ? "selected" : ""}>
                        ${match.homeTeam}
                    </option>

                    <option value="${match.awayTeam}"
                        ${match.winner === match.awayTeam ? "selected" : ""}>
                        ${match.awayTeam}
                    </option>
                </select>

                <br><br>

                <button class="saveMatchBtn"
                        data-id="${match.id}">
                    Save
                </button>

            </div>
        `;
    });

    attachAdminEvents();
}


function attachAdminEvents() {
    document.querySelectorAll(".saveMatchBtn").forEach(button => {
        button.addEventListener("click", async () => {
            const matchId = button.dataset.id;

            const homeTeam =
                document.getElementById(`${matchId}_homeTeam`).value.trim();

            const awayTeam =
                document.getElementById(`${matchId}_awayTeam`).value.trim();

            const homeGoalsValue =
                document.getElementById(`${matchId}_homeGoals`).value;

            const awayGoalsValue =
                document.getElementById(`${matchId}_awayGoals`).value;

            const status =
                document.getElementById(`${matchId}_status`).value;

            const selectedWinner =
                document.getElementById(`${matchId}_winner`).value;

            const homeGoals =
                homeGoalsValue === "" ? null : Number(homeGoalsValue);

            const awayGoals =
                awayGoalsValue === "" ? null : Number(awayGoalsValue);

            let winner = selectedWinner;

            if (!winner && homeGoals !== null && awayGoals !== null) {
                if (homeGoals > awayGoals) {
                    winner = homeTeam;
                } else if (awayGoals > homeGoals) {
                    winner = awayTeam;
                } else {
                    winner = null;
                }
            }

            if (
                status === "finished" &&
                homeGoals !== null &&
                awayGoals !== null &&
                homeGoals === awayGoals &&
                !winner
            ) {
                alert(
                    "This match is tied. Please manually select the winner."
                );
                return;
            }

            await updateDoc(doc(db, "matches", matchId), {
                homeTeam,
                awayTeam,
                homeGoals,
                awayGoals,
                winner,
                status,
                updatedAt: new Date().toISOString()
            });

            await recalculateGlobalLeaderboard();

            const groupsSnap = await getDocs(collection(db, "groups"));

            for (const groupDoc of groupsSnap.docs) {
                await recalculateGroupLeaderboard(groupDoc.id);
            }

            alert(`${matchId} saved and all leaderboards recalculated.`);
        });
    });
}