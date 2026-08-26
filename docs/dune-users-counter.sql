-- ---------------------------------------------------------------------------
-- USERS -- GoodDollar-verified people who have used Action Order.
--
-- ONE number for a Dune Counter. 253 as of 2026-08-26, and it grows by itself.
--
-- Two sources, unioned, because neither alone is both complete and live:
--
--   roster  -- the players we already know verified, refreshed 2026-08-26
--             (254 wallets, 253 after the team filter below). It exists
--             because most of them only ever played VS House, which settles
--             off-chain, so no query could ever find them: of 254, only ~80
--             have any on-chain footprint at all. Regenerate it whenever the
--             number here starts to lag the app's own count.
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
-- NARROWED 2026-08-26: recordMatch is no longer called for MiniPay players.
-- It is signed by the player in native CELO, which a MiniPay wallet does not
-- hold, and MiniPay does not whitelist the call. Web still records, so the
-- live half keeps growing there — but MiniPay play now lands only in the
-- roster, which makes refreshing it the way this number stays honest.
--
-- REMAINING GAP: someone who verifies and only ever plays the lower VS House
-- tiers never signs a transaction, so they stay invisible here -- which is what
-- the frozen roster covers for the original 24. Recording those tiers too would
-- close it entirely.
-- ---------------------------------------------------------------------------
WITH roster (wallet) AS (
    VALUES
        (0x0067378592a4d0ccc3146dba13137e21589921ed),
        (0x02173665c46368822b663b7ce46ed64ccd823c59),
        (0x02be6e5186af0030b9af2c5c71335a23c28bf1be),
        (0x0535dce587c48a297b524a44b73bd221e7adb937),
        (0x06ae908418af9d4769d810eba8895803897bc31e),
        (0x07bba7698227b4443e27656319c3b39617e75114),
        (0x0841523c764f6699baf79770e23f9331e97f6064),
        (0x08e4c3595ff69d3aeea71d620643f01aedce5400),
        (0x090c7a91e4faf7c35e8ca6c8a85ca60895c3371d),
        (0x0b7d9fd597bfe8cfc2680f3043250af93790f4cb),
        (0x0bf976ec2445b7d737d09cd5d475c1ad3e262c29),
        (0x0ca47b7bbcc0e8a0f970fba7c9a65ca9fba1ee0b),
        (0x0d43557e286d9ee6862c123274fb9c8430c00579),
        (0x11c7c364dde40864db6232c18cca09408ec6a242),
        (0x126ccdc4322e785b72606196981c1b52e3226d41),
        (0x12910afe0a4ff3d9700c2d13d003c8153b67c2db),
        (0x1315b1a367d2460f89f1442639cd1f85504e43d2),
        (0x132169fe0e4d5505366b714148ba3947fe548e0a),
        (0x1486bbe7e4eed3aa7d484f18f393d81d7513aa98),
        (0x14c3c5fc601e4d0797eefb5f7065af51b8786715),
        (0x1b9b47623429b958c0618a9ed7830ca41327a0f5),
        (0x1d935a748644daff3587eab9d7b9ede24ae301e1),
        (0x1ec7e9271983624cc128041676becdce1c36d898),
        (0x1f3e5d79d76be22a5393e38ab0f500b61a8e2b9e),
        (0x2111c070ed7c59b766d669d04e3754a4e36b322a),
        (0x24bd865053b0dd89bf772833d51c5832eb0df6fc),
        (0x24e88712b3c0879641d48ebd65bf5a27a2bc95c1),
        (0x284887ee2c35a2f06f9fb8648f8af60017a99e6b),
        (0x299b876a6e48962fe462a2a6176df29e938e45ac),
        (0x2aaf97b03e5ae06e694f99a565eb9fafaff5b900),
        (0x2e20835b59e53046d4424e74d50335407fae84f6),
        (0x2e20f1c460f725e17c4a4da1cc4724e5606f5d4d),
        (0x2f4429679cfd7113e544671ecae5921cc208bc92),
        (0x2f4da4c9c9c27852970771a8f95b58093ce526b7),
        (0x3025c1d584009d3a70811ec9908fb538105a7007),
        (0x30c05545959451b9c91cdb35f52f9fcf2fa63571),
        (0x31819a83aca161cca1982508184755092b4c196d),
        (0x3218a14dfc82e8490da2fa47f2284a5fc4e6fc09),
        (0x32c8831c4bbe1cf551e2453114f4b7d803e20c88),
        (0x3665841ae2a899d0c468082c59aa7d63694692f4),
        (0x369227499d7d050f98e40e9a21556f18e30e81c7),
        (0x39f69deea8bbfd4ae32e7d1211cd3eaf1001ebe4),
        (0x3a2dcdf73a8441a36fba89e93a6ba119f3ff90db),
        (0x3af42e23b453264ef35a452e667fbd820bd4bdd1),
        (0x3b7685d1e326106f0492722a81456957e8755420),
        (0x3b9d849a4a03ff96c7bce590897af38606afe5c5),
        (0x3e325b45f72dfcc3875f75b5933a5da183ec4225),
        (0x4046726f470e2fc24347665b6ea31af606bf776c),
        (0x4052d7a810c90ac7c2ed54a9ce523ec8ad716af3),
        (0x412b7153504217b405af821bdcdc5f21c71e3cbc),
        (0x41367424ed39a8e8b16375cb9c71ce6d24b9da48),
        (0x4265bfb1bf551c7af962eafadbb49c88179415ac),
        (0x427fec0110a705dc6cd8dc78f056c944f2b82626),
        (0x4607a6106509c894fd081691f8fd3ef18dfef9d5),
        (0x46513dd576b485c6ecf79e8cf7028ef06126935e),
        (0x46e48683871f361c1fc579ea7b17dba270187b0c),
        (0x47f6657ac0e9b14b0650988e247529f526034cad),
        (0x494fa23b7eade8b71f8149788f89bbf8cf9b5963),
        (0x497627b769946a7c8e00c02f1f35e492b3633968),
        (0x49e585423d9257c9d3b6eb7caabe9f286c3c7d0c),
        (0x4b26c4bbc48fbcd8602b15cb27367a471613679d),
        (0x4b37658934d19e9b238e04669bedafca32426855),
        (0x4b52a11415c3e26b3df59544803ed7ec04082a8f),
        (0x4c75656e7f6b6126eaa48efb1eeda699c511c057),
        (0x4d1ef76a52f303de4de35d57b63aa76370301ecf),
        (0x4e15ef4e28da9fddd69e21bda075fc0e1b562c27),
        (0x4f6291bed09ff82fdc137b87dda5945b463af464),
        (0x511568b3d0c996112d536cbc63b8153a124c14d0),
        (0x5138db0028bf646b8d59957c7e7b3258fb17c6c4),
        (0x52a7a74b1885d43138662c0303471e0ae3f42ce5),
        (0x5307813baeaf287f38caef62c9950efa0f236197),
        (0x53612d291178e495c6e8d0a5cb71bbca0a7126cf),
        (0x539f3eed8a8bf8d78c9f5fb51296616db2f98807),
        (0x53a9c7bddce103e34afe71f790348532508124c9),
        (0x54b9398fb1eac5a58550d123d7e65aaf8ba9ca57),
        (0x582efcdce3ab2df81a8a17f559fc4699a70c6701),
        (0x591a509765d2b5083dd40b5f06bda3056daa6f80),
        (0x59c508fac70e1203a38ea90facc0920deec4bc21),
        (0x5a00b1c5d58b38bafeef46ce90f414c5dc073003),
        (0x5a0645944e494949fbd7472a259ebbc4a4590d12),
        (0x5a911d9b0de035c731935cddd1e2684e881260f7),
        (0x5b1588dc8bf70006c159e6af095392b3fd516f09),
        (0x5b62ef10a796c045327fcbe0cff81d5b96081885),
        (0x5c148873eda84b7d50d4c39ba2d3cddbe8c0ecaf),
        (0x5e133bb84b9ac1bb349995f07ebd8a18c8a325fa),
        (0x60486d8eb91d7de223de1e35f429d1c97cf5cba2),
        (0x61dae3868046a93d641d685d8abef81588595764),
        (0x6223c59aa1a4617654cf56dcdebc9764fb6a446e),
        (0x629e7511b0b3603ee76143f4e54f12d391eb8f31),
        (0x6302b6298ac095285388df88d0c7f0a044a18fd7),
        (0x6318386f715781dbc4d6eba83c28d8e5e9b0a3e9),
        (0x637e54910c4b3956bffdf2a45d1ef93782744306),
        (0x63ea6f90f02c5b67e22430069095852cae1ab700),
        (0x64a8d065f0d4809d8c7db61cad0afc21d686d9f8),
        (0x64cb3bdc6c9832075810fd7d99dc26d53a0cbdc7),
        (0x6541461f069b845805dcccd01d9f19b36a76f5f0),
        (0x68603978719e5294ed223455eb0dcc31954d961e),
        (0x6a13b5843c306feec58c51fc412f5e1b4bf00370),
        (0x6c1e55d28d6e12e0c7c7388cc0f715c81a5d84d8),
        (0x6c6e33af1b6c06eaaf0a6446a8c2abdf8510bd12),
        (0x6c9128e7b15027c8969b7c4fafdf03a35a004332),
        (0x6d3421cee3da2cdfe32f4585e38bcbbc5f06a397),
        (0x6e0e0f057f69a0e666dc9dd2b315b9483ccad5d8),
        (0x6fbf5e36d458c0aa832f927c7fb72efc8ae39164),
        (0x6fc98ee173307d10e7dc9b0aebfd4e2457f4033c),
        (0x70b67931ea145c9ccbb64f0bd8d27e6d81886408),
        (0x7180c60bf2ed34c59a7056720910fbe34ed94002),
        (0x72bda8bbdf6441a1157e8690c4ac4f3657df5ae0),
        (0x74dd9e1d49008f7d3d53e48b8a339bfee4440ca7),
        (0x7606c73a426acf4707826ae06bec341a70cc4037),
        (0x772abb7bb569dde73075af46faefc6429c4893af),
        (0x78e617373912ddb38fc84acd51756bf5e33234c7),
        (0x79751080d139b608e9105d16b876ad246fb9fc8f),
        (0x7a12a28bcc155d98853bf778801fc48cc1974b0c),
        (0x7b176ed139331be33bd86dad24d38f058ac4f532),
        (0x7c9f237c1a79a2372b493da8b6286c4cb0cd8f2c),
        (0x7d4c813a0ce690efcfb5f16f90fe011f643a8044),
        (0x7ee89e9e6b2871f0e0a4b70c2d8a6b6019d91408),
        (0x7ef8679fd6232664c8faa5237b533a9a32326be2),
        (0x8182ae32f1e4dd22e5b947b7b099c72ae1bc86b8),
        (0x84d77657277d46290888fd2b42cccd740ba333b0),
        (0x84d92815b07310a2f4915624fab42511b953e55a),
        (0x85a20940b033c331fe3c5672aca3a3b9a7581ef9),
        (0x85a4b09fb0788f1c549a68dc2edae3f97aeb5dd7),
        (0x898c37ac5942e01838506cff33ba13f8c2de7776),
        (0x8a9ab0ad99dbb345bea6807e1c1166636d55eb5a),
        (0x8c549d45b3642c891227a704e403741af2d26695),
        (0x8fac8b9aac6a51cc5bebcb3900d78c39a8e0917c),
        (0x8fad61e2dd03e807077d462417e10b92dc3a705f),
        (0x8fbb728240783da4fb9bad66ba9ff88e24238eac),
        (0x908a9083f10c1ec09e9e86e62912fbe2a352e760),
        (0x90b11aa8622d56e6f088af176b6f1f1f709dd459),
        (0x91115982d9b32666dfe98a16eba2ec3ca5579e71),
        (0x91521c129adcc2514e03f337627fbcfd0fb4c595),
        (0x925b1d2ced71c193e131b9fa6c3d58e0557b1ead),
        (0x930d9c5e92519c70fe717d297ad05076d3620958),
        (0x932fa7e85370e5b5cc6a4c15f99947c28fcb9677),
        (0x93d81257bd52ae0de59e04d49ad007558a3e9b04),
        (0x93e6e67bb1f75cae5a7f6e13d76535ae34a31d64),
        (0x94a9e5abd09a0efddab248fa1a0709e21eb9390e),
        (0x9547926c946c24bb4483cfdf1d350c86ce0ababd),
        (0x95739c851b97f0b3e501635746ef407191b67fec),
        (0x95d4ae523f376a5ae24c5242ce64805569be40a1),
        (0x96914769acf2da2092a674e10979d9ef09811011),
        (0x97883c01b7f3416b9d91896bb351cdae1a160979),
        (0x98b87ca6f09ffd27305b715e9028810933ee9da1),
        (0x99690d92cced4fa143d61dc482854ae7920ba446),
        (0x99f95f62e5d0940e1552ac75309853cec3d7bad4),
        (0x9a0deaf07bab701a272341ae98478bc1c19aae99),
        (0x9a800fe911b98137a5a0bf6478e0c223554ca7ad),
        (0x9b37064c172565d8e1bf18ad10870db0aa7183d3),
        (0x9c9c161f98fb7739fb948688d04b7fb0acf29394),
        (0x9d8a7a866af0eee89b45abbb4f1bc9c3698b33e4),
        (0x9fe5d727e663f424e95f00012404e005388ad505),
        (0x9ff28204cb96591d8b85a9351b6639b226457cfc),
        (0xa2720eeb6e91db51cc3a38675d923628084d84f4),
        (0xa2903102bc36d77e32ccb74fc46a625ca3b6311e),
        (0xa4137947dc1c4f630827b3541a38fa53a58342f0),
        (0xa501a4bf32f1ddb1e52bffd269d4121ad0dfffc9),
        (0xa5e3ac40dafec81714f1b577a9dc8c4730a38675),
        (0xa5f77ebba1d1240533dba09424e16cb379412104),
        (0xa60ec52e40263e33528d7f86ac6228ac36bb8cab),
        (0xa6cdce4646323935556dd45bc05735cfd807a347),
        (0xa6e72d725e0e8e6aae1e2e56f0adcaf661cc2530),
        (0xa76c2493c3fd52a614cf4aad64a71992ebc2ffa1),
        (0xa94a543cf0672564d8eafd54d0af46d9bc8c935b),
        (0xaa28d7da665ed0ccc9ed78376e840356b3c19310),
        (0xaa5290f9c887cc81f5b38b0d53938371beecaa7d),
        (0xaa65403e0a31f58df7c9737529b4e3d2943e3c6e),
        (0xab17f7ba3b5be591a5c3a302bff4e72b44e4dc0b),
        (0xabf094346d743d015f5fcbbfd31279ad5051f317),
        (0xadf354637b1cf2813d5b47a58f98b06fbfdb1931),
        (0xae7d95ef384ce7e3041a0ec04a3383c46fe92bdc),
        (0xaf2fb9b15ab03a5be740328d1b8ca20249a81eff),
        (0xaf39b0addbd67312a9e177026c07cac55c77cbfc),
        (0xaf6a72a2976f2663d5ad17667e89e58ac91652aa),
        (0xaf8ec05d77f5b1ad0f78bad3382e36c16e778046),
        (0xb08e4cb94e77e7221844d321d2c11a80d3deb618),
        (0xb267ca478c71a0d7e098bf5f9f0b8fcaba3e4214),
        (0xb2914810724fe2fb871960eb200dea427854b1c7),
        (0xb4fa6d578fc00f045875f93001239033a3591ef4),
        (0xb576e6b1e3d7b92839d0e4615b73c378ffa922fd),
        (0xb5817cc2438c7e871edbaf18f9c5557646bba92e),
        (0xb66023b5ebc41c7d37455c68313bdd43ef50aec9),
        (0xb74cb0922711c6174f12fb5933869ae254488273),
        (0xb8bc48496498604cdca572c96787bb67e6f075c8),
        (0xba2a60aefd58e8372dbe1085f625c988b849d7ba),
        (0xba5064b2339cb1dbfed9a51f49e7ebb035924a28),
        (0xbace8ad5f9e41104d99fd8aa053138833f696b48),
        (0xbc5f95993903027309e1a0b7e6159cbe7c71341a),
        (0xbd52732c6e253ee899cbe89905e752feea46467a),
        (0xbdea31822c0eadbfea650beed4ea968672a9dd03),
        (0xbe813b21a5079b914a7636cced7763e836db2bc0),
        (0xbfbebf801f7d16caeb2c6494cef9b28fce443c6d),
        (0xc1a3890960277acc1df9d255f0f5edd8a1de941b),
        (0xc1a40dbaec14419d47371dab96957e7c943ff3ec),
        (0xc545dba5e07b51864df83945f72f997a172e8d3c),
        (0xc693614c2cffef8825cd2ce7cc173045f6f7a7fd),
        (0xc874646b565624c513074fdf7ead5cb11fb57e03),
        (0xc8c92fa2077351b6f25cc515d7a4f5025708fcfa),
        (0xc90f1b23dea88afe84fa0c2d57da7eae2174bc93),
        (0xcac1700f45fab25c5729832a0e66bde82d275d77),
        (0xccc8844180b9c77fa79a2c14a90c37ea460bbe4c),
        (0xcf16252b2f5c4d1f53fd8788e9ed0420891f8aef),
        (0xcf5a978205a55fd6d32d20f853b27463e09df72f),
        (0xcf78ecddf1261b157709df997eb00efbaa81fe31),
        (0xd07dcbff86b3b93ec4cc2be911fdf408563eb019),
        (0xd0a56d08f35f0afa1991a87eb971f0b4584587e3),
        (0xd2947535b20f656bd3a5d50a3f6159dc6eed30fe),
        (0xd2e30be84ea6f1b81676fffeefff04319b9b0c8b),
        (0xd390eefdd9220079ccdbbb34d89d3f7c18a2efec),
        (0xd44bdbff4e45408d39d15fdd7a200673b98b7e29),
        (0xd5973bb4088f751c55d34712d193b5966f35e2ab),
        (0xd6b69e58d44e523eb58645f1b78425c96dfa648c),
        (0xda4ac912aad28645702f03480956fbebf62cd0ad),
        (0xda9bcee4e86d55dc3bd02bf77cbbda000b1209d4),
        (0xdbb811ec62338db94858ec21ef1d56b658111922),
        (0xdc7d816252a902a409746b09e07683e2fb2bb473),
        (0xdddf9f77a316d855a2a5f1b09fba3f77a7a24468),
        (0xe0bc834a2f7e175d349af57e67a6b0bbdaf569ac),
        (0xe0ccc8adf79858d9cbe2fd5bffa540ac179c76a7),
        (0xe1280809c80889bc58ff06df33235547d4031784),
        (0xe2209cffd306ae501c9a41da9a7533187c48a2d7),
        (0xe286da2fed71fcfe900f272941fec6966131e037),
        (0xe2a139bb199163232a3f8156b7e83797aa5ae322),
        (0xe3bcf5b06118629562f0085ef3b25e23671ecf09),
        (0xe42472963b7eb988038835d69f3f1d4050bc86b2),
        (0xe5af9fb44d9e6b6845dffb96b7e361e2d2880e6f),
        (0xe636c34f8ca5992c543141570e36bfdb5a76cf1f),
        (0xe7bebe04c17853d12dd9e501e589efd40b931cfd),
        (0xe82c5db6d424eca766b36faf01b663ad3e26ec60),
        (0xe8e164935d10fe5d1c3c4b8f57931ac37c9da682),
        (0xeb78ef6de3a2436d37e491178ca63aeb936adcc6),
        (0xee0850d7330601930455394ca68d769e7938b25c),
        (0xefb6605d60d6d50d46bdfa806f060f576ad3eaf1),
        (0xeff8edb14a3f9cb60fdc4d8054fee55517bedd7e),
        (0xf03b1367dae1289d5ebd68060eb52581cc7a6e77),
        (0xf0cee28c693e945129fdb2c32c90ac567aa4f781),
        (0xf14c0721d74ca6eae889dcd3f972244ff62ba963),
        (0xf26a9a5c65cb7f93482234c278064e14549b5e0c),
        (0xf2735158437fb402b39c95e5d9ef884f519a9c1a),
        (0xf41a0f3b99b4372a6503469a7c541a402a40ce30),
        (0xf6b45abd18456a5921961656cbb3c1585875f895),
        (0xf7d742292c367c1532db0e19f1380392ee89a613),
        (0xf9f87213f9e6650668514d5659ac4e1a700d318f),
        (0xfaa8d0148cf6e47110b6560b3f30a29dbe930cc7),
        (0xfbe2bddddc1ddbbb3674bc3260d832076c7536cc),
        (0xfcc8a8e6509710aeff6e5ec5fef90d72deb8d8c8),
        (0xfd088d26b4e019c98f7140c9083accb498ed1f16),
        (0xfd16c3ab9fd1225313317ba4ba1de7c30bbbba17),
        (0xfd4968731297dc592438ea216857bcef9ecfa372),
        (0xfe03ecbf0a2dbb3c5cac73240329c3dfc1a0d557),
        (0xfe9e24054837daa29a163748388ba7ea0e4d8c21),
        (0xffdbacc661431c05111e308308df15001719ea33)
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
