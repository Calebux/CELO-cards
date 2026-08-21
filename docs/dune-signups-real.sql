-- ---------------------------------------------------------------------------
-- REAL SIGNUPS -- on-chain, agent-proof, and it maintains itself.
--
-- 54 as of 2026-08-20.
--
-- Do NOT chart KnockOrderSignups.totalSignups on its own: it reads 169, and
-- 109 of those are our own automation wallets. The raw counter is the single
-- most misleading number in this dataset.
--
-- Intersecting the signup events with GoodDollar verification fixes that for
-- free. An automation wallet cannot pass a face check, so all 109 drop out
-- without needing an exclusion list to maintain -- and the survivors are, by
-- construction, real people who signed up on-chain.
--
-- Honest framing of what this is and is not:
--   169  wallets have signed up on-chain          (109 agents, 2 team, 58 real)
--    58  of those are real players
--    54  of those are also GoodDollar-verified    <-- this query
--   200  real signup wallets exist in app records
--
-- The gap between 54 and 200 is not missing people: KnockOrderSignups.signUp()
-- only fires for a wallet that is already verified AND has claimed, so most
-- players never call it. 54 is the provable floor, not the population.
-- For the population, see the users query (dune-users-counter.sql).
-- ---------------------------------------------------------------------------
WITH signed_up AS (
    -- SignedUp(address indexed player, uint256 indexed index, bool sponsored, uint256 timestamp)
    SELECT DISTINCT bytearray_substring(topic1, 13, 20) AS wallet
    FROM celo.logs
    WHERE contract_address = 0xb18978895de20bb4c7b79307c0ecbf28744f37c7
      AND topic0 = 0x204a284b88089f7eb995a2017100c78a0e2ddf0a606d73b6018f6075acea7c34
),

gooddollar_verified AS (
    SELECT DISTINCT bytearray_substring(topic1, 13, 20) AS wallet
    FROM celo.logs
    WHERE contract_address = 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
      AND topic0 IN (
          0xee1504a83b6d4a361f4c1dc78ab59bfa30d6a3b6612c403e86bb01ef2984295f,  -- WhitelistedAdded
          0xb2a82fce6d8c7a633efe9579f77b4edb96bfdf171a49bfc2ce666dc543a1f500   -- WhitelistedAuthenticated
      )
),

team (wallet) AS (
    VALUES
        (0x0067378592a4d0ccc3146dba13137e21589921ed),
        (0xba37dd0890afc659a25331871319f66e7eba3522),
        (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b)
)

SELECT count(DISTINCT s.wallet) AS real_signups
FROM signed_up s
JOIN gooddollar_verified g ON g.wallet = s.wallet
WHERE s.wallet NOT IN (SELECT wallet FROM team);
