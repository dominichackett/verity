// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PredictionMarket {
    struct Market {
        string question;
        uint256 endTime;
        bool resolved;
        uint256 outcome; // 0 for No, 1 for Yes
        uint256 totalYes;
        uint256 totalNo;
    }

    mapping(uint256 => Market) public markets;
    uint256 public marketCount;
    address public creator;

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event MarketResolved(uint256 indexed marketId, uint256 outcome);

    constructor() {
        creator = msg.sender;
    }

    modifier onlyCreator() {
        require(msg.sender == creator, "Only creator can perform this action");
        _;
    }

    function createMarket(string memory _question, uint256 _duration) external onlyCreator {
        uint256 marketId = marketCount++;
        markets[marketId] = Market({
            question: _question,
            endTime: block.timestamp + _duration,
            resolved: false,
            outcome: 0,
            totalYes: 0,
            totalNo: 0
        });

        emit MarketCreated(marketId, _question, block.timestamp + _duration);
    }

    function resolveMarket(uint256 _marketId, uint256 _outcome) external {
        // In a real scenario, this would be restricted to a Chainlink node or a DAO
        Market storage market = markets[_marketId];
        require(block.timestamp >= market.endTime, "Market has not ended yet");
        require(!market.resolved, "Market already resolved");

        market.resolved = true;
        market.outcome = _outcome;

        emit MarketResolved(_marketId, _outcome);
    }
}
