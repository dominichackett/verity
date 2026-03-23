// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VerityMarket.sol";

contract VerityFactory is Ownable {
    address public treasury;
    address public workflowRunner; // The authorized address for CRE Workflow execution
    uint256 public constant MARKET_BOND = 5 ether;

    struct MarketRecord {
        address marketAddress;
        address creator;
        bool resolved;
    }

    MarketRecord[] public markets;
    mapping(address => uint256) public marketToIndex;

    event MarketCreated(address indexed marketAddress, address indexed creator, string question);
    event MarketResolved(address indexed marketAddress, VerityMarket.Outcome outcome);

    constructor(address _treasury, address initialOwner) Ownable(initialOwner) {
        treasury = _treasury;
    }

    function setWorkflowRunner(address _workflowRunner) external onlyOwner {
        workflowRunner = _workflowRunner;
    }

    function createMarket(
        string memory _question,
        string memory _category,
        string memory _subCategory,
        string memory _topic,
        string memory _context,
        uint256 _deadline,
        bool _hasDraw
    ) external payable {
        require(msg.value == MARKET_BOND, "Must pay 5 FLOW bond");

        VerityMarket newMarket = new VerityMarket(
            _question,
            _category,
            _subCategory,
            _topic,
            _context,
            _deadline,
            _hasDraw,
            treasury
        );

        marketToIndex[address(newMarket)] = markets.length;
        markets.push(MarketRecord({
            marketAddress: address(newMarket),
            creator: msg.sender,
            resolved: false
        }));

        emit MarketCreated(address(newMarket), msg.sender, _question);
    }

    function resolveMarket(address _marketAddress, VerityMarket.Outcome _outcome) external {
        require(msg.sender == workflowRunner || msg.sender == owner(), "Only workflow runner or owner can resolve");
        
        uint256 index = marketToIndex[_marketAddress];
        MarketRecord storage record = markets[index];
        require(record.marketAddress == _marketAddress, "Market not found");
        require(!record.resolved, "Already resolved");

        VerityMarket(_marketAddress).resolve(_outcome);
        record.resolved = true;

        // Bond handling
        if (_outcome == VerityMarket.Outcome.YES || _outcome == VerityMarket.Outcome.NO || _outcome == VerityMarket.Outcome.DRAW) {
            // Clean resolution, return bond to creator
            payable(record.creator).transfer(MARKET_BOND);
        } else if (_outcome == VerityMarket.Outcome.VOID) {
            // Voided, return bond
            payable(record.creator).transfer(MARKET_BOND);
        } else if (_outcome == VerityMarket.Outcome.CONFLICT) {
            payable(record.creator).transfer(MARKET_BOND);
        }

        emit MarketResolved(_marketAddress, _outcome);
    }

    function getMarketsCount() external view returns (uint256) {
        return markets.length;
    }
}
