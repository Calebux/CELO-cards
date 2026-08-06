-- ═══════════════════════════════════════════════════════════════════════════
-- Action Order — Dune queries (Celo mainnet)
--
-- Built on celo.logs with raw topic decoding rather than tokens.transfers,
-- because Dune's Celo coverage in that table is incomplete — which is why the
-- old dashboard reported roughly a third of the real volume.
--
-- Verified against Blockscout on 2026-08-06. Expected values are noted per
-- query so a wrong result is obvious rather than silently believed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TOTAL G$ VOLUME  →  expect ~931,000 G$ · 178 transfers · 41 counterparties
-- ───────────────────────────────────────────────────────────────────────────
with app_addresses (address) as (
  values
    (0xba37dd0890afc659a25331871319f66e7eba3522),  -- treasury
    (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b),  -- MiniPay treasury
    (0xc032b8efca84eacfe38a432ac30ca3684854981b),  -- season pass (G$)
    (0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb),  -- season pass (CELO)
    (0x80b10a44b0ea03473707660bc5767099710bbfe0)   -- arena
),
transfers as (
  select
    varbinary_substring(topic1, 13, 20) as sender,
    varbinary_substring(topic2, 13, 20) as recipient,
    bytearray_to_uint256(data) / 1e18   as amount,
    block_time
  from celo.logs
  where contract_address = 0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a  -- G$
    and topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
)
select
  sum(amount)                                                              as total_volume_gd,
  sum(case when recipient in (select address from app_addresses) then amount else 0 end) as inbound_gd,
  sum(case when sender    in (select address from app_addresses) then amount else 0 end) as outbound_gd,
  count(*)                                                                 as transfers,
  count(distinct case
    when recipient in (select address from app_addresses) then sender else recipient
  end)                                                                     as counterparties,
  min(block_time)                                                          as first_activity,
  max(block_time)                                                          as last_activity
from transfers
where sender    in (select address from app_addresses)
   or recipient in (select address from app_addresses);


-- ───────────────────────────────────────────────────────────────────────────
-- 2. SEASON PASSES SOLD  →  expect 58 passes · ~34,000 G$
--
-- Both pass contracts. Every sale to date has been on the G$ one; the CELO
-- contract has never had a purchase, and querying it alone reported zero.
--
-- PassPurchased(address indexed buyer, string plan, uint256 amount, uint256 totalSold)
-- Non-indexed data is [offset(32) | amount(32) | totalSold(32) | string…], so
-- `amount` sits at byte 33.
-- ───────────────────────────────────────────────────────────────────────────
select
  count(*)                                                     as passes_sold,
  count(distinct varbinary_substring(topic1, 13, 20))          as unique_buyers,
  sum(bytearray_to_uint256(varbinary_substring(data, 33, 32)) / 1e18) as revenue_gd,
  min(block_time)                                              as first_sale,
  max(block_time)                                              as last_sale
from celo.logs
where contract_address in (
    0xc032b8efca84eacfe38a432ac30ca3684854981b,  -- G$ pass
    0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb   -- CELO pass
  )
  and topic0 = 0xd10f1b5a89924ee5fc5846d29052675620b15b414336aff9d0a75e15cc4dc5bb;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. PASSES SOLD PER DAY  (chart: bar, x = day)
-- ───────────────────────────────────────────────────────────────────────────
select
  date_trunc('day', block_time)                                as day,
  count(*)                                                     as passes,
  sum(bytearray_to_uint256(varbinary_substring(data, 33, 32)) / 1e18) as revenue_gd
from celo.logs
where contract_address in (
    0xc032b8efca84eacfe38a432ac30ca3684854981b,
    0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
  )
  and topic0 = 0xd10f1b5a89924ee5fc5846d29052675620b15b414336aff9d0a75e15cc4dc5bb
