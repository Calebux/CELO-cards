# Action Order Dune Dashboard Pack

This dashboard covers the on-chain telemetry Dune can see today: match/wager contract usage, season pass purchases, active wallets, transaction counts, token/native volume, transaction health, and recent activity.

## Constants

Use these addresses in every query:

```sql
-- Celo
-- Wager / arena contract
0x80b10a44b0ea03473707660bc5767099710bbfe0

-- Season pass contract
0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb

-- Treasury
0xba37dd0890afc659a25331871319f66e7eba3522

-- MiniPay treasury
0xbea347eebdb3dcb0bd1fec287561504804f4ba4b

-- USDT on Celo
0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e

-- G$ on Celo
0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a
```

Relevant event/call selectors:

```sql
-- MatchEntered(bytes32,address,uint256,uint8,uint256)
0xda05313f705d2c2458a909375b2e8e79aebefde11f06cd34997b644c8eb46dbc

-- PassPurchased(address,string,uint256,uint256)
0xd10f1b5a89924ee5fc5846d29052675620b15b414336aff9d0a75e15cc4dc5bb

-- enterMatchWithCelo(bytes32)
0x8f341692

-- buySeasonPass(string)
0x97d45937
```

## 1. KPI: Total On-Chain Match Entries

```sql
select
  count(*) as total_match_entries
from celo.logs
where contract_address = 0x80b10a44b0ea03473707660bc5767099710bbfe0
  and topic0 = 0xda05313f705d2c2458a909375b2e8e79aebefde11f06cd34997b644c8eb46dbc;
```

## 2. KPI: Season Passes Sold

```sql
select
  count(*) as season_passes_sold
from celo.logs
where contract_address = 0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
  and topic0 = 0xd10f1b5a89924ee5fc5846d29052675620b15b414336aff9d0a75e15cc4dc5bb;
```

## 3. KPI: Unique Active Wallets

```sql
with wallets as (
  select "from" as wallet
  from celo.transactions
  where "to" in (
    0x80b10a44b0ea03473707660bc5767099710bbfe0,
    0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
  )
    and success = true

  union

  select varbinary_substring(topic1, 13, 20) as wallet
  from celo.logs
  where contract_address in (
    0x80b10a44b0ea03473707660bc5767099710bbfe0,
    0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
  )
    and topic0 in (
      0xda05313f705d2c2458a909375b2e8e79aebefde11f06cd34997b644c8eb46dbc,
      0xd10f1b5a89924ee5fc5846d29052675620b15b414336aff9d0a75e15cc4dc5bb
    )
)
select count(distinct wallet) as unique_active_wallets
from wallets;
```

## 4. KPI: Transactions 24H / 7D / 30D / All-Time

```sql
select
  count(*) as all_time_transactions,
  count_if(block_time >= now() - interval '24' hour) as transactions_24h,
  count_if(block_time >= now() - interval '7' day) as transactions_7d,
  count_if(block_time >= now() - interval '30' day) as transactions_30d
from celo.transactions
where "to" in (
  0x80b10a44b0ea03473707660bc5767099710bbfe0,
  0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb,
  0xba37dd0890afc659a25331871319f66e7eba3522,
  0xbea347eebdb3dcb0bd1fec287561504804f4ba4b
);
```

## 5. Chart: Daily Match Entries

```sql
select
  date_trunc('day', block_time) as day,
  count(*) as match_entries,
  count(distinct varbinary_substring(topic2, 13, 20)) as unique_players
from celo.logs
where contract_address = 0x80b10a44b0ea03473707660bc5767099710bbfe0
  and topic0 = 0xda05313f705d2c2458a909375b2e8e79aebefde11f06cd34997b644c8eb46dbc
group by 1
order by 1;
```

## 6. Chart: Daily Season Pass Purchases

```sql
select
  date_trunc('day', block_time) as day,
  count(*) as passes_sold,
  count(distinct varbinary_substring(topic1, 13, 20)) as unique_buyers
from celo.logs
where contract_address = 0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
  and topic0 = 0xd10f1b5a89924ee5fc5846d29052675620b15b414336aff9d0a75e15cc4dc5bb
group by 1
order by 1;
```

## 7. KPI / Chart: CELO Volume

This covers native CELO sent to the arena, season pass contract, and treasury addresses.

