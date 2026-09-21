-- GoodBuilders S4: Onboarded Users — Action Order
--
-- Their template with our addresses, plus a team exclusion they do not include.
--
-- WHAT COUNTS: a wallet whitelisted by GoodDollar ON OR AFTER 2026-06-30 that
-- touched one of our addresses WITHIN 24 HOURS of being whitelisted. Both
-- halves are strict — verified before the season, or verified and played the
-- next week, and it does not count.
--
-- OUR SPONSORED SIGNUPS DO NOT COUNT HERE. The 191 signUpFor(player) calls were
-- sent by the deployer, so in celo.transactions `from` is the deployer and
-- `to` is the Signups contract — the player is nowhere in the transaction. They
-- appear only in the SignedUp event, which this query does not read. The
-- backfill made players visible to event-based metrics, not to this one.
--
-- WHAT DOES COUNT FOR US, all within 24h of verification:
--   - buying a season pass (G$ transfer to the pass registry)
--   - claiming G$ through ClaimGDollar, which self-signs signUp() from the
--     player's own wallet
--   - receiving a G$ prize or daily reward from a treasury
--   - a VS House match, but ONLY if the player's wallet holds CELO. bossEntry.ts
--     calls MatchRegistry.recordMatch signed by the player, which qualifies —
--     but it is skipped below 0.02 CELO (MIN_GAS_WEI) and skipped entirely in
--     MiniPay, and a wallet made through social login has no CELO. Measured
--     2026-09-21: 138 distinct wallets have ever called it, out of 5,084
--     players. So a player who verifies and then only plays VS House is, in
--     practice, invisible to this metric no matter how much they play.
--
-- THE WELCOME BONUS IS THE PATH THAT IS MEANT TO COVER EVERYONE: 100 G$ from the
-- treasury to every newly verified player. It paid nobody between 2026-08-26 and
-- 2026-09-21 — verifying is a redirect out to GoodDollar and back, 42% of
-- session resumes give up, and the client ping was one shot per page load with
-- no retry. /api/cron/welcome-sweep now pays from the server side instead.

WITH project_contracts AS (
    SELECT address
    FROM (VALUES
        (0xb18978895de20bb4c7b79307c0ecbf28744f37c7),  -- KnockOrderSignups
        (0xc032b8efca84eacfe38a432ac30ca3684854981b),  -- GDollarSeasonPassRegistry v2
        (0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb),  -- Season pass (CELO)
        (0xe9d61b9a0cbb6ef53af1ad63a9e16ca33869f44d),  -- MatchRegistry
        (0x473df985d05a0b635706e58ac8e7452dcc3e9a01),  -- KnockOrderArenaV2 (current)
        (0x8475ca3d129b9d69716b3dcab73a5e0306eaa9c1),  -- KnockOrderArenaV2 (superseded)
        (0x80b10a44b0ea03473707660bc5767099710bbfe0),  -- KnockOrderArena v1
        (0xba37dd0890afc659a25331871319f66e7eba3522),  -- treasury (prizes out, payments in)
        (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b)   -- treasury (MiniPay)
    ) AS t(address)
),

team AS (
    SELECT address
    FROM (VALUES
        (0x0067378592a4d0ccc3146dba13137e21589921ed),  -- deployer / contract owner
        (0xba37dd0890afc659a25331871319f66e7eba3522),  -- treasury
        (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b)   -- treasury (MiniPay)
    ) AS t(address)
),

project_interactions AS (
    SELECT
        block_time,
        CASE
            WHEN "to" IN (SELECT address FROM project_contracts) THEN "from"
            WHEN "from" IN (SELECT address FROM project_contracts) THEN "to"
        END AS user_address
    FROM celo.transactions
    WHERE (
        "to" IN (SELECT address FROM project_contracts)
        OR "from" IN (SELECT address FROM project_contracts)
    )
    AND block_date >= DATE '2026-06-30'
    AND success = true

    UNION ALL

    SELECT
        evt_block_time AS block_time,
        CASE
            WHEN "to" IN (SELECT address FROM project_contracts) THEN "from"
            WHEN "from" IN (SELECT address FROM project_contracts) THEN "to"
        END AS user_address
    FROM erc20_celo.evt_Transfer
    WHERE contract_address = 0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a
    AND (
        "to" IN (SELECT address FROM project_contracts)
        OR "from" IN (SELECT address FROM project_contracts)
    )
    AND evt_block_time >= TIMESTAMP '2026-06-30'
),

whitelist AS (
    SELECT
        varbinary_substring(topic1, 13, 20) AS user_address,
        block_time AS whitelist_time,
        DATE(block_time) AS whitelist_date
    FROM celo.logs
    WHERE contract_address = 0xc361a6e67822a0edc17d899227dd9fc50bd62f42
    AND topic0 = 0xee1504a83b6d4a361f4c1dc78ab59bfa30d6a3b6612c403e86bb01ef2984295f
    AND block_date >= DATE '2026-06-30'
),

onboarded AS (
    SELECT DISTINCT
        w.user_address,
        w.whitelist_date AS cohort_date
    FROM whitelist w
    INNER JOIN project_interactions i
        ON i.user_address = w.user_address
        AND i.block_time >= w.whitelist_time
        AND i.block_time <= w.whitelist_time + INTERVAL '24' HOUR
    WHERE i.user_address IS NOT NULL
    AND i.user_address NOT IN (SELECT address FROM team)   -- added
),

all_dates AS (
    SELECT CAST(d AS DATE) AS cohort_date
    FROM UNNEST(SEQUENCE(DATE '2026-06-30', CURRENT_DATE, INTERVAL '1' DAY)) AS t(d)
)

SELECT
    NULL AS cohort_date,
    COUNT(DISTINCT user_address) AS onboarded_users
FROM onboarded

UNION ALL

SELECT
    ad.cohort_date,
    COALESCE(o.onboarded_users, 0) AS onboarded_users
FROM all_dates ad
LEFT JOIN (
    SELECT cohort_date, COUNT(DISTINCT user_address) AS onboarded_users
    FROM onboarded
    GROUP BY cohort_date
) o ON ad.cohort_date = o.cohort_date

ORDER BY cohort_date DESC NULLS FIRST
