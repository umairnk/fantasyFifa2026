export function calculatePoints(prediction, result) {
    if (
        result.homeGoals === null ||
        result.awayGoals === null ||
        result.status !== "finished"
    ) {
        return null;
    }

    let points = 0;

    const actualWinner =
        result.homeGoals > result.awayGoals
            ? result.homeTeam
            : result.awayGoals > result.homeGoals
                ? result.awayTeam
                : "Draw";

    const predictedWinner = prediction.winner;

    const predictedWinnerGoals =
        predictedWinner === prediction.homeTeam
            ? prediction.homeGoals
            : prediction.awayGoals;

    const predictedLoserGoals =
        predictedWinner === prediction.homeTeam
            ? prediction.awayGoals
            : prediction.homeGoals;

    const actualWinnerGoals =
        actualWinner === result.homeTeam
            ? result.homeGoals
            : result.awayGoals;

    const actualLoserGoals =
        actualWinner === result.homeTeam
            ? result.awayGoals
            : result.homeGoals;

    const predictedGoalDiff =
        Math.abs(prediction.homeGoals - prediction.awayGoals);

    const actualGoalDiff =
        Math.abs(result.homeGoals - result.awayGoals);

    if (predictedWinner === actualWinner) {
        points += 1;
    }

    if (predictedWinnerGoals === actualWinnerGoals) {
        points += 1;
    }

    if (predictedLoserGoals === actualLoserGoals) {
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