// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VerityMarket
 * @dev A Polymarket-like market using the Conditional Tokens mechanism.
 * 1 YES share + 1 NO share = 1 Collateral (e.g., USDC).
 */
contract VerityMarket is ERC1155, ReentrancyGuard {
    enum Outcome { UNRESOLVED, NO, YES, DRAW, VOID }

    // Share IDs
    uint256 public constant NO_ID = 0;
    uint256 public constant YES_ID = 1;
    uint256 public constant DRAW_ID = 2;

    string public question;
    uint256 public deadline;
    bool public hasDraw;
    IERC20 public collateralToken;
    
    bool public resolved;
    Outcome public outcome;
    
    address public factory;
    address public treasury;

    event MarketResolved(Outcome outcome);
    event SharesMinted(address indexed user, uint256 amount);
    event SharesMerged(address indexed user, uint256 amount);
    event PayoutClaimed(address indexed user, uint256 amount);

    constructor(
        string memory _question,
        uint256 _deadline,
        bool _hasDraw,
        address _collateralToken,
        address _treasury
    ) ERC1155("") {
        question = _question;
        deadline = _deadline;
        hasDraw = _hasDraw;
        collateralToken = IERC20(_collateralToken);
        factory = msg.sender;
        treasury = _treasury;
    }

    /**
     * @dev Mint YES and NO (and DRAW) shares by depositing collateral.
     * 1 Collateral (6 decimals) = 1 YES + 1 NO (18 decimals).
     */
    function mintShares(uint256 collateralAmount) external nonReentrant {
        require(!resolved, "Market resolved");
        require(block.timestamp < deadline, "Deadline passed");
        require(collateralAmount > 0, "Amount must be > 0");

        require(collateralToken.transferFrom(msg.sender, address(this), collateralAmount), "Transfer failed");

        // Scale 6 decimals to 18 decimals for shares
        uint256 shareAmount = collateralAmount * 10**12;

        uint256[] memory ids;
        uint256[] memory amounts;

        if (hasDraw) {
            ids = new uint256[](3);
            amounts = new uint256[](3);
            ids[0] = NO_ID;
            ids[1] = YES_ID;
            ids[2] = DRAW_ID;
            amounts[0] = shareAmount;
            amounts[1] = shareAmount;
            amounts[2] = shareAmount;
        } else {
            ids = new uint256[](2);
            amounts = new uint256[](2);
            ids[0] = NO_ID;
            ids[1] = YES_ID;
            amounts[0] = shareAmount;
            amounts[1] = shareAmount;
        }

        _mintBatch(msg.sender, ids, amounts, "");
        emit SharesMinted(msg.sender, collateralAmount);
    }

    /**
     * @dev Merge YES and NO (and DRAW) shares back into collateral.
     * 1 YES + 1 NO (18 decimals) = 1 Collateral (6 decimals).
     */
    function mergeShares(uint256 shareAmount) external nonReentrant {
        require(shareAmount > 0, "Amount must be > 0");

        uint256[] memory ids;
        uint256[] memory amounts;

        if (hasDraw) {
            ids = new uint256[](3);
            amounts = new uint256[](3);
            ids[0] = NO_ID;
            ids[1] = YES_ID;
            ids[2] = DRAW_ID;
            amounts[0] = shareAmount;
            amounts[1] = shareAmount;
            amounts[2] = shareAmount;
        } else {
            ids = new uint256[](2);
            amounts = new uint256[](2);
            ids[0] = NO_ID;
            ids[1] = YES_ID;
            amounts[0] = shareAmount;
            amounts[1] = shareAmount;
        }

        _burnBatch(msg.sender, ids, amounts);
        
        // Scale 18 decimals down to 6 decimals for collateral
        uint256 collateralAmount = shareAmount / 10**12;
        require(collateralToken.transfer(msg.sender, collateralAmount), "Transfer failed");

        emit SharesMerged(msg.sender, collateralAmount);
    }

    /**
     * @dev Resolve the market. Only factory can call.
     */
    function resolve(Outcome _outcome) external {
        require(msg.sender == factory, "Only factory can resolve");
        require(!resolved, "Already resolved");
        require(block.timestamp >= deadline, "Not ended");
        
        resolved = true;
        outcome = _outcome;

        emit MarketResolved(outcome);
    }

    /**
     * @dev Claim payout for winning shares.
     * 1 winning share (18 decimals) = 1 Collateral (6 decimals).
     */
    function redeem() external nonReentrant {
        require(resolved, "Not resolved");
        
        uint256 sharePayout = 0;
        if (outcome == Outcome.YES) {
            sharePayout = balanceOf(msg.sender, YES_ID);
            _burn(msg.sender, YES_ID, sharePayout);
        } else if (outcome == Outcome.NO) {
            sharePayout = balanceOf(msg.sender, NO_ID);
            _burn(msg.sender, NO_ID, sharePayout);
        } else if (outcome == Outcome.DRAW) {
            sharePayout = balanceOf(msg.sender, DRAW_ID);
            _burn(msg.sender, DRAW_ID, sharePayout);
        } else if (outcome == Outcome.VOID) {
            uint256 yesBal = balanceOf(msg.sender, YES_ID);
            uint256 noBal = balanceOf(msg.sender, NO_ID);
            uint256 drawBal = hasDraw ? balanceOf(msg.sender, DRAW_ID) : 0;
            
            uint256 divisor = hasDraw ? 3 : 2;
            sharePayout = (yesBal + noBal + drawBal) / divisor;
            
            _burn(msg.sender, YES_ID, yesBal);
            _burn(msg.sender, NO_ID, noBal);
            if (hasDraw) _burn(msg.sender, DRAW_ID, drawBal);
        }

        require(sharePayout > 0, "No payout");
        
        // Scale 18 decimals down to 6 decimals for collateral
        uint256 collateralPayout = sharePayout / 10**12;

        // Fee handling: 1.5% to treasury
        uint256 fee = (collateralPayout * 15) / 1000;
        uint256 netPayout = collateralPayout - fee;

        require(collateralToken.transfer(treasury, fee), "Fee transfer failed");
        require(collateralToken.transfer(msg.sender, netPayout), "Payout transfer failed");

        emit PayoutClaimed(msg.sender, netPayout);
    }
}
