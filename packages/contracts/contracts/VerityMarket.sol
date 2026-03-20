// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VerityMarket is ReentrancyGuard {
    enum Category { SPORTS, CRYPTO, POPCULTURE }
    // 0=NO, 1=YES, 2=CONFLICT, 3=VOID
    enum Outcome { NO, YES, CONFLICT, VOID }

    string public question;
    Category public category;
    string public sportType;
    string public teams;
    uint256 public deadline;
    uint256 public yesPool;
    uint256 public noPool;
    bool public resolved;
    Outcome public outcome;

    address public factory;
    address public treasury;

    mapping(address => uint256) public yesShares;
    mapping(address => uint256) public noShares;

    event BetPlaced(address indexed user, bool side, uint256 amount);
    event MarketResolved(Outcome outcome);
    event PayoutClaimed(address indexed user, uint256 amount);

    constructor(
        string memory _question,
        Category _category,
        string memory _sportType,
        string memory _teams,
        uint256 _deadline,
        address _treasury
    ) {
        question = _question;
        category = _category;
        sportType = _sportType;
        teams = _teams;
        deadline = _deadline;
        factory = msg.sender;
        treasury = _treasury;
    }

    function placeBet(bool side) external payable nonReentrant {
        require(!resolved, "Market already resolved");
        require(block.timestamp < deadline, "Betting closed");
        require(msg.value >= 0.5 ether, "Minimum bet 0.5 FLOW");

        if (side) {
            yesShares[msg.sender] += msg.value;
            yesPool += msg.value;
        } else {
            noShares[msg.sender] += msg.value;
            noPool += msg.value;
        }

        emit BetPlaced(msg.sender, side, msg.value);
    }

    function resolve(Outcome _outcome) external {
        require(msg.sender == factory, "Only factory can resolve");
        require(!resolved, "Market already resolved");
        require(block.timestamp >= deadline, "Market not ended yet");

        resolved = true;
        outcome = _outcome;

        emit MarketResolved(outcome);

        // Fee logic: 1.5% to treasury on successful resolution
        if (outcome == Outcome.YES || outcome == Outcome.NO) {
            uint256 totalPool = yesPool + noPool;
            uint256 fee = (totalPool * 15) / 1000; // 1.5%
            payable(treasury).transfer(fee);
        }
    }

    function redeem() external nonReentrant {
        require(resolved, "Market not resolved");
        uint256 payout;

        if (outcome == Outcome.YES) {
            require(yesShares[msg.sender] > 0, "No winning shares");
            require(yesPool > 0, "No yes pool");
            payout = (yesShares[msg.sender] * (yesPool + noPool) * 985) / (yesPool * 1000);
            yesShares[msg.sender] = 0;
        } else if (outcome == Outcome.NO) {
            require(noShares[msg.sender] > 0, "No winning shares");
            require(noPool > 0, "No no pool");
            payout = (noShares[msg.sender] * (yesPool + noPool) * 985) / (noPool * 1000);
            noShares[msg.sender] = 0;
        } else if (outcome == Outcome.VOID || outcome == Outcome.CONFLICT) {
            payout = yesShares[msg.sender] + noShares[msg.sender];
            yesShares[msg.sender] = 0;
            noShares[msg.sender] = 0;
        } else {
            revert("Invalid outcome");
        }

        require(payout > 0, "Nothing to redeem");
        payable(msg.sender).transfer(payout);
        emit PayoutClaimed(msg.sender, payout);
    }
}
