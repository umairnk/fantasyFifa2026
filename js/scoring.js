export function calculatePoints(prediction, result) {
    if (
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

    let points = 0;

    const actualWinner = result.winner;

    const actualLoser =
        actualWinner === result.homeTeam
            ? result.awayTeam
            : result.homeTeam;

    const predictedWinner = prediction.winner;

    const predictedGoalsForActualWinner =
        actualWinner === result.homeTeam
            ? prediction.homeGoals
            : prediction.awayGoals;

    const predictedGoalsForActualLoser =
        actualLoser === result.homeTeam
            ? prediction.homeGoals
            : prediction.awayGoals;

    const actualWinnerGoals =
        actualWinner === result.homeTeam
            ? result.homeGoals
            : result.awayGoals;

    const actualLoserGoals =
        actualLoser === result.homeTeam
            ? result.homeGoals
            : result.awayGoals;

    const predictedGoalDiff =
        prediction.homeGoals - prediction.awayGoals;

    const actualGoalDiff =
        result.homeGoals - result.awayGoals;

    if (predictedWinner === actualWinner) {
        points += 1;
    }

    if (predictedGoalsForActualWinner === actualWinnerGoals) {
        points += 1;
    }

    if (predictedGoalsForActualLoser === actualLoserGoals) {
        points += 1;
    }

    if (predictedGoalDiff === actualGoalDiff) {
        points += 1;
    }

    return points;
}


export function emptyLeaderboardRow(player) {
    return {
        player,
        totalGames: 0,
        totalPoints: 0,
        individualWins: 0,
        fourPointers: 0,
        threePointers: 0,
        twoPointers: 0,
        onePointers: 0,
        zeroPointers: 0
    };
}


export function addPointsToRow(row, points) {
    row.totalGames += 1;
    row.totalPoints += points;

    if (points === 4) row.fourPointers += 1;
    if (points === 3) row.threePointers += 1;
    if (points === 2) row.twoPointers += 1;
    if (points === 1) row.onePointers += 1;
    if (points === 0) row.zeroPointers += 1;
}


export function sortLeaderboard(rows) {
    return rows.sort((a, b) =>
        b.totalPoints - a.totalPoints ||
        b.individualWins - a.individualWins ||
        b.fourPointers - a.fourPointers ||
        b.threePointers - a.threePointers ||
        b.twoPointers - a.twoPointers ||
        b.onePointers - a.onePointers ||
        a.player.localeCompare(b.player)
    );
}