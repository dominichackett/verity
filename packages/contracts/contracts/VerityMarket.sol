// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VerityMarket is ReentrancyGuard {
    enum Category { SPORTS, CRYPTO, POPCULTURE }
    // 0=NO, 1=YES, 2=DRAW, 3=CONFLICT, 4=VOID
    enum Outcome { NO, YES, DRAW, CONFLICT, VOID }

    string public question;
    Category public category;
    string public sportType;
    string public teams;
    uint256 public deadline;
    bool public hasDraw; // If true, 3-way market. If false, 2-way (Yes/No).
    
    uint256 public yesPool;
    uint256 public noPool;
    uint256 public drawPool;
    
    bool public resolved;
    Outcome public outcome;

    address public factory;
    address public treasury;

    mapping(address => uint256) public yesShares;
    mapping(address => uint256) public noShares;
    mapping(address => uint256) public drawShares;

    event BetPlaced(address indexed user, uint8 side, uint256 amount);
    event MarketResolved(Outcome outcome);
    event PayoutClaimed(address indexed user, uint256 amount);

    constructor(
        string memory _question,
        Category _category,
        string memory _sportType,
        string memory _teams,
        uint256 _deadline,
        bool _hasDraw,
        address _treasury
    ) {
        question = _question;
        category = _category;
        sportType = _sportType;
        teams = _teams;
        deadline = _deadline;
        hasDraw = _hasDraw;
        factory = msg.sender;
        treasury = _treasury;
    }

    /**
     * @dev Place a bet on a specific side.
     * @param side 0 for NO, 1 for YES, 2 for DRAW.
     */
    function placeBet(uint8 side) external payable nonReentrant {
        require(!resolved, "Market already resolved");
        require(block.timestamp < deadline, "Betting closed");
        require(msg.value >= 0.5 ether, "Minimum bet 0.5 FLOW");
        
        if (hasDraw) {
            require(side <= 2, "Invalid side for 3-way market");
        } else {
            require(side <= 1, "Draw not supported for this market");
        }

        if (side == 1) {
            yesShares[msg.sender] += msg.value;
            yesPool += msg.value;
        } else if (side == 0) {
            noShares[msg.sender] += msg.value;
            noPool += msg.value;
        } else {
            drawShares[msg.sender] += msg.value;
            drawPool += msg.value;
        }

        emit BetPlaced(msg.sender, side, msg.value);
    }

    function resolve(Outcome _outcome) external {
        require(msg.sender == factory, "Only factory can resolve");
        require(!resolved, "Market already resolved");
        require(block.timestamp >= deadline, "Market not ended yet");
        if (!hasDraw) {
            require(_outcome != Outcome.DRAW, "Cannot resolve as DRAW for 2-way market");
        }

        resolved = true;
        outcome = _outcome;

        emit MarketResolved(outcome);

        // Fee logic: 1.5% to treasury on successful resolution
        if (outcome == Outcome.YES || outcome == Outcome.NO || outcome == Outcome.DRAW) {
            uint256 totalPool = yesPool + noPool + drawPool;
            uint256 fee = (totalPool * 15) / 1000; // 1.5%
            payable(treasury).transfer(fee);
        }
    }

    function getOdds() external view returns (uint256 yesProb, uint256 noProb, uint256 drawProb) {
        uint256 totalPool = yesPool + noPool + drawPool;
        if (totalPool == 0) {
            if (hasDraw) return (3333, 3333, 3334);
            return (5000, 5000, 0);
        }
        yesProb = (yesPool * 10000) / totalPool;
        noProb = (noPool * 10000) / totalPool;
        drawProb = (drawPool * 10000) / totalPool;
    }

    function redeem() external nonReentrant {
        require(resolved, "Market not resolved");
        uint256 payout;
        uint256 totalPool = yesPool + noPool + drawPool;

        if (outcome == Outcome.YES) {
            require(yesShares[msg.sender] > 0, "No winning shares");
            payout = (yesShares[msg.sender] * totalPool * 985) / (yesPool * 1000);
            yesShares[msg.sender] = 0;
        } else if (outcome == Outcome.NO) {
            require(noShares[msg.sender] > 0, "No winning shares");
            payout = (noShares[msg.sender] * totalPool * 985) / (noPool * 1000);
            noShares[msg.sender] = 0;
        } else if (outcome == Outcome.DRAW) {
            require(drawShares[msg.sender] > 0, "No winning shares");
            payout = (drawShares[msg.sender] * totalPool * 985) / (drawPool * 1000);
            drawShares[msg.sender] = 0;
        } else if (outcome == Outcome.VOID || outcome == Outcome.CONFLICT) {
            payout = yesShares[msg.sender] + noShares[msg.sender] + drawShares[msg.sender];
            yesShares[msg.sender] = 0;
            noShares[msg.sender] = 0;
            drawShares[msg.sender] = 0;
        } else {
            revert("Invalid outcome");
        }

        require(payout > 0, "Nothing to redeem");
        payable(msg.sender).transfer(payout);
        emit PayoutClaimed(msg.sender, payout);
    }
}
