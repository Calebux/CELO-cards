-- ---------------------------------------------------------------------------
-- USERS -- GoodDollar-verified people who have used Action Order.
--
-- ONE number for a Dune Counter. 93 as of 2026-08-19, and it grows by itself.
--
-- Two sources, unioned, because neither alone is both complete and live:
--
--   roster  -- the players we already know verified, frozen 2026-08-19. It
--             exists because 24 of them only ever played VS House, which
--             settles off-chain, so no query could ever find them. History.
--
--   live    -- derived entirely from logs: any wallet with a GoodDollar
--             verification event that ALSO transacted with an Action Order
--             contract or was paid G$ by our treasury. This half needs no
--             maintenance and picks up new users on the next refresh.
--
-- Overlap is removed by UNION, so the count never double-counts a player who
-- is in both. Today live is a subset of roster; from here on, anything new
-- lands in live and the total climbs on its own.
--
-- Agent wallets cannot appear: they cannot pass a face check, and the
-- verification join drops them without needing an exclusion list.
--
-- Team wallets ARE excluded explicitly -- the deployer is the on-chain owner of
-- our own contracts, and counting it as a player is the easiest thing in this
-- dataset for a reviewer to catch.
--
-- WHAT THE LIVE HALF ALREADY CATCHES: House Boss runs are recorded on-chain by
-- the player's own wallet (MatchRegistry.recordMatch, ~30k gas, no payment) --
-- 81 such events on 2026-08-19, every one of them a boss run. So any verified
-- player who takes on the boss is picked up automatically, no maintenance.
--
-- REMAINING GAP: someone who verifies and only ever plays the lower VS House
-- tiers never signs a transaction, so they stay invisible here -- which is what
-- the frozen roster covers for the original 24. Recording those tiers too would
-- close it entirely.
-- ---------------------------------------------------------------------------
WITH roster (wallet) AS (
    VALUES
        (0x02be6e5186af0030b9af2c5c71335a23c28bf1be),
        (0x0535dce587c48a297b524a44b73bd221e7adb937),
        (0x06ae908418af9d4769d810eba8895803897bc31e),
        (0x0b7d9fd597bfe8cfc2680f3043250af93790f4cb),
        (0x0bf976ec2445b7d737d09cd5d475c1ad3e262c29),
        (0x12910afe0a4ff3d9700c2d13d003c8153b67c2db),
        (0x1315b1a367d2460f89f1442639cd1f85504e43d2),
        (0x14c3c5fc601e4d0797eefb5f7065af51b8786715),
        (0x1d935a748644daff3587eab9d7b9ede24ae301e1),
        (0x24bd865053b0dd89bf772833d51c5832eb0df6fc),
        (0x299b876a6e48962fe462a2a6176df29e938e45ac),
        (0x2e20f1c460f725e17c4a4da1cc4724e5606f5d4d),
        (0x30c05545959451b9c91cdb35f52f9fcf2fa63571),
        (0x3665841ae2a899d0c468082c59aa7d63694692f4),
        (0x369227499d7d050f98e40e9a21556f18e30e81c7),
        (0x39f69deea8bbfd4ae32e7d1211cd3eaf1001ebe4),
        (0x3e325b45f72dfcc3875f75b5933a5da183ec4225),
        (0x412b7153504217b405af821bdcdc5f21c71e3cbc),
        (0x46513dd576b485c6ecf79e8cf7028ef06126935e),
        (0x49e585423d9257c9d3b6eb7caabe9f286c3c7d0c),
        (0x4e15ef4e28da9fddd69e21bda075fc0e1b562c27),
        (0x4f6291bed09ff82fdc137b87dda5945b463af464),
        (0x5307813baeaf287f38caef62c9950efa0f236197),
        (0x53612d291178e495c6e8d0a5cb71bbca0a7126cf),
        (0x591a509765d2b5083dd40b5f06bda3056daa6f80),
        (0x5a00b1c5d58b38bafeef46ce90f414c5dc073003),
        (0x5a0645944e494949fbd7472a259ebbc4a4590d12),
        (0x5b62ef10a796c045327fcbe0cff81d5b96081885),
        (0x6223c59aa1a4617654cf56dcdebc9764fb6a446e),
        (0x6302b6298ac095285388df88d0c7f0a044a18fd7),
        (0x6318386f715781dbc4d6eba83c28d8e5e9b0a3e9),
        (0x6c1e55d28d6e12e0c7c7388cc0f715c81a5d84d8),
        (0x6d3421cee3da2cdfe32f4585e38bcbbc5f06a397),
        (0x6e0e0f057f69a0e666dc9dd2b315b9483ccad5d8),
        (0x7180c60bf2ed34c59a7056720910fbe34ed94002),
        (0x7a12a28bcc155d98853bf778801fc48cc1974b0c),
        (0x7b176ed139331be33bd86dad24d38f058ac4f532),
        (0x8182ae32f1e4dd22e5b947b7b099c72ae1bc86b8),
        (0x85a4b09fb0788f1c549a68dc2edae3f97aeb5dd7),
        (0x8fac8b9aac6a51cc5bebcb3900d78c39a8e0917c),
        (0x908a9083f10c1ec09e9e86e62912fbe2a352e760),
        (0x90b11aa8622d56e6f088af176b6f1f1f709dd459),
        (0x91521c129adcc2514e03f337627fbcfd0fb4c595),
        (0x94a9e5abd09a0efddab248fa1a0709e21eb9390e),
        (0x96914769acf2da2092a674e10979d9ef09811011),
        (0x98b87ca6f09ffd27305b715e9028810933ee9da1),
        (0x99f95f62e5d0940e1552ac75309853cec3d7bad4),
        (0x9a0deaf07bab701a272341ae98478bc1c19aae99),
        (0x9a800fe911b98137a5a0bf6478e0c223554ca7ad),
        (0x9d8a7a866af0eee89b45abbb4f1bc9c3698b33e4),
        (0x9fe5d727e663f424e95f00012404e005388ad505),
        (0x9ff28204cb96591d8b85a9351b6639b226457cfc),
        (0xa2903102bc36d77e32ccb74fc46a625ca3b6311e),
        (0xa501a4bf32f1ddb1e52bffd269d4121ad0dfffc9),
        (0xa6cdce4646323935556dd45bc05735cfd807a347),
        (0xadf354637b1cf2813d5b47a58f98b06fbfdb1931),
        (0xae7d95ef384ce7e3041a0ec04a3383c46fe92bdc),
        (0xaf8ec05d77f5b1ad0f78bad3382e36c16e778046),
        (0xb2914810724fe2fb871960eb200dea427854b1c7),
        (0xb576e6b1e3d7b92839d0e4615b73c378ffa922fd),
        (0xb5817cc2438c7e871edbaf18f9c5557646bba92e),
        (0xb66023b5ebc41c7d37455c68313bdd43ef50aec9),
        (0xb74cb0922711c6174f12fb5933869ae254488273),
        (0xb8bc48496498604cdca572c96787bb67e6f075c8),
        (0xba2a60aefd58e8372dbe1085f625c988b849d7ba),
        (0xba5064b2339cb1dbfed9a51f49e7ebb035924a28),
        (0xc1a3890960277acc1df9d255f0f5edd8a1de941b),
        (0xc874646b565624c513074fdf7ead5cb11fb57e03),
        (0xc8c92fa2077351b6f25cc515d7a4f5025708fcfa),
        (0xccc8844180b9c77fa79a2c14a90c37ea460bbe4c),
        (0xcf5a978205a55fd6d32d20f853b27463e09df72f),
        (0xd07dcbff86b3b93ec4cc2be911fdf408563eb019),
        (0xd390eefdd9220079ccdbbb34d89d3f7c18a2efec),
        (0xd44bdbff4e45408d39d15fdd7a200673b98b7e29),
        (0xd5973bb4088f751c55d34712d193b5966f35e2ab),
        (0xd6b69e58d44e523eb58645f1b78425c96dfa648c),
        (0xda4ac912aad28645702f03480956fbebf62cd0ad),
        (0xdc7d816252a902a409746b09e07683e2fb2bb473),
        (0xdddf9f77a316d855a2a5f1b09fba3f77a7a24468),
        (0xe0ccc8adf79858d9cbe2fd5bffa540ac179c76a7),
        (0xe2209cffd306ae501c9a41da9a7533187c48a2d7),
        (0xe3bcf5b06118629562f0085ef3b25e23671ecf09),
        (0xe5af9fb44d9e6b6845dffb96b7e361e2d2880e6f),
        (0xe636c34f8ca5992c543141570e36bfdb5a76cf1f),
        (0xe7bebe04c17853d12dd9e501e589efd40b931cfd),
        (0xe82c5db6d424eca766b36faf01b663ad3e26ec60),
        (0xf0cee28c693e945129fdb2c32c90ac567aa4f781),
        (0xf14c0721d74ca6eae889dcd3f972244ff62ba963),
        (0xf26a9a5c65cb7f93482234c278064e14549b5e0c),
        (0xf41a0f3b99b4372a6503469a7c541a402a40ce30),
        (0xfaa8d0148cf6e47110b6560b3f30a29dbe930cc7),
        (0xfcc8a8e6509710aeff6e5ec5fef90d72deb8d8c8),
        (0xfd088d26b4e019c98f7140c9083accb498ed1f16)
),

