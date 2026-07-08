export const finalRoundMatches = [

    // =========================
    // Quarter Finals
    // =========================

    {
        id: "QFSFF_QF_01",
        round: "QF-SF-F",
        stage: "QF",
        homeTeam: "France",
        awayTeam: "Morocco",
        startTime: "2026-07-09T22:00:00+02:00"
    },

    {
        id: "QFSFF_QF_02",
        round: "QF-SF-F",
        stage: "QF",
        homeTeam: "Spain",
        awayTeam: "Belgium",
        startTime: "2026-07-10T21:00:00+02:00"
    },

    {
        id: "QFSFF_QF_03",
        round: "QF-SF-F",
        stage: "QF",
        homeTeam: "Norway",
        awayTeam: "England",
        startTime: "2026-07-11T23:00:00+02:00"
    },

    {
        id: "QFSFF_QF_04",
        round: "QF-SF-F",
        stage: "QF",
        homeTeam: "Argentina",
        awayTeam: "Switzerland",
        startTime: "2026-07-12T03:00:00+02:00"
    },


    // =========================
    // Semi Finals
    // =========================

    {
        id: "QFSFF_SF_01",
        round: "QF-SF-F",
        stage: "SF",

        homeTeam: "Winner QF1",
        awayTeam: "Winner QF2",

        sourceHome: "QFSFF_QF_01",
        sourceAway: "QFSFF_QF_02",

        startTime: "2026-07-14T21:00:00+02:00"
    },

    {
        id: "QFSFF_SF_02",
        round: "QF-SF-F",
        stage: "SF",

        homeTeam: "Winner QF3",
        awayTeam: "Winner QF4",

        sourceHome: "QFSFF_QF_03",
        sourceAway: "QFSFF_QF_04",

        startTime: "2026-07-15T21:00:00+02:00"
    },


    // =========================
    // Third Place
    // =========================

    {
        id: "QFSFF_3RD",
        round: "QF-SF-F",
        stage: "3RD",

        homeTeam: "Loser SF1",
        awayTeam: "Loser SF2",

        sourceHome: "QFSFF_SF_01",
        sourceAway: "QFSFF_SF_02",

        startTime: "2026-07-18T22:00:00+02:00"
    },


    // =========================
    // Final
    // =========================

    {
        id: "QFSFF_FINAL",
        round: "QF-SF-F",
        stage: "F",

        homeTeam: "Winner SF1",
        awayTeam: "Winner SF2",

        sourceHome: "QFSFF_SF_01",
        sourceAway: "QFSFF_SF_02",

        startTime: "2026-07-19T21:00:00+02:00"
    }

];