```sql
select
  date_trunc('day', block_time) as day,
  sum(value / 1e18) as celo_volume
from celo.transactions
where "to" in (
  0x80b10a44b0ea03473707660bc5767099710bbfe0,
  0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb,
  0xba37dd0890afc659a25331871319f66e7eba3522,
  0xbea347eebdb3dcb0bd1fec287561504804f4ba4b
)
  and success = true
group by 1
order by 1;
```

## 8. KPI / Chart: USDT and G$ Volume

If `tokens.transfers` is available for Celo in your Dune workspace, use:

```sql
select
  date_trunc('day', block_time) as day,
  symbol,
  sum(amount) as token_volume
from tokens.transfers
where blockchain = 'celo'
  and contract_address in (
    0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e,
    0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a
  )
  and "to" in (
    0x80b10a44b0ea03473707660bc5767099710bbfe0,
    0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb,
    0xba37dd0890afc659a25331871319f66e7eba3522,
    0xbea347eebdb3dcb0bd1fec287561504804f4ba4b
  )
group by 1, 2
order by 1, 2;
```

## 9. KPI: Transaction Health

```sql
select
  count(*) as sampled_transactions,
  count_if(success = true) as successful_transactions,
  count_if(success = false) as failed_transactions,
  cast(count_if(success = false) as double) / nullif(count(*), 0) as failed_rate
from celo.transactions
where "to" in (
  0x80b10a44b0ea03473707660bc5767099710bbfe0,
  0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb,
  0xba37dd0890afc659a25331871319f66e7eba3522,
  0xbea347eebdb3dcb0bd1fec287561504804f4ba4b
);
```

## 10. Chart: Contract Method Usage Over Time

```sql
select
  date_trunc('day', block_time) as day,
  case
    when varbinary_substring(data, 1, 4) = 0x8f341692 then 'enterMatchWithCelo'
    when varbinary_substring(data, 1, 4) = 0x97d45937 then 'buySeasonPass'
    else 'other'
  end as method,
  count(*) as tx_count
from celo.transactions
where "to" in (
  0x80b10a44b0ea03473707660bc5767099710bbfe0,
  0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
)
group by 1, 2
order by 1, 2;
```

## 11. Table: Recent Match Entries

```sql
select
  l.block_time,
  varbinary_substring(l.topic2, 13, 20) as player,
  l.tx_hash,
  t.value / 1e18 as celo_value,
  t.success
from celo.logs l
left join celo.transactions t
  on t.hash = l.tx_hash
where l.contract_address = 0x80b10a44b0ea03473707660bc5767099710bbfe0
  and l.topic0 = 0xda05313f705d2c2458a909375b2e8e79aebefde11f06cd34997b644c8eb46dbc
order by l.block_time desc
limit 100;
```

## 12. Table: Recent Season Pass Purchases

```sql
select
  l.block_time,
  varbinary_substring(l.topic1, 13, 20) as buyer,
  l.tx_hash,
  t.value / 1e18 as celo_value,
  t.success
from celo.logs l
left join celo.transactions t
  on t.hash = l.tx_hash
where l.contract_address = 0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
  and l.topic0 = 0xd10f1b5a89924ee5fc5846d29052675620b15b414336aff9d0a75e15cc4dc5bb
order by l.block_time desc
limit 100;
```

## 13. Table: Top Active Wallets

```sql
with activity as (
  select "from" as wallet, block_time, hash as tx_hash
  from celo.transactions
  where "to" in (
    0x80b10a44b0ea03473707660bc5767099710bbfe0,
    0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb
  )
    and success = true
)
select
  wallet,
  count(*) as tx_count,
  min(block_time) as first_seen,
  max(block_time) as last_seen
from activity
group by 1
order by tx_count desc, last_seen desc
limit 100;
```

## Recommended Dashboard Layout

Top row KPIs:

- Total On-Chain Match Entries
- Season Passes Sold
- Unique Active Wallets
- Transactions 24H
- Transactions 7D
- Transaction Success Rate

Middle charts:

- Daily Match Entries
- Daily Unique Wallets
- Daily Season Pass Purchases
- CELO Volume
- USDT / G$ Volume
- Contract Method Usage

Tables:

- Recent Match Entries
- Recent Season Pass Purchases
- Top Active Wallets

## Important Limits

Dune cannot see your Redis-only gameplay telemetry yet:

- House match results
- Character/card choices
- Ranked card pick rates
- Character win rates
- Match duration / round duration
- Referrals
- Daily streaks
- Retention based on app match history

To put those into Dune, export app telemetry into Dune as custom tables or emit compact on-chain events.
