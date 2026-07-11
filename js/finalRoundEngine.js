import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { calculatePoints } from "./scoring.js";

export const FINAL_ROUND_ID = "QF-SF-F";

export const FINAL_ROUND_MATCH_IDS = {
    qf1: "QFSFF_QF_01",
    qf2: "QFSFF_QF_02",
    qf3: "QFSFF_QF_03",
    qf4: "QFSFF_QF_04",
    sf1: "QFSFF_SF_01",
    sf2: "QFSFF_SF_02",
    third: "QFSFF_3RD",
    final: "QFSFF_FINAL"
};

export function isFinalRound(round) {
    return round === FINAL_ROUND_ID;
}

export function getFinalRoundSubmittedField() {
    return "predictionsSubmittedQFSFF";
}

export function formatFinalRoundStage(stage) {
    if (stage === "QF") return "Quarter Final";
    if (stage === "SF") return "Semi Final";
    if (stage === "3RD") return "3rd Place Play-off";
    if (stage === "F") return "Final";
    return stage || "Match";
}

export async function getFinalRoundMatches() {
    const snap = await getDocs(collection(db, "matches"));
    const matches = [];

    snap.forEach(docSnap => {
        const match = docSnap.data();
        if (match.round === FINAL_ROUND_ID) {
            matches.push(match);
        }
    });

    matches.sort((a, b) => getFinalRoundSortIndex(a.id) - getFinalRoundSortIndex(b.id));
    return matches;
}

export async function getFinalRoundMatchesMap() {
    const matches = await getFinalRoundMatches();
    const map = {};

    matches.forEach(match => {
        map[match.id] = match;
    });

    return map;
}

export async function getUserFinalRoundPredictions(username) {
    const snap = await getDocs(collection(db, "predictions", username, "matches"));
    const map = {};

    snap.forEach(docSnap => {
        const prediction = docSnap.data();
        if (prediction.round === FINAL_ROUND_ID) {
            map[docSnap.id] = prediction;
        }
    });

    return map;
}

export function getFinalRoundSortIndex(matchId) {
    const order = [
        FINAL_ROUND_MATCH_IDS.qf1,
        FINAL_ROUND_MATCH_IDS.qf2,
        FINAL_ROUND_MATCH_IDS.qf3,
        FINAL_ROUND_MATCH_IDS.qf4,
        FINAL_ROUND_MATCH_IDS.sf1,
        FINAL_ROUND_MATCH_IDS.sf2,
        FINAL_ROUND_MATCH_IDS.third,
        FINAL_ROUND_MATCH_IDS.final
    ];

    const index = order.indexOf(matchId);
    return index === -1 ? 999 : index;
}

export function getFinalRoundTreeGroups(matchesMap) {
    return {
        qfs: [
            matchesMap[FINAL_ROUND_MATCH_IDS.qf1],
            matchesMap[FINAL_ROUND_MATCH_IDS.qf2],
            matchesMap[FINAL_ROUND_MATCH_IDS.qf3],
            matchesMap[FINAL_ROUND_MATCH_IDS.qf4]
        ].filter(Boolean),
        sfs: [
            matchesMap[FINAL_ROUND_MATCH_IDS.sf1],
            matchesMap[FINAL_ROUND_MATCH_IDS.sf2]
        ].filter(Boolean),
        placement: [
            matchesMap[FINAL_ROUND_MATCH_IDS.third],
            matchesMap[FINAL_ROUND_MATCH_IDS.final]
        ].filter(Boolean)
    };
}