group by 1
order by 1;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. REWARDS DISTRIBUTED TO PLAYERS  →  expect ~299,000 G$
--
-- Outbound only, excluding our own addresses on the receiving end, so moving
-- funds between our own wallets is never counted as paying a player.
-- ───────────────────────────────────────────────────────────────────────────
with app_addresses (address) as (
  values
    (0xba37dd0890afc659a25331871319f66e7eba3522),
    (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b),
    (0xc032b8efca84eacfe38a432ac30ca3684854981b),
    (0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb),
    (0x80b10a44b0ea03473707660bc5767099710bbfe0)
)
select
  sum(bytearray_to_uint256(data) / 1e18)                       as rewards_gd,
  count(*)                                                     as payouts,
  count(distinct varbinary_substring(topic2, 13, 20))          as players_paid
from celo.logs
where contract_address = 0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a
  and topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
  and varbinary_substring(topic1, 13, 20) in (select address from app_addresses)
  and varbinary_substring(topic2, 13, 20) not in (select address from app_addresses);


-- ───────────────────────────────────────────────────────────────────────────
-- 5. DAILY VOLUME  (chart: area, x = day, y = inbound_gd + outbound_gd)
-- ───────────────────────────────────────────────────────────────────────────
with app_addresses (address) as (
  values
    (0xba37dd0890afc659a25331871319f66e7eba3522),
    (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b),
    (0xc032b8efca84eacfe38a432ac30ca3684854981b),
    (0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb),
    (0x80b10a44b0ea03473707660bc5767099710bbfe0)
),
transfers as (
  select
    varbinary_substring(topic1, 13, 20) as sender,
    varbinary_substring(topic2, 13, 20) as recipient,
    bytearray_to_uint256(data) / 1e18   as amount,
    block_time
  from celo.logs
  where contract_address = 0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a
    and topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
)
select
  date_trunc('day', block_time) as day,
  sum(case when recipient in (select address from app_addresses) then amount else 0 end) as inbound_gd,
  sum(case when sender    in (select address from app_addresses) then amount else 0 end) as outbound_gd,
  sum(amount)                   as total_gd,
  count(*)                      as transfers
from transfers
where sender    in (select address from app_addresses)
   or recipient in (select address from app_addresses)
group by 1
order by 1;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. UNIQUE WALLETS REACHED  (everyone who has transacted with the app)
--
-- Counts on-chain counterparties, so it is wider than registered players and
-- narrower than total signups — a wallet only appears once it moves value.
-- ───────────────────────────────────────────────────────────────────────────
with app_addresses (address) as (
  values
    (0xba37dd0890afc659a25331871319f66e7eba3522),
    (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b),
    (0xc032b8efca84eacfe38a432ac30ca3684854981b),
    (0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb),
    (0x80b10a44b0ea03473707660bc5767099710bbfe0)
),
counterparties as (
  select
    case
      when varbinary_substring(topic2, 13, 20) in (select address from app_addresses)
      then varbinary_substring(topic1, 13, 20)
      else varbinary_substring(topic2, 13, 20)
    end            as wallet,
    block_time
  from celo.logs
  where contract_address = 0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a
    and topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    and (
      varbinary_substring(topic1, 13, 20) in (select address from app_addresses)
      or varbinary_substring(topic2, 13, 20) in (select address from app_addresses)
    )
)
select
  count(distinct wallet) as wallets_reached,
  count(*)               as interactions
from counterparties
where wallet not in (select address from app_addresses);


-- ───────────────────────────────────────────────────────────────────────────
-- 7. ON-CHAIN SIGNUPS  →  raw count includes 112 automation wallets
--
-- SignedUp fires only inside the verify-and-claim flow, so this counts
-- GoodDollar-verified players rather than app registrations. The raw total is
-- inflated by a one-off script run; the agent wallets are not filtered here
-- because pasting 112 addresses into SQL is unmanageable — subtract 112, or
-- exclude them with a Dune list if you maintain one.
-- ───────────────────────────────────────────────────────────────────────────
select
  count(*)                                            as signups_raw,
  count(*) - 112                                      as signups_real_estimate,
  count(distinct varbinary_substring(topic1, 13, 20)) as unique_wallets,
  min(block_time)                                     as first_signup,
  max(block_time)                                     as last_signup
from celo.logs
where contract_address = 0xb18978895de20bb4c7b79307c0ecbf28744f37c7
  and topic0 = 0x204a284b88089f7eb995a2017100c78a0e2ddf0a606d73b6018f6075acea7c34;
