-- ────────────────────────────────────────────────────────────────────────────
-- 9. GOODDOLLAR USERS — all 90, each proven a real person on-chain
--
-- Query 8 counts only wallets with an Action Order transaction, which misses
-- players who verified and played before anything required a transaction. This
-- one takes the full player list from the app's own records and lets Dune prove
-- the part that matters: that every wallet passed GoodDollar face verification.
--
-- So the membership ("these are my players") comes from the app; the humanity
-- ("each is a verified person") is proven here from chain data and can be
-- checked line by line. Agent wallets cannot appear — they cannot pass a face
-- check — which is why the list is 90 and not the ~297 raw signups.
--
-- Snapshot taken 2026-08-10. Regenerate when the roster changes.
-- ─────────────────────────────────────────────────────────────────────────────
WITH players (wallet, player_name) AS (
    VALUES
        (0xba5064b2339cb1dbfed9a51f49e7ebb035924a28, 'Ade'),
        (0x90b11aa8622d56e6f088af176b6f1f1f709dd459, 'Alpha'),
        (0xd07dcbff86b3b93ec4cc2be911fdf408563eb019, 'Apala'),
        (0x53612d291178e495c6e8d0a5cb71bbca0a7126cf, 'Bawa'),
        (0xc1a3890960277acc1df9d255f0f5edd8a1de941b, 'Bernard'),
        (0xc8c92fa2077351b6f25cc515d7a4f5025708fcfa, 'Bigkala'),
        (0x94a9e5abd09a0efddab248fa1a0709e21eb9390e, 'Busta'),
        (0xaf8ec05d77f5b1ad0f78bad3382e36c16e778046, 'chuks'),
        (0x6223c59aa1a4617654cf56dcdebc9764fb6a446e, 'Dadaopera2026'),
        (0x12910afe0a4ff3d9700c2d13d003c8153b67c2db, 'Daved'),
        (0xb5817cc2438c7e871edbaf18f9c5557646bba92e, 'dede'),
        (0x98b87ca6f09ffd27305b715e9028810933ee9da1, 'Dona'),
        (0xb8bc48496498604cdca572c96787bb67e6f075c8, 'Enoch'),
        (0xd6b69e58d44e523eb58645f1b78425c96dfa648c, 'Etosatheknight'),
        (0x02be6e5186af0030b9af2c5c71335a23c28bf1be, 'faith'),
        (0xfaa8d0148cf6e47110b6560b3f30a29dbe930cc7, 'Farouk'),
        (0xe82c5db6d424eca766b36faf01b663ad3e26ec60, 'farouq'),
        (0x5a0645944e494949fbd7472a259ebbc4a4590d12, 'FRANKLIN'),
        (0x5307813baeaf287f38caef62c9950efa0f236197, 'Game'),
        (0x9fe5d727e663f424e95f00012404e005388ad505, 'godamongstmen'),
        (0xe7bebe04c17853d12dd9e501e589efd40b931cfd, 'Grace'),
        (0x96914769acf2da2092a674e10979d9ef09811011, 'Hevel'),
        (0xae7d95ef384ce7e3041a0ec04a3383c46fe92bdc, 'Hitman'),
        (0x5a00b1c5d58b38bafeef46ce90f414c5dc073003, 'Hunter'),
        (0x7180c60bf2ed34c59a7056720910fbe34ed94002, 'Jhay'),
        (0xd44bdbff4e45408d39d15fdd7a200673b98b7e29, 'Joel'),
        (0x99f95f62e5d0940e1552ac75309853cec3d7bad4, 'Karen'),
        (0xf26a9a5c65cb7f93482234c278064e14549b5e0c, 'Kayet'),
        (0x6c1e55d28d6e12e0c7c7388cc0f715c81a5d84d8, 'Kwano'),
        (0x49e585423d9257c9d3b6eb7caabe9f286c3c7d0c, 'Legend'),
        (0x4f6291bed09ff82fdc137b87dda5945b463af464, 'MAGEE'),
        (0x91521c129adcc2514e03f337627fbcfd0fb4c595, 'mr_moneyyyy'),
        (0x9ff28204cb96591d8b85a9351b6639b226457cfc, 'Mrvic'),
        (0x369227499d7d050f98e40e9a21556f18e30e81c7, 'Murphy'),
        (0x30c05545959451b9c91cdb35f52f9fcf2fa63571, 'myguyvinz'),
        (0xadf354637b1cf2813d5b47a58f98b06fbfdb1931, 'Nathy'),
        (0xba2a60aefd58e8372dbe1085f625c988b849d7ba, 'Nutman'),
        (0xccc8844180b9c77fa79a2c14a90c37ea460bbe4c, 'OneMan'),
        (0xa2903102bc36d77e32ccb74fc46a625ca3b6311e, 'Otowo'),
        (0xb74cb0922711c6174f12fb5933869ae254488273, 'OxNiel'),
        (0xe5af9fb44d9e6b6845dffb96b7e361e2d2880e6f, 'Page'),
        (0xe3bcf5b06118629562f0085ef3b25e23671ecf09, 'Rayhab'),
        (0x2e20f1c460f725e17c4a4da1cc4724e5606f5d4d, 'Real'),
        (0xdddf9f77a316d855a2a5f1b09fba3f77a7a24468, 'Reddington'),
        (0x908a9083f10c1ec09e9e86e62912fbe2a352e760, 'Robin'),
        (0x6318386f715781dbc4d6eba83c28d8e5e9b0a3e9, 'savagekiller'),
        (0xfd088d26b4e019c98f7140c9083accb498ed1f16, 'Shadow'),
        (0x85a4b09fb0788f1c549a68dc2edae3f97aeb5dd7, 'shadowwww'),
        (0x06ae908418af9d4769d810eba8895803897bc31e, 'Shaka'),
        (0xfcc8a8e6509710aeff6e5ec5fef90d72deb8d8c8, 'Shakespeare'),
        (0xcf5a978205a55fd6d32d20f853b27463e09df72f, 'sheamous'),
        (0x39f69deea8bbfd4ae32e7d1211cd3eaf1001ebe4, 'sIxeyes'),
        (0x1315b1a367d2460f89f1442639cd1f85504e43d2, 'stoneluv87'),
        (0x591a509765d2b5083dd40b5f06bda3056daa6f80, 'Stretch'),
        (0x24bd865053b0dd89bf772833d51c5832eb0df6fc, 'szp'),
        (0x0bf976ec2445b7d737d09cd5d475c1ad3e262c29, 'Thanos01'),
        (0xb576e6b1e3d7b92839d0e4615b73c378ffa922fd, 'Timeless'),
        (0x14c3c5fc601e4d0797eefb5f7065af51b8786715, 'Tobi'),
        (0x9a800fe911b98137a5a0bf6478e0c223554ca7ad, 'Trovic1'),
        (0x7a12a28bcc155d98853bf778801fc48cc1974b0c, 'Tunchii'),
        (0xf41a0f3b99b4372a6503469a7c541a402a40ce30, 'User'),
        (0x8fac8b9aac6a51cc5bebcb3900d78c39a8e0917c, 'Veron'),
        (0x4e15ef4e28da9fddd69e21bda075fc0e1b562c27, 'WiseDominic'),
        (0x6e0e0f057f69a0e666dc9dd2b315b9483ccad5d8, 'Xaxxoo'),
        (0xc874646b565624c513074fdf7ead5cb11fb57e03, 'Zeequeen'),
        (0x299b876a6e48962fe462a2a6176df29e938e45ac, 'Zepar'),
        (0xe0ccc8adf79858d9cbe2fd5bffa540ac179c76a7, 'Abrahamnavig1'),
        (0x1d935a748644daff3587eab9d7b9ede24ae301e1, 'Alphaquietus'),
        (0xd390eefdd9220079ccdbbb34d89d3f7c18a2efec, 'Blackghost'),
        (0x0067378592a4d0ccc3146dba13137e21589921ed, 'Calebux'),
        (0x3e325b45f72dfcc3875f75b5933a5da183ec4225, 'Eagle'),
        (0xf7b6fbd7ca09d4ee32f86b10d20f1913434b9c13, 'eldenlord'),
        (0xa501a4bf32f1ddb1e52bffd269d4121ad0dfffc9, 'Error'),
        (0xe636c34f8ca5992c543141570e36bfdb5a76cf1f, 'Funshaw'),
        (0x6d3421cee3da2cdfe32f4585e38bcbbc5f06a397, 'Gamebaby'),
        (0xf14c0721d74ca6eae889dcd3f972244ff62ba963, 'HarbdulS'),
        (0xa6cdce4646323935556dd45bc05735cfd807a347, 'High_Tower'),
        (0x8182ae32f1e4dd22e5b947b7b099c72ae1bc86b8, 'Hightower'),
        (0xbb7ba69ea64d9b071588782a586fbfbc004942f8, 'James1'),
        (0xf0cee28c693e945129fdb2c32c90ac567aa4f781, 'KING_VON1'),
        (0xb2914810724fe2fb871960eb200dea427854b1c7, 'mrmoney'),
        (0x9a0deaf07bab701a272341ae98478bc1c19aae99, 'mtech0dayexp'),
        (0x0b7d9fd597bfe8cfc2680f3043250af93790f4cb, 'RAEL'),
        (0xd5973bb4088f751c55d34712d193b5966f35e2ab, 'Segun'),
        (0x46513dd576b485c6ecf79e8cf7028ef06126935e, 'shunt'),
        (0x0535dce587c48a297b524a44b73bd221e7adb937, 'Test'),
        (0x7103b541e45318384a4e646d8b024b77eab56e4c, 'Wascana'),
        (0x693ea1b5393f62e754d4d8ca88fc8b4121b4e229, 'Yuseee'),
        (0xdc7d816252a902a409746b09e07683e2fb2bb473, 'Zeenat'),
        (0x9d8a7a866af0eee89b45abbb4f1bc9c3698b33e4, 'zintarh')
),
gooddollar_events AS (
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
    count(*)        AS gooddollar_users,   -- 90
    count(g.wallet) AS proven_onchain      -- 90: every wallet has a verification event
FROM players p
LEFT JOIN gooddollar_events g ON g.wallet = p.wallet;

-- Per-user detail: drop the aggregate above and run this instead.
-- SELECT p.player_name, p.wallet, g.last_verified_at
-- FROM players p
-- LEFT JOIN gooddollar_events g ON g.wallet = p.wallet
-- ORDER BY g.last_verified_at DESC NULLS LAST;