export function calculateQualifiedTeamsFromPrediction(predictionMap) {
    const qf1 = predictionMap[FINAL_ROUND_MATCH_IDS.qf1];
    const qf2 = predictionMap[FINAL_ROUND_MATCH_IDS.qf2];
    const qf3 = predictionMap[FINAL_ROUND_MATCH_IDS.qf3];
    const qf4 = predictionMap[FINAL_ROUND_MATCH_IDS.qf4];

    const sf1Home = qf1?.winner || "Winner QF1";
    const sf1Away = qf2?.winner || "Winner QF2";
    const sf2Home = qf3?.winner || "Winner QF3";
    const sf2Away = qf4?.winner || "Winner QF4";

    const sf1 = predictionMap[FINAL_ROUND_MATCH_IDS.sf1];
    const sf2 = predictionMap[FINAL_ROUND_MATCH_IDS.sf2];

    const sf1Loser = getOtherTeam(sf1?.homeTeam, sf1?.awayTeam, sf1?.winner) || "Loser SF1";
    const sf2Loser = getOtherTeam(sf2?.homeTeam, sf2?.awayTeam, sf2?.winner) || "Loser SF2";

    return {
        [FINAL_ROUND_MATCH_IDS.sf1]: {
            homeTeam: sf1Home,
            awayTeam: sf1Away
        },
        [FINAL_ROUND_MATCH_IDS.sf2]: {
            homeTeam: sf2Home,
            awayTeam: sf2Away
        },
        [FINAL_ROUND_MATCH_IDS.third]: {
            homeTeam: sf1Loser,
            awayTeam: sf2Loser
        },
        [FINAL_ROUND_MATCH_IDS.final]: {
            homeTeam: sf1?.winner || "Winner SF1",
            awayTeam: sf2?.winner || "Winner SF2"
        }
    };
}

export function getOtherTeam(homeTeam, awayTeam, winner) {
    if (!homeTeam || !awayTeam || !winner) return null;
    if (winner === homeTeam) return awayTeam;
    if (winner === awayTeam) return homeTeam;
    return null;
}

export function createEmptyFinalPrediction(match) {
    return {
        matchId: match.id,
        round: FINAL_ROUND_ID,
        stage: match.stage || null,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeGoals: null,
        awayGoals: null,
        winner: null
    };
}

export function updatePredictionTeamsFromTree(predictionMap) {
    const qualified = calculateQualifiedTeamsFromPrediction(predictionMap);

    Object.keys(qualified).forEach(matchId => {
        if (!predictionMap[matchId]) return;

        const newHome = qualified[matchId].homeTeam;
        const newAway = qualified[matchId].awayTeam;

        predictionMap[matchId].homeTeam = newHome;
        predictionMap[matchId].awayTeam = newAway;

        if (
            predictionMap[matchId].winner &&
            predictionMap[matchId].winner !== newHome &&
            predictionMap[matchId].winner !== newAway
        ) {
            predictionMap[matchId].winner = null;
        }
    });

    return predictionMap;
}

export async function saveFinalRoundPredictions(username, predictionMap) {
    for (const matchId of Object.keys(predictionMap)) {
        const prediction = predictionMap[matchId];

        await setDoc(
            doc(db, "predictions", username, "matches", matchId),
            {
                ...prediction,
                round: FINAL_ROUND_ID,
                submittedAt: new Date().toISOString()
            }
        );
    }

    await setDoc(doc(db, "users", username), {
        predictionsSubmittedQFSFF: true
    }, { merge: true });
}

