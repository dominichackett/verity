import { expect } from "chai";
import { ethers } from "hardhat";
import { VerityFactory, VerityMarket, VerityTreasury, MockUSDC, VerityAMM } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Verity Polymarket Mechanism", function () {
  let factory: VerityFactory;
  let treasury: VerityTreasury;
  let usdc: MockUSDC;
  let owner: SignerWithAddress;
  let workflowRunner: SignerWithAddress;
  let creator: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const MARKET_BOND = ethers.parseEther("5");

  beforeEach(async function () {
    [owner, workflowRunner, creator, user1, user2] = await ethers.getSigners();

    // 1. Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();

    // 2. Deploy Treasury
    const TreasuryFactory = await ethers.getContractFactory("VerityTreasury");
    treasury = await TreasuryFactory.deploy(owner.address);

    // 3. Deploy Factory
    const VerityFactory = await ethers.getContractFactory("VerityFactory");
    factory = await VerityFactory.deploy(
        await treasury.getAddress(), 
        await usdc.getAddress(), 
        owner.address
    );

    // Set Workflow Runner
    await factory.setWorkflowRunner(workflowRunner.address);
  });

  describe("Polymarket Workflow", function () {
    let market: VerityMarket;
    let marketAddress: string;

    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 1000;
      const tx = await factory.connect(creator).createMarket(
        "Will BTC hit 100k?", "Crypto", "Price", "BTC", "BTC/USD", deadline, false,
        { value: MARKET_BOND }
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => (log as any).fragment?.name === 'MarketCreated');
      marketAddress = (event as any).args[0];
      market = await ethers.getContractAt("VerityMarket", marketAddress);
    });

    it("Should allow minting and merging shares (the core mechanism)", async function () {
      const amount = ethers.parseUnits("100", 6);
      
      // Mint USDC for user1
      await usdc.mint(user1.address, amount);
      await usdc.connect(user1).approve(marketAddress, amount);

      // 1. Mint Shares (Split)
      await market.connect(user1).mintShares(amount);
      
      expect(await market.balanceOf(user1.address, 1)).to.equal(ethers.parseUnits("100", 18)); // Shares are 18 decimals
      expect(await market.balanceOf(user1.address, 0)).to.equal(ethers.parseUnits("100", 18)); // Shares are 18 decimals
      expect(await usdc.balanceOf(marketAddress)).to.equal(amount);

      // 2. Merge Shares
      await market.connect(user1).mergeShares(ethers.parseUnits("100", 18));
      expect(await market.balanceOf(user1.address, 1)).to.equal(0);
      expect(await market.balanceOf(user1.address, 0)).to.equal(0);
      expect(await usdc.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should allow trading through AMM", async function () {
      const ammFactory = await ethers.getContractFactory("VerityAMM");
      const amm = await ammFactory.deploy(marketAddress, await usdc.getAddress());

      const liquidityAmount = ethers.parseUnits("1000", 6);
      await usdc.mint(owner.address, liquidityAmount);
      await usdc.approve(await amm.getAddress(), liquidityAmount);
      
      // Add Liquidity (starts at 50/50 price)
      await amm.addLiquidity(liquidityAmount);

      expect(await market.balanceOf(await amm.getAddress(), 1)).to.equal(ethers.parseUnits("1000", 18));
      expect(await market.balanceOf(await amm.getAddress(), 0)).to.equal(ethers.parseUnits("1000", 18));

      // User1 buys YES
      const buyAmount = ethers.parseUnits("100", 6);
      await usdc.mint(user1.address, buyAmount);
      await usdc.connect(user1).approve(await amm.getAddress(), buyAmount);

      await amm.connect(user1).buy(1, buyAmount, 0); // Buy YES

      const user1YesBalance = await market.balanceOf(user1.address, 1);
      expect(user1YesBalance).to.be.gt(ethers.parseUnits("100", 18)); 
      
      const user1NoBalance = await market.balanceOf(user1.address, 0);
      expect(user1NoBalance).to.equal(0); 
    });

    it("Should support markets with DRAW option", async function () {
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 1000;
      const tx = await factory.connect(creator).createMarket(
        "Soccer: Team A vs Team B", "Sports", "Soccer", "Match", "Match Result", deadline, true,
        { value: MARKET_BOND }
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => (log as any).fragment?.name === 'MarketCreated');
      const drawMarketAddress = (event as any).args[0];
      const drawAmmAddress = (event as any).args[1];
      const drawMarket = await ethers.getContractAt("VerityMarket", drawMarketAddress);
      const drawAmm = await ethers.getContractAt("VerityAMM", drawAmmAddress);

      expect(await drawMarket.hasDraw()).to.be.true;

      const liquidityAmount = ethers.parseUnits("1000", 6);
      await usdc.mint(owner.address, liquidityAmount);
      await usdc.approve(drawAmmAddress, liquidityAmount);
      await drawAmm.addLiquidity(liquidityAmount);

      expect(await drawMarket.balanceOf(drawAmmAddress, 2)).to.equal(ethers.parseUnits("1000", 18)); // DRAW_ID is 2

      // User buys DRAW
      const buyAmount = ethers.parseUnits("100", 6);
      await usdc.mint(user1.address, buyAmount);
      await usdc.connect(user1).approve(drawAmmAddress, buyAmount);

      await drawAmm.connect(user1).buy(2, buyAmount, 0); // Buy DRAW

      const user1DrawBalance = await drawMarket.balanceOf(user1.address, 2);
      expect(user1DrawBalance).to.be.gt(ethers.parseUnits("100", 18)); 

      // Sell DRAW
      await drawMarket.connect(user1).setApprovalForAll(drawAmmAddress, true);
      await drawAmm.connect(user1).sell(2, user1DrawBalance, 0);

      expect(await drawMarket.balanceOf(user1.address, 2)).to.equal(0);
    });

    it("Should resolve market and allow winning share redemption", async function () {
      const amount = ethers.parseUnits("100", 6);
      await usdc.mint(user1.address, amount);
      await usdc.connect(user1).approve(marketAddress, amount);
      await market.connect(user1).mintShares(amount);

      // Pass deadline
      await ethers.provider.send("evm_increaseTime", [2000]);
      await ethers.provider.send("evm_mine", []);

      // Resolve as YES (2)
      await factory.connect(workflowRunner).resolveMarket(marketAddress, 2);

      // User1 has 100 YES shares. Each should be worth $1.00 (minus 1.5% fee).
      const initialUSDC = await usdc.balanceOf(user1.address);
      await market.connect(user1).redeem();

      const finalUSDC = await usdc.balanceOf(user1.address);
      const payout = finalUSDC - initialUSDC;
      
      // 100 * 0.985 = 98.5
      expect(payout).to.equal(ethers.parseUnits("98.5", 6));
    });
  });
});
