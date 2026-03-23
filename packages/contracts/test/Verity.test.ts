import { expect } from "chai";
import { ethers } from "hardhat";
import { VerityFactory, VerityMarket, VerityTreasury } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Verity Platform", function () {
  let factory: VerityFactory;
  let treasury: VerityTreasury;
  let owner: SignerWithAddress;
  let workflowRunner: SignerWithAddress;
  let creator: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const MARKET_BOND = ethers.parseEther("5");
  const MIN_BET = ethers.parseEther("0.5");

  beforeEach(async function () {
    [owner, workflowRunner, creator, user1, user2, user3] = await ethers.getSigners();

    // Deploy Treasury
    const TreasuryFactory = await ethers.getContractFactory("VerityTreasury");
    treasury = await TreasuryFactory.deploy(owner.address);

    // Deploy Factory
    const VerityFactory = await ethers.getContractFactory("VerityFactory");
    factory = await VerityFactory.deploy(await treasury.getAddress(), owner.address);

    // Set Workflow Runner
    await factory.setWorkflowRunner(workflowRunner.address);
  });

  describe("Market Creation", function () {
    it("Should create a 2-way market with correct bond", async function () {
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 1000;
      
      const tx = await factory.connect(creator).createMarket(
        "Will BTC hit 100k?",
        "Crypto",
        "Price Action",
        "Bitcoin",
        "BTC/USD",
        deadline,
        false, // 2-way
        { value: MARKET_BOND }
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => (log as any).fragment?.name === 'MarketCreated');
      const marketAddress = (event as any).args[0];

      const market = await ethers.getContractAt("VerityMarket", marketAddress);
      expect(await market.question()).to.equal("Will BTC hit 100k?");
      expect(await market.hasDraw()).to.be.false;
      expect(await ethers.provider.getBalance(await factory.getAddress())).to.equal(MARKET_BOND);
    });

    it("Should fail if bond is incorrect", async function () {
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 1000;
      await expect(factory.connect(creator).createMarket(
        "Will BTC hit 100k?", "Crypto", "Price Action", "Bitcoin", "BTC/USD", deadline, false,
        { value: ethers.parseEther("4") }
      )).to.be.revertedWith("Must pay 5 FLOW bond");
    });
  });

  describe("Betting Logic", function () {
    let market: VerityMarket;
    let marketAddress: string;

    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 1000;
      const tx = await factory.connect(creator).createMarket(
        "Arsenal vs Man City", "Sports", "Premier League", "Soccer", "Arsenal vs Man City", deadline, true, // 3-way
        { value: MARKET_BOND }
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => (log as any).fragment?.name === 'MarketCreated');
      marketAddress = (event as any).args[0];
      market = await ethers.getContractAt("VerityMarket", marketAddress);
    });

    it("Should allow placing bets on all 3 sides", async function () {
      await market.connect(user1).placeBet(1, { value: ethers.parseEther("1") }); // YES
      await market.connect(user2).placeBet(0, { value: ethers.parseEther("2") }); // NO
      await market.connect(user3).placeBet(2, { value: ethers.parseEther("3") }); // DRAW

      expect(await market.yesPool()).to.equal(ethers.parseEther("1"));
      expect(await market.noPool()).to.equal(ethers.parseEther("2"));
      expect(await market.drawPool()).to.equal(ethers.parseEther("3"));
    });

    it("Should return correct probabilities (odds)", async function () {
      await market.connect(user1).placeBet(1, { value: ethers.parseEther("1") }); // 1/6 = 16.66%
      await market.connect(user2).placeBet(0, { value: ethers.parseEther("2") }); // 2/6 = 33.33%
      await market.connect(user3).placeBet(2, { value: ethers.parseEther("3") }); // 3/6 = 50%

      const [yesProb, noProb, drawProb] = await market.getOdds();
      expect(yesProb).to.be.closeTo(1666n, 1n);
      expect(noProb).to.be.closeTo(3333n, 1n);
      expect(drawProb).to.be.closeTo(5000n, 1n);
    });

    it("Should reject bets after deadline", async function () {
      await ethers.provider.send("evm_increaseTime", [2000]);
      await ethers.provider.send("evm_mine", []);
      
      await expect(market.connect(user1).placeBet(1, { value: MIN_BET }))
        .to.be.revertedWith("Betting closed");
    });
  });

  describe("Resolution and Payouts", function () {
    let market: VerityMarket;
    let marketAddress: string;

    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 1000;
      const tx = await factory.connect(creator).createMarket(
        "Arsenal vs Man City", "Sports", "Premier League", "Soccer", "Arsenal vs Man City", deadline, true,
        { value: MARKET_BOND }
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => (log as any).fragment?.name === 'MarketCreated');
      marketAddress = (event as any).args[0];
      market = await ethers.getContractAt("VerityMarket", marketAddress);

      // User1: 10 FLOW on YES
      // User2: 10 FLOW on NO
      // Total Pool: 20 FLOW
      // Expected Fee (1.5%): 0.3 FLOW
      // Winner Pool (98.5%): 19.7 FLOW
      await market.connect(user1).placeBet(1, { value: ethers.parseEther("10") });
      await market.connect(user2).placeBet(0, { value: ethers.parseEther("10") });

      // Pass deadline
      await ethers.provider.send("evm_increaseTime", [2000]);
      await ethers.provider.send("evm_mine", []);
    });

    it("Should allow workflow runner to resolve YES and distribute payouts", async function () {
      const initialCreatorBalance = await ethers.provider.getBalance(creator.address);
      const initialTreasuryBalance = await ethers.provider.getBalance(await treasury.getAddress());

      await factory.connect(workflowRunner).resolveMarket(marketAddress, 1); // YES
      
      expect(await market.resolved()).to.be.true;
      expect(await market.outcome()).to.equal(1);

      // Check Fee (1.5% of 20 = 0.3)
      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(initialTreasuryBalance + ethers.parseEther("0.3"));

      // Check Bond Return (5 FLOW)
      expect(await ethers.provider.getBalance(creator.address)).to.be.gt(initialCreatorBalance);

      // User1 Redeem (Wins the whole 19.7 pool)
      const initialUser1Balance = await ethers.provider.getBalance(user1.address);
      await market.connect(user1).redeem();
      expect(await ethers.provider.getBalance(user1.address)).to.be.gt(initialUser1Balance + ethers.parseEther("19"));
    });

    it("Should allow VOID resolution and return all funds", async function () {
      await factory.connect(workflowRunner).resolveMarket(marketAddress, 4); // VOID
      
      const initialUser1Balance = await ethers.provider.getBalance(user1.address);
      await market.connect(user1).redeem();
      // Returns original 10 FLOW (minus gas)
      expect(await ethers.provider.getBalance(user1.address)).to.be.gt(initialUser1Balance + ethers.parseEther("9.9"));
    });
  });
});
