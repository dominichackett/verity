import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy MockUSDC (Collateral Token)
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // 2. Deploy VerityTreasury
  const VerityTreasury = await ethers.getContractFactory("VerityTreasury");
  const treasury = await VerityTreasury.deploy(deployer.address);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("VerityTreasury deployed to:", treasuryAddress);

  // 3. Deploy VerityFactory
  const VerityFactory = await ethers.getContractFactory("VerityFactory");
  const factory = await VerityFactory.deploy(
    treasuryAddress,
    usdcAddress,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("VerityFactory deployed to:", factoryAddress);

  // 3. Set Workflow Runner (The address used by your CRE Workflow)
  const workflowRunnerAddress = process.env.WORKFLOW_RUNNER_ADDRESS;
  if (workflowRunnerAddress) {
    console.log("Setting Workflow Runner to:", workflowRunnerAddress);
    await factory.setWorkflowRunner(workflowRunnerAddress);
  } else {
    console.log("WARNING: WORKFLOW_RUNNER_ADDRESS not set. Please set it manually via factory.setWorkflowRunner()");
  }

  console.log("\nDeployment Complete!");
  console.log("-------------------");
  console.log("Factory Address:", factoryAddress);
  console.log("Treasury Address:", treasuryAddress);
  console.log("MockUSDC Address:", usdcAddress);
  console.log("-------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
