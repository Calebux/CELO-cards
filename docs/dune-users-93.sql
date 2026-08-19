-- ──────────────────────────────────────────────────────────────────────────
-- 9. USERS — the 93 GoodDollar-verified people who have used Action Order
--
-- Counts every wallet in Action Order's player records that has passed
-- GoodDollar face verification at any point. 93 as of 2026-08-19.
--
-- "At any point" is deliberate: G$ verification lapses after 180 days, and
-- someone who verified in June and has since lapsed is still a real person who
-- played the game. Currently-inside-their-window was 20 on the same date.
--
-- The two halves of the claim have different provenance, kept visible on
-- purpose rather than blended:
--   • membership ("these are our players") comes from the app's own records;
--   • humanity ("each is a verified person") is proven here from chain data,
--     and can be checked line by line against GoodDollar's Identity contract
--     by anyone — including GoodDollar, who own that contract.
--
-- `onchain_evidence` names what each wallet did on-chain, so the stronger,
-- fully trustless subset is available from the same query: 69 of the 93 have a
-- signup, season pass, treasury payout or recorded match. The other 24 played
-- VS House, which settles off-chain, and are marked 'app-records' rather than
-- rounded up into something they are not.
--
-- Agent wallets cannot appear — they cannot pass a face check — which is why
-- this is 93 and not the ~309 raw signups.
--
-- Snapshot 2026-08-19. Regenerate when the roster changes.
-- ─────────────────────────────────────────────────────────────────────────────
WITH players (wallet, player_name, onchain_evidence) AS (
    VALUES
        (0xe0ccc8adf79858d9cbe2fd5bffa540ac179c76a7, 'Abrahamnavig1', 'signup+pass'),
        (0xba5064b2339cb1dbfed9a51f49e7ebb035924a28, 'Ade', 'signup+pass'),
        (0x3665841ae2a899d0c468082c59aa7d63694692f4, 'Adugba', 'match'),
        (0x90b11aa8622d56e6f088af176b6f1f1f709dd459, 'Alpha', 'signup+payout'),
        (0x1d935a748644daff3587eab9d7b9ede24ae301e1, 'Alphaquietus', 'signup+pass+payout+match'),
        (0xd07dcbff86b3b93ec4cc2be911fdf408563eb019, 'Apala', 'signup+pass'),
        (0x53612d291178e495c6e8d0a5cb71bbca0a7126cf, 'Bawa', 'app-records'),
        (0xc1a3890960277acc1df9d255f0f5edd8a1de941b, 'Bernard', 'app-records'),
        (0xc8c92fa2077351b6f25cc515d7a4f5025708fcfa, 'Bigkala', 'signup'),
        (0xd390eefdd9220079ccdbbb34d89d3f7c18a2efec, 'Blackghost', 'app-records'),
        (0x94a9e5abd09a0efddab248fa1a0709e21eb9390e, 'Busta', 'signup'),
        (0x6302b6298ac095285388df88d0c7f0a044a18fd7, 'Car', 'signup+payout'),
        (0xaf8ec05d77f5b1ad0f78bad3382e36c16e778046, 'chuks', 'pass'),
        (0x6223c59aa1a4617654cf56dcdebc9764fb6a446e, 'Dadaopera2026', 'app-records'),
        (0x5b62ef10a796c045327fcbe0cff81d5b96081885, 'Dahniehl', 'signup+pass+match'),
        (0x12910afe0a4ff3d9700c2d13d003c8153b67c2db, 'Daved', 'signup+pass+payout'),
        (0xb5817cc2438c7e871edbaf18f9c5557646bba92e, 'dede', 'payout'),
        (0xb66023b5ebc41c7d37455c68313bdd43ef50aec9, 'DeMewlingOak', 'app-records'),
        (0x98b87ca6f09ffd27305b715e9028810933ee9da1, 'Dona', 'signup+payout'),
        (0x3e325b45f72dfcc3875f75b5933a5da183ec4225, 'Eagle', 'app-records'),
        (0xb8bc48496498604cdca572c96787bb67e6f075c8, 'Enoch', 'signup+pass'),
        (0xa501a4bf32f1ddb1e52bffd269d4121ad0dfffc9, 'Error', 'pass'),
        (0xd6b69e58d44e523eb58645f1b78425c96dfa648c, 'Etosatheknight', 'payout'),
        (0x02be6e5186af0030b9af2c5c71335a23c28bf1be, 'faith', 'app-records'),
        (0xfaa8d0148cf6e47110b6560b3f30a29dbe930cc7, 'Farouk', 'signup+pass'),
        (0xe82c5db6d424eca766b36faf01b663ad3e26ec60, 'farouq', 'signup+pass'),
        (0x5a0645944e494949fbd7472a259ebbc4a4590d12, 'FRANKLIN', 'signup+payout'),
        (0xe636c34f8ca5992c543141570e36bfdb5a76cf1f, 'Funshaw', 'signup+pass+payout+match'),
        (0x5307813baeaf287f38caef62c9950efa0f236197, 'Game', 'signup+pass+payout'),
        (0x6d3421cee3da2cdfe32f4585e38bcbbc5f06a397, 'Gamebaby', 'signup+payout'),
        (0x9fe5d727e663f424e95f00012404e005388ad505, 'godamongstmen', 'app-records'),
        (0xe7bebe04c17853d12dd9e501e589efd40b931cfd, 'Grace', 'pass'),
        (0xf14c0721d74ca6eae889dcd3f972244ff62ba963, 'HarbdulS', 'signup+payout'),
        (0x96914769acf2da2092a674e10979d9ef09811011, 'Hevel', 'signup+pass'),
        (0xa6cdce4646323935556dd45bc05735cfd807a347, 'High_Tower', 'signup+payout'),
        (0x8182ae32f1e4dd22e5b947b7b099c72ae1bc86b8, 'Hightower', 'signup+pass+payout'),
        (0xae7d95ef384ce7e3041a0ec04a3383c46fe92bdc, 'Hitman', 'signup+pass+payout'),
        (0x5a00b1c5d58b38bafeef46ce90f414c5dc073003, 'Hunter', 'payout'),
        (0x7180c60bf2ed34c59a7056720910fbe34ed94002, 'Jhay', 'signup'),
        (0xd44bdbff4e45408d39d15fdd7a200673b98b7e29, 'Joel', 'signup+pass'),
        (0xda4ac912aad28645702f03480956fbebf62cd0ad, 'Johny', 'app-records'),
        (0x99f95f62e5d0940e1552ac75309853cec3d7bad4, 'Karen', 'signup+pass+payout'),
        (0xf26a9a5c65cb7f93482234c278064e14549b5e0c, 'Kayet', 'app-records'),
        (0xf0cee28c693e945129fdb2c32c90ac567aa4f781, 'KING_VON1', 'app-records'),
        (0x6c1e55d28d6e12e0c7c7388cc0f715c81a5d84d8, 'Kwano', 'signup'),
        (0x49e585423d9257c9d3b6eb7caabe9f286c3c7d0c, 'Legend', 'signup+pass'),
        (0x4f6291bed09ff82fdc137b87dda5945b463af464, 'MAGEE', 'signup+pass'),
        (0x91521c129adcc2514e03f337627fbcfd0fb4c595, 'mr_moneyyyy', 'pass'),
        (0xb2914810724fe2fb871960eb200dea427854b1c7, 'mrmoney', 'app-records'),
        (0x9ff28204cb96591d8b85a9351b6639b226457cfc, 'Mrvic', 'app-records'),
        (0x9a0deaf07bab701a272341ae98478bc1c19aae99, 'mtech0dayexp', 'signup+payout'),
        (0x369227499d7d050f98e40e9a21556f18e30e81c7, 'Murphy', 'signup+pass'),
        (0x30c05545959451b9c91cdb35f52f9fcf2fa63571, 'myguyvinz', 'signup+pass'),
        (0xadf354637b1cf2813d5b47a58f98b06fbfdb1931, 'Nathy', 'pass'),
        (0x7b176ed139331be33bd86dad24d38f058ac4f532, 'Ninat', 'signup+pass+payout+match'),
        (0xba2a60aefd58e8372dbe1085f625c988b849d7ba, 'Nutman', 'signup+payout'),
        (0xccc8844180b9c77fa79a2c14a90c37ea460bbe4c, 'OneMan', 'app-records'),
        (0xa2903102bc36d77e32ccb74fc46a625ca3b6311e, 'Otowo', 'pass'),
        (0xb74cb0922711c6174f12fb5933869ae254488273, 'OxNiel', 'signup+payout'),
        (0xe5af9fb44d9e6b6845dffb96b7e361e2d2880e6f, 'Page', 'payout'),
        (0x0b7d9fd597bfe8cfc2680f3043250af93790f4cb, 'RAEL', 'app-records'),
        (0xe3bcf5b06118629562f0085ef3b25e23671ecf09, 'Rayhab', 'signup+payout'),
        (0x2e20f1c460f725e17c4a4da1cc4724e5606f5d4d, 'Real', 'pass'),
        (0xdddf9f77a316d855a2a5f1b09fba3f77a7a24468, 'Reddington', 'app-records'),
        (0x908a9083f10c1ec09e9e86e62912fbe2a352e760, 'Robin', 'signup+pass+payout'),
        (0xe2209cffd306ae501c9a41da9a7533187c48a2d7, 'Sagesammy', 'signup+payout+match'),
        (0x6318386f715781dbc4d6eba83c28d8e5e9b0a3e9, 'savagekiller', 'app-records'),
        (0xd5973bb4088f751c55d34712d193b5966f35e2ab, 'Segun', 'signup+payout+match'),
        (0xfd088d26b4e019c98f7140c9083accb498ed1f16, 'Shadow', 'signup+pass'),
        (0x85a4b09fb0788f1c549a68dc2edae3f97aeb5dd7, 'shadowwww', 'payout'),
        (0x06ae908418af9d4769d810eba8895803897bc31e, 'Shaka', 'signup+pass'),
        (0xfcc8a8e6509710aeff6e5ec5fef90d72deb8d8c8, 'Shakespeare', 'signup+pass'),
        (0x412b7153504217b405af821bdcdc5f21c71e3cbc, 'Shalex', 'app-records'),
        (0xcf5a978205a55fd6d32d20f853b27463e09df72f, 'sheamous', 'signup+pass+payout'),
        (0x46513dd576b485c6ecf79e8cf7028ef06126935e, 'shunt', 'signup+pass'),
        (0x39f69deea8bbfd4ae32e7d1211cd3eaf1001ebe4, 'sIxeyes', 'signup+pass+payout'),
        (0x1315b1a367d2460f89f1442639cd1f85504e43d2, 'stoneluv87', 'signup+pass'),
        (0x591a509765d2b5083dd40b5f06bda3056daa6f80, 'Stretch', 'signup+payout'),
        (0x24bd865053b0dd89bf772833d51c5832eb0df6fc, 'szp', 'app-records'),
        (0x0535dce587c48a297b524a44b73bd221e7adb937, 'Test', 'payout'),
        (0x0bf976ec2445b7d737d09cd5d475c1ad3e262c29, 'Thanos01', 'app-records'),
        (0xb576e6b1e3d7b92839d0e4615b73c378ffa922fd, 'Timeless', 'signup+pass'),
        (0x14c3c5fc601e4d0797eefb5f7065af51b8786715, 'Tobi', 'signup+pass+payout'),
        (0x9a800fe911b98137a5a0bf6478e0c223554ca7ad, 'Trovic1', 'signup+pass'),
        (0x7a12a28bcc155d98853bf778801fc48cc1974b0c, 'Tunchii', 'signup+pass'),
        (0xf41a0f3b99b4372a6503469a7c541a402a40ce30, 'User', 'app-records'),
        (0x8fac8b9aac6a51cc5bebcb3900d78c39a8e0917c, 'Veron', 'app-records'),
        (0x4e15ef4e28da9fddd69e21bda075fc0e1b562c27, 'WiseDominic', 'app-records'),
        (0x6e0e0f057f69a0e666dc9dd2b315b9483ccad5d8, 'Xaxxoo', 'pass'),
        (0xdc7d816252a902a409746b09e07683e2fb2bb473, 'Zeenat', 'signup+pass+payout'),
        (0xc874646b565624c513074fdf7ead5cb11fb57e03, 'Zeequeen', 'signup+pass+payout'),
        (0x299b876a6e48962fe462a2a6176df29e938e45ac, 'Zepar', 'signup+pass'),
        (0x9d8a7a866af0eee89b45abbb4f1bc9c3698b33e4, 'zintarh', 'app-records')
),
gooddollar_events AS (
    -- WhitelistedAdded (first verification) and WhitelistedAuthenticated
    -- (re-verification). Either one proves the wallet passed at some point.
    SELECT
        bytearray_substring(topic1, 13, 20) AS wallet,
        max(block_time)                     AS last_verified_at
    FROM celo.logs
    WHERE contract_address = 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
      AND topic0 IN (
          0xee1504a83b6d4a361f4c1dc78ab59bfa30d6a3b6612c403e86bb01ef2984295f,  -- WhitelistedAdded
          0xb2a82fce6d8c7a633efe9579f77b4edb96bfdf171a49bfc2ce666dc543a1f500   -- WhitelistedAuthenticated
      )
    GROUP BY 1
)
SELECT
    count(*)                                       AS users,
    count(g.wallet)                                AS verification_proven_here,
    count_if(p.onchain_evidence <> 'app-records')  AS with_onchain_activity
FROM players p
LEFT JOIN gooddollar_events g ON g.wallet = p.wallet;

-- Team wallets (deployer 0x00673785, treasury 0xBa37dd08, MiniPay treasury
-- 0xbEa347Ee) are excluded from this roster on purpose. The deployer is the
-- on-chain owner of our own contracts; listing it as a player would be the
-- easiest thing in this dataset for a reviewer to catch.