export async function propagateActualFinalRoundTeams() {
    const map = await getFinalRoundMatchesMap();

    const qf1 = map[FINAL_ROUND_MATCH_IDS.qf1];
    const qf2 = map[FINAL_ROUND_MATCH_IDS.qf2];
    const qf3 = map[FINAL_ROUND_MATCH_IDS.qf3];
    const qf4 = map[FINAL_ROUND_MATCH_IDS.qf4];

    const updates = {};

    updates[FINAL_ROUND_MATCH_IDS.sf1] = {
        homeTeam: qf1?.winner || map[FINAL_ROUND_MATCH_IDS.sf1]?.homeTeam || "Winner QF1",
        awayTeam: qf2?.winner || map[FINAL_ROUND_MATCH_IDS.sf1]?.awayTeam || "Winner QF2"
    };

    updates[FINAL_ROUND_MATCH_IDS.sf2] = {
        homeTeam: qf3?.winner || map[FINAL_ROUND_MATCH_IDS.sf2]?.homeTeam || "Winner QF3",
        awayTeam: qf4?.winner || map[FINAL_ROUND_MATCH_IDS.sf2]?.awayTeam || "Winner QF4"
    };

    const sf1 = { ...map[FINAL_ROUND_MATCH_IDS.sf1], ...updates[FINAL_ROUND_MATCH_IDS.sf1] };
    const sf2 = { ...map[FINAL_ROUND_MATCH_IDS.sf2], ...updates[FINAL_ROUND_MATCH_IDS.sf2] };

    updates[FINAL_ROUND_MATCH_IDS.final] = {
        homeTeam: sf1?.winner || map[FINAL_ROUND_MATCH_IDS.final]?.homeTeam || "Winner SF1",
        awayTeam: sf2?.winner || map[FINAL_ROUND_MATCH_IDS.final]?.awayTeam || "Winner SF2"
    };

    updates[FINAL_ROUND_MATCH_IDS.third] = {
        homeTeam: getOtherTeam(sf1?.homeTeam, sf1?.awayTeam, sf1?.winner) || map[FINAL_ROUND_MATCH_IDS.third]?.homeTeam || "Loser SF1",
        awayTeam: getOtherTeam(sf2?.homeTeam, sf2?.awayTeam, sf2?.winner) || map[FINAL_ROUND_MATCH_IDS.third]?.awayTeam || "Loser SF2"
    };

    for (const matchId of Object.keys(updates)) {
        await setDoc(doc(db, "matches", matchId), updates[matchId], { merge: true });
    }
}

function calculateFinalRoundNormalPoints(prediction, result) {
    if (
        !prediction ||
        !result ||
        result.homeGoals === null ||
        result.awayGoals === null ||
        result.homeGoals === undefined ||
        result.awayGoals === undefined ||
        result.status !== "finished" ||
        !result.winner
    ) {
        return null;
    }

    if (result.stage === "QF") {
        return calculatePoints(prediction, result);
    }

    const predictedTeams = [prediction.homeTeam, prediction.awayTeam].filter(Boolean);
    const actualTeams = [result.homeTeam, result.awayTeam].filter(Boolean);

    const correctlyQualifiedTeams =
        predictedTeams.filter(team => actualTeams.includes(team));

    if (correctlyQualifiedTeams.length === 2) {
        return calculatePoints(prediction, result);
    }

    if (correctlyQualifiedTeams.length === 0) {
        return 0;
    }

    const correctTeam = correctlyQualifiedTeams[0];
    let points = 0;

    if (
        prediction.winner === result.winner &&
        prediction.winner === correctTeam
    ) {
        points += 1;
    }

    const predictedGoalsForCorrectTeam =
        prediction.homeTeam === correctTeam
            ? prediction.homeGoals
            : prediction.awayGoals;

    const actualGoalsForCorrectTeam =
        result.homeTeam === correctTeam
            ? result.homeGoals
            : result.awayGoals;

    if (predictedGoalsForCorrectTeam === actualGoalsForCorrectTeam) {
        points += 1;
    }

    return points;
}


export function calculateFinalRoundBonus(prediction, result) {
    if (
        !prediction ||
        !result ||
        result.status !== "finished" ||
        !result.winner ||
        prediction.winner !== result.winner
    ) {
        return 0;
    }

    if (result.stage === "SF" || result.stage === "3RD") {
        return 1;
    }

    if (result.stage === "F") {
        return 2;
    }

    return 0;
}


export function calculateFinalRoundScore(prediction, result) {
    const normalPoints = calculateFinalRoundNormalPoints(prediction, result);

    if (normalPoints === null) {
        return null;
    }

    const bonusPoints = calculateFinalRoundBonus(prediction, result);

    return {
        normalPoints,
        bonusPoints,
        totalPoints: normalPoints + bonusPoints
    };
}


/*
 * Kept for compatibility with any older code that expects only the
 * normal 0-4 match score.
 */
export function calculateFinalRoundPoints(prediction, result) {
    const score = calculateFinalRoundScore(prediction, result);
    return score === null ? null : score.normalPoints;
}