gooddollar_verified AS (
    -- WhitelistedAdded (first verification) or WhitelistedAuthenticated
    -- (re-verification). Either proves the wallet passed at some point.
    SELECT DISTINCT bytearray_substring(topic1, 13, 20) AS wallet
    FROM celo.logs
    WHERE contract_address = 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
      AND topic0 IN (
          0xee1504a83b6d4a361f4c1dc78ab59bfa30d6a3b6612c403e86bb01ef2984295f,
          0xb2a82fce6d8c7a633efe9579f77b4edb96bfdf171a49bfc2ce666dc543a1f500
      )
),

touched_action_order AS (
    -- Sent a transaction to any Action Order contract.
    SELECT DISTINCT "from" AS wallet
    FROM celo.transactions
    WHERE "to" IN (
        0xb18978895de20bb4c7b79307c0ecbf28744f37c7,  -- KnockOrderSignups
        0xe9d61b9a0cbb6ef53af1ad63a9e16ca33869f44d,  -- MatchRegistry
        0x80b10a44b0ea03473707660bc5767099710bbfe0,  -- Arena V1
        0x473df985d05a0b635706e58ac8e7452dcc3e9a01,  -- Arena V2
        0x8475ca3d129b9d69716b3dcab73a5e0306eaa9c1,  -- Arena V2 (superseded)
        0x445fce73fa5b87ca9ff84e4fabd27f26aee92cfb,  -- Season pass (CELO)
        0xc032b8efca84eacfe38a432ac30ca3684854981b   -- Season pass (G$)
    )
      AND success

    UNION

    -- Or was paid G$ by a treasury. Our treasuries only ever pay players, so
    -- receiving from one is itself evidence of use -- and it catches bounty
    -- winners who never signed a transaction themselves.
    SELECT DISTINCT bytearray_substring(topic2, 13, 20) AS wallet
    FROM celo.logs
    WHERE contract_address = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A  -- G$
      AND topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
      AND bytearray_substring(topic1, 13, 20) IN (
          0xBa37dd0890AFc659a25331871319f66E7EBA3522,
          0xbEa347EeBdB3dCb0Bd1feC287561504804f4ba4b
      )
),

live AS (
    SELECT t.wallet
    FROM touched_action_order t
    JOIN gooddollar_verified g ON g.wallet = t.wallet
),

team (wallet) AS (
    VALUES
        (0x0067378592a4d0ccc3146dba13137e21589921ed),  -- deployer / contract owner
        (0xba37dd0890afc659a25331871319f66e7eba3522),  -- treasury
        (0xbea347eebdb3dcb0bd1fec287561504804f4ba4b)   -- treasury (MiniPay)
)

SELECT count(DISTINCT u.wallet) AS users
FROM (
    SELECT wallet FROM roster
    UNION
    SELECT wallet FROM live
) u
WHERE u.wallet NOT IN (SELECT wallet FROM team);
